"use strict";

function loadSecurity() {
    jest.resetModules();
    process.env.NODE_ENV = "test";
    process.env.AUTH_DISABLED = "false";
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "correct-horse-battery-staple";
    return require("./security");
}

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

describe("basicAuth", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
        jest.resetModules();
    });

    test("accepts valid credentials", () => {
        const { basicAuth } = loadSecurity();
        const credentials = Buffer.from(
            "admin:correct-horse-battery-staple",
            "utf8",
        ).toString("base64");
        const req = { headers: { authorization: `Basic ${credentials}` } };
        const res = createResponse();
        const next = jest.fn();

        basicAuth(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
    });

    test("rejects wrong credentials with a different length", () => {
        const { basicAuth } = loadSecurity();
        const credentials = Buffer.from("admin:wrong", "utf8").toString("base64");
        const req = { headers: { authorization: `Basic ${credentials}` } };
        const res = createResponse();
        const next = jest.fn();

        basicAuth(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "invalid credentials" });
    });

    test("requires an Authorization header", () => {
        const { basicAuth } = loadSecurity();
        const req = { headers: {} };
        const res = createResponse();
        const next = jest.fn();

        basicAuth(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "authentication required" });
        expect(res.headers["WWW-Authenticate"]).toContain("Basic realm");
    });
});
