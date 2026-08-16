CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL
);

ALTER TABLE services ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS interval_seconds INTEGER NOT NULL DEFAULT 60;
ALTER TABLE services ADD COLUMN IF NOT EXISTS timeout_ms INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE services ADD COLUMN IF NOT EXISTS expected_status INTEGER;
ALTER TABLE services ADD COLUMN IF NOT EXISTS next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE services ADD COLUMN IF NOT EXISTS check_lease_until TIMESTAMPTZ;
ALTER TABLE services ADD COLUMN IF NOT EXISTS last_status TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS last_status_code INTEGER;
ALTER TABLE services ADD COLUMN IF NOT EXISTS last_latency_ms NUMERIC(12, 2);
ALTER TABLE services ADD COLUMN IF NOT EXISTS last_error_code TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE services ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS current_incident_id UUID;
ALTER TABLE services ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE services ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS health_check_results (
    id BIGSERIAL PRIMARY KEY,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL,
    status_code INTEGER,
    latency_ms NUMERIC(12, 2),
    error_code TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open',
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

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_interval_seconds_check' AND conrelid = 'services'::regclass) THEN
        ALTER TABLE services
            ADD CONSTRAINT services_interval_seconds_check
            CHECK (interval_seconds BETWEEN 5 AND 86400);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_timeout_ms_check' AND conrelid = 'services'::regclass) THEN
        ALTER TABLE services
            ADD CONSTRAINT services_timeout_ms_check
            CHECK (timeout_ms BETWEEN 500 AND 30000);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_expected_status_check' AND conrelid = 'services'::regclass) THEN
        ALTER TABLE services
            ADD CONSTRAINT services_expected_status_check
            CHECK (expected_status IS NULL OR expected_status BETWEEN 100 AND 599);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_last_status_check' AND conrelid = 'services'::regclass) THEN
        ALTER TABLE services
            ADD CONSTRAINT services_last_status_check
            CHECK (last_status IS NULL OR last_status IN ('healthy', 'unhealthy', 'unreachable', 'blocked'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_check_results_status_check' AND conrelid = 'health_check_results'::regclass) THEN
        ALTER TABLE health_check_results
            ADD CONSTRAINT health_check_results_status_check
            CHECK (status IN ('healthy', 'unhealthy', 'unreachable', 'blocked'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidents_status_check' AND conrelid = 'incidents'::regclass) THEN
        ALTER TABLE incidents
            ADD CONSTRAINT incidents_status_check
            CHECK (status IN ('open', 'resolved'));
    END IF;
END $$;

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
