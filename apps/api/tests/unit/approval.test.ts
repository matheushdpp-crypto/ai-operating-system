import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalService } from '../../src/modules/approvals/approval.service.js';

describe('ApprovalService (Human-in-the-loop State Machine)', () => {
  const service = new ApprovalService();
  const orgId = 'test_org_approval_1';

  test('creates pending approval and transitions to APPROVED', async () => {
    const approval = await service.createApproval({
      organization_id: orgId,
      requested_by: 'Agent: Finance Agent',
      assigned_to: 'ADMIN',
      reason: 'Exceeds auto-approval limit',
      context: { invoice_id: '123' },
      proposed_action: { action: 'approve_payment', amount: 50000 },
    });

    assert.equal(approval.status, 'PENDING');

    const approved = await service.approve(approval.id, 'user:admin1', 'Verified and approved');
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.decision, 'APPROVED');
    assert.equal(approved.decided_by, 'user:admin1');
  });

  test('rejects pending approval properly', async () => {
    const approval = await service.createApproval({
      organization_id: orgId,
      requested_by: 'Agent: Sales Agent',
      reason: 'Discount too high',
      context: {},
      proposed_action: { discount: 35 },
    });

    const rejected = await service.reject(approval.id, 'user:manager', 'Discount limit strictly 15%');
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.decision_reason, 'Discount limit strictly 15%');
  });

  test('takes over approval with custom human action', async () => {
    const approval = await service.createApproval({
      organization_id: orgId,
      requested_by: 'Agent: Support Agent',
      reason: 'Special SLA refund request',
      context: {},
      proposed_action: { refund: 100 },
    });

    const takenOver = await service.takeOver(approval.id, 'user:admin', { refund: 50, notes: 'Partial settlement' });
    assert.equal(takenOver.status, 'TAKEN_OVER');
    assert.equal(takenOver.proposed_action.refund, 50);
    assert.equal(takenOver.proposed_action.overridden_by_human, true);
  });
});
