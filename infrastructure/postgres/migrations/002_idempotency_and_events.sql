-- =============================================================================
-- Migration 002: Workflow Events & Idempotency Records
-- =============================================================================

SET search_path TO aios, public;

CREATE TABLE IF NOT EXISTS aios.workflow_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID NOT NULL REFERENCES aios.workflow_runs(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_run ON aios.workflow_events (workflow_run_id, created_at);

CREATE TABLE IF NOT EXISTS aios.idempotency_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(255) NOT NULL,
    operation_type VARCHAR(100) NOT NULL,
    operation_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
    response_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_org_idempotency_key UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup ON aios.idempotency_records (organization_id, idempotency_key);
