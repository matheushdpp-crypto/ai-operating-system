import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeService } from '../../src/modules/knowledge/knowledge.service.js';
import { embeddingProvider } from '../../src/modules/knowledge/embedding.provider.js';

describe('Knowledge & RAG Engine Unit Tests', () => {
  const orgA = 'org_rag_test_a';
  const orgB = 'org_rag_test_b';

  test('ingests document, splits into chunks, and computes embeddings', async () => {
    const source = await knowledgeService.createSource({
      organization_id: orgA,
      name: 'Operations Handbook',
      type: 'SOP',
      status: 'ACTIVE',
      metadata: {},
    });

    const content = `Security Incident Response Protocol.
All data breach notifications must be dispatched within 2 hours.
Critical system patches must be applied within 24 hours of release.
Routine server maintenance occurs every Sunday at 02:00 UTC.`;

    const result = await knowledgeService.ingestDocument({
      source_id: source.id,
      title: 'Incident Protocol',
      content,
    });

    assert.ok(result.document);
    assert.ok(result.chunks.length > 0);
    assert.equal(result.deduplicated, false);
    assert.ok(result.chunks[0].embedding);
    assert.ok(Array.isArray(result.chunks[0].embedding));
  });

  test('deduplicates identical document content on re-ingestion', async () => {
    const source = await knowledgeService.createSource({
      organization_id: orgA,
      name: 'Duplicate Test Source',
      type: 'MANUAL',
      status: 'ACTIVE',
      metadata: {},
    });

    const content = 'Exact duplicate text content for hashing verification test.';

    const first = await knowledgeService.ingestDocument({
      source_id: source.id,
      title: 'Doc 1',
      content,
    });
    assert.equal(first.deduplicated, false);

    const second = await knowledgeService.ingestDocument({
      source_id: source.id,
      title: 'Doc 2 (Duplicate)',
      content,
    });
    assert.equal(second.deduplicated, true);
    assert.equal(second.document.id, first.document.id);
  });

  test('retrieves relevant knowledge and enforces organization isolation', async () => {
    const sourceA = await knowledgeService.createSource({
      organization_id: orgA,
      name: 'Org A Confidential Strategy',
      type: 'MANUAL',
      status: 'ACTIVE',
      metadata: {},
    });

    await knowledgeService.ingestDocument({
      source_id: sourceA.id,
      title: 'Org A Q3 Goals',
      content: 'Org A confidential secret target: increase automation revenue by 40%.',
    });

    // Org A can retrieve its own document
    const resultsA = await knowledgeService.searchSimilar(orgA, 'automation revenue', 3);
    assert.ok(resultsA.length > 0);
    assert.ok(resultsA[0].content.includes('Org A confidential'));

    // Org B MUST NOT retrieve Org A's document
    const resultsB = await knowledgeService.searchSimilar(orgB, 'automation revenue', 3);
    assert.equal(resultsB.length, 0, 'Organization B must not retrieve Organization A documents');
  });

  test('computes cosine similarity accurately', () => {
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    const v3 = [0, 1, 0];

    const simIdentical = embeddingProvider.cosineSimilarity(v1, v2);
    const simOrthogonal = embeddingProvider.cosineSimilarity(v1, v3);

    assert.ok(Math.abs(simIdentical - 1.0) < 0.001);
    assert.ok(Math.abs(simOrthogonal - 0.0) < 0.001);
  });
});
