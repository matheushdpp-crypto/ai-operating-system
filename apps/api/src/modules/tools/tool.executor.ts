import crypto from 'crypto';
import { Tool, IdempotencyRecord } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';
import { auditService } from '../audit/audit.service.js';
import { agentService } from '../agents/agent.service.js';
import { IToolAdapter, HttpApiToolAdapter, N8nToolAdapter, InternalToolAdapter } from './tool.adapter.js';

export class ToolExecutor {
  private static instance: ToolExecutor;
  private adapters: Map<string, IToolAdapter> = new Map();

  private constructor() {
    this.adapters.set('HTTP_API', new HttpApiToolAdapter());
    this.adapters.set('N8N', new N8nToolAdapter());
    this.adapters.set('INTERNAL', new InternalToolAdapter());
    this.adapters.set('ERP', new HttpApiToolAdapter());
    this.adapters.set('CRM', new HttpApiToolAdapter());
    this.adapters.set('MESSAGING', new InternalToolAdapter());
    this.adapters.set('DATABASE', new InternalToolAdapter());
    this.adapters.set('STORAGE', new InternalToolAdapter());
  }

  public static getInstance(): ToolExecutor {
    if (!ToolExecutor.instance) {
      ToolExecutor.instance = new ToolExecutor();
    }
    return ToolExecutor.instance;
  }

  /**
   * Executes a tool action through strict authorization and idempotency checks
   */
  async execute(params: {
    organization_id: string;
    capability: string;
    tool_id?: string;
    tool_name?: string;
    agent_id?: string;
    input: Record<string, any>;
    idempotency_key?: string;
  }): Promise<{ status: 'SUCCESS' | 'ERROR'; output: any }> {
    const { organization_id, capability, agent_id, input, idempotency_key } = params;

    // 1. Check Idempotency Record
    if (idempotency_key) {
      let existingRecord: IdempotencyRecord | null = null;
      if (db.isPostgres) {
        const res = await db.driver.query<IdempotencyRecord>(
          `SELECT * FROM aios.idempotency_records WHERE organization_id = $1 AND idempotency_key = $2`,
          [organization_id, idempotency_key]
        );
        existingRecord = res.rows[0] || null;
      } else {
        const mem = db.driver as MemoryDatabaseDriver;
        const records = Array.from(mem.getTable('idempotency_records').values()) as IdempotencyRecord[];
        existingRecord = records.find(
          (r) => r.organization_id === organization_id && r.idempotency_key === idempotency_key
        ) || null;
      }

      if (existingRecord && existingRecord.status === 'COMPLETED') {
        return {
          status: 'SUCCESS',
          output: {
            ...existingRecord.response_data,
            _idempotent_replay: true,
          },
        };
      }
    }

    // 2. Authorization Check (Agent & Permissions)
    if (agent_id) {
      const agent = await agentService.getAgent(agent_id);
      if (!agent) {
        await auditService.log({
          organization_id,
          event_type: 'tool.denied',
          actor_type: 'SYSTEM',
          actor_id: 'tool_executor',
          target_type: 'tool',
          target_id: capability,
          payload: { reason: `Agent [${agent_id}] not found. Execution denied.` },
        });
        return { status: 'ERROR', output: { error: `Agent ${agent_id} not found. Access denied.` } };
      }

      if (agent.organization_id !== organization_id) {
        await auditService.log({
          organization_id,
          event_type: 'tool.denied',
          actor_type: 'AGENT',
          actor_id: agent.id,
          target_type: 'tool',
          target_id: capability,
          payload: { reason: 'Cross-organization agent access strictly denied.' },
        });
        return { status: 'ERROR', output: { error: 'Cross-tenant agent access denied.' } };
      }

      // Check restricted tools on agent
      if (agent.approval_limits?.restricted_tools?.includes(capability)) {
        await auditService.log({
          organization_id,
          event_type: 'tool.denied',
          actor_type: 'AGENT',
          actor_id: agent.id,
          target_type: 'tool',
          target_id: capability,
          payload: { reason: `Capability ${capability} is in agent restricted_tools list.` },
        });
        return { status: 'ERROR', output: { error: `Permission Denied: Agent cannot execute restricted tool ${capability}` } };
      }
    }

    // 3. Resolve Tool
    let tool: Tool | null = null;
    if (params.tool_id) {
      if (db.isPostgres) {
        const res = await db.driver.query<Tool>(`SELECT * FROM aios.tools WHERE id = $1 AND organization_id = $2`, [
          params.tool_id,
          organization_id,
        ]);
        tool = res.rows[0] || null;
      } else {
        const mem = db.driver as MemoryDatabaseDriver;
        tool = mem.getTable('tools').get(params.tool_id) || null;
      }
    }

    if (!tool) {
      // Default tool reference based on capability prefix
      const isN8n = capability.toLowerCase().startsWith('n8n.');
      tool = {
        id: crypto.randomUUID(),
        organization_id,
        name: params.tool_name || (isN8n ? 'n8n Workflow Gateway' : 'Standard Enterprise Tool Gateway'),
        type: isN8n ? 'HTTP_API' : 'ERP',
        provider: isN8n ? 'n8n' : 'internal',
        capabilities: [capability],
        status: 'CONNECTED',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    // 4. Log tool.called
    await auditService.log({
      organization_id,
      event_type: 'tool.called',
      actor_type: agent_id ? 'AGENT' : 'SYSTEM',
      actor_id: agent_id || 'system:tool_executor',
      target_type: 'tool',
      target_id: tool.name,
      payload: {
        capability,
        tool_type: tool.type,
        input,
      },
    });

    // 5. Select Adapter & Execute
    const adapter = this.adapters.get(tool.type) || this.adapters.get('INTERNAL')!;
    const execution = await adapter.execute({
      tool,
      capability,
      input,
      organization_id,
    });

    // 6. Record Idempotency Result
    if (idempotency_key) {
      const record: IdempotencyRecord = {
        id: crypto.randomUUID(),
        organization_id,
        idempotency_key,
        operation_type: 'tool_execution',
        operation_id: tool.id,
        status: execution.status === 'SUCCESS' ? 'COMPLETED' : 'FAILED',
        response_data: execution.output,
        created_at: new Date().toISOString(),
      };

      if (db.isPostgres) {
        await db.driver.query(
          `INSERT INTO aios.idempotency_records (id, organization_id, idempotency_key, operation_type, operation_id, status, response_data, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (organization_id, idempotency_key) DO UPDATE SET status = EXCLUDED.status, response_data = EXCLUDED.response_data`,
          [record.id, record.organization_id, record.idempotency_key, record.operation_type, record.operation_id, record.status, JSON.stringify(record.response_data), record.created_at]
        );
      } else {
        const mem = db.driver as MemoryDatabaseDriver;
        mem.getTable('idempotency_records').set(record.id, record);
      }
    }

    // 7. Audit Logging
    await auditService.log({
      organization_id,
      event_type: execution.status === 'SUCCESS' ? 'tool.executed' : 'tool.failed',
      actor_type: agent_id ? 'AGENT' : 'SYSTEM',
      actor_id: agent_id || 'system:tool_executor',
      target_type: 'tool',
      target_id: tool.name,
      payload: {
        capability,
        status: execution.status,
        duration_ms: execution.duration_ms,
      },
    });

    return execution;
  }
}

export const toolExecutor = ToolExecutor.getInstance();
