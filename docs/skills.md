# Biblioteca de Skills Declarativas (SKILL.md)

As **Skills** no AiOS são pequenos artefatos modulares e versionáveis que ensinam **COMO** executar uma tarefa específica.

## Estrutura Padrão de uma `SKILL.md`

```markdown
---
name: Nome da Skill
slug: slug-unico
version: 1.0.0
description: Descrição curta do objetivo da skill.
purpose: Por que esta skill existe e qual valor ela gera.
when_to_use:
  - Condições em que a skill deve ser acionada.
when_not_to_use:
  - Casos em que a skill NÃO deve ser usada.
inputs:
  campo1: string
  campo2: number
outputs:
  resultado: object
tools:
  - ERP
  - Database
knowledge:
  - Politica Financeira SOP
is_shared: true
---

# Nome da Skill

## Instructions
1. Passo 1 da execução.
2. Passo 2 da execução.
3. Validação dos resultados.
```

O AiOS analisa o frontmatter YAML e o corpo Markdown automaticamente através do `SkillParser`, disponibilizando as capacidades para os agentes autorizados.
