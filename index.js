const express = require("express");
const app = express();
app.use(express.json());
const services = [];
const { randomUUID } = require("crypto");
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
        id: randomUUID(),
        name: req.body.name,
        url: req.body.url
    };

    services.push(service);

    res.status(201).json(service);
});

app.get("/services", (req, res) => {
    res.json(services);
});

app.get("/services/:id", (req, res) => {
    const service = services.find((service) => {
        return service.id === req.params.id;
    });

    res.json(service);
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}

module.exports = app;
