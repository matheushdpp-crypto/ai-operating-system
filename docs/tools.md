# Tools e Integrações MCP

Os agentes interagem com o mundo externo através de abstrações de ferramentas (Tools) e servidores compatíveis com o **Model Context Protocol (MCP)**.

## Tipos de Tools Suportados

- `CRM`: Operações sobre Salesforce, HubSpot, RD Station.
- `ERP`: Lançamento e consulta de faturas em SAP, Oracle, TOTVS.
- `EMAIL`: Envio e leitura de comunicações.
- `CALENDAR`: Agendamento e checagem de disponibilidade.
- `MESSAGING`: Slack, Microsoft Teams, WhatsApp.
- `STORAGE`: MinIO / AWS S3 para leitura e gravação de arquivos.
- `DATABASE`: Consultas SQL controladas.
- `BROWSER`: Automação e extração web.
- `MCP`: Ferramentas expostas dinamicamente via servidores MCP padronizados.

O agente sempre enxerga uma capacidade (`capability`), e nunca chaves de API diretas ou detalhes de infraestrutura.
