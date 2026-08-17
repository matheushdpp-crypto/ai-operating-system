# Human-in-the-Loop & Central de Aprovações

O AiOS implementa o conceito de que **a autonomia da IA termina onde o risco empresarial começa**.

## Ciclo de Vida de uma Aprovação

```mermaid
stateDiagram-v2
    [*] --> PENDING: Policy Engine (HUMAN_REQUIRED)
    PENDING --> APPROVED: Operador Clica 'APROVAR'
    PENDING --> REJECTED: Operador Clica 'REJEITAR'
    PENDING --> CHANGES_REQUESTED: Operador Solicita Ajuste
    PENDING --> TAKEN_OVER: Operador Assume e Edita Parâmetros

    APPROVED --> [*]: Workflow Resumido
    TAKEN_OVER --> [*]: Workflow Resumido com Payload Customizado
    REJECTED --> [*]: Workflow Encerrado com Falha Controlada
```

## Ações do Operador Humano no Control Center
- **APROVAR (Approve)**: Libera o workflow exatamente como planejado pelo agente.
- **REJEITAR (Reject)**: Cancela a execução e registra o motivo para auditoria.
- **SOLICITAR AJUSTES (Request Changes)**: Devolve para o agente com observações.
- **ASSUMIR MANUALMENTE (Take Over)**: Permite ao humano sobrescrever os parâmetros da ação antes de disparar o efeito colateral.
