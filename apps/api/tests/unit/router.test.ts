import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicRouter } from '../../src/modules/orchestrator/router.js';
import { agentService } from '../../src/modules/agents/agent.service.js';

describe('DeterministicRouter', () => {
  const router = new DeterministicRouter();
  const orgId = 'test_org_router_1';

  test('routes deterministic tasks directly to assigned roles', async () => {
    // Seed agent
    await agentService.createAgent({
      organization_id: orgId,
      name: 'Finance Bot',
      role: 'Finance Agent',
      job_description: 'Finance validation',
      runtime: 'native',
      runtime_config: {},
      status: 'ACTIVE',
      permissions: [],
      approval_limits: {},
      knowledge_scopes: [],
    });

    const route = await router.routeTask({
      organization_id: orgId,
      taskName: 'invoice_validation',
      payload: { amount: 500 },
    });

    assert.equal(route.is_deterministic, true);
    assert.equal(route.domain, 'Finance Agent');
    assert.equal(route.agent.role, 'Finance Agent');
  });

  test('falls back to Orchestrator Agent when task is ambiguous', async () => {
    await agentService.createAgent({
      organization_id: orgId,
      name: 'Master Orchestrator',
      role: 'Orchestrator Agent',
      job_description: 'Orchestrates complex multi-domain operations',
      runtime: 'native',
      runtime_config: {},
      status: 'ACTIVE',
      permissions: [],
      approval_limits: {},
      knowledge_scopes: [],
    });

    const route = await router.routeTask({
      organization_id: orgId,
      taskName: 'custom_unrecognized_process',
      payload: { data: 'test' },
    });

    assert.equal(route.is_deterministic, false);
    assert.equal(route.agent.role, 'Orchestrator Agent');
  });
});
