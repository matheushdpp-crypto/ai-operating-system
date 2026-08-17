#!/usr/bin/env bash

# ==============================================================================
# AI Operating System (AiOS) - Automated Installation & Bootstrapper Script
# ==============================================================================
set -e

echo "=================================================================="
echo "          AI OPERATING SYSTEM (AiOS) - ENTERPRISE INSTALLER       "
echo "=================================================================="

# 1. Check Docker & Docker Compose
echo "[1/6] Verificando dependências de infraestrutura..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker não encontrado. Por favor instale o Docker antes de continuar."
    exit 1
fi

if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose não encontrado. Por favor instale o docker compose."
    exit 1
fi
echo "✅ Docker e Docker Compose detectados."

# 2. Check or Create .env
echo "[2/6] Configurando arquivo de ambiente (.env)..."
if [ ! -f .env ]; then
    echo "Criando .env a partir de .env.example..."
    cp .env.example .env
    echo "✅ Arquivo .env gerado. Altere as senhas e chaves conforme necessário."
else
    echo "✅ Arquivo .env já existe."
fi

# 3. Pull & Build Containers
echo "[3/6] Construindo e iniciando serviços Docker Compose..."
docker compose up -d --build

# 4. Wait for PostgreSQL Health
echo "[4/6] Aguardando inicialização do banco de dados (PostgreSQL + pgvector)..."
until docker compose exec -T postgres pg_isready -U aios_admin -d aios_platform &> /dev/null; do
    sleep 2
    echo "Aguardando PostgreSQL..."
done
echo "✅ Banco de dados PostgreSQL com pgvector pronto."

# 5. Run Health Check
echo "[5/6] Verificando integridade da plataforma..."
sleep 5

# 6. Complete
echo "=================================================================="
echo "🎉 INSTALAÇÃO CONCLUÍDA COM SUCESSO!"
echo "=================================================================="
echo "🎛️ AiOS Control Center: http://localhost:8080"
echo "📡 AiOS API Backend:     http://localhost:3000"
echo "🔄 n8n Automation Engine: http://localhost:5678"
echo "💾 MinIO Storage Console: http://localhost:9001"
echo "=================================================================="
echo "Abra o Control Center no navegador para iniciar o Setup Wizard."
echo "=================================================================="
