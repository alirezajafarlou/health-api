const request = require("supertest");
const app = require("./index");
const expectCookies = require("supertest/lib/cookies");

describe("health-api", () => {
    test("GET / returns the application message", async () => {
        const response = await request(app).get("/");

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe("health-api is running");
    });

    test("GET /health returns healthy status", async () => {
        const response = await request(app).get("/health");

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe("healthy");
    });

    test("GET /about returns description about the api", async () => {
        const response = await request(app).get("/about");

        expect(response.statusCode).toBe(200);
        expect(response.body.description).toBe("a health checker api");
    });

    test("POST /services sends info about the given service", async () => {
        const response = await request(app)
        .post("/services")
        .send({
            name: "my-api",
            url: "https://example.com"
        });

        expect(response.statusCode).toBe(201);
        expect(response.body.name).toBe("my-api")
    });
});
