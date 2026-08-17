# Camada de Conhecimento (Knowledge) & pgvector

O AiOS separa categoricamente:
- **Knowledge**: Informações documentais estáticas ou semi-estáticas (SOPs, manuais, políticas, legislação).
- **Memory**: Fatos persistentes aprendidos sobre clientes ou preferências do usuário.
- **State**: O estado operacional atual de uma tarefa ou workflow.

## Pipeline de Ingestão e RAG

```mermaid
graph LR
    SOURCE[Documento/SOP] --> CHUNK[Chunking em Blocos]
    CHUNK --> EMBED[Geração de Embeddings]
    EMBED --> PGV[(PostgreSQL + pgvector)]
    QUERY[Consulta do Agente] --> RETRIEVE[Busca por Similaridade Cosine Distance]
    RETRIEVE --> AGENT[Contexto Injetado no Agente]
```

A busca semântica é realizada diretamente no PostgreSQL com indexação HNSW em vetores de 1536 dimensões (`vector_cosine_ops`).
