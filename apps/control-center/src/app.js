/**
 * AiOS Control Center Frontend Client Application
 */

const API_BASE = window.location.port === '8080' ? 'http://localhost:3000/api/v1' : '/api/v1';

let currentOrgId = null;
let currentView = 'dashboard';

// Utilities
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    showToast(err.message, 'error');
    throw err;
  }
}

// Router & State
async function initApp() {
  setupNavigation();
  setupGlobalActions();
  await checkSetupAndBootstrap();
}

async function checkSetupAndBootstrap() {
  try {
    const status = await apiFetch('/setup/status');
    if (!status.is_setup_complete) {
      renderView('wizard');
      return;
    }

    const orgs = await apiFetch('/organizations');
    if (orgs && orgs.length > 0) {
      currentOrgId = orgs[0].id;
      document.getElementById('org-name-badge').textContent = orgs[0].name;
    }
    renderView('dashboard');
  } catch (err) {
    console.warn('API not ready or running standalone. Showing setup wizard.');
    renderView('wizard');
  }
}

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      navItems.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderView(view);
    });
  });
}

function setupGlobalActions() {
  const triggerDemoBtn = document.getElementById('btn-trigger-demo');
  if (triggerDemoBtn) {
    triggerDemoBtn.addEventListener('click', async () => {
      await triggerUniversalDemo();
    });
  }
}

async function triggerUniversalDemo(amount = 48000) {
  try {
    showToast('Iniciando pipeline universal com invoice de R$ ' + amount.toLocaleString('pt-BR') + '...', 'info');
    const run = await apiFetch('/workflows/universal-invoice-pipeline/trigger', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: currentOrgId,
        task_name: 'validate_invoice',
        payload: {
          action: 'validate_invoice',
          vendor: 'TechCorp Brasil Servicos de Software',
          invoice_number: 'INV-2026-8891',
          amount: amount,
          currency: 'BRL',
          description: 'Licenciamento anual de infraestrutura em nuvem e APIs.',
        },
      }),
    });

    showToast(`Workflow iniciado! Run ID: ${run.id.slice(0, 8)}`, 'success');
    renderView('runs');
  } catch (err) {
    // Handled in apiFetch
  }
}

// Views Renderer
async function renderView(viewName) {
  currentView = viewName;
  const container = document.getElementById('view-container');
  const title = document.getElementById('page-title');

  switch (viewName) {
    case 'dashboard':
      title.textContent = 'Painel de Controle Operacional';
      await renderDashboard(container);
      break;
    case 'approvals':
      title.textContent = 'Fila de Aprovações Humanas (Human-in-the-Loop)';
      await renderApprovals(container);
      break;
    case 'runs':
      title.textContent = 'Execuções de Workflows & Linha do Tempo';
      await renderRuns(container);
      break;
    case 'agents':
      title.textContent = 'Agentes & Job Descriptions';
      await renderAgents(container);
      break;
    case 'skills':
      title.textContent = 'Biblioteca de Skills (SKILL.md)';
      await renderSkills(container);
      break;
    case 'workflows':
      title.textContent = 'Workflows & Pipelines Empresariais';
      await renderWorkflows(container);
      break;
    case 'knowledge':
      title.textContent = 'Knowledge Base & Busca Vetorial (pgvector)';
      await renderKnowledge(container);
      break;
    case 'tools':
      title.textContent = 'Tools & Integrações MCP';
      await renderTools(container);
      break;
    case 'policies':
      title.textContent = 'Políticas Determinísticas de Governança';
      await renderPolicies(container);
      break;
    case 'audit':
      title.textContent = 'Logs de Auditoria Imutáveis';
      await renderAudit(container);
      break;
    case 'wizard':
      title.textContent = 'Setup Wizard Inicial (AiOS Bootstrap)';
      renderWizard(container);
      break;
    default:
      container.innerHTML = `<div>Tela em desenvolvimento: ${viewName}</div>`;
  }
}

// -----------------------------------------------------------------------------
// 1. Dashboard View
// -----------------------------------------------------------------------------
async function renderDashboard(container) {
  try {
    const data = await apiFetch(`/dashboard/metrics?organization_id=${currentOrgId || ''}`);

    // Update pending badge
    const badge = document.getElementById('pending-badge');
    if (data.pending_approvals_count > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = data.pending_approvals_count;
    } else {
      badge.style.display = 'none';
    }

    container.innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Workflows Ativos</span>
            <span>⚡</span>
          </div>
          <div class="metric-value">${data.running_workflows}</div>
          <div class="metric-subtext">${data.workflows_count} pipelines configurados</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Aprovações Pendentes</span>
            <span>🛡️</span>
          </div>
          <div class="metric-value" style="color: var(--accent-amber);">${data.pending_approvals_count}</div>
          <div class="metric-subtext">Aguardando decisão humana</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Total de Execuções</span>
            <span>📊</span>
          </div>
          <div class="metric-value">${data.total_runs}</div>
          <div class="metric-subtext">${data.completed_workflows} completadas / ${data.failed_workflows} falhas</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Agentes Ativos</span>
            <span>🤖</span>
          </div>
          <div class="metric-value">${data.active_agents}</div>
          <div class="metric-subtext">Orchestrator, Finance, etc.</div>
        </div>
      </div>

      ${data.pending_approvals.length > 0 ? `
        <div class="section-card">
          <div class="section-header">
            <h2 class="section-title">🚨 Aprovação Requerida com Urgência</h2>
            <button class="btn btn-secondary btn-sm" onclick="window.navTo('approvals')">Ver todas</button>
          </div>
          ${renderApprovalCardHtml(data.pending_approvals[0])}
        </div>
      ` : ''}

      <div class="section-card">
        <div class="section-header">
          <h2 class="section-title">Eventos Recentes de Auditoria</h2>
          <button class="btn btn-secondary btn-sm" onclick="window.navTo('audit')">Ver logs completos</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Evento</th>
              <th>Ator</th>
              <th>Alvo</th>
              <th>Horário</th>
            </tr>
          </thead>
          <tbody>
            ${data.recent_logs.map(log => `
              <tr>
                <td><strong>${log.event_type}</strong></td>
                <td><span class="status-badge ${log.actor_type === 'AGENT' ? 'running' : 'completed'}">${log.actor_type}: ${log.actor_id}</span></td>
                <td>${log.target_type || '-'} ${log.target_id || ''}</td>
                <td>${new Date(log.created_at).toLocaleTimeString('pt-BR')}</td>
              </tr>
            `).join('')}
            ${data.recent_logs.length === 0 ? '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhum evento registrado ainda.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="section-card"><p>Carregando dados do servidor...</p></div>`;
  }
}

// -----------------------------------------------------------------------------
// 2. Approvals View (Human-in-the-Loop)
// -----------------------------------------------------------------------------
async function renderApprovals(container) {
  const approvals = await apiFetch(`/approvals?organization_id=${currentOrgId || ''}`);

  container.innerHTML = `
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">Fila de Decisões Humanas</h2>
        <span class="badge-count" style="font-size: 0.85rem;">${approvals.filter(a => a.status === 'PENDING').length} Pendentes</span>
      </div>
      <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 0.9rem;">
        Esta tela centraliza os pontos de parada onde a autonomia da IA é pausada por políticas de conformidade ou limites operacionais.
      </p>

      ${approvals.length === 0 ? `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 8px;">✅</div>
          <p>Nenhuma aprovação pendente no momento.</p>
          <button class="btn btn-secondary btn-sm" style="margin-top: 12px;" onclick="window.triggerUniversalDemo(48000)">
            Disparar Invoice de R$ 48.000,00 para gerar aprovação
          </button>
        </div>
      ` : ''}

      ${approvals.map(approval => renderApprovalCardHtml(approval)).join('')}
    </div>
  `;
}

function renderApprovalCardHtml(approval) {
  const isPending = approval.status === 'PENDING';
  const amount = approval.proposed_action?.params?.amount || approval.context?.trigger?.amount || 'N/A';
  const vendor = approval.proposed_action?.params?.vendor || approval.context?.trigger?.vendor || 'N/A';

  return `
    <div class="approval-card" id="approval-card-${approval.id}">
      <div class="approval-card-header">
        <div>
          <h3 style="font-size: 1.05rem; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
            Aprovação de Processo: ${approval.context?.task || 'Validação de Invoice'}
          </h3>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Solicitado por: <strong>${approval.requested_by}</strong></span>
        </div>
        <span class="status-badge ${approval.status.toLowerCase()}">${approval.status}</span>
      </div>

      <div class="approval-reason-box">
        <strong>Motivo da Parada:</strong> ${approval.reason}
      </div>

      <div class="approval-details-grid">
        <div>
          <div style="color: var(--text-muted); font-size: 0.75rem;">VALOR SOLICITADO</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">
            ${typeof amount === 'number' ? 'R$ ' + amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : amount}
          </div>
        </div>
        <div>
          <div style="color: var(--text-muted); font-size: 0.75rem;">FORNECEDOR / ALVO</div>
          <div style="font-weight: 600;">${vendor}</div>
        </div>
        <div>
          <div style="color: var(--text-muted); font-size: 0.75rem;">ATRIBUÍDO PARA</div>
          <div>${approval.assigned_to || 'ADMIN'}</div>
        </div>
        <div>
          <div style="color: var(--text-muted); font-size: 0.75rem;">WORKFLOW RUN ID</div>
          <div style="font-family: var(--font-mono);">${approval.workflow_run_id ? approval.workflow_run_id.slice(0, 8) : '-'}</div>
        </div>
      </div>

      <div class="code-snippet">
        <strong>Ação Proposta pela IA:</strong>
        <pre>${JSON.stringify(approval.proposed_action, null, 2)}</pre>
      </div>

      ${isPending ? `
        <div class="approval-actions" style="margin-top: 16px;">
          <button class="btn btn-primary" onclick="window.handleApproval('${approval.id}', 'approve')">
            ✅ APROVAR
          </button>
          <button class="btn btn-danger" onclick="window.handleApproval('${approval.id}', 'reject')">
            ❌ REJEITAR
          </button>
          <button class="btn btn-warning" onclick="window.handleApproval('${approval.id}', 'changes')">
            ✏️ SOLICITAR AJUSTES
          </button>
          <button class="btn btn-secondary" onclick="window.handleApproval('${approval.id}', 'takeover')">
            👤 ASSUMIR MANUALMENTE
          </button>
        </div>
      ` : `
        <div style="margin-top: 12px; font-size: 0.84rem; color: var(--text-secondary);">
          Decidido em: ${new Date(approval.decided_at || approval.updated_at).toLocaleString('pt-BR')} 
          ${approval.decision_reason ? `(${approval.decision_reason})` : ''}
        </div>
      `}
    </div>
  `;
}

// -----------------------------------------------------------------------------
// 3. Runs & 12-Stage Timeline View
// -----------------------------------------------------------------------------
async function renderRuns(container) {
  const runs = await apiFetch(`/runs?organization_id=${currentOrgId || ''}`);

  if (runs.length === 0) {
    container.innerHTML = `
      <div class="section-card" style="text-align: center; padding: 40px;">
        <p>Nenhuma execução registrada ainda.</p>
        <button class="btn btn-primary" style="margin-top: 12px;" onclick="window.triggerUniversalDemo(48000)">
          Executar Workflow Universal de Demonstração
        </button>
      </div>
    `;
    return;
  }

  // Load first run details for timeline
  const firstRunId = runs[0].id;
  const runDetail = await apiFetch(`/runs/${firstRunId}`);

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 320px 1fr; gap: 20px;">
      <!-- Runs List -->
      <div class="section-card" style="padding: 16px; max-height: 80vh; overflow-y: auto;">
        <h3 class="section-title" style="margin-bottom: 12px; font-size: 0.95rem;">Histórico de Execuções</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${runs.map(r => `
            <div onclick="window.selectRun('${r.id}')" style="padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: ${r.id === firstRunId ? 'var(--bg-subtle)' : 'transparent'}; cursor: pointer;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-weight: 600; font-size: 0.85rem;">Run #${r.id.slice(0, 8)}</span>
                <span class="status-badge ${r.status.toLowerCase()}">${r.status}</span>
              </div>
              <div style="font-size: 0.76rem; color: var(--text-muted);">
                ${new Date(r.started_at).toLocaleTimeString('pt-BR')} • Etapa: ${r.current_step}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Timeline Detail -->
      <div class="section-card" id="timeline-detail-box">
        ${renderRunTimelineHtml(runDetail)}
      </div>
    </div>
  `;
}

function renderRunTimelineHtml(runDetail) {
  const { run, steps } = runDetail;
  if (!run) return `<div>Selecione uma execução</div>`;

  return `
    <div class="section-header">
      <div>
        <h2 class="section-title">Timeline da Execução (Pipeline Universal de 12 Etapas)</h2>
        <span style="font-size: 0.8rem; color: var(--text-muted);">ID: ${run.id} • Status Geral: <strong>${run.status}</strong></span>
      </div>
      <span class="status-badge ${run.status.toLowerCase()}">${run.status}</span>
    </div>

    ${run.status === 'WAITING_APPROVAL' ? `
      <div class="approval-reason-box" style="margin-bottom: 20px;">
        ⏸️ <strong>WORKFLOW EM PAUSA:</strong> Aguardando decisão humana na etapa de Human-in-the-loop.
        <button class="btn btn-sm btn-primary" style="margin-left: 12px;" onclick="window.navTo('approvals')">Ir para Aprovação</button>
      </div>
    ` : ''}

    <div class="pipeline-timeline">
      ${steps.map((step, idx) => `
        <div class="timeline-step">
          <div class="step-number">${step.step_order}</div>
          <div class="step-details">
            <div class="step-title-row">
              <span class="step-name">${step.step_name}</span>
              <div>
                <span class="status-badge ${step.status.toLowerCase()}">${step.status}</span>
                <span class="step-duration">${step.duration_ms !== undefined ? step.duration_ms + 'ms' : ''}</span>
              </div>
            </div>
            <div class="code-snippet">
              <strong>Entrada / Saída:</strong>
              <pre>${JSON.stringify({ input: step.input_data, output: step.output_data }, null, 2)}</pre>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// -----------------------------------------------------------------------------
// 4. Agents View
// -----------------------------------------------------------------------------
async function renderAgents(container) {
  const agents = await apiFetch(`/agents?organization_id=${currentOrgId || ''}`);

  container.innerHTML = `
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">Agentes Registrados na Plataforma</h2>
        <button class="btn btn-primary btn-sm" onclick="alert('Modal de criação de agente preparado.')">+ Criar Agente</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;">
        ${agents.map(agent => `
          <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">${agent.name}</h3>
              <span class="status-badge active">${agent.status}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--accent-blue); font-weight: 600; margin-bottom: 8px;">${agent.role}</div>
            <p style="font-size: 0.84rem; color: var(--text-secondary); margin-bottom: 12px;">${agent.job_description}</p>
            
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px;">
              <strong>Runtime:</strong> ${agent.runtime}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px;">
              <strong>Limite de Auto-Aprovação:</strong> ${agent.approval_limits?.max_auto_approval_amount ? 'R$ ' + agent.approval_limits.max_auto_approval_amount.toLocaleString('pt-BR') : 'Requer aprovação'}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">
              <strong>Skills Autorizadas:</strong> ${(agent.skills || []).map(s => s.name).join(', ') || 'Todas'}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// 5. Skills View (SKILL.md)
// -----------------------------------------------------------------------------
async function renderSkills(container) {
  const skills = await apiFetch(`/skills?organization_id=${currentOrgId || ''}`);

  container.innerHTML = `
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">Biblioteca de Skills Declarativas (Padrão SKILL.md)</h2>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
        ${skills.map(skill => `
          <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <h3 style="font-size: 1rem; font-weight: 600;">${skill.name}</h3>
              <span class="status-badge completed">v${skill.version}</span>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 8px;">slug: ${skill.slug}</div>
            <p style="font-size: 0.84rem; color: var(--text-secondary); margin-bottom: 12px;">${skill.description || skill.purpose || ''}</p>
            
            <div class="code-snippet" style="max-height: 140px;">
              <strong>Instruções:</strong>
              <pre>${skill.instructions}</pre>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// 6. Workflows View
// -----------------------------------------------------------------------------
async function renderWorkflows(container) {
  const workflows = await apiFetch(`/workflows?organization_id=${currentOrgId || ''}`);

  container.innerHTML = `
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">Pipelines & Workflows Cadastrados</h2>
        <button class="btn btn-primary btn-sm" onclick="window.triggerUniversalDemo(48000)">Disparar Workflow Demo</button>
      </div>
      ${workflows.map(wf => `
        <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <h3 style="font-size: 1.05rem; font-weight: 600;">${wf.name}</h3>
            <span class="status-badge active">Gatilho: ${wf.trigger_type}</span>
          </div>
          <p style="font-size: 0.86rem; color: var(--text-secondary); margin-bottom: 12px;">${wf.description}</p>
          <div style="font-size: 0.8rem; color: var(--text-muted);">
            <strong>Etapas configuradas (${wf.steps_config.length}):</strong> ${wf.steps_config.map(s => s.name).join(' → ')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// -----------------------------------------------------------------------------
// 7. Knowledge & RAG View
// -----------------------------------------------------------------------------
async function renderKnowledge(container) {
  container.innerHTML = `
    <div class="section-card">
      <h2 class="section-title">Knowledge Base & Recuperação Semântica (pgvector)</h2>
      <p style="color: var(--text-secondary); font-size: 0.88rem; margin-bottom: 16px;">
        Ingestão e busca semântica de SOPs, contratos e políticas empresariais indexados com vetores cosine distance.
      </p>

      <div style="display: flex; gap: 10px; margin-bottom: 20px;">
        <input type="text" id="rag-query-input" placeholder="Ex: Qual o limite de aprovação para faturas de TI?" style="flex: 1; padding: 10px; background: var(--bg-subtle); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
        <button class="btn btn-primary" onclick="window.testRagSearch()">Buscar no pgvector</button>
      </div>

      <div id="rag-results-box" class="code-snippet" style="min-height: 80px;">
        Digite uma consulta acima para testar a busca vetorial semântica.
      </div>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// 8. Tools & Integrations View
// -----------------------------------------------------------------------------
async function renderTools(container) {
  const tools = await apiFetch(`/tools?organization_id=${currentOrgId || ''}`);

  container.innerHTML = `
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">Tools & Integrações MCP Cadastradas</h2>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
        ${tools.map(tool => `
          <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <h3 style="font-size: 0.95rem; font-weight: 600;">${tool.name}</h3>
              <span class="status-badge completed">${tool.status}</span>
            </div>
            <div style="font-size: 0.78rem; color: var(--accent-blue); margin-bottom: 6px;">Tipo: ${tool.type} • Provedor: ${tool.provider}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">
              <strong>Capacidades:</strong> ${tool.capabilities.join(', ')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// 9. Policies View
// -----------------------------------------------------------------------------
async function renderPolicies(container) {
  const policies = await apiFetch(`/policies?organization_id=${currentOrgId || ''}`);

  container.innerHTML = `
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">Políticas Determinísticas de Governança</h2>
      </div>
      <p style="color: var(--text-secondary); font-size: 0.88rem; margin-bottom: 16px;">
        Regras determinísticas executadas no nível de infraestrutura independentemente do modelo LLM.
      </p>
      ${policies.map(pol => `
        <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; margin-bottom: 16px;">
          <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 4px;">${pol.name} (Escopo: ${pol.scope})</h3>
          <p style="font-size: 0.84rem; color: var(--text-secondary); margin-bottom: 12px;">${pol.description || ''}</p>
          <div class="code-snippet">
            <strong>Regras de Decisão (ALLOW | DENY | HUMAN_REQUIRED):</strong>
            <pre>${JSON.stringify(pol.rules, null, 2)}</pre>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// -----------------------------------------------------------------------------
// 10. Audit Logs View
// -----------------------------------------------------------------------------
async function renderAudit(container) {
  const logs = await apiFetch(`/audit/logs?organization_id=${currentOrgId || ''}`);

  container.innerHTML = `
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">Logs de Auditoria Imutáveis</h2>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Evento</th>
            <th>Ator</th>
            <th>Alvo</th>
            <th>Payload Sanitizado</th>
            <th>Data / Hora</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(log => `
            <tr>
              <td><strong>${log.event_type}</strong></td>
              <td><span class="status-badge ${log.actor_type === 'AGENT' ? 'running' : 'completed'}">${log.actor_type}: ${log.actor_id}</span></td>
              <td>${log.target_type || '-'} ${log.target_id || ''}</td>
              <td style="font-family: var(--font-mono); font-size: 0.74rem;">${JSON.stringify(log.payload)}</td>
              <td>${new Date(log.created_at).toLocaleString('pt-BR')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// 11. Setup Wizard View
// -----------------------------------------------------------------------------
function renderWizard(container) {
  container.innerHTML = `
    <div class="section-card" style="max-width: 680px; margin: 0 auto;">
      <h2 class="section-title" style="font-size: 1.4rem; margin-bottom: 8px;">⚙️ Setup Wizard: AiOS Enterprise</h2>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 24px;">
        Configure a instância da sua empresa sobre a infraestrutura-base do AI Operating System.
      </p>

      <form id="wizard-form" onsubmit="window.submitWizard(event)">
        <h3 style="font-size: 1rem; color: var(--text-primary); margin-bottom: 12px;">1. Dados da Empresa (Tenant)</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div>
            <label style="font-size: 0.8rem; color: var(--text-secondary);">Nome da Empresa</label>
            <input type="text" id="wiz-company-name" required value="Acme Corporation" style="width: 100%; padding: 8px; background: var(--bg-subtle); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
          </div>
          <div>
            <label style="font-size: 0.8rem; color: var(--text-secondary);">Setor / Indústria</label>
            <input type="text" id="wiz-industry" value="Tecnologia & Serviços" style="width: 100%; padding: 8px; background: var(--bg-subtle); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
          </div>
        </div>

        <h3 style="font-size: 1rem; color: var(--text-primary); margin-bottom: 12px;">2. Conta do Administrador</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div>
            <label style="font-size: 0.8rem; color: var(--text-secondary);">Nome Completo</label>
            <input type="text" id="wiz-admin-name" required value="Admin Operador" style="width: 100%; padding: 8px; background: var(--bg-subtle); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
          </div>
          <div>
            <label style="font-size: 0.8rem; color: var(--text-secondary);">E-mail Corporativo</label>
            <input type="email" id="wiz-admin-email" required value="admin@empresa.com" style="width: 100%; padding: 8px; background: var(--bg-subtle); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
          </div>
          <div style="grid-column: span 2;">
            <label style="font-size: 0.8rem; color: var(--text-secondary);">Senha de Acesso</label>
            <input type="password" id="wiz-admin-pass" required value="AdminAiOS2026!" style="width: 100%; padding: 8px; background: var(--bg-subtle); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
          </div>
        </div>

        <h3 style="font-size: 1rem; color: var(--text-primary); margin-bottom: 12px;">3. Provedor de IA Inicial</h3>
        <div style="margin-bottom: 24px;">
          <select id="wiz-ai-provider" style="width: 100%; padding: 8px; background: var(--bg-subtle); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm);">
            <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
            <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
            <option value="ollama">Ollama (Local Open Source)</option>
            <option value="hermes">Hermes Agent Runtime</option>
            <option value="openclaw">OpenClaw Agent Runtime</option>
          </select>
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%; padding: 12px; font-weight: 600;">
          🚀 Finalizar Configuração e Inicializar AiOS
        </button>
      </form>
    </div>
  `;
}

// Global Window Functions for inline HTML events
window.navTo = (view) => {
  const btn = document.querySelector(`[data-view="${view}"]`);
  if (btn) btn.click();
  else renderView(view);
};

window.triggerUniversalDemo = triggerUniversalDemo;

window.handleApproval = async (approvalId, decision) => {
  try {
    let endpoint = `/approvals/${approvalId}/approve`;
    if (decision === 'reject') endpoint = `/approvals/${approvalId}/reject`;
    if (decision === 'changes') endpoint = `/approvals/${approvalId}/changes`;
    if (decision === 'takeover') endpoint = `/approvals/${approvalId}/takeover`;

    await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        decided_by: 'user:admin_operador',
        reason: `Decisão de ${decision.toUpperCase()} aplicada pelo operador humano no Control Center.`,
      }),
    });

    showToast(`Decisão '${decision.toUpperCase()}' registrada com sucesso! Workflow retomado.`, 'success');
    await renderApprovals(document.getElementById('view-container'));
  } catch (err) {
    // Handled in apiFetch
  }
};

window.selectRun = async (runId) => {
  const runDetail = await apiFetch(`/runs/${runId}`);
  document.getElementById('timeline-detail-box').innerHTML = renderRunTimelineHtml(runDetail);
};

window.testRagSearch = async () => {
  const query = document.getElementById('rag-query-input').value;
  if (!query) return;
  const results = await apiFetch('/knowledge/search', {
    method: 'POST',
    body: JSON.stringify({ organization_id: currentOrgId, query, top_k: 3 }),
  });
  document.getElementById('rag-results-box').innerHTML = `
    <strong>Documentos Semelhantes Encontrados no pgvector:</strong>
    <pre>${JSON.stringify(results, null, 2)}</pre>
  `;
};

window.submitWizard = async (e) => {
  e.preventDefault();
  const companyName = document.getElementById('wiz-company-name').value;
  const industry = document.getElementById('wiz-industry').value;
  const adminName = document.getElementById('wiz-admin-name').value;
  const adminEmail = document.getElementById('wiz-admin-email').value;
  const adminPass = document.getElementById('wiz-admin-pass').value;
  const provider = document.getElementById('wiz-ai-provider').value;

  try {
    showToast('Executando Setup Wizard do AiOS...', 'info');
    const result = await apiFetch('/setup/wizard', {
      method: 'POST',
      body: JSON.stringify({
        company: { name: companyName, industry },
        admin: { name: adminName, email: adminEmail, password: adminPass },
        aiProvider: { provider },
      }),
    });

    showToast('AI Operating System Ready!', 'success');
    currentOrgId = result.organization.id;
    document.getElementById('org-name-badge').textContent = result.organization.name;
    renderView('dashboard');
  } catch (err) {
    // Handled
  }
};

// Start App
initApp();
