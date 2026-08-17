import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toolService } from '../../src/modules/tools/tool.service.js';
import { agentService } from '../../src/modules/agents/agent.service.js';

describe('Tool System, Authorization and Idempotency Tests', () => {
  const orgId = 'org_tool_test_1';

  test('executes registered tool action successfully', async () => {
    await toolService.registerTool({
      organization_id: orgId,
      name: 'Test Internal Gateway',
      type: 'INTERNAL',
      provider: 'system',
      capabilities: ['system.ping', 'system.compute'],
      status: 'CONNECTED',
      metadata: {},
    });

    const res = await toolService.executeToolAction({
      organization_id: orgId,
      capability: 'system.ping',
      input: { ping: true },
    });

    assert.equal(res.status, 'SUCCESS');
    assert.ok(res.output.executed);
  });

  test('denies tool execution when capability is restricted on the agent', async () => {
    const agent = await agentService.createAgent({
      organization_id: orgId,
      name: 'Restricted Operator Agent',
      role: 'Junior Operator',
      job_description: 'Handles standard requests without raw database access.',
      runtime: 'native',
      runtime_config: {},
      status: 'ACTIVE',
      permissions: ['read:basic'],
      approval_limits: {
        restricted_tools: ['database.drop_table', 'raw_sql.execute'],
      },
      knowledge_scopes: [],
    });

    const res = await toolService.executeToolAction({
      organization_id: orgId,
      capability: 'database.drop_table',
      agent_id: agent.id,
      input: { table: 'customers' },
    });

    assert.equal(res.status, 'ERROR');
    assert.ok(res.output.error.includes('Permission Denied'));
  });

  test('enforces idempotency protection and returns cached response without duplicate side effects', async () => {
    const idempotencyKey = 'idempotency-key-unique-test-999';

    // First execution
    const firstCall = await toolService.executeToolAction({
      organization_id: orgId,
      capability: 'crm.create_lead',
      input: { email: 'client@enterprise.com', lead_score: 95 },
      idempotency_key: idempotencyKey,
    });

    assert.equal(firstCall.status, 'SUCCESS');
    assert.ok(firstCall.output);

    // Second execution with identical idempotency key
    const secondCall = await toolService.executeToolAction({
      organization_id: orgId,
      capability: 'crm.create_lead',
      input: { email: 'client@enterprise.com', lead_score: 95 },
      idempotency_key: idempotencyKey,
    });

    assert.equal(secondCall.status, 'SUCCESS');
    assert.equal(secondCall.output._idempotent_replay, true);
  });
});
