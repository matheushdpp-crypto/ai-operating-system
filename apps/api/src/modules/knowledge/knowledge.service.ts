import crypto from 'crypto';
import { KnowledgeSource, Document, DocumentChunk } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';
import { auditService } from '../audit/audit.service.js';

export class KnowledgeService {
  private static instance: KnowledgeService;

  public static getInstance(): KnowledgeService {
    if (!KnowledgeService.instance) {
      KnowledgeService.instance = new KnowledgeService();
    }
    return KnowledgeService.instance;
  }

  /**
   * Generates deterministic normalized 1536-dim vector for embeddings in test/standalone environments
   */
  private generateMockEmbedding(text: string): number[] {
    const dim = 1536;
    const vec: number[] = new Array(dim).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    for (let i = 0; i < dim; i++) {
      vec[i] = Math.sin(hash + i);
    }
    // Normalize
    const mag = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    return vec.map((v) => (mag > 0 ? v / mag : 0));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  async createSource(source: Omit<KnowledgeSource, 'id' | 'created_at' | 'updated_at'>): Promise<KnowledgeSource> {
    const id = crypto.randomUUID();
    const newSource: KnowledgeSource = {
      id,
      ...source,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.knowledge_sources (id, organization_id, name, type, status, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [newSource.id, newSource.organization_id, newSource.name, newSource.type, newSource.status, JSON.stringify(newSource.metadata), newSource.created_at, newSource.updated_at]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('knowledge_sources').set(id, newSource);
    }

    return newSource;
  }

  async ingestDocument(params: {
    source_id: string;
    title: string;
    content: string;
    uri?: string;
    mime_type?: string;
  }): Promise<{ document: Document; chunks: DocumentChunk[] }> {
    const docId = crypto.randomUUID();
    const chunkSize = 500;
    const overlap = 50;

    // Simple robust chunking
    const words = params.content.split(/\s+/);
    const chunkTexts: string[] = [];
    let i = 0;
    while (i < words.length) {
      const slice = words.slice(i, i + chunkSize);
      chunkTexts.push(slice.join(' '));
      i += chunkSize - overlap;
      if (slice.length < chunkSize) break;
    }
    if (chunkTexts.length === 0) chunkTexts.push(params.content);

    const doc: Document = {
      id: docId,
      source_id: params.source_id,
      title: params.title,
      uri: params.uri,
      mime_type: params.mime_type || 'text/plain',
      raw_content: params.content,
      chunk_count: chunkTexts.length,
      metadata: {},
      created_at: new Date().toISOString(),
    };

    const chunks: DocumentChunk[] = [];
    for (let idx = 0; idx < chunkTexts.length; idx++) {
      const chunkText = chunkTexts[idx];
      const embedding = this.generateMockEmbedding(chunkText);
      const chunk: DocumentChunk = {
        id: crypto.randomUUID(),
        document_id: docId,
        chunk_index: idx,
        content: chunkText,
        embedding,
        metadata: { title: params.title },
        created_at: new Date().toISOString(),
      };
      chunks.push(chunk);
    }

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.documents (id, source_id, title, uri, mime_type, raw_content, chunk_count, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [doc.id, doc.source_id, doc.title, doc.uri, doc.mime_type, doc.raw_content, doc.chunk_count, JSON.stringify(doc.metadata), doc.created_at]
      );
      for (const c of chunks) {
        await db.driver.query(
          `INSERT INTO aios.document_chunks (id, document_id, chunk_index, content, embedding, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [c.id, c.document_id, c.chunk_index, c.content, JSON.stringify(c.embedding), JSON.stringify(c.metadata), c.created_at]
        );
      }
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('documents').set(doc.id, doc);
      for (const c of chunks) {
        mem.getTable('document_chunks').set(c.id, c);
      }
    }

    return { document: doc, chunks };
  }

  async searchSimilar(organization_id: string, query: string, topK: number = 3): Promise<DocumentChunk[]> {
    const queryVec = this.generateMockEmbedding(query);

    if (db.isPostgres) {
      try {
        const res = await db.driver.query<DocumentChunk>(
          `SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.metadata, dc.created_at,
                  1 - (dc.embedding <=> $1::vector) as similarity
           FROM aios.document_chunks dc
           JOIN aios.documents d ON dc.document_id = d.id
           JOIN aios.knowledge_sources ks ON d.source_id = ks.id
           WHERE ks.organization_id = $2
           ORDER BY dc.embedding <=> $1::vector
           LIMIT $3`,
          [JSON.stringify(queryVec), organization_id, topK]
        );
        return res.rows;
      } catch (err: any) {
        console.warn('[KnowledgeService] Fallback to memory search:', err.message);
      }
    }

    const mem = db.driver as MemoryDatabaseDriver;
    const allChunks = Array.from(mem.getTable('document_chunks').values()) as DocumentChunk[];
    const scored = allChunks
      .map((c) => ({
        ...c,
        similarity: c.embedding ? this.cosineSimilarity(queryVec, c.embedding) : 0,
      }))
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, topK);

    await auditService.log({
      organization_id,
      event_type: 'knowledge.retrieved',
      actor_type: 'SYSTEM',
      actor_id: 'system:knowledge_layer',
      target_type: 'query',
      target_id: query.slice(0, 50),
      payload: { topK, results_count: scored.length },
    });

    return scored;
  }
}

export const knowledgeService = KnowledgeService.getInstance();
