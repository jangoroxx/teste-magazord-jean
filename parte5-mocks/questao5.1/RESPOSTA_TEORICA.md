# Questão 5.1 – Mocks de APIs Externas (teórica)

Contexto: integração com marketplaces (Mercado Livre, Amazon) para publicar produtos, atualizar preço, processar pedidos e atualizar estoque.

## 5.1.a) Testar sem afetar os ambientes reais

- **Sandbox/homologação e contas de teste** dos marketplaces, quando disponíveis (usuários de teste, endpoints de sandbox), com credenciais separadas das de produção.
- **Guardrails:** configuração por ambiente e uma *allowlist* de hosts que **bloqueia chamadas a domínios de produção** a partir de testes; credenciais de produção nunca existem no CI.
- **Mocks no dia a dia** (PR/CI) e sandbox real só em verificações periódicas.
- **Higiene de dados:** tudo que for criado em sandbox (anúncios, pedidos) é identificado por prefixo e limpo ao final; respeito aos *rate limits* mesmo em sandbox.

## 5.1.b) Estratégia de mock e ferramentas

Combino camadas:

- **Unidade:** *stubs/fakes* da interface do cliente do marketplace.
- **Integração:** um **servidor de mock** que o sistema chama de verdade por HTTP, apontando a URL base do marketplace para ele.

Ferramentas:
- **WireMock:** independente de linguagem, roda em Docker, tem cenários com estado, atrasos e injeção de falhas (timeout, conexão cortada). É a minha escolha para integração de backend e pipelines.
- **MSW:** intercepta requisições dentro do processo (Node/navegador). Ótimo para testes JS/E2E do front, mas não substitui um mock de rede para um backend em outra linguagem.
- **JSON Server:** rápido para protótipos e CRUD simples, mas fraco para falhas, estado complexo e fidelidade ao contrato.
- **Mockoon/Prism:** úteis quando já existe uma especificação OpenAPI, para gerar o mock a partir dela.

Para ganhar fidelidade, gravo respostas reais do sandbox (*record/replay*), versiono os *stubs* e os revisito quando o marketplace mudar.

## 5.1.c) Simulação de erro 500, timeout e 429

| Cenário | Como simular | O que o sistema deve fazer / o que valido |
|---|---|---|
| **500** | Mock responde `500` (de forma intermitente e permanente) | *Retry* com *backoff* exponencial e *jitter*, limite de tentativas, **idempotência** (não duplica pedido/anúncio), estado final consistente, log e alerta |
| **Timeout** | Mock com atraso maior que o timeout do cliente | Timeout configurado e respeitado, cancelamento da requisição, *retry* seguro, *circuit breaker* quando a falha persiste, fila não fica bloqueada, mensagem/status coerente para o usuário |
| **429** | Mock responde `429` com `Retry-After` | Respeita o `Retry-After` (sem *retry* imediato), aplica *throttling*/fila, prioriza operações críticas (pedidos antes de atualização de preço), registra métrica |

## 5.1.d) Validação de payload (schema validation)

- Uso **JSON Schema/OpenAPI** (Ajv, Zod, ou ferramentas como Schemathesis) para validar o que **enviamos** (no mock, comparando o request recebido com o schema) e o que **esperamos receber**.
- **Onde entra no pipeline:** rápido, na etapa de testes de integração de cada PR (contra o mock) e, de forma periódica (ex.: noturna), contra o **sandbox real** para detectar *drift* (a API mudou e nosso mock ficou desatualizado).
- Schemas versionados no repositório; rigorosos em campos obrigatórios e tipos, e **tolerantes a campos extras** (*tolerant reader*), para não quebrar com evoluções compatíveis da API.

## 5.1.e) Mock vs. contract testing

- **Mock:** testa o *nosso código* contra uma **suposição** sobre a API. É rápido e determinístico, ótimo para cenários de falha, mas se a API real mudar o mock continua "verde" (falso positivo).
- **Contract testing:** verifica que a suposição **coincide com a realidade** (ou que consumidor e provedor concordam). O contrato consumer-driven (Pact) brilha entre serviços **que a gente controla** (front ↔ API própria, microsserviços).
- **Com Mercado Livre/Amazon**, não controlamos o provedor, então um Pact bilateral é inviável. A abordagem prática é: **mocks** para comportamento e falhas (em todo PR) + **verificação de schema/contrato contra o sandbox ou a especificação oficial** (periódica) para detectar *drift* + **poucos smoke tests reais** em sandbox. Os mocks dão velocidade e cobertura de falhas, e a verificação de contrato dá confiança de que eles ainda representam a API real.
