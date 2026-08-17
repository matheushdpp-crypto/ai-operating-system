import { authService } from '../auth/auth.service.js';
import { agentService } from '../agents/agent.service.js';
import { skillService } from '../skills/skill.service.js';
import { policyEngine } from '../policies/policy.engine.js';
import { toolService } from '../tools/tool.service.js';
import { workflowEngine } from '../workflows/workflow.engine.js';
import { knowledgeService } from '../knowledge/knowledge.service.js';
import { db } from '../../database/index.js';

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
    financeAgent: any;
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

    // 3. Register Core Skills
    const validateInvoiceSkill = await skillService.registerSkill({
      organization_id: organization.id,
      name: 'Validate Invoice',
      slug: 'validate-invoice',
      version: '1.0.0',
      description: 'Validates commercial invoices, amounts, tax identifiers, and vendor terms against policy limits.',
      purpose: 'Ensure every corporate invoice is strictly verified before automated or human payment release.',
      when_to_use: 'When a new invoice document or structured payment request is received.',
      when_not_to_use: 'For simple notifications, non-financial inquiries, or internal calendar invites.',
      instructions: `1. Inspect vendor tax identifier, invoice number, and currency.
2. Cross-reference invoice line items with purchase orders.
3. Validate total amount against automatic approval limits ($10,000.00 max auto limit).
4. If amount > limit, trigger Human-in-the-Loop approval.
5. If valid, format structured approval payload.`,
      inputs_schema: {
        vendor: 'string',
        amount: 'number',
        invoice_number: 'string',
        description: 'string',
      },
      outputs_schema: {
        status: 'VALIDATED | REJECTED',
        action_proposed: 'object',
      },
      required_tools: ['ERP', 'Database'],
      required_knowledge: ['Financial Policy SOP', 'Vendor Whitelist'],
      is_shared: true,
    });

    const notifyStakeholderSkill = await skillService.registerSkill({
      organization_id: organization.id,
      name: 'Notify Stakeholder',
      slug: 'notify-stakeholder',
      version: '1.0.0',
      description: 'Dispatches high-priority notifications across email, messaging, and Control Center.',
      instructions: 'Format clean markdown alert and dispatch via configured communication channel.',
      inputs_schema: { recipient: 'string', message: 'string' },
      outputs_schema: { sent: 'boolean' },
      required_tools: ['Messaging', 'Email'],
      required_knowledge: [],
      is_shared: true,
    });

    // 4. Create Agents
    const orchestratorAgent = await agentService.createAgent(
      {
        organization_id: organization.id,
        name: 'AiOS Orchestrator',
        role: 'Orchestrator Agent',
        job_description:
          'Central intelligent coordinator responsible for identifying unrouted tasks, classifying enterprise domains, delegating to specialized agents, and managing workflow states.',
        runtime: 'native',
        runtime_config: {},
        status: 'ACTIVE',
        permissions: ['*'],
        approval_limits: {},
        knowledge_scopes: ['all'],
      },
      ['notify-stakeholder']
    );

    const financeAgent = await agentService.createAgent(
      {
        organization_id: organization.id,
        name: 'Finance & Compliance Agent',
        role: 'Finance Agent',
        job_description:
          'Handles automated invoice processing, expense verification, ERP reconciliation, and fiscal compliance. Authorized to automatically approve payments up to $10,000.00.',
        runtime: 'native',
        runtime_config: {},
        status: 'ACTIVE',
        permissions: ['finance:read', 'finance:validate', 'erp:query'],
        approval_limits: {
          max_auto_approval_amount: 10000,
          currency: 'BRL',
          require_human_on: ['amount > 10000', 'new_unverified_vendor'],
        },
        knowledge_scopes: ['financial_sop', 'tax_compliance'],
      },
      ['validate-invoice', 'notify-stakeholder']
    );

    // 5. Create Deterministic Policy
    const policy = await policyEngine.createPolicy({
      organization_id: organization.id,
      name: 'Financial Expense & Invoice Policy',
      description: 'Enforces strict organizational spending limits and mandatory human approvals.',
      scope: 'financial',
      is_active: true,
      rules: [
        {
          id: 'rule_high_value_invoice',
          name: 'High Value Invoice Approval Threshold',
          condition: {
            field: 'amount',
            operator: 'gt',
            value: 10000,
          },
          decision: 'HUMAN_REQUIRED',
          reason: 'Invoice amount exceeds automatic agent approval limit of R$ 10.000,00. Requires manual human authorization.',
          suggested_approver_role: 'ADMIN',
        },
        {
          id: 'rule_banned_tool_export',
          name: 'Restricted Financial Export Tool',
          condition: {
            field: 'action',
            operator: 'eq',
            value: 'export_full_ledger',
          },
          decision: 'DENY',
          reason: 'Direct export of complete financial ledger is restricted by corporate security policy.',
          suggested_approver_role: 'ADMIN',
        },
      ],
    });

    // 6. Register Default Tools
    await toolService.registerTool({
      organization_id: organization.id,
      name: 'Corporate ERP Integration',
      type: 'ERP',
      provider: 'SAP / Oracle / TOTVS Adapter',
      capabilities: ['erp.query_invoice', 'erp.create_payment', 'erp.reconcile'],
      status: 'CONNECTED',
      metadata: { mock_mode: true },
    });

    await toolService.registerTool({
      organization_id: organization.id,
      name: 'Enterprise Notification Gateway',
      type: 'MESSAGING',
      provider: 'Slack / WhatsApp / Teams Gateway',
      capabilities: ['messaging.send_alert', 'messaging.request_approval'],
      status: 'CONNECTED',
      metadata: {},
    });

    // 7. Ingest Baseline Knowledge
    const source = await knowledgeService.createSource({
      organization_id: organization.id,
      name: 'Corporate Finance & Procurement Standard Operating Procedures (SOP)',
      type: 'SOP',
      status: 'ACTIVE',
      metadata: { version: '2026.1' },
    });

    await knowledgeService.ingestDocument({
      source_id: source.id,
      title: 'SOP-FIN-001: Invoice Validation and Payment Limits',
      content: `Standard Operating Procedure for Corporate Invoice Validation.
1. All invoices must include valid vendor CNPJ/Tax ID and issue date.
2. Invoices under R$ 10.000,00 can be processed automatically by the Finance Agent if 3-way matching succeeds.
3. Any invoice with total amount exceeding R$ 10.000,00 MUST be held in pending state for Human Operator verification and approval.
4. If an invoice contains irregular tax retention, human review is strictly mandatory.`,
    });

    // 8. Create Universal Demo Workflow
    const demoWorkflow = await workflowEngine.createWorkflow({
      organization_id: organization.id,
      name: 'Universal Enterprise Invoice Processing Pipeline',
      slug: 'universal-invoice-pipeline',
      description: 'Demonstration of the complete 12-stage universal pipeline with automatic policy check and human-in-the-loop escalation.',
      trigger_type: 'WEBHOOK',
      trigger_config: { endpoint: '/api/v1/workflows/trigger/universal-invoice' },
      steps_config: [
        { name: 'Trigger Ingestion', stage: 'TRIGGER' },
        { name: 'Task Identification', stage: 'IDENTIFY' },
        { name: 'Context & Memory Hydration', stage: 'LOAD_CONTEXT' },
        { name: 'Agent Selection', stage: 'SELECT_AGENT' },
        { name: 'Skill Assembly', stage: 'LOAD_SKILLS' },
        { name: 'Knowledge Retrieval', stage: 'LOAD_KNOWLEDGE' },
        { name: 'Agent Decision Generation', stage: 'EXECUTE_AGENT' },
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
      financeAgent,
      demoWorkflow,
      policy,
      status: 'SUCCESS',
      message: 'AI Operating System Ready',
    };
  }
}

export const setupService = SetupService.getInstance();
