const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.json({ message: "health-api is running" });
});

app.get("/health", (req, res) => {
    res.json({ status: "healthy" });
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}

module.exports = app;
