"use strict";

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === "") return fallback;
    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseInteger(name, fallback, { min, max } = {}) {
    const raw = process.env[name];
    const value = raw === undefined || raw === "" ? fallback : Number(raw);

    if (!Number.isInteger(value)) {
        throw new Error(`${name} must be an integer`);
    }
    if (min !== undefined && value < min) {
        throw new Error(`${name} must be >= ${min}`);
    }
    if (max !== undefined && value > max) {
        throw new Error(`${name} must be <= ${max}`);
    }
    return value;
}

function parseOptionalHttpUrl(name) {
    const raw = process.env[name];
    if (!raw) return "";
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error(`${name} must be a valid URL`);
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error(`${name} must use http or https`);
    }
    if (parsed.username || parsed.password) {
        throw new Error(`${name} must not contain URL credentials`);
    }
    return parsed.toString();
}

function parseList(value) {
    return String(value || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const authDisabled = parseBoolean(process.env.AUTH_DISABLED, false);

if (isProduction && authDisabled) {
    throw new Error("AUTH_DISABLED cannot be enabled in production");
}

const adminUsername = process.env.ADMIN_USERNAME || "";
const adminPassword = process.env.ADMIN_PASSWORD || "";

if (!authDisabled && (!adminUsername || !adminPassword)) {
    throw new Error(
        "ADMIN_USERNAME and ADMIN_PASSWORD are required unless AUTH_DISABLED=true",
    );
}

if (isProduction && adminPassword.length < 16) {
    throw new Error("ADMIN_PASSWORD must be at least 16 characters in production");
}

if (isProduction && !process.env.DB_PASSWORD) {
    throw new Error("DB_PASSWORD is required in production");
}

module.exports = Object.freeze({
    nodeEnv,
    isProduction,
    port: parseInteger("PORT", 3000, { min: 1, max: 65535 }),
    trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
    jsonBodyLimit: process.env.JSON_BODY_LIMIT || "32kb",

    db: {
        host: process.env.DB_HOST || "localhost",
        port: parseInteger("DB_PORT", 5432, { min: 1, max: 65535 }),
        user: process.env.DB_USER || "healthapi",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "healthapi",
        poolMax: parseInteger("DB_POOL_MAX", 10, { min: 1, max: 100 }),
        statementTimeoutMs: parseInteger("DB_STATEMENT_TIMEOUT_MS", 10_000, {
            min: 1_000,
            max: 120_000,
        }),
        migrationStatementTimeoutMs: parseInteger(
            "DB_MIGRATION_STATEMENT_TIMEOUT_MS",
            60_000,
            { min: 5_000, max: 600_000 },
        ),
        ssl: parseBoolean(process.env.DB_SSL, false),
        sslRejectUnauthorized: parseBoolean(
            process.env.DB_SSL_REJECT_UNAUTHORIZED,
            true,
        ),
    },

    auth: {
        disabled: authDisabled,
        username: adminUsername,
        password: adminPassword,
    },

    rateLimit: {
        windowMs: parseInteger("RATE_LIMIT_WINDOW_MS", 60_000, {
            min: 1_000,
            max: 3_600_000,
        }),
        max: parseInteger("RATE_LIMIT_MAX", 240, { min: 10, max: 100_000 }),
        checkMax: parseInteger("HEALTH_CHECK_RATE_LIMIT_MAX", 60, {
            min: 1,
            max: 10_000,
        }),
    },

    monitoring: {
        enabled: parseBoolean(process.env.MONITOR_ENABLED, nodeEnv !== "test"),
        pollMs: parseInteger("MONITOR_POLL_MS", 5_000, {
            min: 1_000,
            max: 300_000,
        }),
        batchSize: parseInteger("MONITOR_BATCH_SIZE", 50, {
            min: 1,
            max: 1_000,
        }),
        concurrency: parseInteger("MONITOR_CONCURRENCY", 5, {
            min: 1,
            max: 100,
        }),
        incidentFailureThreshold: parseInteger(
            "INCIDENT_FAILURE_THRESHOLD",
            2,
            { min: 1, max: 20 },
        ),
        retentionDays: parseInteger("RESULT_RETENTION_DAYS", 30, {
            min: 1,
            max: 3650,
        }),
        minIntervalSeconds: parseInteger("MIN_CHECK_INTERVAL_SECONDS", 15, {
            min: 5,
            max: 86_400,
        }),
        defaultIntervalSeconds: parseInteger(
            "DEFAULT_CHECK_INTERVAL_SECONDS",
            60,
            { min: 5, max: 86_400 },
        ),
        defaultTimeoutMs: parseInteger("DEFAULT_CHECK_TIMEOUT_MS", 10_000, {
            min: 500,
            max: 30_000,
        }),
        maxRedirects: parseInteger("MAX_HEALTH_REDIRECTS", 3, {
            min: 0,
            max: 10,
        }),
    },

    targets: {
        allowPrivate: parseBoolean(process.env.ALLOW_PRIVATE_TARGETS, false),
        allowHosts: parseList(process.env.TARGET_ALLOWLIST),
        dnsTimeoutMs: parseInteger("DNS_LOOKUP_TIMEOUT_MS", 3_000, {
            min: 250,
            max: 30_000,
        }),
    },

    alerts: {
        webhookUrl: parseOptionalHttpUrl("ALERT_WEBHOOK_URL"),
        webhookToken: process.env.ALERT_WEBHOOK_TOKEN || "",
        timeoutMs: parseInteger("ALERT_WEBHOOK_TIMEOUT_MS", 5_000, {
            min: 500,
            max: 30_000,
        }),
    },

    api: {
        maxPageSize: parseInteger("MAX_SERVICES_PAGE_SIZE", 100, {
            min: 10,
            max: 1000,
        }),
    },

    shutdownTimeoutMs: parseInteger("SHUTDOWN_TIMEOUT_MS", 10_000, {
        min: 1_000,
        max: 60_000,
    }),
});
