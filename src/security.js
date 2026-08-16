"use strict";

const crypto = require("crypto");
const config = require("./config");
const logger = require("./logger");

function requestContext(req, res, next) {
    const candidate = String(req.headers["x-request-id"] || "");
    const requestId = /^[A-Za-z0-9._:-]{1,64}$/.test(candidate)
        ? candidate
        : crypto.randomUUID();

    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    const started = process.hrtime.bigint();

    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        logger.info("http_request", {
            requestId,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
            ip: req.ip,
        });
    });

    next();
}

function securityHeaders(req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader(
        "Content-Security-Policy",
        [
            "default-src 'self'",
            "base-uri 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "object-src 'none'",
            "script-src 'self'",
            "style-src 'self' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data:",
            "connect-src 'self'",
        ].join("; "),
    );

    if (config.isProduction) {
        res.setHeader(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        );
    }

    next();
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left), "utf8");
    const rightBuffer = Buffer.from(String(right), "utf8");
    const compareLength = Math.max(leftBuffer.length, rightBuffer.length, 1);
    const paddedLeft = Buffer.alloc(compareLength);
    const paddedRight = Buffer.alloc(compareLength);

    leftBuffer.copy(paddedLeft);
    rightBuffer.copy(paddedRight);

    const contentMatches = crypto.timingSafeEqual(paddedLeft, paddedRight);
    return contentMatches && leftBuffer.length === rightBuffer.length;
}

function basicAuth(req, res, next) {
    if (config.auth.disabled) return next();

    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Basic ")) {
        res.setHeader("WWW-Authenticate", 'Basic realm="Health API", charset="UTF-8"');
        return res.status(401).json({ error: "authentication required" });
    }

    let decoded;
    try {
        decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    } catch {
        decoded = "";
    }

    const separator = decoded.indexOf(":");
    const username = separator >= 0 ? decoded.slice(0, separator) : "";
    const password = separator >= 0 ? decoded.slice(separator + 1) : "";

    if (
        !safeEqual(username, config.auth.username) ||
        !safeEqual(password, config.auth.password)
    ) {
        res.setHeader("WWW-Authenticate", 'Basic realm="Health API", charset="UTF-8"');
        return res.status(401).json({ error: "invalid credentials" });
    }

    next();
}

function createRateLimiter({ windowMs, max, prefix }) {
    const buckets = new Map();
    let lastSweep = Date.now();

    return function rateLimiter(req, res, next) {
        const now = Date.now();
        const key = `${prefix}:${req.ip}`;
        let bucket = buckets.get(key);

        if (!bucket || bucket.resetAt <= now) {
            bucket = { count: 0, resetAt: now + windowMs };
            buckets.set(key, bucket);
        }

        bucket.count += 1;
        const remaining = Math.max(0, max - bucket.count);
        res.setHeader("RateLimit-Limit", String(max));
        res.setHeader("RateLimit-Remaining", String(remaining));
        res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

        if (now - lastSweep > windowMs * 2) {
            lastSweep = now;
            for (const [bucketKey, value] of buckets) {
                if (value.resetAt <= now) buckets.delete(bucketKey);
            }
        }

        if (bucket.count > max) {
            const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
            res.setHeader("Retry-After", String(retryAfter));
            return res.status(429).json({ error: "rate limit exceeded" });
        }

        next();
    };
}

function mutationOriginGuard(req, res, next) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        return next();
    }

    const fetchSite = String(req.headers["sec-fetch-site"] || "");
    if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
        return res.status(403).json({ error: "cross-site request blocked" });
    }

    const origin = req.headers.origin;
    if (!origin) return next();

    try {
        const parsed = new URL(origin);
        const hostSource = config.trustProxy
            ? req.headers["x-forwarded-host"] || req.headers.host
            : req.headers.host;
        const protocolSource = config.trustProxy
            ? req.headers["x-forwarded-proto"] || req.protocol
            : req.protocol;
        const host = String(hostSource || "").split(",")[0].trim();
        const protocol = String(protocolSource || "").split(",")[0].trim();

        if (parsed.host !== host || parsed.protocol !== `${protocol}:`) {
            return res.status(403).json({ error: "origin mismatch" });
        }
    } catch {
        return res.status(403).json({ error: "invalid origin" });
    }

    next();
}

function noStore(req, res, next) {
    res.setHeader("Cache-Control", "no-store");
    next();
}

module.exports = {
    requestContext,
    securityHeaders,
    basicAuth,
    createRateLimiter,
    mutationOriginGuard,
    noStore,
};