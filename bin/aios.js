#!/usr/bin/env node

/**
 * AiOS CLI - AI Operating System Management Tool
 */

import { setupService } from '../apps/api/dist/modules/setup/setup.service.js';
import { agentService } from '../apps/api/dist/modules/agents/agent.service.js';
import { skillService } from '../apps/api/dist/modules/skills/skill.service.js';
import { workflowEngine } from '../apps/api/dist/modules/workflows/workflow.engine.js';
import { approvalService } from '../apps/api/dist/modules/approvals/approval.service.js';
import { auditService } from '../apps/api/dist/modules/audit/audit.service.js';
import { authService } from '../apps/api/dist/modules/auth/auth.service.js';
import { db } from '../apps/api/dist/database/index.js';
import { config } from '../apps/api/dist/config/env.js';

const [,, command, ...args] = process.argv;

async function runCli() {
  await db.init();
  const orgs = await authService.listOrganizations();
  const defaultOrgId = orgs[0]?.id;

  switch (command) {
    case 'health':
      const isDbHealthy = await db.driver.isHealthy();
      console.log('\n🔍 [AiOS System Health Check]');
      console.log(`- Platform: ${config.platform.name}`);
      console.log(`- Database: ${isDbHealthy ? '✅ HEALTHY' : '❌ ERROR'} (${db.isPostgres ? 'PostgreSQL + pgvector' : 'In-Memory Driver'})`);
      console.log(`- n8n Endpoint: 🌐 ${config.n8n.baseUrl}`);
      console.log(`- Control Center: 🎛️ ${config.platform.controlCenterUrl}`);
      console.log(`- Runtime Adapter: 🤖 ${config.ai.defaultProvider}\n`);
      break;

    case 'setup':
      console.log('\n⚙️ [Running AiOS Setup Wizard]...');
      const res = await setupService.runSetupWizard({
        company: { name: 'Empresa Matriz' },
        admin: { name: 'Admin Master', email: 'admin@aios.local', password: 'AdminPassword2026!' },
        aiProvider: { provider: 'openai' },
      });
      console.log(`✅ Setup concluído com sucesso! Organização ID: ${res.organization.id}`);
      console.log(`🎛️ Acesse o Control Center em: ${config.platform.controlCenterUrl}\n`);
      break;

    case 'agent':
      if (args[0] === 'list') {
        if (!defaultOrgId) return console.log('❌ Nenhuma organização configurada. Execute: aios setup');
        const agents = await agentService.listAgents(defaultOrgId);
        console.log(`\n🤖 [Agentes Registrados (${agents.length})]:`);
        agents.forEach((a) => console.log(` - [${a.role}] ${a.name} (Runtime: ${a.runtime}, Status: ${a.status})`));
        console.log('');
      } else {
        console.log('Uso: aios agent list');
      }
      break;

    case 'skill':
      if (args[0] === 'list') {
        if (!defaultOrgId) return console.log('❌ Nenhuma organização configurada. Execute: aios setup');
        const skills = await skillService.listSkills(defaultOrgId);
        console.log(`\n🧩 [Skills Cadastradas (${skills.length})]:`);
        skills.forEach((s) => console.log(` - ${s.name} (slug: ${s.slug}, v${s.version})`));
        console.log('');
      } else {
        console.log('Uso: aios skill list');
      }
      break;

    case 'workflow':
      if (args[0] === 'list') {
        if (!defaultOrgId) return console.log('❌ Nenhuma organização configurada. Execute: aios setup');
        const workflows = await workflowEngine.listWorkflows(defaultOrgId);
        console.log(`\n🔄 [Workflows Cadastrados (${workflows.length})]:`);
        workflows.forEach((w) => console.log(` - ${w.name} (slug: ${w.slug}, trigger: ${w.trigger_type})`));
        console.log('');
      } else if (args[0] === 'run') {
        if (!defaultOrgId) return console.log('❌ Nenhuma organização configurada. Execute: aios setup');
        const slug = args[1] || 'universal-invoice-pipeline';
        const wf = await workflowEngine.getWorkflowBySlug(defaultOrgId, slug);
        if (!wf) return console.log(`❌ Workflow '${slug}' não encontrado.`);
        console.log(`\n⚡ Disparando workflow '${slug}'...`);
        const run = await workflowEngine.executeWorkflow({
          workflow_id: wf.id,
          organization_id: defaultOrgId,
          trigger_payload: {
            action: 'validate_invoice',
            vendor: 'Fornecedor Exemplo S.A.',
            amount: 45000,
            currency: 'BRL',
          },
          task_name: 'validate_invoice',
        });
        console.log(`✅ Run iniciado! ID: ${run.id} | Status: ${run.status}\n`);
      } else {
        console.log('Uso: aios workflow list | aios workflow run <slug>');
      }
      break;

    case 'approval':
      if (args[0] === 'list') {
        if (!defaultOrgId) return console.log('❌ Nenhuma organização configurada. Execute: aios setup');
        const approvals = await approvalService.listApprovals(defaultOrgId);
        console.log(`\n🛡️ [Fila de Aprovações (${approvals.length})]:`);
        approvals.forEach((ap) =>
          console.log(` - [${ap.status}] ID: ${ap.id.slice(0, 8)} | Solicitado por: ${ap.requested_by} | Motivo: ${ap.reason}`)
        );
        console.log('');
      } else if (args[0] === 'approve' && args[1]) {
        await approvalService.approve(args[1], 'CLI_ADMIN', 'Aprovado via linha de comando');
        console.log(`✅ Aprovação ${args[1]} aprovada com sucesso.`);
      } else {
        console.log('Uso: aios approval list | aios approval approve <id>');
      }
      break;

    case 'logs':
      if (!defaultOrgId) return console.log('❌ Nenhuma organização configurada. Execute: aios setup');
      const logs = await auditService.list(defaultOrgId, 20);
      console.log(`\n📜 [Logs Recentes de Auditoria (${logs.length})]:`);
      logs.forEach((l) =>
        console.log(` - [${new Date(l.created_at).toLocaleTimeString()}] ${l.event_type} by ${l.actor_type}:${l.actor_id}`)
      );
      console.log('');
      break;

    default:
      console.log(`
AiOS CLI - Enterprise AI Operating System Interface

Comandos disponíveis:
  aios health                  Verifica a integridade dos serviços
  aios setup                   Executa o assistente de inicialização
  aios agent list              Lista agentes cadastrados
  aios skill list              Lista skills declarativas
  aios workflow list           Lista workflows
  aios workflow run <slug>     Dispara uma execução de workflow
  aios approval list           Lista aprovações pendentes
  aios approval approve <id>   Aprova uma solicitação humana
  aios logs                    Exibe logs recentes de auditoria
`);
  }

  process.exit(0);
}

runCli().catch((err) => {
  console.error('Erro na CLI:', err.message);
  process.exit(1);
});
