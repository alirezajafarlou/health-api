"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const { version } = require("./package.json");
const config = require("./src/config");
const logger = require("./src/logger");
const { pool, initializeSchema, checkDatabase, closeDatabase } = require("./src/db");
const repository = require("./src/repository");
const { startMonitor, runAndPersistServiceCheck } = require("./src/monitor");
const { isValidUUID, validateServicePayload } = require("./src/validation");
const {
    requestContext,
    securityHeaders,
    basicAuth,
    createRateLimiter,
    mutationOriginGuard,
    noStore,
} = require("./src/security");

const dashboardHtml = fs.readFileSync(
    path.join(__dirname, "frontend", "index.html"),
    "utf8",
);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);

app.use(requestContext);
app.use(securityHeaders);
app.use(
    createRateLimiter({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
        prefix: "global",
    }),
);
app.use(express.json({ limit: config.jsonBodyLimit, strict: true }));

const checkRateLimiter = createRateLimiter({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.checkMax,
    prefix: "checks",
});

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requireUuid(req, res, next) {
    if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ error: "invalid service id" });
    }
    next();
}

function parseLimit(value, fallback, max) {
    const number = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(number) || number < 1 || number > max) return null;
    return number;
}

function parseOffset(value) {
    const number = value === undefined ? 0 : Number(value);
    if (!Number.isInteger(number) || number < 0) return null;
    return number;
}

app.get("/live", (_req, res) => {
    res.json({ status: "alive" });
});

const readinessHandler = asyncRoute(async (_req, res) => {
    await checkDatabase();
    res.json({ status: "ready" });
});

app.get("/ready", readinessHandler);
app.get("/health", readinessHandler);

app.use(basicAuth);
app.use(mutationOriginGuard);

app.get("/", noStore, (_req, res) => {
    res.json({ message: "health-api is running", version });
});

app.get("/about", noStore, (_req, res) => {
    res.json({
        name: "health-api",
        version,
        description: "continuous HTTP/HTTPS service monitoring",
    });
});

app.get(
    "/stats",
    noStore,
    asyncRoute(async (_req, res) => {
        const metrics = await repository.getMetrics();
        res.json({
            total: Number(metrics.services_total),
            enabled: Number(metrics.services_enabled),
            healthy: Number(metrics.services_healthy),
            unhealthy: Number(metrics.services_unhealthy),
            unknown: Number(metrics.services_unknown),
            openIncidents: Number(metrics.incidents_open),
        });
    }),
);

app.get(
    "/metrics",
    noStore,
    asyncRoute(async (_req, res) => {
        const metrics = await repository.getMetrics();
        const memory = process.memoryUsage();
        const lines = [
            "# TYPE health_api_services_total gauge",
            `health_api_services_total ${metrics.services_total}`,
            "# TYPE health_api_services_enabled gauge",
            `health_api_services_enabled ${metrics.services_enabled}`,
            "# TYPE health_api_services_healthy gauge",
            `health_api_services_healthy ${metrics.services_healthy}`,
            "# TYPE health_api_services_unhealthy gauge",
            `health_api_services_unhealthy ${metrics.services_unhealthy}`,
            "# TYPE health_api_services_unknown gauge",
            `health_api_services_unknown ${metrics.services_unknown}`,
            "# TYPE health_api_incidents_open gauge",
            `health_api_incidents_open ${metrics.incidents_open}`,
            "# TYPE process_uptime_seconds gauge",
            `process_uptime_seconds ${process.uptime()}`,
            "# TYPE process_resident_memory_bytes gauge",
            `process_resident_memory_bytes ${memory.rss}`,
            "",
        ];
        res.type("text/plain; version=0.0.4; charset=utf-8").send(lines.join("\n"));
    }),
);

app.post(
    "/services",
    noStore,
    asyncRoute(async (req, res) => {
        const payload = validateServicePayload(req.body);
        const service = await repository.createService(payload);
        res.status(201).json(service);
    }),
);

app.get(
    "/services",
    noStore,
    asyncRoute(async (req, res) => {
        const limit = parseLimit(req.query.limit, 100, config.api.maxPageSize);
        const offset = parseOffset(req.query.offset);
        const search = String(req.query.search || "").trim();

        if (limit === null || offset === null || search.length > 200) {
            return res.status(400).json({ error: "invalid pagination or search" });
        }

        const services = await repository.listServices({ search, limit, offset });
        res.json(services);
    }),
);

app.get(
    "/services/:id",
    noStore,
    requireUuid,
    asyncRoute(async (req, res) => {
        const service = await repository.getService(req.params.id);
        if (!service) return res.status(404).json({ error: "service not found" });
        res.json(service);
    }),
);

app.patch(
    "/services/:id",
    noStore,
    requireUuid,
    asyncRoute(async (req, res) => {
        const payload = validateServicePayload(req.body, { partial: true });
        const service = await repository.updateService(req.params.id, payload);
        if (!service) return res.status(404).json({ error: "service not found" });
        res.json(service);
    }),
);

app.delete(
    "/services/:id",
    noStore,
    requireUuid,
    asyncRoute(async (req, res) => {
        const deleted = await repository.deleteService(req.params.id);
        if (!deleted) return res.status(404).json({ error: "service not found" });
        res.json({ message: "service deleted", id: deleted.id });
    }),
);

app.get(
    "/services/:id/health",
    noStore,
    requireUuid,
    asyncRoute(async (req, res) => {
        const service = await repository.getService(req.params.id);
        if (!service) return res.status(404).json({ error: "service not found" });
        res.json({
            id: service.id,
            name: service.name,
            status: service.last_status || "unknown",
            statusCode: service.last_status_code,
            latencyMs: service.last_latency_ms,
            checkedAt: service.last_checked_at,
            errorCode: service.last_error_code,
        });
    }),
);

app.post(
    "/services/:id/check",
    noStore,
    checkRateLimiter,
    requireUuid,
    asyncRoute(async (req, res) => {
        const service = await repository.claimServiceNow(req.params.id);
        if (!service) {
            const existing = await repository.getService(req.params.id);
            if (!existing) return res.status(404).json({ error: "service not found" });
            if (!existing.enabled) return res.status(409).json({ error: "service is disabled" });
            return res.status(409).json({ error: "health check already in progress" });
        }

        const updated = await runAndPersistServiceCheck(service);
        res.json({
            id: updated.id,
            name: updated.name,
            status: updated.last_status || "unknown",
            statusCode: updated.last_status_code,
            latencyMs: updated.last_latency_ms,
            checkedAt: updated.last_checked_at,
            errorCode: updated.last_error_code,
        });
    }),
);

app.get(
    "/services/:id/history",
    noStore,
    requireUuid,
    asyncRoute(async (req, res) => {
        const limit = parseLimit(req.query.limit, 100, 500);
        if (limit === null) return res.status(400).json({ error: "invalid limit" });
        const service = await repository.getService(req.params.id);
        if (!service) return res.status(404).json({ error: "service not found" });
        res.json(await repository.getHistory(req.params.id, limit));
    }),
);

app.get(
    "/services/:id/incidents",
    noStore,
    requireUuid,
    asyncRoute(async (req, res) => {
        const limit = parseLimit(req.query.limit, 50, 200);
        if (limit === null) return res.status(400).json({ error: "invalid limit" });
        const service = await repository.getService(req.params.id);
        if (!service) return res.status(404).json({ error: "service not found" });
        res.json(await repository.getIncidents(req.params.id, limit));
    }),
);

app.get("/dashboard", noStore, (_req, res) => {
    res.type("html").send(dashboardHtml);
});

app.use(
    express.static(path.join(__dirname, "frontend"), {
        etag: true,
        maxAge: config.isProduction ? "1h" : 0,
        setHeaders: (res, filePath) => {
            if (filePath.endsWith("index.html")) {
                res.setHeader("Cache-Control", "no-store");
            }
        },
    }),
);

app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
});

app.use((error, req, res, _next) => {
    logger.error("request_failed", {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        message: error.message,
    });

    if (error?.type === "entity.too.large") {
        return res.status(413).json({ error: "request body too large" });
    }
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ error: "invalid JSON" });
    }

    const statusCode = Number(error.statusCode) || 500;
    res.status(statusCode).json({
        error: statusCode >= 500 ? "internal server error" : error.message,
        requestId: req.requestId,
    });
});

async function start() {
    await initializeSchema();
    const monitor = startMonitor();

    const server = app.listen(config.port, "0.0.0.0", () => {
        logger.info("server_started", {
            port: config.port,
            env: config.nodeEnv,
        });
    });

    server.keepAliveTimeout = 5_000;
    server.headersTimeout = 15_000;
    server.requestTimeout = 35_000;

    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info("shutdown_started", { signal });

        const forceTimer = setTimeout(() => {
            logger.error("shutdown_forced");
            process.exit(1);
        }, config.shutdownTimeoutMs);
        forceTimer.unref();

        server.close(async (serverError) => {
            try {
                await monitor.stop();
                await closeDatabase();
                clearTimeout(forceTimer);
                if (serverError) throw serverError;
                logger.info("shutdown_complete");
                process.exit(0);
            } catch (error) {
                logger.error("shutdown_failed", { message: error.message });
                process.exit(1);
            }
        });
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));

    return server;
}

if (require.main === module) {
    start().catch((error) => {
        logger.error("startup_failed", { message: error.message });
        void closeDatabase().finally(() => process.exit(1));
    });
}

module.exports = app;
module.exports.pool = pool;
module.exports.start = start;
