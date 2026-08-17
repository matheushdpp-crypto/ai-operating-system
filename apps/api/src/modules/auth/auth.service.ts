import crypto from 'crypto';
import { User, Organization, UserRole } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';
import { config } from '../../config/env.js';

export interface TokenPayload {
  userId: string;
  organizationId: string;
  role: UserRole;
  email: string;
  exp: number;
}

export class AuthService {
  private static instance: AuthService;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public hashPassword(password: string): string {
    const salt = config.auth.jwtSecret.slice(0, 16);
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  }

  public verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  /**
   * Generates HMAC SHA-256 Signed JWT Token
   */
  public generateToken(user: User): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const expiresInMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const payload: TokenPayload = {
      userId: user.id,
      organizationId: user.organization_id,
      role: user.role,
      email: user.email,
      exp: Date.now() + expiresInMs,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', config.auth.jwtSecret)
      .update(`${header}.${encodedPayload}`)
      .digest('base64url');

    return `${header}.${encodedPayload}.${signature}`;
  }

  /**
   * Verifies JWT Token and returns payload
   */
  public verifyToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, payload, signature] = parts;

      const expectedSignature = crypto
        .createHmac('sha256', config.auth.jwtSecret)
        .update(`${header}.${payload}`)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return null;
      }

      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as TokenPayload;
      if (decoded.exp && Date.now() > decoded.exp) {
        return null; // Expired
      }

      return decoded;
    } catch {
      return null;
    }
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
      const res = await db.driver.query<User>(`SELECT * FROM aios.users WHERE email = $1 AND is_active = true`, [
        email.toLowerCase(),
      ]);
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
