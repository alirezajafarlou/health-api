"use strict";

function log(level, event, fields = {}) {
    const payload = {
        ts: new Date().toISOString(),
        level,
        event,
        ...fields,
    };

    const line = JSON.stringify(payload);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
}

module.exports = {
    info: (event, fields) => log("info", event, fields),
    warn: (event, fields) => log("warn", event, fields),
    error: (event, fields) => log("error", event, fields),
};
