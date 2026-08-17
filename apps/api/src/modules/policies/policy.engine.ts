import crypto from 'crypto';
import { Policy, PolicyRule, PolicyEvaluationResult, PolicyDecisionResult } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';
import { auditService } from '../audit/audit.service.js';

export class PolicyEngine {
  private static instance: PolicyEngine;

  public static getInstance(): PolicyEngine {
    if (!PolicyEngine.instance) {
      PolicyEngine.instance = new PolicyEngine();
    }
    return PolicyEngine.instance;
  }

  /**
   * Resolves nested property path e.g. "params.value" or "user.role" or "agent.name"
   */
  private resolveValue(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Evaluates a single rule condition deterministically
   */
  public evaluateCondition(condition: PolicyRule['condition'], context: Record<string, any>): boolean {
    const actualValue = this.resolveValue(context, condition.field);
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'eq':
        return actualValue === targetValue;
      case 'neq':
        return actualValue !== targetValue;
      case 'gt':
        return typeof actualValue === 'number' && actualValue > targetValue;
      case 'gte':
        return typeof actualValue === 'number' && actualValue >= targetValue;
      case 'lt':
        return typeof actualValue === 'number' && actualValue < targetValue;
      case 'lte':
        return typeof actualValue === 'number' && actualValue <= targetValue;
      case 'in':
        return Array.isArray(targetValue) && targetValue.includes(actualValue);
      case 'not_in':
        return Array.isArray(targetValue) && !targetValue.includes(actualValue);
      case 'contains':
        if (typeof actualValue === 'string') return actualValue.includes(String(targetValue));
        if (Array.isArray(actualValue)) return actualValue.includes(targetValue);
        return false;
      case 'custom':
        return Boolean(actualValue);
      default:
        return false;
    }
  }

  /**
   * Evaluates a proposed action against all active policies matching the scope and organization
   */
  public async evaluate(params: {
    organization_id: string;
    scope?: string;
    action: string;
    context: Record<string, any>;
    agent_id?: string;
  }): Promise<PolicyEvaluationResult> {
    const policies = await this.listPolicies(params.organization_id, params.scope);
    const matchedRules: PolicyRule[] = [];
    const reasons: string[] = [];
    let finalDecision: PolicyDecisionResult = 'ALLOW';
    let suggestedRole: string | undefined = undefined;

    // Check generic agent approval limit conditions if configured on the agent
    const agentLimits = params.context.agent_approval_limits;
    if (agentLimits) {
      if (agentLimits.restricted_tools && Array.isArray(agentLimits.restricted_tools)) {
        if (agentLimits.restricted_tools.includes(params.action)) {
          finalDecision = 'DENY';
          reasons.push(`Action [${params.action}] is explicitly in agent restricted_tools list.`);
        }
      }
      if (typeof agentLimits.max_auto_approval_amount === 'number' && typeof params.context.amount === 'number') {
        if (params.context.amount > agentLimits.max_auto_approval_amount) {
          if (finalDecision !== 'DENY') finalDecision = 'HUMAN_REQUIRED';
          reasons.push(`Amount (${params.context.amount}) exceeds agent threshold (${agentLimits.max_auto_approval_amount})`);
        }
      }
      if (typeof agentLimits.max_auto_approval_value === 'number' && typeof params.context.value === 'number') {
        if (params.context.value > agentLimits.max_auto_approval_value) {
          if (finalDecision !== 'DENY') finalDecision = 'HUMAN_REQUIRED';
          reasons.push(`Value (${params.context.value}) exceeds agent threshold (${agentLimits.max_auto_approval_value})`);
        }
      }
    }

    const evaluationContext = {
      action: params.action,
      agent_id: params.agent_id,
      ...params.context,
    };

    for (const policy of policies) {
      if (!policy.is_active) continue;

      for (const rule of policy.rules) {
        const matches = this.evaluateCondition(rule.condition, evaluationContext);

        if (matches) {
          matchedRules.push(rule);
          reasons.push(rule.reason);
          if (rule.suggested_approver_role) {
            suggestedRole = rule.suggested_approver_role;
          }

          // Priority: DENY > HUMAN_REQUIRED > ALLOW
          if (rule.decision === 'DENY') {
            finalDecision = 'DENY';
          } else if (rule.decision === 'HUMAN_REQUIRED' && finalDecision !== 'DENY') {
            finalDecision = 'HUMAN_REQUIRED';
          }
        }
      }
    }

    const result: PolicyEvaluationResult = {
      decision: finalDecision,
      matched_rules: matchedRules,
      reasons: reasons.length > 0 ? reasons : ['No restricting policies triggered. Action allowed.'],
      requires_approval: finalDecision === 'HUMAN_REQUIRED',
      suggested_approver_role: suggestedRole || 'ADMIN',
    };

    // Log policy check to audit trail
    await auditService.log({
      organization_id: params.organization_id,
      event_type: 'policy.checked',
      actor_type: params.agent_id ? 'AGENT' : 'SYSTEM',
      actor_id: params.agent_id || 'system:policy_engine',
      target_type: 'action',
      target_id: params.action,
      payload: {
        scope: params.scope || 'general',
        decision: result.decision,
        reasons: result.reasons,
        requires_approval: result.requires_approval,
      },
    });

    return result;
  }

  async createPolicy(policy: Omit<Policy, 'id' | 'created_at' | 'updated_at'>): Promise<Policy> {
    const id = crypto.randomUUID();
    const newPolicy: Policy = {
      id,
      ...policy,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.policies (id, organization_id, name, description, scope, rules, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newPolicy.id,
          newPolicy.organization_id,
          newPolicy.name,
          newPolicy.description,
          newPolicy.scope,
          JSON.stringify(newPolicy.rules),
          newPolicy.is_active,
          newPolicy.created_at,
          newPolicy.updated_at,
        ]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('policies').set(id, newPolicy);
    }

    return newPolicy;
  }

  async listPolicies(organization_id: string, scope?: string): Promise<Policy[]> {
    if (db.isPostgres) {
      const query = scope && scope !== 'general' && scope !== '*'
        ? `SELECT * FROM aios.policies WHERE organization_id = $1 AND (scope = $2 OR scope = 'general' OR scope = '*')`
        : `SELECT * FROM aios.policies WHERE organization_id = $1`;
      const params = scope && scope !== 'general' && scope !== '*' ? [organization_id, scope] : [organization_id];
      const res = await db.driver.query<Policy>(query, params);
      return res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      return Array.from(mem.getTable('policies').values()).filter(
        (p: Policy) =>
          p.organization_id === organization_id &&
          (!scope || scope === 'general' || scope === '*' || p.scope === scope || p.scope === 'general' || p.scope === '*')
      );
    }
  }
}

export const policyEngine = PolicyEngine.getInstance();
