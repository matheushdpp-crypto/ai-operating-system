# Workflows e Integração com n8n

O AiOS possui um modelo híbrido de workflows:

1. **State Machine Interno do AiOS**: Executa nativamente o Pipeline Universal de 12 Etapas, gerenciando pausas, aprovações e registros de auditoria com consistência ACID.
2. **n8n Automation Engine**: Utilizado como conector de baixo código para sistemas externos, webhooks de entrada, disparos agendados e integrações complexas.

## Comunicação AiOS <-> n8n

- **Trigger via n8n**: O n8n recebe um evento externo (ex: e-mail com anexo, webhook de CRM) e faz uma chamada POST para `/api/v1/workflows/:slug/trigger`.
- **Callback para n8n**: Quando o workflow é concluído ou aprovado no AiOS, um webhook é enviado de volta para o n8n para dar continuidade aos fluxos legados da empresa.
