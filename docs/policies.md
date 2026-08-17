# Políticas Determinísticas de Governança

Diferente de abordagens frágeis baseadas puramente em prompts de LLM, o **Policy Engine** do AiOS aplica regras determinísticas na camada de infraestrutura.

## Formato de Regras de Política

Cada política avalia parâmetros contra operadores (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `contains`):

```json
{
  "name": "Limite Financeiro de Compras",
  "scope": "financial",
  "rules": [
    {
      "id": "rule_spending_10k",
      "name": "Alçada Superior a R$ 10.000",
      "condition": {
        "field": "amount",
        "operator": "gt",
        "value": 10000
      },
      "decision": "HUMAN_REQUIRED",
      "reason": "Valor acima do limite automático. Exige aprovação de um operador humano.",
      "suggested_approver_role": "ADMIN"
    }
  ]
}
```

### Decisões Possíveis
- `ALLOW`: Ação permitida para execução autônoma imediata.
- `DENY`: Ação terminantemente proibida. O workflow falha com erro de conformidade.
- `HUMAN_REQUIRED`: Ação pausada até que um humano revise e assine digitalmente a liberação.
