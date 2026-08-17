# ==============================================================================
# AiOS Health Check PowerShell Script
# ==============================================================================

Write-Host "Verificando integridade dos servicos do AiOS..." -ForegroundColor Cyan

try {
    $api = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/health" -Method Get -TimeoutSec 3
    if ($api.status -eq "OK") {
        Write-Host "AiOS API: ONLINE ($($api.platform))" -ForegroundColor Green
    }
} catch {
    Write-Host "AiOS API: OFFLINE (Certifique-se de que a API esta rodando na porta 3000)" -ForegroundColor Red
}

try {
    $ui = Invoke-WebRequest -Uri "http://localhost:8080" -Method Get -TimeoutSec 3
    if ($ui.StatusCode -eq 200) {
        Write-Host "Control Center: ONLINE (http://localhost:8080)" -ForegroundColor Green
    }
} catch {
    Write-Host "Control Center: OFFLINE" -ForegroundColor Red
}
