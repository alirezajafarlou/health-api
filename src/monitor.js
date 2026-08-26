"use strict";

const config = require("./config");
const logger = require("./logger");
const repository = require("./repository");
const { checkHttpEndpoint } = require("./ssrf");
const { notifyIncidentEvent } = require("./notifier");

async function runAndPersistServiceCheck(service) {
    let persisted;
    let check;
    try {
        check = await checkHttpEndpoint(service);
        persisted = await repository.persistCheckResult(
            service,
            check,
            config.monitoring.incidentFailureThreshold,
        );
    } catch (error) {
        try {
            await repository.releaseCheckLease(service.id);
        } catch (releaseError) {
            logger.error("check_lease_release_failed", {
                serviceId: service.id,
                message: releaseError.message,
            });
        }
        throw error;
    }

    if (persisted?.incidentEvent) {
        logger.warn("incident_state_changed", {
            serviceId: service.id,
            serviceName: service.name,
            event: persisted.incidentEvent,
            status: check.status,
        });
        await notifyIncidentEvent(persisted.incidentEvent, persisted.service);
    }

    return persisted?.service || { ...service, last_status: check.status };
}

async function mapWithConcurrency(items, concurrency, worker) {
    let cursor = 0;
    const runners = Array.from(
        { length: Math.min(concurrency, items.length) },
        async () => {
            while (true) {
                const index = cursor;
                cursor += 1;
                if (index >= items.length) return;
                await worker(items[index]);
            }
        },
    );
    await Promise.all(runners);
}

function startMonitor() {
    if (!config.monitoring.enabled) {
        logger.info("monitor_disabled");
        return { stop: async () => {} };
    }

    let timer = null;
    let running = null;
    let stopped = false;
    let lastPruneAt = 0;

    const tick = async () => {
        if (stopped || running) return;
        running = (async () => {
            try {
                const due = await repository.claimDueServices(
                    config.monitoring.batchSize,
                );

                if (due.length) {
                    await mapWithConcurrency(
                        due,
                        config.monitoring.concurrency,
                        async (service) => {
                            try {
                                await runAndPersistServiceCheck(service);
                            } catch (error) {
                                logger.error("monitor_check_failed", {
                                    serviceId: service.id,
                                    message: error.message,
                                });
                            }
                        },
                    );
                }

                if (Date.now() - lastPruneAt > 24 * 60 * 60 * 1000) {
                    lastPruneAt = Date.now();
                    const deleted = await repository.pruneHistory(
                        config.monitoring.retentionDays,
                    );
                    if (deleted) logger.info("history_pruned", { deleted });
                }
            } catch (error) {
                logger.error("monitor_tick_failed", { message: error.message });
            } finally {
                running = null;
            }
        })();

        await running;
    };

    timer = setInterval(tick, config.monitoring.pollMs);
    timer.unref();
    void tick();

    logger.info("monitor_started", {
        pollMs: config.monitoring.pollMs,
        batchSize: config.monitoring.batchSize,
        concurrency: config.monitoring.concurrency,
    });

    return {
        stop: async () => {
            stopped = true;
            if (timer) clearInterval(timer);
            if (running) await running;
        },
    };
}

module.exports = { startMonitor, runAndPersistServiceCheck };
