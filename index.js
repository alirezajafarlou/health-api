const express = require("express");

const app = express();
app.use(express.json());
const services = [];
const port = process.env.PORT || 3000;

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

app.post("/services", (req, res) => {
    const service = {
        id: services.length + 1,
        name: req.body.name,
        url: req.body.url
    };

    services.push(service);

    res.status(201).json(service);
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}

module.exports = app;
