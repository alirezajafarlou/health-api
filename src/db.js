"use strict";

const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");
const config = require("./config");
const logger = require("./logger");

const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    max: config.db.poolMax,
    application_name: "health-api",
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: config.db.statementTimeoutMs,
    query_timeout: config.db.statementTimeoutMs,
    idle_in_transaction_session_timeout: 10_000,
    allowExitOnIdle: config.nodeEnv === "test",
    ssl: config.db.ssl
        ? { rejectUnauthorized: config.db.sslRejectUnauthorized }
        : false,
});

pool.on("error", (error) => {
    logger.error("database_pool_error", { message: error.message });
});

async function initializeSchema() {
    await pool.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
    );

    const migrationsDir = path.join(__dirname, "..", "db", "migrations");
    const migrationFiles = (await fs.readdir(migrationsDir))
        .filter((name) => name.endsWith(".sql"))
        .sort();

    for (const name of migrationFiles) {
        const alreadyApplied = await pool.query(
            "SELECT 1 FROM schema_migrations WHERE name = $1",
            [name],
        );
        if (alreadyApplied.rowCount) continue;

        const sql = await fs.readFile(path.join(migrationsDir, name), "utf8");
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `SET LOCAL statement_timeout = '${config.db.migrationStatementTimeoutMs}ms'`,
            );
            await client.query(sql);
            await client.query(
                "INSERT INTO schema_migrations (name) VALUES ($1)",
                [name],
            );
            await client.query("COMMIT");
            logger.info("database_migration_applied", { name });
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}

async function checkDatabase() {
    await pool.query("SELECT 1");
}

async function closeDatabase() {
    await pool.end();
}

module.exports = { pool, initializeSchema, checkDatabase, closeDatabase };
