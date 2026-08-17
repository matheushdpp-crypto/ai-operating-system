# Troubleshooting e Diagnóstico

Guia de resolução de problemas comuns na operação do AiOS.

---

## 1. Falha na Conexão com o Banco de Dados

**Sintoma:** Log exibe `PostgreSQL not reachable at configured host`.  
**Resolução:**
1. Verifique se o container postgres está ativo: `docker compose ps`.
2. Verifique os logs do PostgreSQL: `docker compose logs -f postgres`.
3. Certifique-se de que a porta 5432 não está em uso por outro serviço local.

---

## 2. Aprovação Não Retoma o Workflow

**Sintoma:** O operador clica em Aprovar, mas o workflow continua como `WAITING_APPROVAL`.  
**Resolução:**
1. Verifique a tela de **Logs de Auditoria** para confirmar se o evento `approval.approved` foi registrado.
2. Certifique-se de que o backend da API está rodando e conectado ao banco.

---

## 3. Comandos Úteis de Diagnóstico

```bash
# Checagem de integridade via CLI
node ./bin/aios.js health

# Visualizar logs em tempo real
docker compose logs -f --tail=50

# Reiniciar todos os containers
docker compose restart
```
