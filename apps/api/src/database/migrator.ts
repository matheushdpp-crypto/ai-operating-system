import fs from 'fs';
import path from 'path';
import { db } from './index.js';

export class DatabaseMigrator {
  private static instance: DatabaseMigrator;

  public static getInstance(): DatabaseMigrator {
    if (!DatabaseMigrator.instance) {
      DatabaseMigrator.instance = new DatabaseMigrator();
    }
    return DatabaseMigrator.instance;
  }

  /**
   * Applies all pending SQL migrations in alphabetical order
   */
  async runMigrations(migrationsDir: string = './infrastructure/postgres/migrations'): Promise<string[]> {
    if (!db.isPostgres) {
      return ['[DatabaseMigrator] Skipped (running in-memory driver)'];
    }

    // Ensure migrations table exists
    await db.driver.query(`
      CREATE TABLE IF NOT EXISTS aios.schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const appliedRes = await db.driver.query<{ version: string }>(
      `SELECT version FROM aios.schema_migrations`
    );
    const applied = new Set(appliedRes.rows.map((r) => r.version));

    if (!fs.existsSync(migrationsDir)) {
      return ['[DatabaseMigrator] Migrations directory not found'];
    }

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const executed: string[] = [];

    for (const file of files) {
      if (!applied.has(file)) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        await db.driver.query(sql);
        await db.driver.query(
          `INSERT INTO aios.schema_migrations (version) VALUES ($1)`,
          [file]
        );
        executed.push(file);
      }
    }

    return executed;
  }
}

export const databaseMigrator = DatabaseMigrator.getInstance();
