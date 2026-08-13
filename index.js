const express = require("express");
const app = express();
app.use(express.json());

const { Pool } = require("pg");

const port = process.env.PORT || 3000;

const pool = new Pool({
    host: "localhost",
    port: 5432,
    user: "healthapi",
    password: "healthapi",
    database: "healthapi"
});

app.get("/", (req, res) => {
    res.json({ message: "health-api is running" });
});

app.get("/health", (req, res) => {
    res.json({ status: "healthy" });
});

app.get("/about", (req, res) => {
    res.json({ 
        name: "health-api",
        description: "a health checker api"
    });
});

app.post("/services", async(req, res) => {
    const result = await pool.query(
        `INSERT INTO services (name, url)
         VALUES ($1, $2)
         RETURNING *`,
        [req.body.name, req.body.url]
    );

    res.status(201).json(result.rows[0]);
});

app.get("/services", async (req, res) => {
    const result = await pool.query(
        "SELECT * FROM services"
    );

    res.json(result.rows);
});

app.delete("/services/:id", async (req, res) => {
    const result = await pool.query(
        "DELETE FROM services WHERE id = $1 RETURNING *",
        [req.params.id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({
            error: "service not found"
        });
    }

    res.status(200).json({
        message: `deleted service with the id ${req.params.id}`
    });
});

app.get("/services/:id", async (req, res) => {
    const result = await pool.query(
        "SELECT * FROM services WHERE id = $1",
        [req.params.id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({
            error: "service not found"
        });
    }

    res.json(result.rows[0]);
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}

module.exports = app;
module.exports.pool = pool;