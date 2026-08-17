-- =============================================================================
-- Migration 001: Initial Schema & Extensions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE SCHEMA IF NOT EXISTS n8n;
CREATE SCHEMA IF NOT EXISTS aios;

SET search_path TO aios, public;

CREATE TABLE IF NOT EXISTS aios.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    industry VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'pt-BR',
    settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aios.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'OPERATOR' CHECK (role IN ('ADMIN', 'OPERATOR', 'VIEWER')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_org_email UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS aios.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    job_description TEXT NOT NULL,
    runtime VARCHAR(50) DEFAULT 'native' CHECK (runtime IN ('native', 'hermes', 'openclaw', 'custom')),
    runtime_config JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'DISABLED', 'BUSY')),
    permissions JSONB DEFAULT '[]'::jsonb,
    approval_limits JSONB DEFAULT '{}'::jsonb,
    knowledge_scopes JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aios.skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0.0',
    description TEXT,
    purpose TEXT,
    when_to_use TEXT,
    when_not_to_use TEXT,
    instructions TEXT NOT NULL,
    inputs_schema JSONB DEFAULT '{}'::jsonb,
    outputs_schema JSONB DEFAULT '{}'::jsonb,
    required_tools JSONB DEFAULT '[]'::jsonb,
    required_knowledge JSONB DEFAULT '[]'::jsonb,
    file_path VARCHAR(500),
    is_shared BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_skill_slug UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS aios.agent_skills (
    agent_id UUID NOT NULL REFERENCES aios.agents(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES aios.skills(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, skill_id)
);

CREATE TABLE IF NOT EXISTS aios.tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('CRM', 'ERP', 'EMAIL', 'CALENDAR', 'MESSAGING', 'STORAGE', 'DATABASE', 'BROWSER', 'HTTP_API', 'MCP')),
    provider VARCHAR(100) NOT NULL,
    credentials_ref VARCHAR(255),
    capabilities JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(50) DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'ERROR', 'MOCK')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aios.policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    scope VARCHAR(100) NOT NULL,
    rules JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aios.knowledge_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('MANUAL', 'FILE', 'SOP', 'POLICY', 'WEBSITE', 'DATABASE')),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aios.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES aios.knowledge_sources(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    uri VARCHAR(1000),
    mime_type VARCHAR(100),
    raw_content TEXT,
    chunk_count INT DEFAULT 0,
    content_hash VARCHAR(64),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aios.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES aios.documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON aios.document_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS aios.memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    scope VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255),
    agent_id UUID REFERENCES aios.agents(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'EPISODIC' CHECK (type IN ('FACT', 'PREFERENCE', 'LESSON_LEARNED', 'EPISODIC', 'SUMMARY')),
    importance NUMERIC(3,2) DEFAULT 0.50,
    source VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aios.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50) DEFAULT 'MANUAL' CHECK (trigger_type IN ('WEBHOOK', 'EVENT', 'CRON', 'MANUAL', 'API')),
    trigger_config JSONB DEFAULT '{}'::jsonb,
    steps_config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_workflow_slug UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS aios.workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES aios.workflows(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    trigger_payload JSONB DEFAULT '{}'::jsonb,
    current_step VARCHAR(100) DEFAULT 'TRIGGER',
    status VARCHAR(50) DEFAULT 'RUNNING' CHECK (status IN ('PENDING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')),
    state_data JSONB DEFAULT '{}'::jsonb,
    idempotency_key VARCHAR(255),
    retry_count INT DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS aios.workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID NOT NULL REFERENCES aios.workflow_runs(id) ON DELETE CASCADE,
    step_name VARCHAR(100) NOT NULL,
    step_order INT NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'SKIPPED', 'FAILED', 'PAUSED')),
    input_data JSONB DEFAULT '{}'::jsonb,
    output_data JSONB DEFAULT '{}'::jsonb,
    error TEXT,
    retry_count INT DEFAULT 0,
    idempotency_key VARCHAR(255),
    duration_ms INT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS aios.approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    workflow_run_id UUID REFERENCES aios.workflow_runs(id) ON DELETE CASCADE,
    task_id VARCHAR(255),
    requested_by VARCHAR(255) NOT NULL,
    assigned_to VARCHAR(255),
    reason TEXT NOT NULL,
    context JSONB DEFAULT '{}'::jsonb,
    proposed_action JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'TAKEN_OVER', 'EXPIRED')),
    decision VARCHAR(50),
    decision_reason TEXT,
    decided_by UUID REFERENCES aios.users(id) ON DELETE SET NULL,
    decided_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aios.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES aios.organizations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    actor_type VARCHAR(50) NOT NULL CHECK (actor_type IN ('USER', 'AGENT', 'SYSTEM', 'WEBHOOK')),
    actor_id VARCHAR(255) NOT NULL,
    target_type VARCHAR(100),
    target_id VARCHAR(255),
    payload JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_org_event ON aios.audit_logs (organization_id, event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON aios.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_org ON aios.workflow_runs (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_org_status ON aios.approvals (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_memories_scope ON aios.memories (organization_id, scope);
