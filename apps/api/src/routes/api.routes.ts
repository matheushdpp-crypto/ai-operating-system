import { FastifyInstance, FastifyPluginAsync } from 'fastify';
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
import { db } from '../database/index.js';
import { config } from '../config/env.js';
import { WorkflowRun } from '../types/index.js';

export const apiRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ---------------------------------------------------------------------------
  // Health & System Status
  // ---------------------------------------------------------------------------
  app.get('/health', async (request, reply) => {
    const isDbHealthy = await db.driver.isHealthy();
    return {
      status: 'OK',
      platform: config.platform.name,
      version: '1.0.0',
      uptime_seconds: process.uptime(),
      timestamp: new Date().toISOString(),
      components: {
        database: {
          status: isDbHealthy ? 'HEALTHY' : 'DEGRADED',
          type: db.isPostgres ? 'POSTGRESQL_PGVECTOR' : 'IN_MEMORY_REPOSITORY',
        },
        n8n: {
          status: 'CONFIGURED',
          url: config.n8n.baseUrl,
        },
        runtime: {
          status: 'ONLINE',
          default: config.ai.defaultProvider,
        },
        storage: {
          status: 'ONLINE',
          provider: config.storage.provider,
        },
      },
    };
  });

  // ---------------------------------------------------------------------------
  // Setup Wizard
  // ---------------------------------------------------------------------------
  app.get('/setup/status', async (request, reply) => {
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
  // Auth & Organizations
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
    return {
      token: 'jwt_mock_token_' + user.id,
      user,
      organization: org,
    };
  });

  app.get('/organizations', async () => {
    return authService.listOrganizations();
  });

  // ---------------------------------------------------------------------------
  // Dashboard Metrics
  // ---------------------------------------------------------------------------
  app.get('/dashboard/metrics', async (request, reply) => {
    const orgId = (request.query as any)?.organization_id || (await authService.listOrganizations())[0]?.id;
    if (!orgId) return { total_runs: 0, active_agents: 0, pending_approvals: 0, recent_events: [] };

    const runs: WorkflowRun[] = await workflowEngine.listRuns(orgId, 100);
    const agents = await agentService.listAgents(orgId);
    const approvals = await approvalService.listApprovals(orgId, 'PENDING');
    const logs = await auditService.list(orgId, 10);

    return {
      workflows_count: (await workflowEngine.listWorkflows(orgId)).length,
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
  // Agents
  // ---------------------------------------------------------------------------
  app.get('/agents', async (request) => {
    const orgId = (request.query as any)?.organization_id || (await authService.listOrganizations())[0]?.id;
    return orgId ? agentService.listAgents(orgId) : [];
  });

  app.post('/agents', async (request, reply) => {
    const body = request.body as any;
    const orgId = body.organization_id || (await authService.listOrganizations())[0]?.id;
    const agent = await agentService.createAgent({ ...body, organization_id: orgId }, body.skills || []);
    return reply.status(201).send(agent);
  });

  app.get('/agents/:id', async (request, reply) => {
    const { id } = request.params as any;
    const agent = await agentService.getAgent(id);
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    return agent;
  });

  // ---------------------------------------------------------------------------
  // Skills
  // ---------------------------------------------------------------------------
  app.get('/skills', async (request) => {
    const orgId = (request.query as any)?.organization_id || (await authService.listOrganizations())[0]?.id;
    return orgId ? skillService.listSkills(orgId) : [];
  });

  app.post('/skills', async (request, reply) => {
    const body = request.body as any;
    const orgId = body.organization_id || (await authService.listOrganizations())[0]?.id;
    const skill = await skillService.registerSkill({ ...body, organization_id: orgId });
    return reply.status(201).send(skill);
  });

  // ---------------------------------------------------------------------------
  // Workflows & Runs
  // ---------------------------------------------------------------------------
  app.get('/workflows', async (request) => {
    const orgId = (request.query as any)?.organization_id || (await authService.listOrganizations())[0]?.id;
    return orgId ? workflowEngine.listWorkflows(orgId) : [];
  });

  app.post('/workflows/:slug/trigger', async (request, reply) => {
    const { slug } = request.params as any;
    const orgId = (request.body as any)?.organization_id || (await authService.listOrganizations())[0]?.id;
    const workflow = await workflowEngine.getWorkflowBySlug(orgId, slug);
    if (!workflow) return reply.status(404).send({ error: `Workflow not found: ${slug}` });

    const payload = (request.body as any)?.payload || (request.body as any) || {};
    const taskName = (request.body as any)?.task_name || slug;

    const run = await workflowEngine.executeWorkflow({
      workflow_id: workflow.id,
      organization_id: orgId,
      trigger_payload: payload,
      task_name: taskName,
    });

    return reply.status(202).send(run);
  });

  app.get('/runs', async (request) => {
    const orgId = (request.query as any)?.organization_id || (await authService.listOrganizations())[0]?.id;
    return orgId ? workflowEngine.listRuns(orgId) : [];
  });

  app.get('/runs/:id', async (request, reply) => {
    const { id } = request.params as any;
    const result = await workflowEngine.getRun(id);
    if (!result.run) return reply.status(404).send({ error: 'Workflow run not found' });
    return result;
  });

  // ---------------------------------------------------------------------------
  // Approvals (Human-in-the-Loop)
  // ---------------------------------------------------------------------------
  app.get('/approvals', async (request) => {
    const orgId = (request.query as any)?.organization_id || (await authService.listOrganizations())[0]?.id;
    const status = (request.query as any)?.status;
    return orgId ? approvalService.listApprovals(orgId, status) : [];
  });

  app.get('/approvals/:id', async (request, reply) => {
    const { id } = request.params as any;
    const approval = await approvalService.getApproval(id);
    if (!approval) return reply.status(404).send({ error: 'Approval not found' });
    return approval;
  });

  app.post('/approvals/:id/approve', async (request, reply) => {
    const { id } = request.params as any;
    const { decided_by, reason } = (request.body as any) || {};
    const updated = await approvalService.approve(id, decided_by, reason);
    return updated;
  });

  app.post('/approvals/:id/reject', async (request, reply) => {
    const { id } = request.params as any;
    const { decided_by, reason } = (request.body as any) || {};
    const updated = await approvalService.reject(id, decided_by, reason);
    return updated;
  });

  app.post('/approvals/:id/changes', async (request, reply) => {
    const { id } = request.params as any;
    const { decided_by, notes } = (request.body as any) || {};
    const updated = await approvalService.requestChanges(id, decided_by, notes);
    return updated;
  });

  app.post('/approvals/:id/takeover', async (request, reply) => {
    const { id } = request.params as any;
    const { decided_by, custom_action } = (request.body as any) || {};
    const updated = await approvalService.takeOver(id, decided_by, custom_action);
    return updated;
  });

  // ---------------------------------------------------------------------------
  // Policies
  // ---------------------------------------------------------------------------
  app.get('/policies', async (request) => {
    const orgId = (request.query as any)?.organization_id || (await authService.listOrganizations())[0]?.id;
    return orgId ? policyEngine.listPolicies(orgId) : [];
  });

  app.post('/policies', async (request, reply) => {
    const body = request.body as any;
    const orgId = body.organization_id || (await authService.listOrganizations())[0]?.id;
    const policy = await policyEngine.createPolicy({ ...body, organization_id: orgId });
    return reply.status(201).send(policy);
  });

  // ---------------------------------------------------------------------------
  // Knowledge & RAG
  // ---------------------------------------------------------------------------
  app.post('/knowledge/ingest', async (request, reply) => {
    const body = request.body as any;
    const orgId = body.organization_id || (await authService.listOrganizations())[0]?.id;
    let sourceId = body.source_id;

    if (!sourceId) {
      const source = await knowledgeService.createSource({
        organization_id: orgId,
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
    });

    return reply.status(201).send(doc);
  });

  app.post('/knowledge/search', async (request) => {
    const { query, top_k } = request.body as any;
    const orgId = (request.body as any)?.organization_id || (await authService.listOrganizations())[0]?.id;
    return knowledgeService.searchSimilar(orgId, query, top_k || 3);
  });

  // ---------------------------------------------------------------------------
  // Tools & Integrations
  // ---------------------------------------------------------------------------
  app.get('/tools', async (request) => {
    const orgId = (request.query as any)?.organization_id || (await authService.listOrganizations())[0]?.id;
    return orgId ? toolService.listTools(orgId) : [];
  });

  // ---------------------------------------------------------------------------
  // Audit Logs
  // ---------------------------------------------------------------------------
  app.get('/audit/logs', async (request) => {
    const orgId = (request.query as any)?.organization_id || (await authService.listOrganizations())[0]?.id;
    const eventType = (request.query as any)?.event_type;
    return orgId ? auditService.list(orgId, 100, eventType) : [];
  });
};
