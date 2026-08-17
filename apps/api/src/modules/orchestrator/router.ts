import { Agent } from '../../types/index.js';
import { agentService } from '../agents/agent.service.js';
import { auditService } from '../audit/audit.service.js';

export interface RouteResolution {
  agent: Agent;
  domain: string;
  is_deterministic: boolean;
  reason: string;
}

export class DeterministicRouter {
  private static instance: DeterministicRouter;

  public static getInstance(): DeterministicRouter {
    if (!DeterministicRouter.instance) {
      DeterministicRouter.instance = new DeterministicRouter();
    }
    return DeterministicRouter.instance;
  }

  // Pre-configured deterministic routing rules mapping process keys to roles
  private static staticMappings: Record<string, string> = {
    invoice_validation: 'Finance Agent',
    process_invoice: 'Finance Agent',
    expense_approval: 'Finance Agent',
    lead_qualification: 'Sales Agent',
    crm_enrichment: 'Sales Agent',
    customer_support: 'Support Agent',
    ticket_resolution: 'Support Agent',
    security_audit: 'Security Agent',
    compliance_check: 'Compliance Agent',
  };

  /**
   * Resolves the agent to execute a task:
   * 1. Deterministic Router first
   * 2. Orchestrator Agent fallback
   */
  public async routeTask(params: {
    organization_id: string;
    taskName: string;
    payload: Record<string, any>;
  }): Promise<RouteResolution> {
    const normalizedTask = params.taskName.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const matchedRole = DeterministicRouter.staticMappings[normalizedTask];

    if (matchedRole) {
      const agent = await agentService.getAgentByRole(params.organization_id, matchedRole);
      if (agent) {
        await auditService.log({
          organization_id: params.organization_id,
          event_type: 'agent.selected',
          actor_type: 'SYSTEM',
          actor_id: 'system:deterministic_router',
          target_type: 'agent',
          target_id: agent.id,
          payload: {
            task: params.taskName,
            domain: matchedRole,
            method: 'DETERMINISTIC_ROUTING',
          },
        });

        return {
          agent,
          domain: matchedRole,
          is_deterministic: true,
          reason: `Matched deterministic rule for [${normalizedTask}] -> [${matchedRole}]`,
        };
      }
    }

    // Fallback: Resolve Orchestrator Agent
    let orchestrator = await agentService.getAgentByRole(params.organization_id, 'Orchestrator Agent');
    if (!orchestrator) {
      // If no explicit Orchestrator Agent, pick first active agent or create virtual reference
      const allAgents = await agentService.listAgents(params.organization_id);
      orchestrator = allAgents.find((a) => a.role.toLowerCase().includes('orchestrator')) || allAgents[0];
    }

    if (!orchestrator) {
      throw new Error(`No available agent found in organization ${params.organization_id} to handle task ${params.taskName}`);
    }

    await auditService.log({
      organization_id: params.organization_id,
      event_type: 'agent.selected',
      actor_type: 'AGENT',
      actor_id: orchestrator.id,
      target_type: 'agent',
      target_id: orchestrator.id,
      payload: {
        task: params.taskName,
        domain: 'ORCHESTRATION',
        method: 'ORCHESTRATOR_DELEGATION',
      },
    });

    return {
      agent: orchestrator,
      domain: 'GENERAL',
      is_deterministic: false,
      reason: `Delegated to Orchestrator Agent for dynamic resolution of [${params.taskName}]`,
    };
  }
}

export const deterministicRouter = DeterministicRouter.getInstance();
