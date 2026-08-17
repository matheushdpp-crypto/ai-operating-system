#!/usr/bin/env bash

# ==============================================================================
# AiOS Backup Script
# ==============================================================================
set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/aios_backup_${TIMESTAMP}.sql.gz"
DB_USER="${DATABASE_USER:-aios_admin}"
DB_NAME="${DATABASE_NAME:-aios_platform}"

mkdir -p "${BACKUP_DIR}"

echo "📦 Iniciando backup dos dados do AiOS (PostgreSQL)..."
docker compose exec -T postgres pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${BACKUP_FILE}"

echo "✅ Backup concluído com sucesso: ${BACKUP_FILE}"
echo "💡 Para backup do Storage/MinIO, utilize replicação S3 ou cópia do volume 'storage_data'."
