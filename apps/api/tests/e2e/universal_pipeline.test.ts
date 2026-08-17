import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupService } from '../../src/modules/setup/setup.service.js';
import { workflowEngine } from '../../src/modules/workflows/workflow.engine.js';
import { approvalService } from '../../src/modules/approvals/approval.service.js';
import { auditService } from '../../src/modules/audit/audit.service.js';

describe('Universal 12-Stage Enterprise Pipeline E2E Test', () => {
  test('executes complete 12-stage workflow with HITL approval gate, pause, human approve, resume, and audit', async () => {
    // 1. Bootstrap instance
    const setup = await setupService.runSetupWizard({
      company: { name: 'E2E Logistics Global' },
      admin: { name: 'E2E Admin', email: 'admin@e2e.test', password: 'Password2026!' },
    });
    const orgId = setup.organization.id;
    const workflow = setup.demoWorkflow;

    // 2. Trigger high-value invoice ($48,000 > $10,000 limit)
    const initialRun = await workflowEngine.executeWorkflow({
      workflow_id: workflow.id,
      organization_id: orgId,
      trigger_payload: {
        action: 'validate_invoice',
        vendor: 'Cloud Servers Global S.A.',
        invoice_number: 'INV-E2E-2026-990',
        amount: 48000,
        currency: 'BRL',
        description: 'Dedicated GPU clusters for agent operations.',
      },
      task_name: 'validate_invoice',
    });

    // 3. Verify workflow paused at HUMAN_APPROVAL step
    assert.equal(initialRun.status, 'WAITING_APPROVAL');
    assert.equal(initialRun.current_step, 'HUMAN_APPROVAL');

    // 4. Verify Approval was created in pending state
    const pendingApprovals = await approvalService.listApprovals(orgId, 'PENDING');
    assert.ok(pendingApprovals.length > 0);
    const approval = pendingApprovals.find((a) => a.workflow_run_id === initialRun.id);
    assert.ok(approval, 'Approval entry must exist for the paused run');
    assert.ok(approval.reason.includes('exceeds'));

    // 5. Human Operator performs APPROVE action
    await approvalService.approve(approval.id, 'user:e2e_admin', 'Approved after reviewing commercial PO');

    // 6. Fetch updated run state
    const { run: completedRun, steps } = await workflowEngine.getRun(initialRun.id);
    assert.ok(completedRun);
    assert.equal(completedRun.status, 'COMPLETED');
    assert.equal(completedRun.current_step, 'COMPLETE');

    // 7. Verify all 12 stages recorded in sequence
    assert.ok(steps.length >= 11, `Expected all pipeline stages recorded, got ${steps.length}`);
    const stepNames = steps.map((s) => s.step_name);
    assert.ok(stepNames.includes('TRIGGER'));
    assert.ok(stepNames.includes('IDENTIFY'));
    assert.ok(stepNames.includes('LOAD_CONTEXT'));
    assert.ok(stepNames.includes('SELECT_AGENT'));
    assert.ok(stepNames.includes('LOAD_SKILLS'));
    assert.ok(stepNames.includes('LOAD_KNOWLEDGE'));
    assert.ok(stepNames.includes('EXECUTE_AGENT'));
    assert.ok(stepNames.includes('CHECK_POLICY'));
    assert.ok(stepNames.includes('HUMAN_APPROVAL'));
    assert.ok(stepNames.includes('EXECUTE_SIDE_EFFECTS'));
    assert.ok(stepNames.includes('UPDATE_STATE'));
    assert.ok(stepNames.includes('COMPLETE'));

    // 8. Verify audit logs trail recorded every critical event
    const auditLogs = await auditService.list(orgId, 50);
    const eventTypes = auditLogs.map((l) => l.event_type);
    assert.ok(eventTypes.includes('workflow.started'));
    assert.ok(eventTypes.includes('agent.selected'));
    assert.ok(eventTypes.includes('knowledge.retrieved'));
    assert.ok(eventTypes.includes('policy.checked'));
    assert.ok(eventTypes.includes('approval.created'));
    assert.ok(eventTypes.includes('approval.approved'));
    assert.ok(eventTypes.includes('tool.called'));
    assert.ok(eventTypes.includes('workflow.completed'));
  });
});
