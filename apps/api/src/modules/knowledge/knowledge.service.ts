import crypto from 'crypto';
import { KnowledgeSource, Document, DocumentChunk } from '../../types/index.js';
import { db, MemoryDatabaseDriver } from '../../database/index.js';
import { auditService } from '../audit/audit.service.js';
import { embeddingProvider } from './embedding.provider.js';

export class KnowledgeService {
  private static instance: KnowledgeService;

  public static getInstance(): KnowledgeService {
    if (!KnowledgeService.instance) {
      KnowledgeService.instance = new KnowledgeService();
    }
    return KnowledgeService.instance;
  }

  /**
   * Computes SHA-256 content hash for deduplication
   */
  public computeHash(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
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
        [
          newSource.id,
          newSource.organization_id,
          newSource.name,
          newSource.type,
          newSource.status,
          JSON.stringify(newSource.metadata),
          newSource.created_at,
          newSource.updated_at,
        ]
      );
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('knowledge_sources').set(id, newSource);
    }

    return newSource;
  }

  async listSources(organization_id: string): Promise<KnowledgeSource[]> {
    if (db.isPostgres) {
      const res = await db.driver.query<KnowledgeSource>(
        `SELECT * FROM aios.knowledge_sources WHERE organization_id = $1 ORDER BY name ASC`,
        [organization_id]
      );
      return res.rows;
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      return (Array.from(mem.getTable('knowledge_sources').values()) as KnowledgeSource[]).filter(
        (s) => s.organization_id === organization_id
      );
    }
  }

  /**
   * Ingests a document with extraction, chunking, content fingerprinting, and real embeddings
   */
  async ingestDocument(params: {
    source_id: string;
    title: string;
    content: string;
    uri?: string;
    mime_type?: string;
    metadata?: Record<string, any>;
  }): Promise<{ document: Document; chunks: DocumentChunk[]; deduplicated: boolean }> {
    const contentHash = this.computeHash(params.content);

    // Check for duplicate document in source
    if (db.isPostgres) {
      const existing = await db.driver.query<Document>(
        `SELECT * FROM aios.documents WHERE source_id = $1 AND content_hash = $2 LIMIT 1`,
        [params.source_id, contentHash]
      );
      if (existing.rows.length > 0) {
        const doc = existing.rows[0];
        const chunksRes = await db.driver.query<DocumentChunk>(
          `SELECT * FROM aios.document_chunks WHERE document_id = $1 ORDER BY chunk_index ASC`,
          [doc.id]
        );
        return { document: doc, chunks: chunksRes.rows, deduplicated: true };
      }
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      const docs = Array.from(mem.getTable('documents').values()) as Document[];
      const existing = docs.find((d) => d.source_id === params.source_id && d.content_hash === contentHash);
      if (existing) {
        const chunks = (Array.from(mem.getTable('document_chunks').values()) as DocumentChunk[])
          .filter((c) => c.document_id === existing.id)
          .sort((a, b) => a.chunk_index - b.chunk_index);
        return { document: existing, chunks, deduplicated: true };
      }
    }

    const docId = crypto.randomUUID();
    const chunkSize = 400; // words
    const overlap = 40;

    // Robust chunking respecting word boundaries
    const words = params.content.split(/\s+/).filter(Boolean);
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
      content_hash: contentHash,
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
    };

    const chunks: DocumentChunk[] = [];
    for (let idx = 0; idx < chunkTexts.length; idx++) {
      const chunkText = chunkTexts[idx];
      const embedding = await embeddingProvider.embed(chunkText);

      const chunk: DocumentChunk = {
        id: crypto.randomUUID(),
        document_id: docId,
        chunk_index: idx,
        content: chunkText,
        embedding,
        metadata: { title: params.title, ...(params.metadata || {}) },
        created_at: new Date().toISOString(),
      };
      chunks.push(chunk);
    }

    if (db.isPostgres) {
      await db.driver.query(
        `INSERT INTO aios.documents (id, source_id, title, uri, mime_type, raw_content, chunk_count, content_hash, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          doc.id,
          doc.source_id,
          doc.title,
          doc.uri,
          doc.mime_type,
          doc.raw_content,
          doc.chunk_count,
          doc.content_hash,
          JSON.stringify(doc.metadata),
          doc.created_at,
        ]
      );
      for (const c of chunks) {
        await db.driver.query(
          `INSERT INTO aios.document_chunks (id, document_id, chunk_index, content, embedding, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            c.id,
            c.document_id,
            c.chunk_index,
            c.content,
            JSON.stringify(c.embedding),
            JSON.stringify(c.metadata),
            c.created_at,
          ]
        );
      }
    } else {
      const mem = db.driver as MemoryDatabaseDriver;
      mem.getTable('documents').set(doc.id, doc);
      for (const c of chunks) {
        mem.getTable('document_chunks').set(c.id, c);
      }
    }

    return { document: doc, chunks, deduplicated: false };
  }

  /**
   * RAG Vector search strictly isolated by organization_id
   */
  async searchSimilar(
    organization_id: string,
    query: string,
    topK: number = 3,
    similarityThreshold: number = 0.0
  ): Promise<DocumentChunk[]> {
    const queryVec = await embeddingProvider.embed(query);

    if (db.isPostgres) {
      try {
        const res = await db.driver.query<DocumentChunk>(
          `SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.metadata, dc.created_at,
                  1 - (dc.embedding <=> $1::vector) as similarity
           FROM aios.document_chunks dc
           JOIN aios.documents d ON dc.document_id = d.id
           JOIN aios.knowledge_sources ks ON d.source_id = ks.id
           WHERE ks.organization_id = $2
             AND (1 - (dc.embedding <=> $1::vector)) >= $4
           ORDER BY dc.embedding <=> $1::vector
           LIMIT $3`,
          [JSON.stringify(queryVec), organization_id, topK, similarityThreshold]
        );

        await auditService.log({
          organization_id,
          event_type: 'knowledge.retrieved',
          actor_type: 'SYSTEM',
          actor_id: 'system:knowledge_layer',
          target_type: 'query',
          target_id: query.slice(0, 50),
          payload: { topK, results_count: res.rows.length },
        });

        return res.rows;
      } catch (err: any) {
        console.warn('[KnowledgeService] PostgreSQL vector search failed, falling back:', err.message);
      }
    }

    // In-Memory Driver Retrieval with Tenant Isolation
    const mem = db.driver as MemoryDatabaseDriver;
    const allSources = Array.from(mem.getTable('knowledge_sources').values()) as KnowledgeSource[];
    const orgSourceIds = new Set(allSources.filter((s) => s.organization_id === organization_id).map((s) => s.id));

    const allDocs = Array.from(mem.getTable('documents').values()) as Document[];
    const orgDocIds = new Set(allDocs.filter((d) => orgSourceIds.has(d.source_id)).map((d) => d.id));

    const allChunks = Array.from(mem.getTable('document_chunks').values()) as DocumentChunk[];
    const orgChunks = allChunks.filter((c) => orgDocIds.has(c.document_id));

    const scored = orgChunks
      .map((c) => ({
        ...c,
        similarity: c.embedding ? embeddingProvider.cosineSimilarity(queryVec, c.embedding) : 0,
      }))
      .filter((c) => (c.similarity || 0) >= similarityThreshold)
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
