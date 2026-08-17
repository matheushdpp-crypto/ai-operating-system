import pg from 'pg';
import { config } from '../config/env.js';

export interface IDatabaseDriver {
  query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
  isHealthy(): Promise<boolean>;
  close(): Promise<void>;
}

class PostgresDriver implements IDatabaseDriver {
  private pool: pg.Pool;

  constructor() {
    this.pool = new pg.Pool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    });

    this.pool.on('error', (err) => {
      console.error('[PostgresDriver] Unexpected pool error:', err.message);
    });
  }

  async query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
    const client = await this.pool.connect();
    try {
      const res = await client.query(text, params);
      return { rows: res.rows as T[], rowCount: res.rowCount || 0 };
    } finally {
      client.release();
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Memory Driver for Zero-Dependency Fast Unit & E2E Testing / Standalone Mode
 */
export class MemoryDatabaseDriver implements IDatabaseDriver {
  private tables: Map<string, Map<string, any>> = new Map();

  constructor() {
    this.initTables();
  }

  private initTables() {
    const tableNames = [
      'organizations',
      'users',
      'agents',
      'skills',
      'agent_skills',
      'tools',
      'policies',
      'knowledge_sources',
      'documents',
      'document_chunks',
      'memories',
      'workflows',
      'workflow_runs',
      'workflow_steps',
      'workflow_events',
      'idempotency_records',
      'approvals',
      'audit_logs',
    ];
    for (const name of tableNames) {
      this.tables.set(name, new Map());
    }
  }

  getTable(name: string): Map<string, any> {
    const key = name.replace('aios.', '').toLowerCase();
    if (!this.tables.has(key)) {
      this.tables.set(key, new Map());
    }
    return this.tables.get(key)!;
  }

  async query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
    // Mock query handler for memory driver
    return { rows: [] as T[], rowCount: 0 };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.tables.clear();
  }
}

export class DatabaseService {
  private static instance: DatabaseService;
  public driver: IDatabaseDriver;
  public isPostgres: boolean = false;

  private constructor() {
    // Default to Memory Driver for testing/standalone, allow auto-upgrade to Postgres
    this.driver = new MemoryDatabaseDriver();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async init() {
    try {
      const pgDriver = new PostgresDriver();
      const healthy = await pgDriver.isHealthy();
      if (healthy) {
        this.driver = pgDriver;
        this.isPostgres = true;
        console.log('[DatabaseService] Connected successfully to PostgreSQL (with pgvector).');
      } else {
        if (config.platform.nodeEnv === 'production') {
          throw new Error('PostgreSQL is not reachable. In production (NODE_ENV=production), in-memory fallback is disallowed. FAIL FAST.');
        }
        console.log('[DatabaseService] PostgreSQL not reachable at configured host. Running with In-Memory Repository.');
        await pgDriver.close();
      }
    } catch (err: any) {
      if (config.platform.nodeEnv === 'production') {
        console.error('❌ [DatabaseService] Critical production error:', err.message);
        throw err;
      }
      console.log('[DatabaseService] Using In-Memory Repository driver.');
    }
  }
}

export const db = DatabaseService.getInstance();
