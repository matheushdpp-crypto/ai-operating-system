# Configuração de Ambiente (.env)

O AiOS separa rigorosamente as variáveis de configuração em blocos funcionais:

```ini
# 1. PLATFORM
NODE_ENV=development
API_PORT=3000
CONTROL_CENTER_PORT=8080

# 2. DATABASE
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=aios_admin
DATABASE_PASSWORD=aios_secure_password_change_me
DATABASE_NAME=aios_platform

# 3. N8N
N8N_BASE_URL=http://localhost:5678
N8N_WEBHOOK_URL=http://localhost:5678/webhook

# 4. AI & RUNTIMES
AI_DEFAULT_PROVIDER=openai
AI_DEFAULT_MODEL=gpt-4o-mini
AI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_KEY=sua_chave_aqui
ANTHROPIC_API_KEY=
HERMES_API_URL=http://localhost:8000
OPENCLAW_API_URL=http://localhost:8001

# 5. STORAGE
STORAGE_PROVIDER=local
STORAGE_LOCAL_PATH=./storage_data
```
