"use strict";

process.env.NODE_ENV = "test";
process.env.AUTH_DISABLED = "true";
process.env.MONITOR_ENABLED = "false";

const {
    isPublicIp,
    matchesAllowlist,
    validateUrlBasics,
    resolveTarget,
} = require("./ssrf");

describe("SSRF target policy", () => {
    test.each([
        "127.0.0.1",
        "10.0.0.1",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "::1",
        "fc00::1",
        "fe80::1",
        "::ffff:127.0.0.1",
        "::ffff:7f00:1",
        "2001:db8::1",
        "3fff::1",
    ])("blocks non-public IP %s", (ip) => {
        expect(isPublicIp(ip)).toBe(false);
    });

    test.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
        "accepts public IP %s",
        (ip) => {
            expect(isPublicIp(ip)).toBe(true);
        },
    );

    test("rejects non-http protocols", () => {
        expect(() => validateUrlBasics("file:///etc/passwd")).toThrow(
            /http or https/,
        );
    });

    test("rejects credentials embedded in URL", () => {
        expect(() => validateUrlBasics("http://user:pass@example.com")).toThrow(
            /credentials/,
        );
    });

    test("supports exact and wildcard private-target allowlists", () => {
        expect(matchesAllowlist("api.internal.example", ["api.internal.example"]))
            .toBe(true);
        expect(matchesAllowlist("a.svc.example", ["*.svc.example"]))
            .toBe(true);
        expect(matchesAllowlist("svc.example", ["*.svc.example"]))
            .toBe(false);
    });

    test("blocks literal metadata address by default", async () => {
        await expect(resolveTarget("http://169.254.169.254/latest/meta-data"))
            .rejects.toMatchObject({ code: "PRIVATE_ADDRESS_BLOCKED" });
    });

    test("allows explicitly allowlisted private targets", async () => {
        const resolved = await resolveTarget("http://127.0.0.1:8080/health", {
            allowHosts: ["127.0.0.1"],
        });
        expect(resolved.addresses[0].address).toBe("127.0.0.1");
    });

    test("pinned request can reach an explicitly allowlisted private target", async () => {
        const http = require("http");
        const { checkHttpEndpoint } = require("./ssrf");
        const server = http.createServer((_req, res) => {
            res.statusCode = 204;
            res.end();
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        try {
            const { port } = server.address();
            const result = await checkHttpEndpoint(
                {
                    url: `http://127.0.0.1:${port}/health`,
                    timeout_ms: 1000,
                    expected_status: 204,
                },
                { allowHosts: ["127.0.0.1"] },
            );
            expect(result.status).toBe("healthy");
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    test("revalidates redirect targets and blocks redirect to metadata IP", async () => {
        const http = require("http");
        const { checkHttpEndpoint } = require("./ssrf");
        const server = http.createServer((_req, res) => {
            res.statusCode = 302;
            res.setHeader("Location", "http://169.254.169.254/latest/meta-data");
            res.end();
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        try {
            const { port } = server.address();
            const result = await checkHttpEndpoint(
                {
                    url: `http://127.0.0.1:${port}/health`,
                    timeout_ms: 1000,
                    expected_status: null,
                },
                { allowHosts: ["127.0.0.1"] },
            );
            expect(result.status).toBe("blocked");
            expect(result.errorCode).toBe("PRIVATE_ADDRESS_BLOCKED");
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});
