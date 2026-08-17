# Segurança, Autenticação e RBAC

O AiOS foi projetado para operações empresariais seguras com isolamento por organização (*multi-tenant boundary*).

## Funções de Usuário (RBAC)

1. **ADMIN**: Controle total sobre a organização, criação de agentes, políticas, permissões e aprovações de alto nível.
2. **OPERATOR**: Execução e acompanhamento de workflows, tomada de decisão na fila de aprovações.
3. **VIEWER**: Visualização de relatórios, dashboards e logs de auditoria (somente leitura).

## Regras de Segurança
- **Zero Secrets no Código**: Chaves de API nunca são armazenadas no banco em texto puro ou commitadas no Git.
- **Sanitização de Auditoria**: Tokens, chaves e senhas são automaticamente substituídos por `[REDACTED]` antes de serem gravados nos logs de auditoria.
- **Isolamento Organizacional**: Todas as consultas e operações filtram estritamente por `organization_id`.
