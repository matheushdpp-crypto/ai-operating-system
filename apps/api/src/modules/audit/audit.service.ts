import crypto from 'crypto';
import { AuditLog, ActorType } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';

export class AuditService {
  private static instance: AuditService;

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Sanitizes payload to remove sensitive tokens and passwords
   */
  private sanitizePayload(payload: Record<string, any>): Record<string, any> {
    const sensitiveKeys = ['password', 'secret', 'token', 'apikey', 'key', 'authorization', 'bearer'];
    const sanitized: Record<string, any> = {};

    for (const [k, v] of Object.entries(payload)) {
      const lower = k.toLowerCase();
      if (sensitiveKeys.some((s) => lower.includes(s))) {
        sanitized[k] = '[REDACTED]';
      } else if (typeof v === 'object' && v !== null) {
        sanitized[k] = Array.isArray(v) ? v : this.sanitizePayload(v);
      } else {
        sanitized[k] = v;
      }
    }

    return sanitized;
  }

  async log(params: {
    organization_id: string;
    event_type: string;
    actor_type: ActorType;
    actor_id: string;
    target_type?: string;
    target_id?: string;
    payload?: Record<string, any>;
    ip_address?: string;
  }): Promise<AuditLog> {
    const id = crypto.randomUUID();
    const entry: AuditLog = {
      id,
      organization_id: params.organization_id,
      event_type: params.event_type,
      actor_type: params.actor_type,
      actor_id: params.actor_id,
      target_type: params.target_type,
      target_id: params.target_id,
      payload: this.sanitizePayload(params.payload || {}),
      ip_address: params.ip_address,
      created_at: new Date().toISOString(),
    };

    if (db.isPostgres) {
      try {
        await db.driver.query(
          `INSERT INTO aios.audit_logs (id, organization_id, event_type, actor_type, actor_id, target_type, target_id, payload, ip_address, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            entry.id,
            entry.organization_id,
            entry.event_type,
            entry.actor_type,
            entry.actor_id,
            entry.target_type,
            entry.target_id,
            JSON.stringify(entry.payload),
            entry.ip_address,
            entry.created_at,
          ]
        );
      } catch (err: any) {
        console.error('[AuditService] Failed to write audit log to PostgreSQL:', err.message);
      }
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('audit_logs').set(entry.id, entry);
    }

    return entry;
  }

  async list(organization_id: string, limit: number = 100, event_type?: string): Promise<AuditLog[]> {
    if (db.isPostgres) {
      const query = event_type
        ? `SELECT * FROM aios.audit_logs WHERE organization_id = $1 AND event_type = $2 ORDER BY created_at DESC LIMIT $3`
        : `SELECT * FROM aios.audit_logs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`;
      const params = event_type ? [organization_id, event_type, limit] : [organization_id, limit];
      const res = await db.driver.query<AuditLog>(query, params);
      return res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      const logs = Array.from(mem.getTable('audit_logs').values())
        .filter((l: AuditLog) => l.organization_id === organization_id && (!event_type || l.event_type === event_type))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);
      return logs;
    }
  }
}

export const auditService = AuditService.getInstance();
