import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Skill } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';
import { SkillParser } from './skill.parser.js';
import { auditService } from '../audit/audit.service.js';

export class SkillService {
  private static instance: SkillService;

  public static getInstance(): SkillService {
    if (!SkillService.instance) {
      SkillService.instance = new SkillService();
    }
    return SkillService.instance;
  }

  async registerSkill(skill: Omit<Skill, 'id' | 'created_at' | 'updated_at'>): Promise<Skill> {
    const id = crypto.randomUUID();
    const newSkill: Skill = {
      id,
      ...skill,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.skills (id, organization_id, name, slug, version, description, purpose, when_to_use, when_not_to_use, instructions, inputs_schema, outputs_schema, required_tools, required_knowledge, file_path, is_shared, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (organization_id, slug) DO UPDATE SET
           name = EXCLUDED.name,
           instructions = EXCLUDED.instructions,
           inputs_schema = EXCLUDED.inputs_schema,
           outputs_schema = EXCLUDED.outputs_schema,
           required_tools = EXCLUDED.required_tools,
           required_knowledge = EXCLUDED.required_knowledge,
           updated_at = EXCLUDED.updated_at`,
        [
          newSkill.id,
          newSkill.organization_id,
          newSkill.name,
          newSkill.slug,
          newSkill.version,
          newSkill.description,
          newSkill.purpose,
          newSkill.when_to_use,
          newSkill.when_not_to_use,
          newSkill.instructions,
          JSON.stringify(newSkill.inputs_schema),
          JSON.stringify(newSkill.outputs_schema),
          JSON.stringify(newSkill.required_tools),
          JSON.stringify(newSkill.required_knowledge),
          newSkill.file_path,
          newSkill.is_shared,
          newSkill.created_at,
          newSkill.updated_at,
        ]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('skills').set(id, newSkill);
    }

    return newSkill;
  }

  async getSkillBySlug(organization_id: string, slug: string): Promise<Skill | null> {
    if (db.isPostgres) {
      const res = await db.driver.query<Skill>(
        `SELECT * FROM aios.skills WHERE (organization_id = $1 OR is_shared = true) AND slug = $2`,
        [organization_id, slug]
      );
      return res.rows[0] || null;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      const skills = Array.from(mem.getTable('skills').values()) as Skill[];
      return skills.find((s) => (s.organization_id === organization_id || s.is_shared) && s.slug === slug) || null;
    }
  }

  async listSkills(organization_id: string): Promise<Skill[]> {
    if (db.isPostgres) {
      const res = await db.driver.query<Skill>(
        `SELECT * FROM aios.skills WHERE organization_id = $1 OR is_shared = true ORDER BY name ASC`,
        [organization_id]
      );
      return res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      return (Array.from(mem.getTable('skills').values()) as Skill[]).filter(
        (s) => s.organization_id === organization_id || s.is_shared
      );
    }
  }

  /**
   * Scans a directory for SKILL.md files and registers them into the database
   */
  async loadSkillsFromDirectory(dirPath: string, organization_id: string, is_shared: boolean = false): Promise<Skill[]> {
    const loaded: Skill[] = [];
    if (!fs.existsSync(dirPath)) return loaded;

    const scan = (currentDir: string) => {
      const files = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const f of files) {
        const fullPath = path.join(currentDir, f.name);
        if (f.isDirectory()) {
          scan(fullPath);
        } else if (f.name.toLowerCase() === 'skill.md' || f.name.endsWith('.skill.md')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const parsed = SkillParser.parse(content, fullPath);
          const skill: Omit<Skill, 'id' | 'created_at' | 'updated_at'> = {
            organization_id,
            name: parsed.name,
            slug: parsed.slug,
            version: parsed.version || '1.0.0',
            description: parsed.description,
            purpose: parsed.purpose,
            when_to_use: parsed.when_to_use,
            when_not_to_use: parsed.when_not_to_use,
            instructions: parsed.instructions,
            inputs_schema: parsed.inputs_schema || {},
            outputs_schema: parsed.outputs_schema || {},
            required_tools: parsed.required_tools || [],
            required_knowledge: parsed.required_knowledge || [],
            file_path: fullPath,
            is_shared,
          };
          loaded.push(skill as any);
        }
      }
    };

    scan(dirPath);

    const saved: Skill[] = [];
    for (const item of loaded) {
      const res = await this.registerSkill(item);
      saved.push(res);
    }

    return saved;
  }
}

export const skillService = SkillService.getInstance();
