import crypto from 'crypto';
import { Tool, ToolType } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';
import { toolExecutor } from './tool.executor.js';

export class ToolService {
  private static instance: ToolService;

  public static getInstance(): ToolService {
    if (!ToolService.instance) {
      ToolService.instance = new ToolService();
    }
    return ToolService.instance;
  }

  async registerTool(tool: Omit<Tool, 'id' | 'created_at' | 'updated_at'>): Promise<Tool> {
    const id = crypto.randomUUID();
    const newTool: Tool = {
      id,
      ...tool,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.tools (id, organization_id, name, type, provider, credentials_ref, capabilities, status, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          newTool.id,
          newTool.organization_id,
          newTool.name,
          newTool.type,
          newTool.provider,
          newTool.credentials_ref,
          JSON.stringify(newTool.capabilities),
          newTool.status,
          JSON.stringify(newTool.metadata),
          newTool.created_at,
          newTool.updated_at,
        ]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('tools').set(id, newTool);
    }

    return newTool;
  }

  async getTool(organization_id: string, id: string): Promise<Tool | null> {
    if (db.isPostgres) {
      const res = await db.driver.query<Tool>(`SELECT * FROM aios.tools WHERE id = $1 AND organization_id = $2`, [
        id,
        organization_id,
      ]);
      return res.rows[0] || null;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      const t = mem.getTable('tools').get(id) as Tool | undefined;
      return t && t.organization_id === organization_id ? t : null;
    }
  }

  async listTools(organization_id: string, type?: ToolType): Promise<Tool[]> {
    if (db.isPostgres) {
      const query = type
        ? `SELECT * FROM aios.tools WHERE organization_id = $1 AND type = $2 ORDER BY name ASC`
        : `SELECT * FROM aios.tools WHERE organization_id = $1 ORDER BY name ASC`;
      const params = type ? [organization_id, type] : [organization_id];
      const res = await db.driver.query<Tool>(query, params);
      return res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      return (Array.from(mem.getTable('tools').values()) as Tool[]).filter(
        (t) => t.organization_id === organization_id && (!type || t.type === type)
      );
    }
  }

  async executeToolAction(params: {
    organization_id: string;
    tool_id?: string;
    tool_name?: string;
    capability: string;
    agent_id?: string;
    input: Record<string, any>;
    idempotency_key?: string;
  }): Promise<{ status: 'SUCCESS' | 'ERROR'; output: any }> {
    return toolExecutor.execute(params);
  }
}

export const toolService = ToolService.getInstance();
