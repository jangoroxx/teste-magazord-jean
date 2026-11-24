# Questão 1.1 – Rate Limiting e Autenticação com Token

## 1.1.a) Como estruturar os testes de rate limiting e o comportamento ao exceder o limite

Eu separo em três camadas, da mais barata para a mais cara:

1. **Contrato dos headers (chamada real, barata).** Valido que `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset` existem, são numéricos e coerentes (`0 ≤ remaining ≤ limit`, `reset` no futuro, `limit` = 60 sem autenticação e ≥ 5000 com token) e que `remaining` não aumenta entre duas chamadas seguidas.
2. **Comportamento no limite (determinístico, com mock/stub).** Esgotar o limite real da GitHub API é lento, instável e prejudica outros usuários do mesmo IP (inclusive o CI compartilhado). Por isso simulo a resposta `403` com `remaining = 0` (ou `429` com `Retry-After`) e valido a lógica do cliente: detecção correta do rate limit, diferenciando-o de um `403` por permissão (`remaining > 0`), cálculo da espera até o reset e uso de backoff em vez de retry imediato. No projeto, isso está nos testes marcados com `[mock]`.
3. **Exaustão real (opcional, isolada).** Um teste lento, marcado (ex.: `@slow`) e executado só em pipeline noturno, contra um ambiente próprio com limite baixo configurável e credencial dedicada. Valida o ciclo completo: estourar o limite, receber o erro, esperar a janela e voltar a ser atendido (com relógio controlado, para não esperar de verdade).

O que eu valido ao exceder o limite: status correto (`403`/`429`), corpo de erro padronizado, `Retry-After`/`Reset` coerentes, que o sistema não perde nem duplica operações, e que o limite é aplicado **por chave/IP** (um consumidor não afeta o outro).

## 1.1.b) Obter e reutilizar o token entre os testes

Implementei uma classe `TokenManager` (`utils/api-helper.js`) com cache em memória:

- `getToken()` só faz login se não houver token ou se ele estiver expirado (TTL controlado, `expiresAt`).
- **Single-flight:** se vários testes pedem o token ao mesmo tempo, compartilham a mesma Promise e fazem **um** login (evita estourar limite de login e flakiness).
- `authedGet()` monta o header `Authorization: Bearer <token>`.

Em um projeto maior, o mesmo princípio vira um `globalSetup` (autentica uma vez e persiste em arquivo, como o `storageState`) ou uma fixture com escopo de *worker* (`test.extend` com `scope: 'worker'`), para cada worker paralelo ter seu token sem logar a cada teste.

## 1.1.c) Detectar expiração e tratar o cenário

Combino duas estratégias:

- **Proativa:** o cliente guarda `expiresAt` (TTL) e renova **antes** de expirar, com uma margem de segurança (`safetyMs`).
- **Reativa:** se o servidor responde `401`, renova o token e repete a requisição **uma única vez**. Se a segunda tentativa também retornar `401`, o teste falha com mensagem clara (credencial inválida ≠ token expirado), sem entrar em loop.

Para testar sem esperar 2 minutos, o relógio é **injetável** (`now`): avanço o tempo no teste e verifico que o novo login acontece. Também testo o caso de o servidor invalidar o token antes do TTL local. Como o ReqRes devolve um token fixo que não expira de verdade, a expiração é simulada (TTL fixo curto + cliente falso que responde `401`), o que está documentado no README.
