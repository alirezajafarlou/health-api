const request = require("supertest");
const app = require("./index");

global.fetch = jest.fn();

describe("health-api", () => {
    afterAll(async () => {
        // Close the PostgreSQL connection pool after all tests finish.
        await app.pool.end();
    });

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

    test("POST /services rejects missing fields", async () => {
        const response = await request(app)
            .post("/services")
            .send({
                name: "my-api"
            });

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("name and url are required");
    });

    test("POST /services rejects an invalid URL", async () => {
        const response = await request(app)
            .post("/services")
            .send({
                name: "my-api",
                url: "not-a-url"
            });

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("url must be a valid URL");
    });

    test("GET /services returns the info about existing services", async () => {
        await request(app)
        .post("/services")
        .send({
            name: "my-api",
            url: "https://example.com"
        });

    const response = await request(app).get("/services");

    expect(response.statusCode).toBe(200);
    expect(response.body[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(response.body[0].name).toBe("my-api");
    expect(response.body[0].url).toBe("https://example.com");
    });

    test("GET /services/:id returns the matching service", async () => {
        const createResponse = await request(app)
            .post("/services")
            .send({
                name: "my-api",
                url: "https://example.com"
            });

        const response = await request(app)
            .get(`/services/${createResponse.body.id}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.id).toBe(createResponse.body.id);
        expect(response.body.name).toBe("my-api");
        expect(response.body.url).toBe("https://example.com");
        
    });

    test("GET /services/:id/health checks the service health", async () => {
        fetch.mockResolvedValue({
            ok: true
        });

        const createResponse = await request(app)
            .post("/services")
            .send({
                name: "my-api",
                url: "https://example.com"
            });

        const response = await request(app)
            .get(`/services/${createResponse.body.id}/health`);

        expect(response.statusCode).toBe(200);
        expect(response.body.id).toBe(createResponse.body.id);
        expect(response.body.name).toBe("my-api");
        expect(response.body.status).toBe("healthy");
    });

    test("GET /services/:id/health rejects an invalid UUID", async () => {
        const response = await request(app)
            .get("/services/not-a-uuid/health");

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("invalid service id");
    });
    
    test("DELETE /services/:id deletes an existing service", async () => {
        const createResponse = await request(app)
            .post("/services")
            .send({
                name: "my-api",
                url: "https://example.com"
            });
        
        const response = await request(app)
            .delete(`/services/${createResponse.body.id}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe(
            `deleted service with the id ${createResponse.body.id}`
        );
    });

    test("POST /Finding and deleting a non-existing service", async () => {
        const response = await request(app)
            .delete("/services/00000000-0000-0000-0000-000000000000");

        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe("service not found");
    });

    test("GET /services/:id returns 404 after the service is deleted", async () => {
        const createResponse = await request(app)
            .post("/services")
            .send({
                name: "my-api",
                url: "https://example.com"
            });

        await request(app)
            .delete(`/services/${createResponse.body.id}`);
        
        const response = await request(app)
            .get(`/services/${createResponse.body.id}`);

        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe("service not found");
    });

    test("GET /services/:id rejects an invalid UUID", async () => {
        const response = await request(app)
            .get("/services/not-a-uuid");

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("invalid service id");
    });

    test("DELETE /services/:id rejects an invalid UUID", async () => {
        const response = await request(app)
            .delete("/services/not-a-uuid");

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("invalid service id");
    });

});
