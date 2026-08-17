import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { agentService } from '../../src/modules/agents/agent.service.js';
import { workflowEngine } from '../../src/modules/workflows/workflow.engine.js';
import { approvalService } from '../../src/modules/approvals/approval.service.js';
import { auditService } from '../../src/modules/audit/audit.service.js';
import { memoryService } from '../../src/modules/memory/memory.service.js';
import { policyEngine } from '../../src/modules/policies/policy.engine.js';

describe('Organization Multi-Tenant Isolation Tests', () => {
  const orgA = 'tenant_company_alpha';
  const orgB = 'tenant_company_beta';

  test('Organization A cannot see or mutate Organization B agents', async () => {
    await agentService.createAgent({
      organization_id: orgA,
      name: 'Alpha Confidential Agent',
      role: 'Alpha Specialist',
      job_description: 'Handles Alpha secret operations.',
      runtime: 'native',
      runtime_config: {},
      status: 'ACTIVE',
      permissions: ['alpha:all'],
      approval_limits: {},
      knowledge_scopes: [],
    });

    const agentsAlpha = await agentService.listAgents(orgA);
    const agentsBeta = await agentService.listAgents(orgB);

    assert.equal(agentsAlpha.length, 1);
    assert.equal(agentsBeta.length, 0);
  });

  test('Organization A cannot see Organization B workflows and runs', async () => {
    const workflowA = await workflowEngine.createWorkflow({
      organization_id: orgA,
      name: 'Alpha Secret Workflow',
      slug: 'alpha-secret-flow',
      description: 'Alpha proprietary workflow.',
      trigger_type: 'MANUAL',
      trigger_config: {},
      steps_config: [],
      is_active: true,
    });

    const runA = await workflowEngine.executeWorkflow({
      workflow_id: workflowA.id,
      organization_id: orgA,
      trigger_payload: { param: 'alpha_secret' },
    });

    const runsA = await workflowEngine.listRuns(orgA);
    const runsB = await workflowEngine.listRuns(orgB);

    assert.ok(runsA.some((r) => r.id === runA.id));
    assert.ok(!runsB.some((r) => r.id === runA.id));
  });

  test('Organization A cannot see Organization B approvals or audit logs', async () => {
    const approval = await approvalService.createApproval({
      organization_id: orgA,
      requested_by: 'Alpha Agent',
      reason: 'Confidential approval',
      context: { confidential: true },
      proposed_action: { action: 'release_funds' },
    });

    const approvalsA = await approvalService.listApprovals(orgA);
    const approvalsB = await approvalService.listApprovals(orgB);

    assert.ok(approvalsA.some((a) => a.id === approval.id));
    assert.equal(approvalsB.length, 0);

    const logsA = await auditService.list(orgA);
    const logsB = await auditService.list(orgB);

    assert.ok(logsA.length > 0);
    assert.equal(logsB.length, 0);
  });

  test('Organization A cannot see Organization B memories or policies', async () => {
    await memoryService.saveMemory({
      organization_id: orgA,
      scope: 'strategy',
      content: 'Alpha secret expansion in Q4',
      type: 'FACT',
    });

    const memoriesA = await memoryService.getMemories(orgA, 'strategy');
    const memoriesB = await memoryService.getMemories(orgB, 'strategy');

    assert.equal(memoriesA.length, 1);
    assert.equal(memoriesB.length, 0);

    await policyEngine.createPolicy({
      organization_id: orgA,
      name: 'Alpha Policy',
      scope: 'alpha_scope',
      rules: [],
      is_active: true,
    });

    const policiesA = await policyEngine.listPolicies(orgA);
    const policiesB = await policyEngine.listPolicies(orgB);

    assert.equal(policiesA.length, 1);
    assert.equal(policiesB.length, 0);
  });
});
