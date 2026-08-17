# Agentes e Job Descriptions

No AiOS, cada **Agent** representa uma entidade com responsabilidade estrita dentro da organização.

## Modelo de Dados do Agente

```json
{
  "id": "uuid",
  "organization_id": "uuid",
  "name": "Finance & Compliance Agent",
  "role": "Finance Agent",
  "job_description": "Responsável por validação de notas fiscais, conferência de impostos e lançamento de pagamentos no ERP.",
  "runtime": "native",
  "status": "ACTIVE",
  "permissions": ["erp:query", "finance:validate"],
  "approval_limits": {
    "max_auto_approval_amount": 10000,
    "currency": "BRL"
  },
  "knowledge_scopes": ["financial_sop", "tax_rules"],
  "skills": ["validate-invoice", "notify-stakeholder"]
}
```

O **Job Description** define a autoridade e os limites operacionais do agente. Agentes não devem assumir funções fora de seu escopo designado.
