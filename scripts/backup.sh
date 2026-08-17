#!/usr/bin/env bash

# ==============================================================================
# AiOS Backup Script
# ==============================================================================
set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/aios_backup_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "📦 Iniciando backup dos dados do AiOS..."
docker compose exec -T postgres pg_dump -U aios_admin aios_platform | gzip > "${BACKUP_FILE}"

echo "✅ Backup concluído com sucesso: ${BACKUP_FILE}"
