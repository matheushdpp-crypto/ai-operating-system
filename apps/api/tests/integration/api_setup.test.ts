import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupService } from '../../src/modules/setup/setup.service.js';
import { agentService } from '../../src/modules/agents/agent.service.js';
import { skillService } from '../../src/modules/skills/skill.service.js';
import { knowledgeService } from '../../src/modules/knowledge/knowledge.service.js';
import { workflowEngine } from '../../src/modules/workflows/workflow.engine.js';

describe('AiOS Setup Wizard & Architecture Integration', () => {
  test('executes setup wizard bootstrap and creates all enterprise layers', async () => {
    const setupResult = await setupService.runSetupWizard({
      company: {
        name: 'Enterprise Integration Test Corp',
        industry: 'FinTech',
      },
      admin: {
        name: 'Integration Admin',
        email: 'admin@integcorp.test',
        password: 'Password123!',
      },
      aiProvider: {
        provider: 'openai',
      },
    });

    assert.equal(setupResult.status, 'SUCCESS');
    assert.equal(setupResult.message, 'AI Operating System Ready');

    const orgId = setupResult.organization.id;

    // Verify Agents created
    const agents = await agentService.listAgents(orgId);
    assert.ok(agents.length >= 2, 'Should create at least Orchestrator and Finance agents');

    // Verify Skills registered
    const skills = await skillService.listSkills(orgId);
    assert.ok(skills.some((s) => s.slug === 'validate-invoice'));

    // Verify Knowledge Base ingested & searchable
    const searchResults = await knowledgeService.searchSimilar(orgId, 'invoice validation limits', 2);
    assert.ok(searchResults.length > 0, 'Should find knowledge chunks');

    // Verify Workflow created
    const workflows = await workflowEngine.listWorkflows(orgId);
    assert.ok(workflows.some((w) => w.slug === 'universal-invoice-pipeline'));
  });
});
