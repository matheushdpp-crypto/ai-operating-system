import { config } from '../../config/env.js';
import { AIProviderFactory } from '../runtime/ai.provider.js';

export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  cosineSimilarity(a: number[], b: number[]): number;
}

export class DefaultEmbeddingProvider implements IEmbeddingProvider {
  private static instance: DefaultEmbeddingProvider;

  public static getInstance(): DefaultEmbeddingProvider {
    if (!DefaultEmbeddingProvider.instance) {
      DefaultEmbeddingProvider.instance = new DefaultEmbeddingProvider();
    }
    return DefaultEmbeddingProvider.instance;
  }

  async embed(text: string): Promise<number[]> {
    const aiProvider = AIProviderFactory.getProvider();
    return aiProvider.generateEmbedding(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const vec = await this.embed(text);
      results.push(vec);
    }
    return results;
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const embeddingProvider = DefaultEmbeddingProvider.getInstance();
