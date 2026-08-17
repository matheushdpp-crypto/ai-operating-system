import crypto from 'crypto';
import { MemoryEntry, MemoryType } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';

export class MemoryService {
  private static instance: MemoryService;

  public static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService();
    }
    return MemoryService.instance;
  }

  async saveMemory(params: {
    organization_id: string;
    scope: string;
    content: string;
    type?: MemoryType;
    importance?: number;
    entity_id?: string;
    agent_id?: string;
    source?: string;
    metadata?: Record<string, any>;
  }): Promise<MemoryEntry> {
    const id = crypto.randomUUID();
    const entry: MemoryEntry = {
      id,
      organization_id: params.organization_id,
      scope: params.scope,
      content: params.content,
      type: params.type || 'EPISODIC',
      importance: params.importance !== undefined ? params.importance : 0.5,
      entity_id: params.entity_id,
      agent_id: params.agent_id,
      source: params.source,
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.memories (id, organization_id, scope, entity_id, agent_id, content, type, importance, source, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          entry.id,
          entry.organization_id,
          entry.scope,
          entry.entity_id,
          entry.agent_id,
          entry.content,
          entry.type,
          entry.importance,
          entry.source,
          JSON.stringify(entry.metadata),
          entry.created_at,
          entry.updated_at,
        ]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('memories').set(id, entry);
    }

    return entry;
  }

  async getMemories(organization_id: string, scope?: string, entity_id?: string): Promise<MemoryEntry[]> {
    if (db.isPostgres) {
      let query = `SELECT * FROM aios.memories WHERE organization_id = $1`;
      const params: any[] = [organization_id];
      if (scope) {
        params.push(scope);
        query += ` AND scope = $${params.length}`;
      }
      if (entity_id) {
        params.push(entity_id);
        query += ` AND entity_id = $${params.length}`;
      }
      query += ` ORDER BY importance DESC, created_at DESC LIMIT 50`;
      const res = await db.driver.query<MemoryEntry>(query, params);
      return res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      return (Array.from(mem.getTable('memories').values()) as MemoryEntry[])
        .filter(
          (m) =>
            m.organization_id === organization_id &&
            (!scope || m.scope === scope) &&
            (!entity_id || m.entity_id === entity_id)
        )
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 50);
    }
  }
}

export const memoryService = MemoryService.getInstance();
