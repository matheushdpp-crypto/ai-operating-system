import crypto from 'crypto';
import { Agent, Skill } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';
import { skillService } from '../skills/skill.service.js';

export class AgentService {
  private static instance: AgentService;

  public static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  async createAgent(agent: Omit<Agent, 'id' | 'created_at' | 'updated_at'>, skillSlugs: string[] = []): Promise<Agent> {
    const id = crypto.randomUUID();
    const newAgent: Agent = {
      id,
      organization_id: agent.organization_id,
      name: agent.name,
      role: agent.role,
      job_description: agent.job_description,
      runtime: agent.runtime || 'native',
      runtime_config: agent.runtime_config || {},
      status: agent.status || 'ACTIVE',
      permissions: agent.permissions || [],
      approval_limits: agent.approval_limits || {},
      knowledge_scopes: agent.knowledge_scopes || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.agents (id, organization_id, name, role, job_description, runtime, runtime_config, status, permissions, approval_limits, knowledge_scopes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          newAgent.id,
          newAgent.organization_id,
          newAgent.name,
          newAgent.role,
          newAgent.job_description,
          newAgent.runtime,
          JSON.stringify(newAgent.runtime_config),
          newAgent.status,
          JSON.stringify(newAgent.permissions),
          JSON.stringify(newAgent.approval_limits),
          JSON.stringify(newAgent.knowledge_scopes),
          newAgent.created_at,
          newAgent.updated_at,
        ]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('agents').set(id, newAgent);
    }

    // Attach skills
    for (const slug of skillSlugs) {
      const skill = await skillService.getSkillBySlug(agent.organization_id, slug);
      if (skill) {
        await this.grantSkill(newAgent.id, skill.id);
      }
    }

    return newAgent;
  }

  async getAgent(id: string): Promise<Agent | null> {
    let agent: Agent | null = null;
    if (db.isPostgres) {
      const res = await db.driver.query<Agent>(`SELECT * FROM aios.agents WHERE id = $1`, [id]);
      agent = res.rows[0] || null;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      agent = mem.getTable('agents').get(id) || null;
    }

    if (agent) {
      agent.skills = await this.getAgentSkills(agent.id, agent.organization_id);
    }
    return agent;
  }

  async getAgentByRole(organization_id: string, role: string): Promise<Agent | null> {
    let agent: Agent | null = null;
    if (db.isPostgres) {
      const res = await db.driver.query<Agent>(
        `SELECT * FROM aios.agents WHERE organization_id = $1 AND (role ILIKE $2 OR name ILIKE $2) AND status = 'ACTIVE' LIMIT 1`,
        [organization_id, role]
      );
      agent = res.rows[0] || null;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      const agents = Array.from(mem.getTable('agents').values()) as Agent[];
      agent = agents.find(
        (a) => a.organization_id === organization_id && (a.role.toLowerCase() === role.toLowerCase() || a.name.toLowerCase() === role.toLowerCase()) && a.status === 'ACTIVE'
      ) || null;
    }

    if (agent) {
      agent.skills = await this.getAgentSkills(agent.id, agent.organization_id);
    }
    return agent;
  }

  async listAgents(organization_id: string): Promise<Agent[]> {
    let agents: Agent[] = [];
    if (db.isPostgres) {
      const res = await db.driver.query<Agent>(
        `SELECT * FROM aios.agents WHERE organization_id = $1 ORDER BY name ASC`,
        [organization_id]
      );
      agents = res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      agents = (Array.from(mem.getTable('agents').values()) as Agent[]).filter(
        (a) => a.organization_id === organization_id
      );
    }

    for (const a of agents) {
      a.skills = await this.getAgentSkills(a.id, a.organization_id);
    }
    return agents;
  }

  async grantSkill(agent_id: string, skill_id: string): Promise<void> {
    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.agent_skills (agent_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [agent_id, skill_id]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      const key = `${agent_id}:${skill_id}`;
      mem.getTable('agent_skills').set(key, { agent_id, skill_id });
    }
  }

  async getAgentSkills(agent_id: string, organization_id: string): Promise<Skill[]> {
    if (db.isPostgres) {
      const res = await db.driver.query<Skill>(
        `SELECT s.* FROM aios.skills s
         JOIN aios.agent_skills ask ON s.id = ask.skill_id
         WHERE ask.agent_id = $1`,
        [agent_id]
      );
      return res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      const relations = Array.from(mem.getTable('agent_skills').values()).filter((r) => r.agent_id === agent_id);
      const skillsTable = mem.getTable('skills');
      return relations
        .map((r) => skillsTable.get(r.skill_id))
        .filter((s): s is Skill => Boolean(s));
    }
  }
}

export const agentService = AgentService.getInstance();
