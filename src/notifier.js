"use strict";

const config = require("./config");
const logger = require("./logger");

let validatedWebhook = null;

function getWebhookUrl() {
    if (!config.alerts.webhookUrl) return null;
    if (validatedWebhook) return validatedWebhook;

    const parsed = new URL(config.alerts.webhookUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("ALERT_WEBHOOK_URL must use http or https");
    }
    if (parsed.username || parsed.password) {
        throw new Error("ALERT_WEBHOOK_URL must not contain credentials");
    }
    validatedWebhook = parsed;
    return validatedWebhook;
}

async function notifyIncidentEvent(event, service) {
    const webhook = getWebhookUrl();
    if (!webhook) return;

    const headers = { "Content-Type": "application/json" };
    if (config.alerts.webhookToken) {
        headers.Authorization = `Bearer ${config.alerts.webhookToken}`;
    }

    const payload = {
        event: `incident.${event}`,
        emittedAt: new Date().toISOString(),
        service: {
            id: service.id,
            name: service.name,
            url: service.url,
            status: service.last_status,
            statusCode: service.last_status_code,
            latencyMs: service.last_latency_ms,
            checkedAt: service.last_checked_at,
            errorCode: service.last_error_code,
        },
    };

    try {
        const response = await fetch(webhook, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            redirect: "error",
            signal: AbortSignal.timeout(config.alerts.timeoutMs),
        });
        if (!response.ok) {
            logger.warn("alert_webhook_rejected", { status: response.status, event });
        }
    } catch (error) {
        logger.warn("alert_webhook_failed", { event, message: error.message });
    }
}

module.exports = { notifyIncidentEvent, getWebhookUrl };
