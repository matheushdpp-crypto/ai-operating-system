import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyEngine } from '../../src/modules/policies/policy.engine.js';
import { PolicyRule } from '../../src/types/index.js';

describe('PolicyEngine Deterministic Evaluator', () => {
  const engine = new PolicyEngine();

  test('evaluateCondition gt and lte operators', () => {
    const gtRule: PolicyRule['condition'] = {
      field: 'amount',
      operator: 'gt',
      value: 10000,
    };

    assert.equal(engine.evaluateCondition(gtRule, { amount: 15000 }), true);
    assert.equal(engine.evaluateCondition(gtRule, { amount: 8000 }), false);
    assert.equal(engine.evaluateCondition(gtRule, { amount: 10000 }), false);
  });

  test('evaluateCondition eq and in operators', () => {
    const eqRule: PolicyRule['condition'] = {
      field: 'action',
      operator: 'eq',
      value: 'export_full_ledger',
    };

    assert.equal(engine.evaluateCondition(eqRule, { action: 'export_full_ledger' }), true);
    assert.equal(engine.evaluateCondition(eqRule, { action: 'query_invoice' }), false);

    const inRule: PolicyRule['condition'] = {
      field: 'country',
      operator: 'in',
      value: ['BR', 'US', 'PT'],
    };
    assert.equal(engine.evaluateCondition(inRule, { country: 'BR' }), true);
    assert.equal(engine.evaluateCondition(inRule, { country: 'JP' }), false);
  });

  test('evaluate returns HUMAN_REQUIRED when policy rule triggers', async () => {
    const orgId = 'test_org_policy_1';
    await engine.createPolicy({
      organization_id: orgId,
      name: 'High Value Threshold Policy',
      scope: 'financial',
      is_active: true,
      rules: [
        {
          id: 'rule_val_10k',
          name: 'Exceeds 10k',
          condition: { field: 'amount', operator: 'gt', value: 10000 },
          decision: 'HUMAN_REQUIRED',
          reason: 'Amount is above 10,000 auto-approval limit',
          suggested_approver_role: 'ADMIN',
        },
      ],
    });

    const evalResult = await engine.evaluate({
      organization_id: orgId,
      scope: 'financial',
      action: 'approve_payment',
      context: { amount: 48000 },
    });

    assert.equal(evalResult.decision, 'HUMAN_REQUIRED');
    assert.equal(evalResult.requires_approval, true);
    assert.equal(evalResult.matched_rules.length, 1);
  });
});
