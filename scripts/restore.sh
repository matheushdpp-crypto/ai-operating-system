#!/usr/bin/env bash

# ==============================================================================
# AiOS Restore Script
# ==============================================================================
set -e

if [ -z "$1" ]; then
    echo "Uso: ./scripts/restore.sh <caminho_do_arquivo_backup.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"
DB_USER="${DATABASE_USER:-aios_admin}"
DB_NAME="${DATABASE_NAME:-aios_platform}"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "❌ Arquivo não encontrado: ${BACKUP_FILE}"
    exit 1
fi

echo "⚠️ Restaurando banco de dados a partir de ${BACKUP_FILE}..."
gunzip -c "${BACKUP_FILE}" | docker compose exec -T postgres psql -U "${DB_USER}" "${DB_NAME}"

echo "✅ Restauração concluída com sucesso."
