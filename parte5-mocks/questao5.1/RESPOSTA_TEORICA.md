# Questão 5.1 – Mocks de APIs Externas (teórica)

Contexto: integração com marketplaces (Mercado Livre, Amazon) para publicar produtos, atualizar preço, processar pedidos e atualizar estoque.

## 5.1.a) Testar sem afetar os ambientes reais

O primeiro passo é **não assumir que todo marketplace tem sandbox**. Cada um funciona de um jeito:

- **Mercado Livre:** a documentação de testes descreve o uso de **usuários de teste** criados com o token da conta (informando o país/site, ex.: Brasil), e **não encontrei menção a uma URL de sandbox separada**: o teste acontece na própria plataforma. Cria-se ao menos um vendedor e um comprador de teste. Regras da documentação: **até 10 usuários de teste por conta**; usuários **sem atividade (comprar, perguntar, publicar) por 60 dias são removidos**; eles **só compram, vendem e perguntam em itens de teste**, que são removidos periodicamente; e os anúncios de teste devem ficar na categoria "Others", nunca em "gold"/"gold_premium" (para não aparecerem na home). Por isso o **setup dos usuários de teste precisa ser automatizado e recriável**, e não manual.
- **Amazon (SP-API):** oferece um endpoint de **sandbox** com respostas simuladas para um conjunto de operações. Serve para validar o formato de requisição e de resposta, mas não reproduz o comportamento real (estoque, filas, limites).

**Consequência prática:** como o teste do Mercado Livre acontece na própria plataforma, com contas de teste (e não em um ambiente isolado, até onde a documentação indica), um bug nosso (loop de publicação, preço errado, excesso de chamadas) ainda consome **rate limit real** e pode bloquear a aplicação. Por isso:

- **Mocks em todo PR/CI**, para o dia a dia e para os cenários de falha (ver 5.1.b e 5.1.c).
- **Contas de teste reais só em poucos smoke tests**, controlados e periódicos, para confirmar que os mocks ainda representam a API.
- **Aplicação separada no DevCenter** para homologação (apontando para `localhost` ou staging), vinculada **apenas** aos usuários de teste, com credenciais próprias guardadas em *secrets* do CI.
- **Guardrails:** configuração por ambiente, *allowlist* de hosts, e credenciais de produção que nunca existem no CI.
- **Higiene de dados:** tudo que for criado em teste (anúncios, pedidos) usa um prefixo identificável e é limpo ao final; respeito aos limites de requisições mesmo nas contas de teste.

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
| **429** | Mock responde `429` (a documentação cita `local_rate_limited`: "muitas chamadas, tente de novo em alguns segundos") com `Retry-After` | Respeita o `Retry-After` (sem *retry* imediato), aplica *throttling*/fila, prioriza operações críticas (pedidos antes de atualização de preço), registra métrica |
| **401 (token expirado)** | Mock responde `401` quando o `access_token` expira. A documentação fala em 6 h, mas o exemplo de resposta traz `expires_in: 10800` (3 h); por isso o código deve usar o **`expires_in` da resposta**, e não um valor fixo. O `refresh_token` é de **uso único** (cada renovação devolve um novo) e vale 6 meses | Renova o token e repete a requisição **uma única vez** (sem loop). Guarda o **novo `refresh_token` antes** de usar o novo `access_token`; evita renovações **concorrentes** (*single-flight*), porque reutilizar o refresh antigo gera `invalid_grant` (400). Se o refresh for recusado, falha com erro claro e exige nova autorização |
| **403 (permissão/política)** | Mock responde `403` (`forbidden`) quando a requisição não é autorizada para o recurso, por exemplo usando o token de outro usuário. Há também relatos de `403` em buscas públicas de anúncios | Distingue **403 de permissão** (não faz *retry*, gera alerta e mensagem clara) de **429** (faz *retry* com *backoff*); não trata como falha transitória algo que nunca vai passar |

## 5.1.d) Validação de payload (schema validation)

- Uso **JSON Schema/OpenAPI** (Ajv, Zod, ou ferramentas como Schemathesis) para validar o que **enviamos** (no mock, comparando o request recebido com o schema) e o que **esperamos receber**.
- **Onde entra no pipeline:** rápido, na etapa de testes de integração de cada PR (contra o mock) e, de forma periódica (ex.: noturna), contra o **sandbox real** para detectar *drift* (a API mudou e nosso mock ficou desatualizado).
- Schemas versionados no repositório; rigorosos em campos obrigatórios e tipos, e **tolerantes a campos extras** (*tolerant reader*), para não quebrar com evoluções compatíveis da API.

## 5.1.e) Mock vs. contract testing

- **Mock:** testa o *nosso código* contra uma **suposição** sobre a API. É rápido e determinístico, ótimo para cenários de falha, mas se a API real mudar o mock continua "verde" (falso positivo).
- **Contract testing:** verifica que a suposição **coincide com a realidade** (ou que consumidor e provedor concordam). O contrato consumer-driven (Pact) brilha entre serviços **que a gente controla** (front ↔ API própria, microsserviços).
- **Com Mercado Livre/Amazon**, não controlamos o provedor, então um Pact bilateral é inviável. A abordagem prática é: **mocks** para comportamento e falhas (em todo PR) + **verificação de schema/contrato contra o sandbox ou a especificação oficial** (periódica) para detectar *drift* + **poucos smoke tests reais** em sandbox. Os mocks dão velocidade e cobertura de falhas, e a verificação de contrato dá confiança de que eles ainda representam a API real.
