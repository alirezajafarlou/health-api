require("dotenv").config();

const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());

const { Pool } = require("pg");

const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id) {
    return uuidRegex.test(id);
}

const port = process.env.PORT || 3000;

// Create a PostgreSQL connection pool using environment variables.
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

app.get("/", (req, res) => {
    res.json({ 
        message: "health-api is running" 
    });
});

app.get("/health", (req, res) => {
    res.json({ status: "healthy" });
});

app.get("/about", (req, res) => {
    res.json({
        name: "health-api",
        description: "a health checker api",
    });
});

app.post("/services", async (req, res) => {
    const { name, url } = req.body;

    // Validate required fields before attempting to write to the database.
    if (!name || !url) {
        return res.status(400).json({
            error: "name and url are required",
        });
    }

    // Ensure the URL can be parsed before storing it.
    try {
        new URL(url);
    } catch {
        return res.status(400).json({
            error: "url must be a valid URL",
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO services (name, url)
             VALUES ($1, $2)
             RETURNING *`,
            [name, url],
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Database error:", error);

        res.status(500).json({
            error: "internal server error",
        });
    }
});

app.get("/services", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM services");

        res.json(result.rows);
    } catch (error) {
        console.error("Database error:", error);

        res.status(500).json({
            error: "internal server error",
        });
    }
});

app.delete("/services/:id", async (req, res) => {
    if (!isValidUUID(req.params.id)) {
        return res.status(400).json({
            error: "invalid service id",
        });
    }

    let result;

    try {
        result = await pool.query(
            "DELETE FROM services WHERE id = $1 RETURNING *",
            [req.params.id],
        );
    } catch (error) {
        console.error("Database error:", error);

        return res.status(500).json({
            error: "internal server error",
        });
    }

    if (result.rows.length === 0) {
        return res.status(404).json({
            error: "service not found",
        });
    }

    res.status(200).json({
        message: `deleted service with the id ${req.params.id}`,
    });
});

app.get("/services/:id", async (req, res) => {
    if (!isValidUUID(req.params.id)) {
        return res.status(400).json({
            error: "invalid service id",
        });
    }

    let result;

    try {
        result = await pool.query("SELECT * FROM services WHERE id = $1", [
            req.params.id,
        ]);
    } catch (error) {
        console.error("Database error:", error);

        return res.status(500).json({
            error: "internal server error",
        });
    }

    if (result.rows.length === 0) {
        return res.status(404).json({
            error: "service not found",
        });
    }

    res.json(result.rows[0]);
});

app.patch("/services/:id", async (req, res) => {
    const { name, url } = req.body;

    // Validate the update body first.
    if (!name && !url) {
        return res.status(400).json({
            error: "name or url is required",
        });
    }

    // Validate URL only if one was provided.
    if (url) {
        try {
            new URL(url);
        } catch {
            return res.status(400).json({
                error: "url must be a valid URL",
            });
        }
    }

    // Validate service ID.
    if (!isValidUUID(req.params.id)) {
        return res.status(400).json({
            error: "invalid service id",
        });
    }

    try {
        const result = await pool.query(
            `UPDATE services
             SET name = COALESCE($1, name),
                 url = COALESCE($2, url)
             WHERE id = $3
             RETURNING *`,
            [name ?? null, url ?? null, req.params.id],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "service not found",
            });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error("Database error:", error);

        return res.status(500).json({
            error: "internal server error",
        });
    }
});

// Check the service URL to determine its health.
app.get("/services/:id/health", async (req, res) => {
    if (!isValidUUID(req.params.id)) {
        return res.status(400).json({
            error: "invalid service id",
        });
    }

    let result;

    try {
        result = await pool.query("SELECT * FROM services WHERE id = $1", [
            req.params.id,
        ]);
    } catch (error) {
        console.error("Database error:", error);

        return res.status(500).json({
            error: "internal server error",
        });
    }

    if (result.rows.length === 0) {
        return res.status(404).json({
            error: "service not found",
        });
    }

    const service = result.rows[0];

    try {
        const serviceUrl = String(service.url).trim();

        const parsedUrl = new URL(serviceUrl);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            return res.status(400).json({
                error: "service URL must use http or https",
            });
        }

        const response = await fetch(parsedUrl, {
            method: "GET",
            signal: AbortSignal.timeout(10000),
        });

        res.json({
            id: service.id,
            name: service.name,
            status: response.ok ? "healthy" : "unhealthy",
            statusCode: response.status,
        });
    } catch (error) {
        console.error(
            `Health check failed for ${JSON.stringify(service.url)}:`,
            error,
        );

        res.status(200).json({
            id: service.id,
            name: service.name,
            status: "unreachable",
            error: error.message,
        });
    }
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.use(express.static(path.join(__dirname, "frontend")));

if (require.main === module) {
    app.listen(port, "0.0.0.0", () => {
        console.log(`Server listening on 0.0.0.0:${port}`);
    });
}

module.exports = app;
module.exports.pool = pool;
