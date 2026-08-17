import { authService } from '../auth/auth.service.js';
import { agentService } from '../agents/agent.service.js';
import { skillService } from '../skills/skill.service.js';
import { policyEngine } from '../policies/policy.engine.js';
import { toolService } from '../tools/tool.service.js';
import { workflowEngine } from '../workflows/workflow.engine.js';
import { knowledgeService } from '../knowledge/knowledge.service.js';

export class SetupService {
  private static instance: SetupService;

  public static getInstance(): SetupService {
    if (!SetupService.instance) {
      SetupService.instance = new SetupService();
    }
    return SetupService.instance;
  }

  async isSetupComplete(): Promise<boolean> {
    const orgs = await authService.listOrganizations();
    return orgs.length > 0;
  }

  async runSetupWizard(params: {
    company: {
      name: string;
      slug?: string;
      industry?: string;
      timezone?: string;
      language?: string;
    };
    admin: {
      name: string;
      email: string;
      password: string;
    };
    aiProvider?: {
      provider: string;
      model?: string;
      apiKey?: string;
    };
  }): Promise<{
    organization: any;
    adminUser: any;
    orchestratorAgent: any;
    demoWorkflow: any;
    policy: any;
    status: string;
    message: string;
  }> {
    // 1. Create Organization
    const organization = await authService.createOrganization(params.company);

    // 2. Create Admin User
    const adminUser = await authService.createUser({
      organization_id: organization.id,
      name: params.admin.name,
      email: params.admin.email,
      password: params.admin.password,
      role: 'ADMIN',
    });

    // 3. Register Generic Core Skills
    const executeActionSkill = await skillService.registerSkill({
      organization_id: organization.id,
      name: 'Execute Authorized Action',
      slug: 'execute-action',
      version: '1.0.0',
      description: 'Executes validated enterprise operational actions with policy limits and audit trail.',
      purpose: 'Ensure every operational action adheres strictly to corporate policy thresholds.',
      when_to_use: 'When an incoming task or workflow requires executing a controlled side effect.',
      instructions: `1. Inspect task payload and parameters.
2. Validate threshold limits and permissions.
3. If value exceeds authorized limits (> 1000), require human escalation.
4. If approved, propose structured action for execution.`,
      inputs_schema: {
        action: 'string',
        value: 'number',
        target: 'string',
        description: 'string',
      },
      outputs_schema: {
        status: 'VALIDATED | PENDING_APPROVAL',
        action_proposed: 'object',
      },
      required_tools: ['HTTP_API', 'Internal'],
      required_knowledge: ['Standard Operating Procedures'],
      is_shared: true,
    });

    const notifyStakeholderSkill = await skillService.registerSkill({
      organization_id: organization.id,
      name: 'Notify Stakeholder',
      slug: 'notify-stakeholder',
      version: '1.0.0',
      description: 'Dispatches high-priority notifications across configured communication channels.',
      instructions: 'Format clean alert notification and dispatch to designated recipient.',
      inputs_schema: { recipient: 'string', message: 'string' },
      outputs_schema: { sent: 'boolean' },
      required_tools: ['MESSAGING'],
      required_knowledge: [],
      is_shared: true,
    });

    // 4. Create Orchestrator Agent
    const orchestratorAgent = await agentService.createAgent(
      {
        organization_id: organization.id,
        name: 'AiOS Orchestrator',
        role: 'Orchestrator Agent',
        job_description:
          'Central intelligent coordinator responsible for identifying tasks, evaluating skills, routing to specialized agents, and managing workflow states.',
        runtime: 'native',
        runtime_config: {},
        status: 'ACTIVE',
        permissions: ['*'],
        approval_limits: {
          max_auto_approval_value: 1000,
        },
        knowledge_scopes: ['all'],
      },
      ['execute-action', 'notify-stakeholder']
    );

    // 5. Create Generic Deterministic Policy
    const policy = await policyEngine.createPolicy({
      organization_id: organization.id,
      name: 'Standard Operational Threshold Policy',
      description: 'Enforces strict organizational action limits and mandatory human authorization when value > 1000.',
      scope: 'general',
      is_active: true,
      rules: [
        {
          id: 'rule_high_value_action',
          name: 'High Value Action Threshold',
          condition: {
            field: 'value',
            operator: 'gt',
            value: 1000,
          },
          decision: 'HUMAN_REQUIRED',
          reason: 'Action value exceeds automatic execution threshold of 1000. Requires manual human review and approval.',
          suggested_approver_role: 'ADMIN',
        },
        {
          id: 'rule_high_amount_action',
          name: 'High Amount Action Threshold',
          condition: {
            field: 'amount',
            operator: 'gt',
            value: 10000,
          },
          decision: 'HUMAN_REQUIRED',
          reason: 'Amount exceeds automatic threshold of 10,000. Requires manual human review and approval.',
          suggested_approver_role: 'ADMIN',
        },
        {
          id: 'rule_restricted_raw_export',
          name: 'Restricted Raw Data Export',
          condition: {
            field: 'action',
            operator: 'eq',
            value: 'restricted_raw_export',
          },
          decision: 'DENY',
          reason: 'Direct raw data export is restricted by corporate security policy.',
          suggested_approver_role: 'ADMIN',
        },
      ],
    });

    // 6. Register Default Tools
    await toolService.registerTool({
      organization_id: organization.id,
      name: 'Enterprise HTTP Gateway',
      type: 'HTTP_API',
      provider: 'generic-http-adapter',
      capabilities: ['http.request', 'api.dispatch', 'action.execute'],
      status: 'CONNECTED',
      metadata: {},
    });

    await toolService.registerTool({
      organization_id: organization.id,
      name: 'Enterprise Notification Gateway',
      type: 'MESSAGING',
      provider: 'internal-notification-gateway',
      capabilities: ['messaging.send_alert', 'messaging.request_approval'],
      status: 'CONNECTED',
      metadata: {},
    });

    // 7. Ingest Baseline Knowledge
    const source = await knowledgeService.createSource({
      organization_id: organization.id,
      name: 'Standard Operating Procedures & Operational Policies',
      type: 'SOP',
      status: 'ACTIVE',
      metadata: { version: '2026.1' },
    });

    await knowledgeService.ingestDocument({
      source_id: source.id,
      title: 'SOP-OPS-001: Operational Action Thresholds and Approval Guidelines',
      content: `Standard Operating Procedure for Operational Execution.
1. Standard operational requests with value <= 1000 are processed automatically by assigned agents.
2. Any request with value or amount exceeding 1000 MUST pause for Human Operator verification and approval.
3. Restricted data exports or unverified third-party integrations are strictly prohibited without administrative waiver.`,
    });

    // 8. Create Universal Generic Demo Workflow
    const demoWorkflow = await workflowEngine.createWorkflow({
      organization_id: organization.id,
      name: 'Universal Action Requiring Approval Pipeline',
      slug: 'action-approval-pipeline',
      description: 'Universal 12-stage enterprise pipeline demonstrating deterministic routing, skill composition, pgvector knowledge lookup, policy check, durable pause/resume, and human approval.',
      trigger_type: 'WEBHOOK',
      trigger_config: { endpoint: '/api/v1/workflows/action-approval-pipeline/trigger' },
      steps_config: [
        { name: 'Trigger Ingestion', stage: 'TRIGGER' },
        { name: 'Task Identification', stage: 'IDENTIFY' },
        { name: 'Context & Memory Hydration', stage: 'LOAD_CONTEXT' },
        { name: 'Agent Selection', stage: 'SELECT_AGENT' },
        { name: 'Skill Assembly', stage: 'LOAD_SKILLS' },
        { name: 'Knowledge Retrieval', stage: 'LOAD_KNOWLEDGE' },
        { name: 'Agent Runtime Execution', stage: 'EXECUTE_AGENT' },
        { name: 'Deterministic Policy Evaluation', stage: 'CHECK_POLICY' },
        { name: 'Human Approval Gate', stage: 'HUMAN_APPROVAL', optional: true },
        { name: 'Tool Side Effects Execution', stage: 'EXECUTE_SIDE_EFFECTS' },
        { name: 'State & Memory Persistence', stage: 'UPDATE_STATE' },
        { name: 'Audit & Complete', stage: 'COMPLETE' },
      ],
      is_active: true,
    });

    return {
      organization,
      adminUser,
      orchestratorAgent,
      demoWorkflow,
      policy,
      status: 'SUCCESS',
      message: 'AI Operating System Ready',
    };
  }
}

export const setupService = SetupService.getInstance();
