const request = require("supertest");
const app = require("./index");

global.fetch = jest.fn();

const createdServiceIds = [];

async function createTestService() {
    const response = await request(app).post("/services").send({
        name: "my-api",
        url: "https://example.com",
    });

    createdServiceIds.push(response.body.id);

    return response;
}

describe("health-api", () => {
    beforeEach(() => {
        fetch.mockReset();
    });

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
        const response = await request(app).post("/services").send({
            name: "my-api",
            url: "https://example.com",
        });

        expect(response.statusCode).toBe(201);
        expect(response.body.name).toBe("my-api");
    });

    test("POST /services rejects missing fields", async () => {
        const response = await request(app).post("/services").send({
            name: "my-api",
        });

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("name and url are required");
    });

    test("POST /services rejects an invalid URL", async () => {
        const response = await request(app).post("/services").send({
            name: "my-api",
            url: "not-a-url",
        });

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("url must be a valid URL");
    });

    test("GET /services returns the info about existing services", async () => {
        const createResponse = await createTestService();

    const response = await request(app).get("/services");

    expect(response.statusCode).toBe(200);

    const service = response.body.find(
        (item) => item.id === createResponse.body.id,
    );

    expect(service).toBeDefined();
    expect(service.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(service.name).toBe("my-api");
    expect(service.url).toBe("https://example.com");
    });

    test("GET /services/:id returns the matching service", async () => {
        const createResponse = await createTestService();

        const response = await request(app).get(
            `/services/${createResponse.body.id}`,
        );

        expect(response.statusCode).toBe(200);
        expect(response.body.id).toBe(createResponse.body.id);
        expect(response.body.name).toBe("my-api");
        expect(response.body.url).toBe("https://example.com");
    });

    test("GET /services/:id/health checks the service health", async () => {
        fetch.mockResolvedValue({
            ok: true,
        });

        const createResponse = await createTestService();

        const response = await request(app).get(
            `/services/${createResponse.body.id}/health`,
        );

        expect(response.statusCode).toBe(200);
        expect(response.body.id).toBe(createResponse.body.id);
        expect(response.body.name).toBe("my-api");
        expect(response.body.status).toBe("healthy");
    });

    test("GET /services/:id/health rejects an invalid UUID", async () => {
        const response = await request(app).get("/services/not-a-uuid/health");

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("invalid service id");
    });

    test("DELETE /services/:id deletes an existing service", async () => {
        const createResponse = await createTestService();

        const response = await request(app).delete(
            `/services/${createResponse.body.id}`,
        );

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe(
            `deleted service with the id ${createResponse.body.id}`,
        );
    });

    test("DELETE /services/:id returns 404 for a non-existing service", async () => {
        const response = await request(app).delete(
            "/services/00000000-0000-0000-0000-000000000000",
        );

        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe("service not found");
    });

    test("GET /services/:id returns 404 after the service is deleted", async () => {
        const createResponse = await createTestService();

        await request(app).delete(`/services/${createResponse.body.id}`);

        const response = await request(app).get(
            `/services/${createResponse.body.id}`,
        );

        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe("service not found");
    });

    test("GET /services/:id rejects an invalid UUID", async () => {
        const response = await request(app).get("/services/not-a-uuid");

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("invalid service id");
    });

    test("DELETE /services/:id rejects an invalid UUID", async () => {
        const response = await request(app).delete("/services/not-a-uuid");

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("invalid service id");
    });

    test("GET /services/:id handles database errors", async () => {
        const querySpy = jest
            .spyOn(app.pool, "query")
            .mockRejectedValue(new Error("database failure"));

        const response = await request(app).get(
            "/services/00000000-0000-0000-0000-000000000001",
        );

        expect(response.statusCode).toBe(500);
        expect(response.body.error).toBe("internal server error");

        querySpy.mockRestore();
    });

    test("DELETE /services/:id handles database errors", async () => {
        const querySpy = jest
            .spyOn(app.pool, "query")
            .mockRejectedValue(new Error("database failure"));

        const response = await request(app).delete(
            "/services/00000000-0000-0000-0000-000000000001",
        );

        expect(response.statusCode).toBe(500);
        expect(response.body.error).toBe("internal server error");

        querySpy.mockRestore();
    });

    test("GET /services/:id/health handles database errors", async () => {
        const querySpy = jest
            .spyOn(app.pool, "query")
            .mockRejectedValue(new Error("database failure"));

        const response = await request(app).get(
            "/services/00000000-0000-0000-0000-000000000001/health",
        );

        expect(response.statusCode).toBe(500);
        expect(response.body.error).toBe("internal server error");

        querySpy.mockRestore();
    });

    test("PATCH /services/:id updates the service", async () => {
        const createResponse = await createTestService();

        const response = await request(app)
            .patch(`/services/${createResponse.body.id}`)
            .send({
                name: "updated-api",
                url: "https://example.org",
            });

        expect(response.statusCode).toBe(200);
        expect(response.body.id).toBe(createResponse.body.id);
        expect(response.body.name).toBe("updated-api");
        expect(response.body.url).toBe("https://example.org");
    });

    test("PATCH /services/:id rejects an invalid UUID", async () => {
        const response = await request(app).patch("/services/not-a-uuid").send({
            name: "updated-api",
        });

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("invalid service id");
    });

    test("PATCH /services/:id rejects an invalid URL", async () => {
        const createResponse = await createTestService();

        const response = await request(app)
            .patch(`/services/${createResponse.body.id}`)
            .send({
                url: "not-a-url",
            });

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("url must be a valid URL");
    });

    test("PATCH /services/:id returns 404 for a non-existing service", async () => {
        const response = await request(app)
            .patch("/services/00000000-0000-0000-0000-000000000000")
            .send({
                name: "updated-api",
            });

        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe("service not found");
    });

    test("PATCH /services/:id rejects an empty update", async () => {
        const createResponse = await createTestService();

        const response = await request(app)
            .patch(`/services/${createResponse.body.id}`)
            .send({});

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("name or url is required");
    });
});
