"use strict";

const { pool } = require("./db");
const config = require("./config");

function mapServiceInput(data) {
    return {
        name: data.name,
        url: data.url,
        enabled: data.enabled ?? true,
        intervalSeconds:
            data.intervalSeconds ?? config.monitoring.defaultIntervalSeconds,
        timeoutMs: data.timeoutMs ?? config.monitoring.defaultTimeoutMs,
        expectedStatus: Object.hasOwn(data, "expectedStatus")
            ? data.expectedStatus
            : null,
    };
}

async function createService(data) {
    const input = mapServiceInput(data);
    const result = await pool.query(
        `INSERT INTO services
            (name, url, enabled, interval_seconds, timeout_ms, expected_status, next_check_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [
            input.name,
            input.url,
            input.enabled,
            input.intervalSeconds,
            input.timeoutMs,
            input.expectedStatus,
        ],
    );
    return result.rows[0];
}

async function listServices({ search = "", limit = 100, offset = 0 } = {}) {
    const params = [];
    let where = "";

    if (search) {
        params.push(`%${search}%`);
        where = `WHERE name ILIKE $${params.length} OR url ILIKE $${params.length}`;
    }

    params.push(limit, offset);
    const result = await pool.query(
        `SELECT * FROM services
         ${where}
         ORDER BY name ASC, created_at ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
    );
    return result.rows;
}

async function getService(id, client = pool) {
    const result = await client.query("SELECT * FROM services WHERE id = $1", [id]);
    return result.rows[0] || null;
}

async function updateService(id, data) {
    const columns = {
        name: "name",
        url: "url",
        enabled: "enabled",
        intervalSeconds: "interval_seconds",
        timeoutMs: "timeout_ms",
        expectedStatus: "expected_status",
    };

    const assignments = [];
    const values = [];
    for (const [key, column] of Object.entries(columns)) {
        if (!Object.hasOwn(data, key)) continue;
        values.push(data[key]);
        assignments.push(`${column} = $${values.length}`);
    }

    values.push(id);
    const shouldRecheck = ["url", "enabled", "intervalSeconds", "timeoutMs", "expectedStatus"].some(
        (key) => Object.hasOwn(data, key),
    );

    const result = await pool.query(
        `UPDATE services
         SET ${assignments.join(", ")},
             updated_at = NOW()
             ${shouldRecheck ? ", next_check_at = NOW()" : ""}
         WHERE id = $${values.length}
         RETURNING *`,
        values,
    );
    return result.rows[0] || null;
}

async function deleteService(id) {
    const result = await pool.query(
        "DELETE FROM services WHERE id = $1 RETURNING id, name",
        [id],
    );
    return result.rows[0] || null;
}

async function claimDueServices(limit) {
    const result = await pool.query(
        `WITH due AS (
            SELECT id
            FROM services
            WHERE enabled = TRUE
              AND next_check_at <= NOW()
              AND (check_lease_until IS NULL OR check_lease_until < NOW())
            ORDER BY next_check_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         )
         UPDATE services AS s
         SET next_check_at = NOW() + (s.interval_seconds * INTERVAL '1 second'),
             check_lease_until = NOW() + ((GREATEST(s.timeout_ms, 5000) + 5000) * INTERVAL '1 millisecond')
         FROM due
         WHERE s.id = due.id
         RETURNING s.*`,
        [limit],
    );
    return result.rows;
}

async function claimServiceNow(id) {
    const result = await pool.query(
        `UPDATE services
         SET check_lease_until = NOW() + ((GREATEST(timeout_ms, 5000) + 5000) * INTERVAL '1 millisecond')
         WHERE id = $1
           AND enabled = TRUE
           AND (check_lease_until IS NULL OR check_lease_until < NOW())
         RETURNING *`,
        [id],
    );
    return result.rows[0] || null;
}

async function releaseCheckLease(id) {
    await pool.query(
        "UPDATE services SET check_lease_until = NULL WHERE id = $1",
        [id],
    );
}

async function persistCheckResult(service, check, incidentFailureThreshold) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await client.query(
            `INSERT INTO health_check_results
                (service_id, status, status_code, latency_ms, error_code, error)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                service.id,
                check.status,
                check.statusCode,
                check.latencyMs,
                check.errorCode,
                check.error,
            ],
        );

        const locked = await client.query(
            "SELECT * FROM services WHERE id = $1 FOR UPDATE",
            [service.id],
        );
        const current = locked.rows[0];
        if (!current) {
            await client.query("ROLLBACK");
            return null;
        }

        let incidentId = current.current_incident_id;
        let consecutiveFailures = Number(current.consecutive_failures || 0);
        let incidentEvent = null;

        if (check.status === "healthy") {
            if (incidentId) {
                await client.query(
                    `UPDATE incidents
                     SET status = 'resolved',
                         resolved_at = NOW(),
                         last_checked_at = NOW(),
                         final_status_code = $2
                     WHERE id = $1 AND resolved_at IS NULL`,
                    [incidentId, check.statusCode],
                );
                incidentEvent = "resolved";
            }
            incidentId = null;
            consecutiveFailures = 0;
        } else {
            consecutiveFailures += 1;

            if (incidentId) {
                await client.query(
                    `UPDATE incidents
                     SET last_checked_at = NOW(),
                         failure_count = failure_count + 1,
                         last_error_code = $2,
                         last_error = $3
                     WHERE id = $1`,
                    [incidentId, check.errorCode, check.error],
                );
            } else if (consecutiveFailures >= incidentFailureThreshold) {
                const created = await client.query(
                    `INSERT INTO incidents
                        (service_id, status, started_at, initial_error_code, initial_error, last_error_code, last_error)
                     VALUES ($1, 'open', COALESCE($4, NOW()), $2, $3, $2, $3)
                     RETURNING id`,
                    [service.id, check.errorCode, check.error, current.last_checked_at],
                );
                incidentId = created.rows[0].id;
                incidentEvent = "opened";
            }
        }

        const updated = await client.query(
            `UPDATE services
             SET last_status = $2,
                 last_status_code = $3,
                 last_latency_ms = $4,
                 last_error_code = $5,
                 last_error = $6,
                 last_checked_at = NOW(),
                 consecutive_failures = $7,
                 current_incident_id = $8,
                 check_lease_until = NULL,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [
                service.id,
                check.status,
                check.statusCode,
                check.latencyMs,
                check.errorCode,
                check.error,
                consecutiveFailures,
                incidentId,
            ],
        );

        await client.query("COMMIT");
        return { service: updated.rows[0], incidentEvent };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function getHistory(serviceId, limit = 100) {
    const result = await pool.query(
        `SELECT id, checked_at, status, status_code, latency_ms, error_code, error
         FROM health_check_results
         WHERE service_id = $1
         ORDER BY checked_at DESC
         LIMIT $2`,
        [serviceId, limit],
    );
    return result.rows;
}

async function getIncidents(serviceId, limit = 50) {
    const result = await pool.query(
        `SELECT * FROM incidents
         WHERE service_id = $1
         ORDER BY started_at DESC
         LIMIT $2`,
        [serviceId, limit],
    );
    return result.rows;
}

async function getMetrics() {
    const result = await pool.query(
        `SELECT
            COUNT(*)::bigint AS services_total,
            COUNT(*) FILTER (WHERE enabled = TRUE)::bigint AS services_enabled,
            COUNT(*) FILTER (WHERE last_status = 'healthy')::bigint AS services_healthy,
            COUNT(*) FILTER (WHERE last_status IN ('unhealthy', 'unreachable', 'blocked'))::bigint AS services_unhealthy,
            COUNT(*) FILTER (WHERE last_status IS NULL)::bigint AS services_unknown,
            (SELECT COUNT(*)::bigint FROM incidents WHERE resolved_at IS NULL) AS incidents_open
         FROM services`,
    );
    return result.rows[0];
}

async function pruneHistory(retentionDays) {
    const result = await pool.query(
        `DELETE FROM health_check_results
         WHERE checked_at < NOW() - ($1 * INTERVAL '1 day')`,
        [retentionDays],
    );
    return result.rowCount;
}

module.exports = {
    createService,
    listServices,
    getService,
    updateService,
    deleteService,
    claimDueServices,
    claimServiceNow,
    releaseCheckLease,
    persistCheckResult,
    getHistory,
    getIncidents,
    getMetrics,
    pruneHistory,
};
