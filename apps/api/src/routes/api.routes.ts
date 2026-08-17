import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { setupService } from '../modules/setup/setup.service.js';
import { authService } from '../modules/auth/auth.service.js';
import { agentService } from '../modules/agents/agent.service.js';
import { skillService } from '../modules/skills/skill.service.js';
import { workflowEngine } from '../modules/workflows/workflow.engine.js';
import { approvalService } from '../modules/approvals/approval.service.js';
import { policyEngine } from '../modules/policies/policy.engine.js';
import { knowledgeService } from '../modules/knowledge/knowledge.service.js';
import { toolService } from '../modules/tools/tool.service.js';
import { auditService } from '../modules/audit/audit.service.js';
import { AIProviderFactory } from '../modules/runtime/ai.provider.js';
import { RuntimeRegistry } from '../modules/runtime/runtime.adapter.js';
import { db } from '../database/index.js';
import { config } from '../config/env.js';
import { WorkflowRun, UserRole } from '../types/index.js';

export const apiRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ---------------------------------------------------------------------------
  // Tenant & RBAC Context Resolver Helper
  // ---------------------------------------------------------------------------
  const resolveAuthContext = async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = authService.verifyToken(token);
      if (payload) {
        return {
          userId: payload.userId,
          organizationId: payload.organizationId,
          role: payload.role,
          email: payload.email,
        };
      }
    }

    // Fallback for development / unauthenticated testing requests
    const explicitOrgId =
      (request.headers['x-organization-id'] as string) ||
      (request.query as any)?.organization_id ||
      (request.body as any)?.organization_id;

    if (explicitOrgId) {
      return {
        userId: 'system',
        organizationId: explicitOrgId,
        role: 'ADMIN' as UserRole,
        email: 'system@aios.internal',
      };
    }

    const orgs = await authService.listOrganizations();
    return {
      userId: 'system',
      organizationId: orgs[0]?.id || 'default-org',
      role: 'ADMIN' as UserRole,
      email: 'system@aios.internal',
    };
  };

  const requireRole = (allowedRoles: UserRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = await resolveAuthContext(request);
      if (!allowedRoles.includes(ctx.role)) {
        return reply.status(403).send({
          error: `Forbidden: Role [${ctx.role}] lacks permission. Required: [${allowedRoles.join(', ')}]`,
        });
      }
    };
  };

  // ---------------------------------------------------------------------------
  // 1. Health & Real System Status
  // ---------------------------------------------------------------------------
  app.get('/health', async () => {
    const isDbHealthy = await db.driver.isHealthy();
    const aiProvider = AIProviderFactory.getProvider();
    const aiHealth = await aiProvider.healthCheck();

    // Check n8n real status
    let n8nStatus: 'HEALTHY' | 'UNAVAILABLE' | 'NOT_CONFIGURED' = 'NOT_CONFIGURED';
    if (config.n8n.baseUrl) {
      try {
        const n8nRes = await fetch(`${config.n8n.baseUrl}/healthz`, { signal: AbortSignal.timeout(2000) });
        n8nStatus = n8nRes.ok ? 'HEALTHY' : 'UNAVAILABLE';
      } catch {
        n8nStatus = 'UNAVAILABLE';
      }
    }

    // Check Agent Runtimes
    const nativeRuntime = RuntimeRegistry.getAdapter('native');
    const hermesRuntime = RuntimeRegistry.getAdapter('hermes');
    const openclawRuntime = RuntimeRegistry.getAdapter('openclaw');

    const [nativeStatus, hermesStatus, openclawStatus] = await Promise.all([
      nativeRuntime.getStatus(),
      hermesRuntime.getStatus(),
      openclawRuntime.getStatus(),
    ]);

    return {
      status: isDbHealthy ? 'HEALTHY' : 'DEGRADED',
      platform: config.platform.name,
      version: '1.0.0',
      node_env: config.platform.nodeEnv,
      uptime_seconds: process.uptime(),
      timestamp: new Date().toISOString(),
      components: {
        database: {
          status: isDbHealthy ? 'HEALTHY' : 'UNAVAILABLE',
          type: db.isPostgres ? 'POSTGRESQL_PGVECTOR' : 'IN_MEMORY_REPOSITORY',
        },
        n8n: {
          status: n8nStatus,
          url: config.n8n.baseUrl,
        },
        ai_provider: {
          status: aiHealth.status,
          provider: aiProvider.name,
          details: aiHealth.message,
        },
        runtimes: {
          native: nativeStatus,
          hermes: hermesStatus,
          openclaw: openclawStatus,
        },
        storage: {
          status: 'HEALTHY',
          provider: config.storage.provider,
        },
      },
    };
  });

  // ---------------------------------------------------------------------------
  // 2. Setup Wizard
  // ---------------------------------------------------------------------------
  app.get('/setup/status', async () => {
    const complete = await setupService.isSetupComplete();
    return { is_setup_complete: complete };
  });

  app.post('/setup/wizard', async (request, reply) => {
    const body = request.body as any;
    if (!body?.company?.name || !body?.admin?.email || !body?.admin?.password) {
      return reply.status(400).send({ error: 'Missing required company or admin setup fields' });
    }
    const result = await setupService.runSetupWizard(body);
    return reply.status(201).send(result);
  });

  // ---------------------------------------------------------------------------
  // 3. Auth & Organizations
  // ---------------------------------------------------------------------------
  app.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body as any;
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password required' });
    }
    const user = await authService.authenticate(email, password);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }
    const org = await authService.getOrganization(user.organization_id);
    const token = authService.generateToken(user);
    return {
      token,
      user,
      organization: org,
    };
  });

  app.get('/organizations', async () => {
    return authService.listOrganizations();
  });

  // ---------------------------------------------------------------------------
  // 4. Dashboard Metrics
  // ---------------------------------------------------------------------------
  app.get('/dashboard/metrics', async (request) => {
    const { organizationId } = await resolveAuthContext(request);
    if (!organizationId) return { total_runs: 0, active_agents: 0, pending_approvals: 0, recent_events: [] };

    const runs: WorkflowRun[] = await workflowEngine.listRuns(organizationId, 100);
    const agents = await agentService.listAgents(organizationId);
    const approvals = await approvalService.listApprovals(organizationId, 'PENDING');
    const logs = await auditService.list(organizationId, 10);

    return {
      workflows_count: (await workflowEngine.listWorkflows(organizationId)).length,
      active_agents: agents.filter((a) => a.status === 'ACTIVE').length,
      total_runs: runs.length,
      running_workflows: runs.filter((r: WorkflowRun) => r.status === 'RUNNING').length,
      completed_workflows: runs.filter((r: WorkflowRun) => r.status === 'COMPLETED').length,
      failed_workflows: runs.filter((r: WorkflowRun) => r.status === 'FAILED').length,
      waiting_approval: runs.filter((r: WorkflowRun) => r.status === 'WAITING_APPROVAL').length,
      pending_approvals_count: approvals.length,
      pending_approvals: approvals,
      recent_logs: logs,
    };
  });

  // ---------------------------------------------------------------------------
  // 5. Agents
  // ---------------------------------------------------------------------------
  app.get('/agents', async (request) => {
    const { organizationId } = await resolveAuthContext(request);
    return agentService.listAgents(organizationId);
  });

  app.post('/agents', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { organizationId } = await resolveAuthContext(request);
    const body = request.body as any;
    const agent = await agentService.createAgent({ ...body, organization_id: organizationId }, body.skills || []);
    return reply.status(201).send(agent);
  });

  app.get('/agents/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { organizationId } = await resolveAuthContext(request);
    const agent = await agentService.getAgent(id);
    if (!agent || agent.organization_id !== organizationId) {
      return reply.status(404).send({ error: 'Agent not found' });
    }
    return agent;
  });

  // ---------------------------------------------------------------------------
  // 6. Skills
  // ---------------------------------------------------------------------------
  app.get('/skills', async (request) => {
    const { organizationId } = await resolveAuthContext(request);
    return skillService.listSkills(organizationId);
  });

  app.post('/skills', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { organizationId } = await resolveAuthContext(request);
    const body = request.body as any;
    const skill = await skillService.registerSkill({ ...body, organization_id: organizationId });
    return reply.status(201).send(skill);
  });

  // ---------------------------------------------------------------------------
  // 7. Workflows & Runs
  // ---------------------------------------------------------------------------
  app.get('/workflows', async (request) => {
    const { organizationId } = await resolveAuthContext(request);
    return workflowEngine.listWorkflows(organizationId);
  });

  app.post('/workflows', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { organizationId } = await resolveAuthContext(request);
    const body = request.body as any;
    const workflow = await workflowEngine.createWorkflow({ ...body, organization_id: organizationId });
    return reply.status(201).send(workflow);
  });

  app.post('/workflows/:slug/trigger', { preHandler: requireRole(['ADMIN', 'OPERATOR']) }, async (request, reply) => {
    const { slug } = request.params as any;
    const { organizationId } = await resolveAuthContext(request);
    const workflow = await workflowEngine.getWorkflowBySlug(organizationId, slug);
    if (!workflow) return reply.status(404).send({ error: `Workflow not found: ${slug}` });

    const payload = (request.body as any)?.payload || (request.body as any) || {};
    const taskName = (request.body as any)?.task_name || slug;
    const idempotencyKey = (request.body as any)?.idempotency_key || (request.headers['x-idempotency-key'] as string);

    const run = await workflowEngine.executeWorkflow({
      workflow_id: workflow.id,
      organization_id: organizationId,
      trigger_payload: payload,
      task_name: taskName,
      idempotency_key: idempotencyKey,
    });

    return reply.status(202).send(run);
  });

  app.get('/runs', async (request) => {
    const { organizationId } = await resolveAuthContext(request);
    return workflowEngine.listRuns(organizationId);
  });

  app.get('/runs/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { organizationId } = await resolveAuthContext(request);
    const result = await workflowEngine.getRun(id);
    if (!result.run || result.run.organization_id !== organizationId) {
      return reply.status(404).send({ error: 'Workflow run not found' });
    }
    return result;
  });

  // ---------------------------------------------------------------------------
  // 8. Approvals (Human-in-the-Loop)
  // ---------------------------------------------------------------------------
  app.get('/approvals', async (request) => {
    const { organizationId } = await resolveAuthContext(request);
    const status = (request.query as any)?.status;
    return approvalService.listApprovals(organizationId, status);
  });

  app.get('/approvals/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { organizationId } = await resolveAuthContext(request);
    const approval = await approvalService.getApproval(id);
    if (!approval || approval.organization_id !== organizationId) {
      return reply.status(404).send({ error: 'Approval not found' });
    }
    return approval;
  });

  app.post('/approvals/:id/approve', { preHandler: requireRole(['ADMIN', 'OPERATOR']) }, async (request, reply) => {
    const { id } = request.params as any;
    const { userId } = await resolveAuthContext(request);
    const { decided_by, reason } = (request.body as any) || {};
    const updated = await approvalService.approve(id, decided_by || userId, reason);
    return updated;
  });

  app.post('/approvals/:id/reject', { preHandler: requireRole(['ADMIN', 'OPERATOR']) }, async (request, reply) => {
    const { id } = request.params as any;
    const { userId } = await resolveAuthContext(request);
    const { decided_by, reason } = (request.body as any) || {};
    const updated = await approvalService.reject(id, decided_by || userId, reason);
    return updated;
  });

  app.post('/approvals/:id/changes', { preHandler: requireRole(['ADMIN', 'OPERATOR']) }, async (request, reply) => {
    const { id } = request.params as any;
    const { userId } = await resolveAuthContext(request);
    const { decided_by, notes } = (request.body as any) || {};
    const updated = await approvalService.requestChanges(id, decided_by || userId, notes);
    return updated;
  });

  app.post('/approvals/:id/takeover', { preHandler: requireRole(['ADMIN', 'OPERATOR']) }, async (request, reply) => {
    const { id } = request.params as any;
    const { userId } = await resolveAuthContext(request);
    const { decided_by, custom_action } = (request.body as any) || {};
    const updated = await approvalService.takeOver(id, decided_by || userId, custom_action);
    return updated;
  });

  // ---------------------------------------------------------------------------
  // 9. Policies
  // ---------------------------------------------------------------------------
  app.get('/policies', async (request) => {
    const { organizationId } = await resolveAuthContext(request);
    return policyEngine.listPolicies(organizationId);
  });

  app.post('/policies', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { organizationId } = await resolveAuthContext(request);
    const body = request.body as any;
    const policy = await policyEngine.createPolicy({ ...body, organization_id: organizationId });
    return reply.status(201).send(policy);
  });

  // ---------------------------------------------------------------------------
  // 10. Knowledge & RAG
  // ---------------------------------------------------------------------------
  app.get('/knowledge/sources', async (request) => {
    const { organizationId } = await resolveAuthContext(request);
    return knowledgeService.listSources(organizationId);
  });

  app.post('/knowledge/ingest', { preHandler: requireRole(['ADMIN', 'OPERATOR']) }, async (request, reply) => {
    const { organizationId } = await resolveAuthContext(request);
    const body = request.body as any;
    let sourceId = body.source_id;

    if (!sourceId) {
      const source = await knowledgeService.createSource({
        organization_id: organizationId,
        name: body.source_name || 'General Knowledge Base',
        type: 'MANUAL',
        status: 'ACTIVE',
        metadata: {},
      });
      sourceId = source.id;
    }

    const doc = await knowledgeService.ingestDocument({
      source_id: sourceId,
      title: body.title || 'Untitled Document',
      content: body.content || '',
      uri: body.uri,
      mime_type: body.mime_type,
      metadata: body.metadata,
    });

    return reply.status(201).send(doc);
  });

  app.post('/knowledge/search', async (request) => {
    const { query, top_k, similarity_threshold } = request.body as any;
    const { organizationId } = await resolveAuthContext(request);
    return knowledgeService.searchSimilar(organizationId, query, top_k || 3, similarity_threshold || 0.0);
  });

  // ---------------------------------------------------------------------------
  // 11. Tools & Integrations
  // ---------------------------------------------------------------------------
  app.get('/tools', async (request) => {
    const { organizationId } = await resolveAuthContext(request);
    return toolService.listTools(organizationId);
  });

  app.post('/tools', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { organizationId } = await resolveAuthContext(request);
    const body = request.body as any;
    const tool = await toolService.registerTool({ ...body, organization_id: organizationId });
    return reply.status(201).send(tool);
  });

  // ---------------------------------------------------------------------------
  // 12. Audit Logs
  // ---------------------------------------------------------------------------
  app.get('/audit/logs', async (request) => {
    const { organizationId } = await resolveAuthContext(request);
    const eventType = (request.query as any)?.event_type;
    return auditService.list(organizationId, 100, eventType);
  });
};
