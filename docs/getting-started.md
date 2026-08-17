# Guia de Início Rápido (Getting Started)

Este guia ensina como inicializar uma nova instância de empresa usando o template AiOS.

---

## 1. Inicializando o Ambiente

Copie o `.env.example` para `.env`:
```bash
cp .env.example .env
```

Suba os serviços principais via Docker Compose:
```bash
docker compose up -d --build
```

---

## 2. Primeiro Acesso e Setup Wizard

1. Acesse o Control Center em **http://localhost:8080**.
2. Preencha o formulário do **Setup Wizard**:
   - **Nome da Empresa**: Razão social ou nome fantasia.
   - **Conta do Administrador**: Seu e-mail e senha segura.
   - **Provedor de IA**: OpenAI, Anthropic, Ollama, Hermes, etc.
3. Clique em **Finalizar Configuração e Inicializar AiOS**.
4. O sistema irá criar a organização, registrar os agentes padrão, importar as skills e o workflow de demonstração.

---

## 3. Disparando o Primeiro Workflow

No topo do Control Center, clique no botão:
`⚡ Executar Workflow Universal Demo`

Isso simula o envio de uma fatura corporativa de R$ 48.000,00:
1. O pipeline identificará o processo e selecionará o **Finance Agent**.
2. O **Policy Engine** detectará que o valor ultrapassa o limite de auto-aprovação de R$ 10.000,00.
3. O workflow entrará em estado `WAITING_APPROVAL` (Pausado).
4. Navegue até a aba **Fila de Aprovações** e clique em **✅ APROVAR**.
5. O workflow será retomado automaticamente, executando os efeitos colaterais e gravando o log de auditoria.
