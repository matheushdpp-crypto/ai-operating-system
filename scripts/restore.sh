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

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "❌ Arquivo não encontrado: ${BACKUP_FILE}"
    exit 1
fi

echo "⚠️ Restaurando banco de dados a partir de ${BACKUP_FILE}..."
gunzip -c "${BACKUP_FILE}" | docker compose exec -T postgres psql -U aios_admin aios_platform

echo "✅ Restauração concluída com sucesso."
