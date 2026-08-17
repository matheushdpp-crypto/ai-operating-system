#!/usr/bin/env bash

# ==============================================================================
# AiOS Health Check Script
# ==============================================================================

echo "🔍 Verificando integridade da infraestrutura AiOS..."

if command -v curl &> /dev/null; then
    echo -n "AiOS API: "
    curl -s http://localhost:3000/api/v1/health | grep -q "OK" && echo "✅ ONLINE" || echo "❌ OFFLINE"

    echo -n "Control Center: "
    curl -s -I http://localhost:8080 | grep -q "200 OK" && echo "✅ ONLINE" || echo "❌ OFFLINE"

    echo -n "n8n Engine: "
    curl -s -I http://localhost:5678 | grep -q "n8n" && echo "✅ ONLINE" || echo "⚠️ STANDBY"
else
    echo "curl não disponível para checagem direta."
fi
