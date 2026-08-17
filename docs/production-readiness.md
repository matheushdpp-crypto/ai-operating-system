# 🛡️ AiOS Production Readiness Guide & Operational Checklist

This document details the hardening status, operational guidelines, and checklist required before onboarding real enterprise clients to the AI Operating System (AiOS).

---

## 1. Status Matrix

| Component | Status | Description |
|---|---|---|
| **Multi-Tenant Foundation** | `SUPPORTED` | Strict `organization_id` isolation across database tables, vector searches, and API endpoints. |
| **Workflow Engine** | `SUPPORTED` | Domain-agnostic 12-stage universal pipeline with idempotency, step retries, and events. |
| **Durable HITL** | `SUPPORTED` | Database-backed human-in-the-loop approvals that survive full process/server restarts. |
| **Policy Engine** | `SUPPORTED` | Deterministic evaluator with `ALLOW`, `DENY`, `HUMAN_REQUIRED` priorities. |
| **Tool Execution Layer** | `SUPPORTED` | `ToolExecutor` and `ToolAdapter` (HTTP API, n8n, Internal) with RBAC authorization and idempotency. |
| **Knowledge & RAG** | `SUPPORTED` | pgvector cosine similarity search, chunking, content hash deduplication, and tenant filtering. |
| **AI Provider Abstraction** | `SUPPORTED` | Configurable OpenAI, OpenRouter, and Ollama support with token usage tracking. |
| **Database Migrations** | `SUPPORTED` | Versioned SQL migrations (`001_initial_schema.sql`, `002_idempotency_and_events.sql`). |
| **Audit Trail** | `SUPPORTED` | Append-oriented audit logging with automatic secret and token redaction. |
| **n8n Automation Engine** | `OPTIONAL / SUPPORTED` | Real webhook dispatch adapter; platform remains fully functional without it. |
| **Hermes / OpenClaw Runtimes**| `OPTIONAL` | Unconfigured by default; returns `NOT_CONFIGURED` or `UNAVAILABLE` without fake healthy status. |
| **Paperclip Integration** | `FUTURE` | Planned for upcoming multi-agent hierarchical protocols. |

---

## 2. Pre-Flight Production Checklist

Before running AiOS in `NODE_ENV=production`, ensure each item below is verified:

### 🔐 Security & Secrets
- [ ] Run `node scripts/generate-secrets.js` to create cryptographically secure keys.
- [ ] Ensure `JWT_SECRET` is at least 32 characters and does not contain `change_me` or default values.
- [ ] Set `DATABASE_PASSWORD` to a strong unique value.
- [ ] Configure `CORS_ALLOWED_ORIGINS` to exact customer domains (never `*` in production).
- [ ] Set `NODE_ENV=production` in the environment. The server will fail fast on startup if default passwords remain.

### 🗄️ Database & Storage
- [ ] PostgreSQL 16+ instance with `pgvector` extension enabled and reachable.
- [ ] Automated database backups configured using `./scripts/backup.sh`.
- [ ] Test database restoration at least once using `./scripts/restore.sh <backup_file>`.
- [ ] Ensure MinIO or S3 bucket is provisioned with appropriate access policies.

### 🚦 Monitoring & Health Checks
- [ ] Verify `GET /api/v1/health` reports status `HEALTHY` for database, storage, and AI providers.
- [ ] Set up automated uptime monitoring pinging `/api/v1/health`.
- [ ] Configure alert notifications for `workflow.failed` or `approval.created` audit events.

---

## 3. Disaster Recovery & Durability Validation

AiOS guarantees that workflows paused in `WAITING_APPROVAL` persist their execution state:

1. A workflow triggers and exceeds policy threshold.
2. Status transitions to `WAITING_APPROVAL` with an approval record created in PostgreSQL.
3. Even if the container or server reboots, the pending state remains intact.
4. When an authorized operator approves via the Control Center or API (`POST /api/v1/approvals/:id/approve`), the engine reloads the run state from the database and executes side effects.
5. External actions use `idempotency_key` to avoid duplicate execution upon retry.
