"use strict";

process.env.NODE_ENV = "test";
process.env.AUTH_DISABLED = "true";
process.env.MONITOR_ENABLED = "false";

jest.mock("./src/ssrf", () => ({
    checkHttpEndpoint: jest.fn(),
}));

const request = require("supertest");
const app = require("./index");
const { checkHttpEndpoint } = require("./src/ssrf");

async function resetDatabase() {
    await app.pool.query("DELETE FROM health_check_results");
    await app.pool.query("DELETE FROM incidents");
    await app.pool.query("DELETE FROM services");
}

async function createService(overrides = {}) {
    return request(app)
        .post("/services")
        .send({
            name: "my-api",
            url: "https://example.com/health",
            ...overrides,
        });
}

describe("health-api", () => {
    beforeEach(async () => {
        checkHttpEndpoint.mockReset();
        await resetDatabase();
    });

    afterAll(async () => {
        await resetDatabase();
        await app.pool.end();
    });

    test("GET /live returns process liveness", async () => {
        const response = await request(app).get("/live");
        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe("alive");
    });

    test("GET /ready checks database readiness", async () => {
        const response = await request(app).get("/ready");
        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe("ready");
    });

    test("GET /dashboard serves the preloaded dashboard HTML", async () => {
        const response = await request(app).get("/dashboard");
        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toMatch(/text\/html/);
        expect(response.text).toMatch(/<!doctype html>/i);
        expect(response.headers["cache-control"]).toBe("no-store");
    });

    test("POST /services creates a monitored service", async () => {
        const response = await createService();
        expect(response.statusCode).toBe(201);
        expect(response.body.name).toBe("my-api");
        expect(response.body.enabled).toBe(true);
        expect(response.body.interval_seconds).toBeGreaterThanOrEqual(15);
    });

    test("POST /services rejects unsupported protocols", async () => {
        const response = await createService({ url: "file:///etc/passwd" });
        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("url must use http or https");
    });

    test("POST /services rejects URL credentials", async () => {
        const response = await createService({
            url: "https://user:pass@example.com/health",
        });
        expect(response.statusCode).toBe(400);
        expect(response.body.error).toMatch(/credentials/i);
    });

    test("POST /services rejects unknown fields", async () => {
        const response = await createService({ admin: true });
        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("unknown field: admin");
    });

    test("GET /services lists services without triggering checks", async () => {
        await createService();
        const response = await request(app).get("/services");
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(checkHttpEndpoint).not.toHaveBeenCalled();
    });

    test("PATCH /services updates whitelisted fields", async () => {
        const created = await createService();
        const response = await request(app)
            .patch(`/services/${created.body.id}`)
            .send({ intervalSeconds: 120, enabled: false });
        expect(response.statusCode).toBe(200);
        expect(response.body.interval_seconds).toBe(120);
        expect(response.body.enabled).toBe(false);
    });

    test("GET /services/:id/health returns cached status", async () => {
        const created = await createService();
        const response = await request(app).get(
            `/services/${created.body.id}/health`,
        );
        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe("unknown");
        expect(checkHttpEndpoint).not.toHaveBeenCalled();
    });

    test("POST /services/:id/check runs and persists a health check", async () => {
        checkHttpEndpoint.mockResolvedValue({
            status: "healthy",
            statusCode: 204,
            latencyMs: 12.5,
            errorCode: null,
            error: null,
        });
        const created = await createService();

        const checked = await request(app).post(
            `/services/${created.body.id}/check`,
        );
        expect(checked.statusCode).toBe(200);
        expect(checked.body.status).toBe("healthy");
        expect(checked.body.statusCode).toBe(204);

        const history = await request(app).get(
            `/services/${created.body.id}/history`,
        );
        expect(history.statusCode).toBe(200);
        expect(history.body).toHaveLength(1);
        expect(history.body[0].status).toBe("healthy");
    });

    test("two failed checks open an incident and recovery resolves it", async () => {
        checkHttpEndpoint.mockResolvedValue({
            status: "unreachable",
            statusCode: null,
            latencyMs: 5,
            errorCode: "TIMEOUT",
            error: "health request failed",
        });
        const created = await createService();
        await request(app).post(`/services/${created.body.id}/check`);
        await request(app).post(`/services/${created.body.id}/check`);

        let incidents = await request(app).get(
            `/services/${created.body.id}/incidents`,
        );
        expect(incidents.body).toHaveLength(1);
        expect(incidents.body[0].resolved_at).toBeNull();

        checkHttpEndpoint.mockResolvedValue({
            status: "healthy",
            statusCode: 200,
            latencyMs: 4,
            errorCode: null,
            error: null,
        });
        await request(app).post(`/services/${created.body.id}/check`);

        incidents = await request(app).get(
            `/services/${created.body.id}/incidents`,
        );
        expect(incidents.body[0].resolved_at).not.toBeNull();
    });

    test("GET /stats reports totals independently of list pagination", async () => {
        await createService();
        const response = await request(app).get("/stats");
        expect(response.statusCode).toBe(200);
        expect(response.body.total).toBe(1);
        expect(response.body.unknown).toBe(1);
    });

    test("manual check refuses an already leased service", async () => {
        const created = await createService();
        await app.pool.query(
            "UPDATE services SET check_lease_until = NOW() + INTERVAL '1 minute' WHERE id = $1",
            [created.body.id],
        );
        const response = await request(app).post(
            `/services/${created.body.id}/check`,
        );
        expect(response.statusCode).toBe(409);
        expect(response.body.error).toMatch(/already in progress/);
    });

    test("DELETE /services removes service and cascades monitoring data", async () => {
        const created = await createService();
        const response = await request(app).delete(`/services/${created.body.id}`);
        expect(response.statusCode).toBe(200);

        const lookup = await request(app).get(`/services/${created.body.id}`);
        expect(lookup.statusCode).toBe(404);
    });

    test("invalid UUIDs are rejected before database access", async () => {
        const response = await request(app).get("/services/not-a-uuid");
        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe("invalid service id");
    });
});
