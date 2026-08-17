# Arquitetura do AI Operating System (AiOS)

O AiOS é estruturado sob o princípio da **separação estrita de responsabilidades**:

| Conceito | Responsabilidade | Tecnologia / Componente |
| :--- | :--- | :--- |
| **Agent** | **QUEM** executa a tarefa | Agent Service / Agent Model |
| **Skill** | **COMO** executar a tarefa | Skill Registry / formato `SKILL.md` |
| **Tool** | **COM O QUÊ** o agente interage | Tool Abstraction / Protocolo MCP |
| **Workflow** | **QUANDO / EM QUE ORDEM** as coisas acontecem | Workflow Engine / n8n |
| **Knowledge** | **O QUE** o agente precisa saber | Knowledge Layer / `pgvector` |
| **Memory** | **O QUE** precisa ser lembrado persistentemente | Memory Layer / `MemoryEntry` |
| **State** | **QUAL É O ESTADO OFICIAL** do processo | PostgreSQL Primary DB |
| **Policy** | **O QUE** o agente pode ou não fazer | Deterministic Policy Engine |
| **Human Approval** | **ONDE** a autonomia da IA termina | Approval Hub (Human-in-the-loop) |
| **Audit** | **O QUE ACONTECEU** durante a execução | Audit Service / Logs Imutáveis |
| **Control Center** | **INTERFACE HUMANA** de gestão | Frontend SPA Vanilla CSS |

---

## 1. Roteamento: Determinístico Primeiro, Agente Orquestrador Depois

Decisões de roteamento são resolvidas por configuração de padrões conhecidos antes de gastar recursos de LLM:
- Requisição com tipo `invoice_validation` -> Roteamento determinístico direto para o **Finance Agent**.
- Requisição com tipo `lead_qualification` -> Roteamento determinístico direto para o **Sales Agent**.
- Se a tarefa for ambígua ou inédita -> O **Agente Orquestrador** é acionado para inferir o domínio e delegar.

---

## 2. Camada de Runtime Desacoplada (`AgentRuntimeAdapter`)

O núcleo da plataforma não é acoplado a nenhum framework proprietário. Uma interface modular (`AgentRuntimeAdapter`) permite plugar:
- **Native Runtime**: Execução direta via API LLM configurada com fallback determinístico.
- **Hermes Adapter**: Conector HTTP para o runtime Hermes.
- **OpenClaw Adapter**: Conector para o runtime OpenClaw.
- **Custom Adapters**: Runtimes proprietários em Python, Go ou Rust.
