const request = require("supertest");
const app = require("./index");

describe("health-api", () => {
    test("GET / returns the application message", async () => {
        const response = await request(app).get("/");

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe("health-api is running");
    });

    test("GET /health returns healthy status", async () => {
        const response = await request(app).get("/health");

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe("broken");
    });
});
