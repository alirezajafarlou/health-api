"use strict";

const config = require("./config");

const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(value) {
    return uuidRegex.test(String(value));
}

function validateServicePayload(input, { partial = false } = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw Object.assign(new Error("request body must be a JSON object"), {
            statusCode: 400,
        });
    }

    const allowed = new Set([
        "name",
        "url",
        "enabled",
        "intervalSeconds",
        "timeoutMs",
        "expectedStatus",
    ]);
    const unknown = Object.keys(input).filter((key) => !allowed.has(key));
    if (unknown.length) {
        throw Object.assign(new Error(`unknown field: ${unknown[0]}`), {
            statusCode: 400,
        });
    }

    const output = {};

    if (!partial || Object.hasOwn(input, "name")) {
        if (typeof input.name !== "string" || !input.name.trim()) {
            throw Object.assign(new Error("name is required"), { statusCode: 400 });
        }
        const name = input.name.trim();
        if (name.length > 100) {
            throw Object.assign(new Error("name must be <= 100 characters"), {
                statusCode: 400,
            });
        }
        output.name = name;
    }

    if (!partial || Object.hasOwn(input, "url")) {
        if (typeof input.url !== "string" || !input.url.trim()) {
            throw Object.assign(new Error("url is required"), { statusCode: 400 });
        }
        const value = input.url.trim();
        if (value.length > 2048) {
            throw Object.assign(new Error("url must be <= 2048 characters"), {
                statusCode: 400,
            });
        }
        let parsed;
        try {
            parsed = new URL(value);
        } catch {
            throw Object.assign(new Error("url must be a valid URL"), {
                statusCode: 400,
            });
        }
        if (!["http:", "https:"].includes(parsed.protocol)) {
            throw Object.assign(new Error("url must use http or https"), {
                statusCode: 400,
            });
        }
        if (parsed.username || parsed.password) {
            throw Object.assign(new Error("credentials in service URLs are not allowed"), {
                statusCode: 400,
            });
        }
        output.url = parsed.toString();
    }

    if (Object.hasOwn(input, "enabled")) {
        if (typeof input.enabled !== "boolean") {
            throw Object.assign(new Error("enabled must be boolean"), {
                statusCode: 400,
            });
        }
        output.enabled = input.enabled;
    }

    if (Object.hasOwn(input, "intervalSeconds")) {
        const value = input.intervalSeconds;
        if (
            !Number.isInteger(value) ||
            value < config.monitoring.minIntervalSeconds ||
            value > 86_400
        ) {
            throw Object.assign(
                new Error(
                    `intervalSeconds must be an integer between ${config.monitoring.minIntervalSeconds} and 86400`,
                ),
                { statusCode: 400 },
            );
        }
        output.intervalSeconds = value;
    }

    if (Object.hasOwn(input, "timeoutMs")) {
        const value = input.timeoutMs;
        if (!Number.isInteger(value) || value < 500 || value > 30_000) {
            throw Object.assign(
                new Error("timeoutMs must be an integer between 500 and 30000"),
                { statusCode: 400 },
            );
        }
        output.timeoutMs = value;
    }

    if (Object.hasOwn(input, "expectedStatus")) {
        const value = input.expectedStatus;
        if (
            value !== null &&
            (!Number.isInteger(value) || value < 100 || value > 599)
        ) {
            throw Object.assign(
                new Error("expectedStatus must be null or an HTTP status 100-599"),
                { statusCode: 400 },
            );
        }
        output.expectedStatus = value;
    }

    if (partial && Object.keys(output).length === 0) {
        throw Object.assign(new Error("at least one update field is required"), {
            statusCode: 400,
        });
    }

    return output;
}

module.exports = { isValidUUID, validateServicePayload };
