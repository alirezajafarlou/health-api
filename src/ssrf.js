"use strict";

const dns = require("dns/promises");
const http = require("http");
const https = require("https");
const net = require("net");
const { performance } = require("perf_hooks");
const config = require("./config");

class TargetPolicyError extends Error {
    constructor(message, code = "TARGET_BLOCKED") {
        super(message);
        this.name = "TargetPolicyError";
        this.code = code;
    }
}

class HealthRequestError extends Error {
    constructor(message, code = "REQUEST_FAILED") {
        super(message);
        this.name = "HealthRequestError";
        this.code = code;
    }
}

function ipv4ToInt(ip) {
    return ip
        .split(".")
        .map(Number)
        .reduce((acc, octet) => ((acc << 8) | octet) >>> 0, 0);
}

function inIpv4Cidr(ip, base, prefix) {
    const value = ipv4ToInt(ip);
    const network = ipv4ToInt(base);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (network & mask);
}

function isPublicIpv4(ip) {
    const blocked = [
        ["0.0.0.0", 8],
        ["10.0.0.0", 8],
        ["100.64.0.0", 10],
        ["127.0.0.0", 8],
        ["169.254.0.0", 16],
        ["172.16.0.0", 12],
        ["192.0.0.0", 24],
        ["192.0.2.0", 24],
        ["192.168.0.0", 16],
        ["198.18.0.0", 15],
        ["198.51.100.0", 24],
        ["203.0.113.0", 24],
        ["224.0.0.0", 4],
        ["240.0.0.0", 4],
    ];
    return !blocked.some(([base, prefix]) => inIpv4Cidr(ip, base, prefix));
}

function ipv6ToBigInt(ip) {
    let value = String(ip).toLowerCase();
    const zoneIndex = value.indexOf("%");
    if (zoneIndex >= 0) value = value.slice(0, zoneIndex);

    if (value.includes(".")) {
        const lastColon = value.lastIndexOf(":");
        const ipv4 = value.slice(lastColon + 1);
        if (net.isIP(ipv4) !== 4) throw new Error("invalid IPv4 tail");
        const octets = ipv4.split(".").map(Number);
        const high = ((octets[0] << 8) | octets[1]).toString(16);
        const low = ((octets[2] << 8) | octets[3]).toString(16);
        value = `${value.slice(0, lastColon)}:${high}:${low}`;
    }

    const pieces = value.split("::");
    if (pieces.length > 2) throw new Error("invalid IPv6");

    const left = pieces[0] ? pieces[0].split(":").filter(Boolean) : [];
    const right = pieces.length === 2 && pieces[1]
        ? pieces[1].split(":").filter(Boolean)
        : [];
    const missing = 8 - left.length - right.length;

    if ((pieces.length === 1 && missing !== 0) || missing < 0) {
        throw new Error("invalid IPv6");
    }

    const groups = [
        ...left,
        ...Array(pieces.length === 2 ? missing : 0).fill("0"),
        ...right,
    ];
    if (groups.length !== 8) throw new Error("invalid IPv6");

    let result = 0n;
    for (const group of groups) {
        if (!/^[0-9a-f]{1,4}$/.test(group)) throw new Error("invalid IPv6");
        result = (result << 16n) | BigInt(parseInt(group, 16));
    }
    return result;
}

function inIpv6Cidr(ip, base, prefix) {
    const value = ipv6ToBigInt(ip);
    const network = ipv6ToBigInt(base);
    const bits = 128n;
    const prefixBits = BigInt(prefix);
    const mask = prefix === 0
        ? 0n
        : ((1n << prefixBits) - 1n) << (bits - prefixBits);
    return (value & mask) === (network & mask);
}

function isPublicIpv6(ip) {
    try {
        const blocked = [
            ["::", 96],
            ["::", 128],
            ["::1", 128],
            ["::ffff:0:0", 96],
            ["64:ff9b:1::", 48],
            ["100::", 64],
            ["2001::", 23],
            ["2001:db8::", 32],
            ["2001:20::", 28],
            ["2002::", 16],
            ["3fff::", 20],
            ["fc00::", 7],
            ["fe80::", 10],
            ["fec0::", 10],
            ["ff00::", 8],
        ];
        return !blocked.some(([base, prefix]) => inIpv6Cidr(ip, base, prefix));
    } catch {
        return false;
    }
}

function isPublicIp(ip) {
    const family = net.isIP(ip);
    if (family === 4) return isPublicIpv4(ip);
    if (family === 6) return isPublicIpv6(ip);
    return false;
}

function normalizeHostname(hostname) {
    return String(hostname)
        .toLowerCase()
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .replace(/\.$/, "");
}

function matchesAllowlist(hostname, allowHosts = config.targets.allowHosts) {
    const host = normalizeHostname(hostname);
    return allowHosts.some((entry) => {
        const normalized = entry.replace(/\.$/, "");
        if (normalized.startsWith("*.")) {
            const suffix = normalized.slice(1);
            return host.endsWith(suffix) && host.length > suffix.length;
        }
        return host === normalized;
    });
}

function validateUrlBasics(input) {
    let parsed;
    try {
        parsed = input instanceof URL ? new URL(input.toString()) : new URL(String(input));
    } catch {
        throw new TargetPolicyError("target URL is invalid", "INVALID_URL");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new TargetPolicyError("target URL must use http or https", "INVALID_PROTOCOL");
    }
    if (parsed.username || parsed.password) {
        throw new TargetPolicyError("credentials in target URLs are not allowed", "URL_CREDENTIALS_BLOCKED");
    }
    if (!parsed.hostname) {
        throw new TargetPolicyError("target hostname is required", "INVALID_HOST");
    }

    return parsed;
}

async function lookupWithTimeout(hostname, timeoutMs) {
    let timer;
    try {
        return await Promise.race([
            dns.lookup(hostname, { all: true, verbatim: true }),
            new Promise((_, reject) => {
                timer = setTimeout(
                    () => reject(new HealthRequestError("target DNS lookup timed out", "DNS_TIMEOUT")),
                    timeoutMs,
                );
                timer.unref();
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function resolveTarget(input, options = {}) {
    const parsed = validateUrlBasics(input);
    const allowPrivate = options.allowPrivate ?? config.targets.allowPrivate;
    const allowHosts = options.allowHosts ?? config.targets.allowHosts;
    const hostname = normalizeHostname(parsed.hostname);
    const explicitlyAllowed = matchesAllowlist(hostname, allowHosts);

    if (
        !explicitlyAllowed &&
        (hostname === "localhost" || hostname.endsWith(".localhost"))
    ) {
        throw new TargetPolicyError("localhost targets are blocked");
    }

    let addresses;
    const literalFamily = net.isIP(hostname);
    if (literalFamily) {
        addresses = [{ address: hostname, family: literalFamily }];
    } else {
        try {
            addresses = await lookupWithTimeout(
                hostname,
                options.dnsTimeoutMs ?? config.targets.dnsTimeoutMs,
            );
        } catch (error) {
            if (error instanceof HealthRequestError) throw error;
            throw new HealthRequestError("target DNS lookup failed", "DNS_FAILED");
        }
    }

    if (!addresses.length) {
        throw new HealthRequestError("target DNS lookup returned no addresses", "DNS_EMPTY");
    }

    if (!allowPrivate && !explicitlyAllowed) {
        const blocked = addresses.find((item) => !isPublicIp(item.address));
        if (blocked) {
            throw new TargetPolicyError(
                "target resolves to a non-public address",
                "PRIVATE_ADDRESS_BLOCKED",
            );
        }
    }

    return { parsed, hostname, addresses, explicitlyAllowed };
}

function makePinnedLookup(address) {
    return (_hostname, options, callback) => {
        if (options && options.all) {
            return callback(null, [address]);
        }
        return callback(null, address.address, address.family);
    };
}

async function requestOnce(url, timeoutMs, options = {}) {
    const { parsed, hostname, addresses } = await resolveTarget(url, options);
    const selected = addresses[0];
    const transport = parsed.protocol === "https:" ? https : http;
    const started = performance.now();

    return new Promise((resolve, reject) => {
        let deadline;
        const request = transport.request(
            {
                protocol: parsed.protocol,
                hostname,
                port: parsed.port || undefined,
                path: `${parsed.pathname}${parsed.search}`,
                method: "GET",
                headers: {
                    Accept: "*/*",
                    "User-Agent": "health-api/2.0",
                    Connection: "close",
                },
                lookup: makePinnedLookup(selected),
                servername: net.isIP(hostname) ? undefined : hostname,
                timeout: timeoutMs,
            },
            (response) => {
                clearTimeout(deadline);
                const durationMs = Math.round((performance.now() - started) * 100) / 100;
                const statusCode = response.statusCode || 0;
                const location = response.headers.location || null;
                response.destroy();
                resolve({ statusCode, location, durationMs, url: parsed });
            },
        );

        deadline = setTimeout(() => {
            request.destroy(new HealthRequestError("health check timed out", "TIMEOUT"));
        }, timeoutMs);
        deadline.unref();

        request.on("error", (error) => {
            clearTimeout(deadline);
            if (error instanceof TargetPolicyError || error instanceof HealthRequestError) {
                return reject(error);
            }
            reject(new HealthRequestError("health request failed", error.code || "REQUEST_FAILED"));
        });
        request.end();
    });
}

async function checkHttpEndpoint(service, options = {}) {
    const timeoutMs = service.timeout_ms || config.monitoring.defaultTimeoutMs;
    const maxRedirects = options.maxRedirects ?? config.monitoring.maxRedirects;
    let current = validateUrlBasics(service.url);
    let totalDurationMs = 0;

    try {
        for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
            const result = await requestOnce(current, timeoutMs, options);
            totalDurationMs += result.durationMs;

            const expected = service.expected_status;
            if (
                expected !== null &&
                expected !== undefined &&
                result.statusCode === Number(expected)
            ) {
                return {
                    status: "healthy",
                    statusCode: result.statusCode,
                    latencyMs: Math.round(totalDurationMs * 100) / 100,
                    errorCode: null,
                    error: null,
                };
            }

            const isRedirect = result.statusCode >= 300 && result.statusCode < 400;
            if (isRedirect && result.location) {
                if (redirectCount === maxRedirects) {
                    throw new HealthRequestError("too many redirects", "TOO_MANY_REDIRECTS");
                }
                current = validateUrlBasics(new URL(result.location, current));
                continue;
            }

            const healthy =
                expected === null || expected === undefined
                    ? result.statusCode >= 200 && result.statusCode < 300
                    : false;

            return {
                status: healthy ? "healthy" : "unhealthy",
                statusCode: result.statusCode,
                latencyMs: Math.round(totalDurationMs * 100) / 100,
                errorCode: null,
                error: null,
            };
        }
    } catch (error) {
        if (error instanceof TargetPolicyError) {
            return {
                status: "blocked",
                statusCode: null,
                latencyMs: Math.round(totalDurationMs * 100) / 100,
                errorCode: error.code,
                error: error.message,
            };
        }

        return {
            status: "unreachable",
            statusCode: null,
            latencyMs: Math.round(totalDurationMs * 100) / 100,
            errorCode: error.code || "REQUEST_FAILED",
            error: "health request failed",
        };
    }

    return {
        status: "unreachable",
        statusCode: null,
        latencyMs: Math.round(totalDurationMs * 100) / 100,
        errorCode: "UNKNOWN",
        error: "health request failed",
    };
}

module.exports = {
    TargetPolicyError,
    HealthRequestError,
    isPublicIp,
    normalizeHostname,
    matchesAllowlist,
    validateUrlBasics,
    resolveTarget,
    checkHttpEndpoint,
};
