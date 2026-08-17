import crypto from 'crypto';
import { Approval, ApprovalStatus } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';
import { auditService } from '../audit/audit.service.js';
import { workflowEngine } from '../workflows/workflow.engine.js';

export class ApprovalService {
  private static instance: ApprovalService;

  public static getInstance(): ApprovalService {
    if (!ApprovalService.instance) {
      ApprovalService.instance = new ApprovalService();
    }
    return ApprovalService.instance;
  }

  async createApproval(params: {
    organization_id: string;
    workflow_run_id?: string;
    task_id?: string;
    requested_by: string;
    assigned_to?: string;
    reason: string;
    context: Record<string, any>;
    proposed_action: Record<string, any>;
  }): Promise<Approval> {
    const id = crypto.randomUUID();
    const approval: Approval = {
      id,
      organization_id: params.organization_id,
      workflow_run_id: params.workflow_run_id,
      task_id: params.task_id,
      requested_by: params.requested_by,
      assigned_to: params.assigned_to || 'ADMIN',
      reason: params.reason,
      context: params.context,
      proposed_action: params.proposed_action,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.approvals (id, organization_id, workflow_run_id, task_id, requested_by, assigned_to, reason, context, proposed_action, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          approval.id,
          approval.organization_id,
          approval.workflow_run_id,
          approval.task_id,
          approval.requested_by,
          approval.assigned_to,
          approval.reason,
          JSON.stringify(approval.context),
          JSON.stringify(approval.proposed_action),
          approval.status,
          approval.created_at,
          approval.updated_at,
        ]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('approvals').set(id, approval);
    }

    await auditService.log({
      organization_id: params.organization_id,
      event_type: 'approval.created',
      actor_type: 'SYSTEM',
      actor_id: params.requested_by,
      target_type: 'approval',
      target_id: approval.id,
      payload: {
        workflow_run_id: params.workflow_run_id,
        reason: params.reason,
        proposed_action: params.proposed_action,
      },
    });

    return approval;
  }

  async getApproval(id: string): Promise<Approval | null> {
    if (db.isPostgres) {
      const res = await db.driver.query<Approval>(`SELECT * FROM aios.approvals WHERE id = $1`, [id]);
      return res.rows[0] || null;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      return mem.getTable('approvals').get(id) || null;
    }
  }

  async listApprovals(organization_id: string, status?: ApprovalStatus): Promise<Approval[]> {
    if (db.isPostgres) {
      const query = status
        ? `SELECT * FROM aios.approvals WHERE organization_id = $1 AND status = $2 ORDER BY created_at DESC`
        : `SELECT * FROM aios.approvals WHERE organization_id = $1 ORDER BY created_at DESC`;
      const params = status ? [organization_id, status] : [organization_id];
      const res = await db.driver.query<Approval>(query, params);
      return res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      return Array.from(mem.getTable('approvals').values())
        .filter((a: Approval) => a.organization_id === organization_id && (!status || a.status === status))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }

  private async updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    decided_by?: string,
    decision_reason?: string,
    decision?: string
  ): Promise<Approval> {
    const existing = await this.getApproval(id);
    if (!existing) throw new Error(`Approval not found: ${id}`);
    if (existing.status !== 'PENDING') throw new Error(`Approval already decided: ${existing.status}`);

    const now = new Date().toISOString();
    existing.status = status;
    existing.decision = decision || status;
    existing.decision_reason = decision_reason;
    existing.decided_by = decided_by;
    existing.decided_at = now;
    existing.updated_at = now;

    if (db.isPostgres) {
      await db.driver.query(
        `UPDATE aios.approvals SET status = $1, decision = $2, decision_reason = $3, decided_by = $4, decided_at = $5, updated_at = $6 WHERE id = $7`,
        [existing.status, existing.decision, existing.decision_reason, existing.decided_by, existing.decided_at, existing.updated_at, id]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('approvals').set(id, existing);
    }

    await auditService.log({
      organization_id: existing.organization_id,
      event_type: `approval.${status.toLowerCase()}`,
      actor_type: 'USER',
      actor_id: decided_by || 'user:operator',
      target_type: 'approval',
      target_id: existing.id,
      payload: {
        status,
        decision_reason,
        workflow_run_id: existing.workflow_run_id,
      },
    });

    // Durable workflow resumption:
    // If this approval was linked to a workflow run, trigger the workflow engine resume from persistent state
    if (existing.workflow_run_id) {
      await workflowEngine.resumeWorkflowRun(existing.workflow_run_id, existing);
    }

    return existing;
  }

  async approve(id: string, decided_by?: string, reason?: string): Promise<Approval> {
    return this.updateApprovalStatus(id, 'APPROVED', decided_by, reason, 'APPROVED');
  }

  async reject(id: string, decided_by?: string, reason?: string): Promise<Approval> {
    return this.updateApprovalStatus(id, 'REJECTED', decided_by, reason, 'REJECTED');
  }

  async requestChanges(id: string, decided_by?: string, notes?: string): Promise<Approval> {
    return this.updateApprovalStatus(id, 'CHANGES_REQUESTED', decided_by, notes, 'CHANGES_REQUESTED');
  }

  async takeOver(id: string, decided_by?: string, customAction?: Record<string, any>): Promise<Approval> {
    const existing = await this.getApproval(id);
    if (!existing) throw new Error(`Approval not found: ${id}`);
    if (customAction) {
      existing.proposed_action = { ...existing.proposed_action, ...customAction, overridden_by_human: true };
    }
    return this.updateApprovalStatus(id, 'TAKEN_OVER', decided_by, 'Taken over and modified by human operator', 'TAKEN_OVER');
  }
}

export const approvalService = ApprovalService.getInstance();
