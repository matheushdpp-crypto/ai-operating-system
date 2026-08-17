import crypto from 'crypto';
import { User, Organization, UserRole } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';

export class AuthService {
  private static instance: AuthService;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password + '_aios_salt').digest('hex');
  }

  public verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  async createOrganization(params: {
    name: string;
    slug?: string;
    industry?: string;
    timezone?: string;
    language?: string;
  }): Promise<Organization> {
    const id = crypto.randomUUID();
    const slug = params.slug || params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const org: Organization = {
      id,
      name: params.name,
      slug,
      industry: params.industry || 'Technology',
      timezone: params.timezone || 'America/Sao_Paulo',
      language: params.language || 'pt-BR',
      settings: {},
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.organizations (id, name, slug, industry, timezone, language, settings, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at`,
        [org.id, org.name, org.slug, org.industry, org.timezone, org.language, JSON.stringify(org.settings), org.is_active, org.created_at, org.updated_at]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('organizations').set(id, org);
    }

    return org;
  }

  async getOrganization(id: string): Promise<Organization | null> {
    if (db.isPostgres) {
      const res = await db.driver.query<Organization>(`SELECT * FROM aios.organizations WHERE id = $1`, [id]);
      return res.rows[0] || null;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      return mem.getTable('organizations').get(id) || null;
    }
  }

  async listOrganizations(): Promise<Organization[]> {
    if (db.isPostgres) {
      const res = await db.driver.query<Organization>(`SELECT * FROM aios.organizations ORDER BY created_at ASC`);
      return res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      return Array.from(mem.getTable('organizations').values());
    }
  }

  async createUser(params: {
    organization_id: string;
    name: string;
    email: string;
    password: string;
    role?: UserRole;
  }): Promise<User> {
    const id = crypto.randomUUID();
    const user: User = {
      id,
      organization_id: params.organization_id,
      name: params.name,
      email: params.email.toLowerCase(),
      password_hash: this.hashPassword(params.password),
      role: params.role || 'OPERATOR',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.users (id, organization_id, name, email, password_hash, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (organization_id, email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
        [user.id, user.organization_id, user.name, user.email, user.password_hash, user.role, user.is_active, user.created_at, user.updated_at]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('users').set(id, user);
    }

    const { password_hash, ...safeUser } = user;
    return safeUser as User;
  }

  async authenticate(email: string, password: string): Promise<User | null> {
    let user: User | null = null;
    if (db.isPostgres) {
      const res = await db.driver.query<User>(`SELECT * FROM aios.users WHERE email = $1 AND is_active = true`, [email.toLowerCase()]);
      user = res.rows[0] || null;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      const allUsers = Array.from(mem.getTable('users').values()) as User[];
      user = allUsers.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.is_active) || null;
    }

    if (!user || !user.password_hash) return null;
    if (this.verifyPassword(password, user.password_hash)) {
      const { password_hash, ...safeUser } = user;
      return safeUser as User;
    }

    return null;
  }
}

export const authService = AuthService.getInstance();
