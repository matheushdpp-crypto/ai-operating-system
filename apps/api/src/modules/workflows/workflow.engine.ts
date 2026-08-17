import crypto from 'crypto';
import {
  Workflow,
  WorkflowRun,
  WorkflowStepRun,
  WorkflowRunStatus,
  WorkflowStepStatus,
  Approval,
} from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';
import { deterministicRouter } from '../orchestrator/router.js';
import { skillService } from '../skills/skill.service.js';
import { knowledgeService } from '../knowledge/knowledge.service.js';
import { memoryService } from '../memory/memory.service.js';
import { RuntimeRegistry } from '../runtime/runtime.adapter.js';
import { policyEngine } from '../policies/policy.engine.js';
import { approvalService } from '../approvals/approval.service.js';
import { toolService } from '../tools/tool.service.js';
import { auditService } from '../audit/audit.service.js';

export const UNIVERSAL_STAGES = [
  'TRIGGER',
  'IDENTIFY',
  'LOAD_CONTEXT',
  'SELECT_AGENT',
  'LOAD_SKILLS',
  'LOAD_KNOWLEDGE',
  'EXECUTE_AGENT',
  'CHECK_POLICY',
  'HUMAN_APPROVAL',
  'EXECUTE_SIDE_EFFECTS',
  'UPDATE_STATE',
  'COMPLETE',
] as const;

export class WorkflowEngine {
  private static instance: WorkflowEngine;

  public static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine();
    }
    return WorkflowEngine.instance;
  }

  async createWorkflow(workflow: Omit<Workflow, 'id' | 'created_at' | 'updated_at'>): Promise<Workflow> {
    const id = crypto.randomUUID();
    const newWorkflow: Workflow = {
      id,
      ...workflow,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.workflows (id, organization_id, name, slug, description, trigger_type, trigger_config, steps_config, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          newWorkflow.id,
          newWorkflow.organization_id,
          newWorkflow.name,
          newWorkflow.slug,
          newWorkflow.description,
          newWorkflow.trigger_type,
          JSON.stringify(newWorkflow.trigger_config),
          JSON.stringify(newWorkflow.steps_config),
          newWorkflow.is_active,
          newWorkflow.created_at,
          newWorkflow.updated_at,
        ]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('workflows').set(id, newWorkflow);
    }

    return newWorkflow;
  }

  async getWorkflowBySlug(organization_id: string, slug: string): Promise<Workflow | null> {
    if (db.isPostgres) {
      const res = await db.driver.query<Workflow>(
        `SELECT * FROM aios.workflows WHERE organization_id = $1 AND slug = $2`,
        [organization_id, slug]
      );
      return res.rows[0] || null;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      const all = Array.from(mem.getTable('workflows').values()) as Workflow[];
      return all.find((w) => w.organization_id === organization_id && w.slug === slug) || null;
    }
  }

  async listWorkflows(organization_id: string): Promise<Workflow[]> {
    if (db.isPostgres) {
      const res = await db.driver.query<Workflow>(
        `SELECT * FROM aios.workflows WHERE organization_id = $1 ORDER BY name ASC`,
        [organization_id]
      );
      return res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      return (Array.from(mem.getTable('workflows').values()) as Workflow[]).filter(
        (w) => w.organization_id === organization_id
      );
    }
  }

  async getRun(runId: string): Promise<{ run: WorkflowRun | null; steps: WorkflowStepRun[] }> {
    let run: WorkflowRun | null = null;
    let steps: WorkflowStepRun[] = [];

    if (db.isPostgres) {
      const runRes = await db.driver.query<WorkflowRun>(`SELECT * FROM aios.workflow_runs WHERE id = $1`, [runId]);
      run = runRes.rows[0] || null;
      const stepRes = await db.driver.query<WorkflowStepRun>(
        `SELECT * FROM aios.workflow_steps WHERE workflow_run_id = $1 ORDER BY step_order ASC`,
        [runId]
      );
      steps = stepRes.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      run = mem.getTable('workflow_runs').get(runId) || null;
      steps = (Array.from(mem.getTable('workflow_steps').values()) as WorkflowStepRun[])
        .filter((s) => s.workflow_run_id === runId)
        .sort((a, b) => a.step_order - b.step_order);
    }

    return { run, steps };
  }

  async listRuns(organization_id: string, limit: number = 50): Promise<WorkflowRun[]> {
    if (db.isPostgres) {
      const res = await db.driver.query<WorkflowRun>(
        `SELECT * FROM aios.workflow_runs WHERE organization_id = $1 ORDER BY started_at DESC LIMIT $2`,
        [organization_id, limit]
      );
      return res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      return (Array.from(mem.getTable('workflow_runs').values()) as WorkflowRun[])
        .filter((r) => r.organization_id === organization_id)
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
        .slice(0, limit);
    }
  }

  private async saveRun(run: WorkflowRun) {
    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.workflow_runs (id, workflow_id, organization_id, trigger_payload, current_step, status, state_data, error_message, started_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           current_step = EXCLUDED.current_step,
           status = EXCLUDED.status,
           state_data = EXCLUDED.state_data,
           error_message = EXCLUDED.error_message,
           completed_at = EXCLUDED.completed_at`,
        [
          run.id,
          run.workflow_id,
          run.organization_id,
          JSON.stringify(run.trigger_payload),
          run.current_step,
          run.status,
          JSON.stringify(run.state_data),
          run.error_message,
          run.started_at,
          run.completed_at,
        ]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('workflow_runs').set(run.id, run);
    }
  }

  private async recordStep(step: Omit<WorkflowStepRun, 'id'>): Promise<WorkflowStepRun> {
    const id = crypto.randomUUID();
    const entry: WorkflowStepRun = { id, ...step };

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.workflow_steps (id, workflow_run_id, step_name, step_order, status, input_data, output_data, error, duration_ms, started_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          entry.id,
          entry.workflow_run_id,
          entry.step_name,
          entry.step_order,
          entry.status,
          JSON.stringify(entry.input_data),
          JSON.stringify(entry.output_data),
          entry.error,
          entry.duration_ms,
          entry.started_at,
          entry.completed_at,
        ]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('workflow_steps').set(id, entry);
    }

    return entry;
  }

  /**
   * Executes the Universal 12-Stage Pipeline
   */
  async executeWorkflow(params: {
    workflow_id: string;
    organization_id: string;
    trigger_payload: Record<string, any>;
    task_name?: string;
  }): Promise<WorkflowRun> {
    const runId = crypto.randomUUID();
    const run: WorkflowRun = {
      id: runId,
      workflow_id: params.workflow_id,
      organization_id: params.organization_id,
      trigger_payload: params.trigger_payload,
      current_step: 'TRIGGER',
      status: 'RUNNING',
      state_data: {},
      started_at: new Date().toISOString(),
    };

    await this.saveRun(run);
    await auditService.log({
      organization_id: params.organization_id,
      event_type: 'workflow.started',
      actor_type: 'SYSTEM',
      actor_id: 'system:workflow_engine',
      target_type: 'workflow_run',
      target_id: run.id,
      payload: { workflow_id: params.workflow_id, trigger: params.trigger_payload },
    });

    // Execute pipeline asynchronously or sequentially
    return this.runPipeline(run, params.task_name || 'process_request');
  }

  private async runPipeline(run: WorkflowRun, taskName: string): Promise<WorkflowRun> {
    let order = 1;

    try {
      // 1. TRIGGER
      const t1 = Date.now();
      await this.recordStep({
        workflow_run_id: run.id,
        step_name: 'TRIGGER',
        step_order: order++,
        status: 'COMPLETED',
        input_data: run.trigger_payload,
        output_data: { message: 'Trigger received and validated' },
        duration_ms: Date.now() - t1,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      // 2. IDENTIFY
      const t2 = Date.now();
      const taskIdentifier = run.trigger_payload.action || run.trigger_payload.process_type || taskName;
      await this.recordStep({
        workflow_run_id: run.id,
        step_name: 'IDENTIFY',
        step_order: order++,
        status: 'COMPLETED',
        input_data: { task: taskIdentifier },
        output_data: { identified_task: taskIdentifier },
        duration_ms: Date.now() - t2,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      // 3. LOAD CONTEXT & MEMORY
      const t3 = Date.now();
      const memories = await memoryService.getMemories(run.organization_id, 'global');
      run.state_data.memories = memories;
      await this.recordStep({
        workflow_run_id: run.id,
        step_name: 'LOAD_CONTEXT',
        step_order: order++,
        status: 'COMPLETED',
        input_data: { entity_id: run.trigger_payload.entity_id },
        output_data: { memories_loaded: memories.length },
        duration_ms: Date.now() - t3,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      // 4. SELECT AGENT
      const t4 = Date.now();
      const routing = await deterministicRouter.routeTask({
        organization_id: run.organization_id,
        taskName: taskIdentifier,
        payload: run.trigger_payload,
      });
      const agent = routing.agent;
      run.state_data.agent = agent;
      await this.recordStep({
        workflow_run_id: run.id,
        step_name: 'SELECT_AGENT',
        step_order: order++,
        status: 'COMPLETED',
        input_data: { task: taskIdentifier },
        output_data: {
          agent_id: agent.id,
          agent_name: agent.name,
          agent_role: agent.role,
          is_deterministic: routing.is_deterministic,
          reason: routing.reason,
        },
        duration_ms: Date.now() - t4,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      // 5. LOAD SKILLS
      const t5 = Date.now();
      const skills = agent.skills || (await skillService.listSkills(run.organization_id));
      run.state_data.skills = skills;
      await this.recordStep({
        workflow_run_id: run.id,
        step_name: 'LOAD_SKILLS',
        step_order: order++,
        status: 'COMPLETED',
        input_data: { agent_id: agent.id },
        output_data: { loaded_skills: skills.map((s) => s.name) },
        duration_ms: Date.now() - t5,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      // 6. LOAD KNOWLEDGE
      const t6 = Date.now();
      const query = `${taskIdentifier} ${JSON.stringify(run.trigger_payload)}`;
      const chunks = await knowledgeService.searchSimilar(run.organization_id, query, 3);
      run.state_data.knowledge = chunks.map((c) => c.content);
      await this.recordStep({
        workflow_run_id: run.id,
        step_name: 'LOAD_KNOWLEDGE',
        step_order: order++,
        status: 'COMPLETED',
        input_data: { query: taskIdentifier },
        output_data: { chunks_found: chunks.length },
        duration_ms: Date.now() - t6,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      // 7. EXECUTE (Agent Runtime)
      const t7 = Date.now();
      const runtimeAdapter = RuntimeRegistry.getAdapter(agent.runtime);
      const executionResult = await runtimeAdapter.executeTask({
        agent,
        skills,
        knowledge: run.state_data.knowledge,
        tools: [],
        task: {
          name: taskIdentifier,
          input: run.trigger_payload,
          context: run.state_data,
        },
      });
      run.state_data.execution_result = executionResult;
      await this.recordStep({
        workflow_run_id: run.id,
        step_name: 'EXECUTE_AGENT',
        step_order: order++,
        status: 'COMPLETED',
        input_data: run.trigger_payload,
        output_data: executionResult.output,
        duration_ms: Date.now() - t7,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      // 8. CHECK POLICY
      const t8 = Date.now();
      const proposedAction = executionResult.action_proposed || {
        action: taskIdentifier,
        params: run.trigger_payload,
      };

      const policyEval = await policyEngine.evaluate({
        organization_id: run.organization_id,
        scope: 'financial',
        action: proposedAction.action,
        context: {
          ...run.trigger_payload,
          max_auto_approval_amount: agent.approval_limits?.max_auto_approval_amount,
        },
        agent_id: agent.id,
      });

      run.state_data.policy_decision = policyEval;
      await this.recordStep({
        workflow_run_id: run.id,
        step_name: 'CHECK_POLICY',
        step_order: order++,
        status: 'COMPLETED',
        input_data: proposedAction,
        output_data: policyEval,
        duration_ms: Date.now() - t8,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      // 9. HUMAN APPROVAL (HITL)
      if (policyEval.requires_approval) {
        run.status = 'WAITING_APPROVAL';
        run.current_step = 'HUMAN_APPROVAL';
        await this.saveRun(run);

        const approval = await approvalService.createApproval({
          organization_id: run.organization_id,
          workflow_run_id: run.id,
          requested_by: `Agent: ${agent.name}`,
          assigned_to: policyEval.suggested_approver_role || 'ADMIN',
          reason: policyEval.reasons.join(' | '),
          context: {
            task: taskIdentifier,
            trigger: run.trigger_payload,
            execution: executionResult.output,
          },
          proposed_action: proposedAction,
        });

        // Record paused step
        await this.recordStep({
          workflow_run_id: run.id,
          step_name: 'HUMAN_APPROVAL',
          step_order: order++,
          status: 'PAUSED',
          input_data: { approval_id: approval.id, reason: approval.reason },
          output_data: { status: 'WAITING_FOR_HUMAN_OPERATOR' },
          started_at: new Date().toISOString(),
        });

        // Register resume callback when human approves/rejects
        approvalService.registerResumeCallback(run.id, async (decidedApproval: Approval) => {
          await this.resumePipeline(run, decidedApproval, order);
        });

        return run;
      }

      // If no approval required, continue automatically to step 10
      return this.continuePipelineExecution(run, proposedAction, order);
    } catch (err: any) {
      run.status = 'FAILED';
      run.error_message = err.message;
      run.completed_at = new Date().toISOString();
      await this.saveRun(run);

      await auditService.log({
        organization_id: run.organization_id,
        event_type: 'workflow.failed',
        actor_type: 'SYSTEM',
        actor_id: 'system:workflow_engine',
        target_type: 'workflow_run',
        target_id: run.id,
        payload: { error: err.message },
      });

      return run;
    }
  }

  /**
   * Resumes workflow after human approval or rejection
   */
  public async resumePipeline(run: WorkflowRun, approval: Approval, nextOrder: number): Promise<WorkflowRun> {
    if (approval.status === 'REJECTED') {
      run.status = 'FAILED';
      run.error_message = `Rejected by human reviewer: ${approval.decision_reason || 'No reason provided'}`;
      run.completed_at = new Date().toISOString();
      await this.saveRun(run);

      await this.recordStep({
        workflow_run_id: run.id,
        step_name: 'HUMAN_APPROVAL',
        step_order: nextOrder,
        status: 'FAILED',
        input_data: { approval_id: approval.id },
        output_data: { decision: 'REJECTED', reason: approval.decision_reason },
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      return run;
    }

    // Step 9 update to completed
    await this.recordStep({
      workflow_run_id: run.id,
      step_name: 'HUMAN_APPROVAL',
      step_order: nextOrder++,
      status: 'COMPLETED',
      input_data: { approval_id: approval.id },
      output_data: { decision: approval.status, decided_by: approval.decided_by },
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    run.status = 'RUNNING';
    return this.continuePipelineExecution(run, approval.proposed_action, nextOrder);
  }

  private async continuePipelineExecution(
    run: WorkflowRun,
    action: Record<string, any>,
    order: number
  ): Promise<WorkflowRun> {
    // 10. EXECUTE SIDE EFFECTS / TOOLS
    const t10 = Date.now();
    const toolExec = await toolService.executeToolAction({
      organization_id: run.organization_id,
      capability: action.action || 'default_action',
      agent_id: run.state_data.agent?.id,
      input: action.params || action,
    });

    await this.recordStep({
      workflow_run_id: run.id,
      step_name: 'EXECUTE_SIDE_EFFECTS',
      step_order: order++,
      status: 'COMPLETED',
      input_data: action,
      output_data: toolExec.output,
      duration_ms: Date.now() - t10,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    // 11. UPDATE STATE & MEMORY
    const t11 = Date.now();
    await memoryService.saveMemory({
      organization_id: run.organization_id,
      scope: 'workflow_history',
      content: `Completed workflow for ${action.action} on amount ${action.params?.amount || 'N/A'}`,
      type: 'EPISODIC',
      agent_id: run.state_data.agent?.id,
    });

    run.state_data.final_result = toolExec.output;
    await this.recordStep({
      workflow_run_id: run.id,
      step_name: 'UPDATE_STATE',
      step_order: order++,
      status: 'COMPLETED',
      input_data: { action },
      output_data: { state: 'PERSISTED', memory: 'SAVED' },
      duration_ms: Date.now() - t11,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    // 12. LOG / AUDIT & COMPLETE
    const t12 = Date.now();
    run.status = 'COMPLETED';
    run.current_step = 'COMPLETE';
    run.completed_at = new Date().toISOString();
    await this.saveRun(run);

    await this.recordStep({
      workflow_run_id: run.id,
      step_name: 'COMPLETE',
      step_order: order++,
      status: 'COMPLETED',
      input_data: { run_id: run.id },
      output_data: { status: 'COMPLETED', summary: 'Universal 12-stage workflow completed successfully.' },
      duration_ms: Date.now() - t12,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    await auditService.log({
      organization_id: run.organization_id,
      event_type: 'workflow.completed',
      actor_type: 'SYSTEM',
      actor_id: 'system:workflow_engine',
      target_type: 'workflow_run',
      target_id: run.id,
      payload: { status: 'COMPLETED', execution_summary: run.state_data.final_result },
    });

    return run;
  }
}

export const workflowEngine = WorkflowEngine.getInstance();
