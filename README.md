# Teste Coordenador de Qualidade – Jean Carlos da Conceição de Souza

## Tecnologias Utilizadas
- Node.js v18+
- Playwright (`@playwright/test`) – API e E2E
- @faker-js/faker (v8, locale pt_BR) – dados dinâmicos
- JavaScript (CommonJS), seguindo os nomes de arquivo pedidos no enunciado

## Instalação

```bash
npm install
```
O `npm install` já baixa o Chromium automaticamente (script `postinstall`). Se o download falhar
(rede corporativa, por exemplo), rode manualmente: `npx playwright install chromium`.

## Execução dos Testes

### Todos os testes
```bash
npm test
```

### Por parte
```bash
npm run test:parte1   # API (GitHub rate limit + token ReqRes)
npm run test:parte2   # E2E (checkout SauceDemo)
npm run test:parte3   # Arquivos (upload de CSV)
# Partes 4 e 5 são teóricas, sem script de execução
```

### Somente testes sem rede/navegador (mock e unitários)
```bash
npm run test:unit
```

### Variáveis de ambiente opcionais
| Variável | Para quê |
|---|---|
| `GITHUB_TOKEN` | usa o limite autenticado (5000/h) na GitHub API |
| `REQRES_API_KEY` | enviada como `x-api-key`; necessária para o teste de requisição autenticada no ReqRes (sem ela, o teste é pulado) |

## Estrutura do Projeto

```
├── README.md
├── package.json
├── playwright.config.js          # 1 projeto Playwright por parte prática
├── casos-de-teste/               # casos de teste de cada parte prática (TXT)
├── parte1-api/questao1.1/
│   ├── RESPOSTA_TEORICA.md
│   └── testes/{api.spec.js, utils/api-helper.js}
├── parte2-e2e/questao2.1/
│   ├── RESPOSTA_TEORICA.md
│   └── testes/{checkout-flow.spec.js, pages/checkout-page.js, fixtures/checkout-data.js}
├── parte3-arquivos/questao3.1/
│   ├── RESPOSTA_TEORICA.md
│   └── testes/{csv-upload.spec.js, utils/csv-generator.js, fixtures/*.csv}
├── parte4-mobile/questao4.1/RESPOSTA_TEORICA.md   # teórica
└── parte5-mocks/questao5.1/RESPOSTA_TEORICA.md    # teórica
```

## Observações

**Decisões técnicas**
- **Parte 1:** as chamadas reais cobrem o contrato dos headers. O estado de "limite esgotado" e a expiração do token são simulados (testes `[mock]`), por serem determinísticos e por não ser seguro esgotar o limite real (afeta o IP/CI). O relógio do `TokenManager` é injetável para simular os 2 minutos de TTL sem esperar. O ReqRes devolve um token fixo que não expira de verdade, por isso a expiração é simulada.
- **Parte 2:** o SauceDemo não tem cupom nem pagamento; a questão do cupom é respondida na teoria e o prático usa dados dinâmicos, Page Object e limpeza de estado após cada teste.
- **Parte 3:** o site `the-internet.herokuapp.com/upload` aceita qualquer arquivo. Nos cenários inválidos o conteúdo é reprovado por um validador próprio e o teste verifica que o site aceita o upload ("File Uploaded!"), sem simular uma rejeição que ele não faz.

**Comportamentos e correções encontrados na execução (23/11/2026)**
- **ReqRes:** sem `x-api-key`, o login e o `GET /api/users/2` respondem 200, mas o mesmo GET com `Authorization: Bearer` responde 401 `missing_api_key`. O teste de requisição autenticada foi mantido com todas as asserções e roda somente com `REQRES_API_KEY` definida (sem ela, é pulado). Um novo teste, executado sem chave, verifica o login, o reuso do token e esse 401. O caminho com chave não foi executado nesta data.
- **`corrupted.csv`:** o arquivo continha sequências de escape como texto (`\x00\xff...`) em vez de bytes binários, e por isso era reprovado pelo cabeçalho, e não como corrompido. O fixture foi regravado com os bytes reais; a asserção e o validador não mudaram.

**Ajustes da revisão (24/11/2026)**
- **Parte 1:** com `REQRES_API_KEY` definida, falha de login agora reprova o teste (antes era pulado). Um 401 atrasado não provoca segunda renovação; isso depende de o servidor devolver um token diferente a cada login, o que o ReqRes não faz.
- **Parte 1:** a comparação do `remaining` só vale dentro da mesma janela (`reset` igual).
- **Parte 3:** nos arquivos inválidos, o teste exige o "File Uploaded!" observado; antes aceitava qualquer título, inclusive de página de erro.

**Com mais tempo eu faria**
- Backoff no cliente da Parte 1 (hoje só há a detecção do limite e o cálculo da espera).
- Pipeline de CI (GitHub Actions) rodando as 3 partes e publicando o relatório HTML.
- Tag `@slow` para o teste de exaustão real do rate limit, em ambiente próprio.
- Testes de contrato (schema) para as respostas das APIs.

**Uso de IA:** utilizei ferramentas de IA como apoio na construção e na revisão deste material, com validação técnica e execução dos testes por mim.
