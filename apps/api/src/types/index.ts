/**
 * AI Operating System (AiOS) - Core Domain Types
 */

export type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  industry?: string;
  timezone: string;
  language: string;
  settings: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  password_hash?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AgentRuntimeType = 'native' | 'hermes' | 'openclaw' | 'custom';
export type AgentStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'BUSY';

export interface Agent {
  id: string;
  organization_id: string;
  name: string;
  role: string;
  job_description: string;
  runtime: AgentRuntimeType;
  runtime_config: Record<string, any>;
  status: AgentStatus;
  permissions: string[];
  approval_limits: {
    max_auto_approval_amount?: number;
    currency?: string;
    restricted_tools?: string[];
    allowed_scopes?: string[];
    require_human_on?: string[];
    [key: string]: any;
  };
  knowledge_scopes: string[];
  skills?: Skill[];
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  version: string;
  description?: string;
  purpose?: string;
  when_to_use?: string;
  when_not_to_use?: string;
  instructions: string;
  inputs_schema: Record<string, any>;
  outputs_schema: Record<string, any>;
  required_tools: string[];
  required_knowledge: string[];
  file_path?: string;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export type ToolType = 'CRM' | 'ERP' | 'EMAIL' | 'CALENDAR' | 'MESSAGING' | 'STORAGE' | 'DATABASE' | 'BROWSER' | 'HTTP_API' | 'MCP';
export type ToolStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'MOCK';

export interface Tool {
  id: string;
  organization_id: string;
  name: string;
  type: ToolType;
  provider: string;
  credentials_ref?: string;
  capabilities: string[];
  status: ToolStatus;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type PolicyDecisionResult = 'ALLOW' | 'DENY' | 'HUMAN_REQUIRED';

export interface PolicyRule {
  id: string;
  name: string;
  condition: {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'custom';
    value: any;
  };
  decision: PolicyDecisionResult;
  reason: string;
  suggested_approver_role?: string;
}

export interface Policy {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  scope: string; // e.g. 'financial', 'data_export', 'tool_execution'
  rules: PolicyRule[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecisionResult;
  matched_rules: PolicyRule[];
  reasons: string[];
  requires_approval: boolean;
  suggested_approver_role?: string;
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'TAKEN_OVER' | 'EXPIRED';

export interface Approval {
  id: string;
  organization_id: string;
  workflow_run_id?: string;
  task_id?: string;
  requested_by: string;
  assigned_to?: string;
  reason: string;
  context: Record<string, any>;
  proposed_action: Record<string, any>;
  status: ApprovalStatus;
  decision?: string;
  decision_reason?: string;
  decided_by?: string;
  decided_at?: string;
  created_at: string;
  updated_at: string;
}

export type WorkflowTriggerType = 'WEBHOOK' | 'EVENT' | 'CRON' | 'MANUAL' | 'API';
export type WorkflowRunStatus = 'PENDING' | 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type WorkflowStepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'SKIPPED' | 'FAILED' | 'PAUSED';

export interface WorkflowStepConfig {
  name: string;
  stage: string;
  agent_id?: string;
  skill_slugs?: string[];
  required_knowledge?: string[];
  policy_scope?: string;
  optional?: boolean;
  action_type?: string;
}

export interface Workflow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string;
  trigger_type: WorkflowTriggerType;
  trigger_config: Record<string, any>;
  steps_config: WorkflowStepConfig[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  organization_id: string;
  trigger_payload: Record<string, any>;
  current_step: string;
  status: WorkflowRunStatus;
  state_data: Record<string, any>;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export interface WorkflowStepRun {
  id: string;
  workflow_run_id: string;
  step_name: string;
  step_order: number;
  status: WorkflowStepStatus;
  input_data: Record<string, any>;
  output_data: Record<string, any>;
  error?: string;
  duration_ms?: number;
  started_at: string;
  completed_at?: string;
}

export type MemoryType = 'FACT' | 'PREFERENCE' | 'LESSON_LEARNED' | 'EPISODIC' | 'SUMMARY';

export interface MemoryEntry {
  id: string;
  organization_id: string;
  scope: string;
  entity_id?: string;
  agent_id?: string;
  content: string;
  type: MemoryType;
  importance: number;
  source?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSource {
  id: string;
  organization_id: string;
  name: string;
  type: 'MANUAL' | 'FILE' | 'SOP' | 'POLICY' | 'WEBSITE' | 'DATABASE';
  status: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  source_id: string;
  title: string;
  uri?: string;
  mime_type?: string;
  raw_content?: string;
  chunk_count: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding?: number[];
  similarity?: number;
  metadata: Record<string, any>;
  created_at: string;
}

export type ActorType = 'USER' | 'AGENT' | 'SYSTEM' | 'WEBHOOK';

export interface AuditLog {
  id: string;
  organization_id: string;
  event_type: string;
  actor_type: ActorType;
  actor_id: string;
  target_type?: string;
  target_id?: string;
  payload: Record<string, any>;
  ip_address?: string;
  created_at: string;
}
