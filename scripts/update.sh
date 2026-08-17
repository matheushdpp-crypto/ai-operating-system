#!/usr/bin/env bash

# ==============================================================================
# AiOS Update Script
# ==============================================================================
set -e

echo "🔄 Atualizando AiOS para a versão mais recente..."
git pull origin main
docker compose down
docker compose up -d --build
echo "✅ Atualização concluída com sucesso."
