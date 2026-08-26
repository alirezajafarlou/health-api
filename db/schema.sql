CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    interval_seconds INTEGER NOT NULL DEFAULT 60 CONSTRAINT services_interval_seconds_check CHECK (interval_seconds BETWEEN 5 AND 86400),
    timeout_ms INTEGER NOT NULL DEFAULT 10000 CONSTRAINT services_timeout_ms_check CHECK (timeout_ms BETWEEN 500 AND 30000),
    expected_status INTEGER CONSTRAINT services_expected_status_check CHECK (expected_status IS NULL OR expected_status BETWEEN 100 AND 599),
    next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_lease_until TIMESTAMPTZ,
    last_status TEXT CONSTRAINT services_last_status_check CHECK (last_status IS NULL OR last_status IN ('healthy', 'unhealthy', 'unreachable', 'blocked')),
    last_status_code INTEGER,
    last_latency_ms NUMERIC(12, 2),
    last_error_code TEXT,
    last_error TEXT,
    last_checked_at TIMESTAMPTZ,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    current_incident_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_check_results (
    id BIGSERIAL PRIMARY KEY,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL CONSTRAINT health_check_results_status_check CHECK (status IN ('healthy', 'unhealthy', 'unreachable', 'blocked')),
    status_code INTEGER,
    latency_ms NUMERIC(12, 2),
    error_code TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open' CONSTRAINT incidents_status_check CHECK (status IN ('open', 'resolved')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    failure_count INTEGER NOT NULL DEFAULT 1,
    initial_error_code TEXT,
    initial_error TEXT,
    last_error_code TEXT,
    last_error TEXT,
    final_status_code INTEGER
);

CREATE INDEX IF NOT EXISTS idx_services_due
    ON services (next_check_at)
    WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_health_check_results_service_checked
    ON health_check_results (service_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_check_results_checked
    ON health_check_results (checked_at);

CREATE INDEX IF NOT EXISTS idx_incidents_service_started
    ON incidents (service_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_one_open
    ON incidents (service_id)
    WHERE resolved_at IS NULL;
