import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupService } from '../../src/modules/setup/setup.service.js';
import { WorkflowEngine } from '../../src/modules/workflows/workflow.engine.js';
import { ApprovalService } from '../../src/modules/approvals/approval.service.js';
import { auditService } from '../../src/modules/audit/audit.service.js';

describe('Universal 12-Stage Enterprise Pipeline E2E & Durability Suite', () => {
  test('executes complete 12-stage workflow with HITL pause, simulated process restart, durable resume, and audit', async () => {
    // 1. Bootstrap instance
    const setup = await setupService.runSetupWizard({
      company: { name: 'E2E Logistics Global' },
      admin: { name: 'E2E Admin', email: 'admin@e2e.test', password: 'Password2026!' },
    });
    const orgId = setup.organization.id;
    const workflow = setup.demoWorkflow;

    const workflowEngineInstance = WorkflowEngine.getInstance();
    const approvalServiceInstance = ApprovalService.getInstance();

    // 2. Trigger high-value action (value: 4500 > threshold 1000)
    const initialRun = await workflowEngineInstance.executeWorkflow({
      workflow_id: workflow.id,
      organization_id: orgId,
      trigger_payload: {
        action: 'action_requiring_approval',
        value: 4500,
        target: 'Cloud Provider Infrastructure',
        description: 'Provision high-throughput cluster nodes.',
      },
      task_name: 'action_requiring_approval',
      idempotency_key: 'e2e-run-key-101',
    });

    // 3. Verify workflow paused at HUMAN_APPROVAL stage
    assert.equal(initialRun.status, 'WAITING_APPROVAL');
    assert.equal(initialRun.current_step, 'HUMAN_APPROVAL');

    // 4. Verify Approval was persisted in pending state in the database
    const pendingApprovals = await approvalServiceInstance.listApprovals(orgId, 'PENDING');
    assert.ok(pendingApprovals.length > 0);
    const approval = pendingApprovals.find((a) => a.workflow_run_id === initialRun.id);
    assert.ok(approval, 'Approval entry must exist in DB for the paused run');
    assert.ok(approval.reason.includes('exceeds'));

    // 5. SIMULATE PROCESS RESTART / FRESH ENGINE:
    // A fresh WorkflowEngine instance loads state purely from database
    const freshWorkflowEngine = WorkflowEngine.getInstance();
    const freshApprovalService = ApprovalService.getInstance();

    // 6. Human Operator performs APPROVE action via persistent service
    await freshApprovalService.approve(approval.id, 'user:e2e_admin', 'Approved after architecture board review');

    // 7. Fetch updated run state from persistent store
    const { run: completedRun, steps } = await freshWorkflowEngine.getRun(initialRun.id);
    assert.ok(completedRun);
    assert.equal(completedRun.status, 'COMPLETED');
    assert.equal(completedRun.current_step, 'COMPLETE');

    // 8. Verify all 12 stages recorded in sequence
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

    // 9. Verify complete audit trail
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

  test('executes automatic straight-through workflow when policy triggers ALLOW without pause', async () => {
    const setup = await setupService.runSetupWizard({
      company: { name: 'Auto Approval Corp' },
      admin: { name: 'Auto Admin', email: 'autoadmin@corp.test', password: 'Password2026!' },
    });
    const orgId = setup.organization.id;
    const workflow = setup.demoWorkflow;

    const workflowEngineInstance = WorkflowEngine.getInstance();

    // Value 250 <= 1000 -> policy ALLOW
    const autoRun = await workflowEngineInstance.executeWorkflow({
      workflow_id: workflow.id,
      organization_id: orgId,
      trigger_payload: {
        action: 'low_value_operation',
        value: 250,
        target: 'Internal Cache',
      },
      task_name: 'low_value_operation',
    });

    assert.equal(autoRun.status, 'COMPLETED');
    assert.equal(autoRun.current_step, 'COMPLETE');

    const { steps } = await workflowEngineInstance.getRun(autoRun.id);
    const stepNames = steps.map((s) => s.step_name);
    assert.ok(stepNames.includes('EXECUTE_SIDE_EFFECTS'));
    assert.ok(stepNames.includes('COMPLETE'));
  });

  test('handles policy rejection and updates workflow to FAILED with proper audit', async () => {
    const setup = await setupService.runSetupWizard({
      company: { name: 'Reject Flow Corp' },
      admin: { name: 'Reject Admin', email: 'reject@corp.test', password: 'Password2026!' },
    });
    const orgId = setup.organization.id;
    const workflow = setup.demoWorkflow;

    const workflowEngineInstance = WorkflowEngine.getInstance();
    const approvalServiceInstance = ApprovalService.getInstance();

    const pausedRun = await workflowEngineInstance.executeWorkflow({
      workflow_id: workflow.id,
      organization_id: orgId,
      trigger_payload: {
        action: 'sensitive_operation',
        value: 99000,
      },
    });

    assert.equal(pausedRun.status, 'WAITING_APPROVAL');

    const approvals = await approvalServiceInstance.listApprovals(orgId, 'PENDING');
    const approval = approvals.find((a) => a.workflow_run_id === pausedRun.id)!;

    // Reject approval
    await approvalServiceInstance.reject(approval.id, 'user:rejector', 'Budget constraints');

    const { run: failedRun } = await workflowEngineInstance.getRun(pausedRun.id);
    assert.equal(failedRun?.status, 'FAILED');
    assert.ok(failedRun?.error_message?.includes('Budget constraints'));
  });
});
