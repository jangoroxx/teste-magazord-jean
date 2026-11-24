const { test, expect } = require('@playwright/test');
const {
  GITHUB_USER_URL, REQRES_BASE, githubHeaders, parseRateLimit, isRateLimited, secondsUntilReset, TokenManager,
} = require('./utils/api-helper');

/** Resposta falsa no formato do APIResponse do Playwright. */
const fakeResponse = ({ status = 200, headers = {}, body = {} }) => ({
  status: () => status,
  headers: () => headers,
  json: async () => body,
});

/**
 * Cliente HTTP falso: cada login devolve token-1, token-2...
 * `expire(token)` faz o "servidor" rejeitar aquele token com 401.
 */
function createFakeRequest({ alwaysUnauthorized = false } = {}) {
  const state = { posts: 0, gets: 0, expired: new Set() };
  return {
    state,
    expire: (t) => state.expired.add(t),
    post: async () => { state.posts += 1; return fakeResponse({ body: { token: `token-${state.posts}` } }); },
    get: async (_url, { headers }) => {
      state.gets += 1;
      const token = headers.Authorization.replace('Bearer ', '');
      const unauthorized = alwaysUnauthorized || state.expired.has(token);
      return fakeResponse({ status: unauthorized ? 401 : 200, body: unauthorized ? { error: 'token expired' } : { data: { id: 2 } } });
    },
  };
}

test.describe('Rate limiting - GitHub API', () => {
  test('headers X-RateLimit-* presentes e coerentes (chamada real)', async ({ request }) => {
    const res = await request.get(GITHUB_USER_URL, { headers: githubHeaders() });
    const headers = res.headers();

    expect(headers).toHaveProperty('x-ratelimit-limit');
    expect(headers).toHaveProperty('x-ratelimit-remaining');
    expect(headers).toHaveProperty('x-ratelimit-reset');

    const rl = parseRateLimit(headers);
    if (process.env.GITHUB_TOKEN) expect(rl.limit).toBeGreaterThanOrEqual(5000);
    else expect(rl.limit).toBe(60);
    expect(rl.remaining).toBeGreaterThanOrEqual(0);
    expect(rl.remaining).toBeLessThanOrEqual(rl.limit);
    expect(rl.reset).toBeGreaterThan(Math.floor(Date.now() / 1000) - 5); // reset no futuro

    // Se o IP já estourou o limite, o 403 é o próprio comportamento esperado.
    if (!isRateLimited(res.status(), headers)) expect(res.status()).toBe(200);
  });

  test('remaining não aumenta entre duas chamadas seguidas (chamada real)', async ({ request }) => {
    const read = async () =>
      parseRateLimit((await request.get(GITHUB_USER_URL, { headers: githubHeaders() })).headers());
    let first = await read();
    let second = await read();
    if (second.reset !== first.reset) {
      // A janela reiniciou entre as chamadas (o remaining volta ao máximo): mede de novo, uma vez.
      first = second;
      second = await read();
    }
    expect(second.reset).toBe(first.reset); // só faz sentido comparar dentro da mesma janela
    expect(second.remaining).toBeLessThanOrEqual(first.remaining);
    expect(second.limit).toBe(first.limit);
  });

  test('[mock] detecta 403 com rate limit esgotado', async () => {
    const res = fakeResponse({
      status: 403,
      headers: { 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' },
      body: { message: 'API rate limit exceeded' },
    });
    expect(isRateLimited(res.status(), res.headers())).toBe(true);
    expect((await res.json()).message).toContain('rate limit');
  });

  test('[mock] 403 por permissão (remaining > 0) NÃO é rate limit', async () => {
    const headers = { 'x-ratelimit-remaining': '42' };
    expect(isRateLimited(403, headers)).toBe(false);
  });

  test('[mock] calcula a espera até o reset da janela', async () => {
    const nowMs = 1_000_000 * 1000;
    expect(secondsUntilReset({ reset: 1_000_030 }, nowMs)).toBe(30);
    expect(secondsUntilReset({ reset: 999_000 }, nowMs)).toBe(0); // reset no passado
  });
});

test.describe('Token - ReqRes', () => {
  // Sem x-api-key o ReqRes permite login e leitura, mas recusa qualquer Bearer em /api/* (ver README).
  test('login real sem API key: token reutilizado e Bearer sem x-api-key é recusado', async ({ request }) => {
    test.skip(!!process.env.REQRES_API_KEY, 'cenário específico de execução sem REQRES_API_KEY');
    const tokens = new TokenManager(request);
    const token = await tokens.getToken();
    expect(token).toBeTruthy();
    expect(await tokens.getToken()).toBe(token); // reutiliza
    expect(tokens.loginCount).toBe(1);

    const semBearer = await request.get(`${REQRES_BASE}/users/2`);
    expect(semBearer.status()).toBe(200);
    expect((await semBearer.json()).data.id).toBe(2);

    const comBearer = await tokens.authedGet('/users/2');
    expect(comBearer.status()).toBe(401);
    expect((await comBearer.json()).error).toBe('missing_api_key');
    expect(tokens.loginCount).toBe(2); // o 401 real dispara uma única renovação
  });

  test('login real, reuso do token e requisição autenticada', async ({ request }) => {
    test.skip(!process.env.REQRES_API_KEY, 'ReqRes exige x-api-key em requisições com Bearer (defina REQRES_API_KEY)');
    const tokens = new TokenManager(request);
    const token = await tokens.getToken(); // com a chave definida, falha de login é falha do teste
    expect(token).toBeTruthy();

    expect(await tokens.getToken()).toBe(token); // reutiliza
    expect(tokens.loginCount).toBe(1);

    const res = await tokens.authedGet('/users/2');
    expect(res.status()).toBe(200);
    expect((await res.json()).data.id).toBe(2);
    expect(tokens.loginCount).toBe(1); // continua sem novo login
  });

  test('[mock] token expira por TTL (2 min) e dispara novo login', async () => {
    const clock = { t: 0 };
    const fake = createFakeRequest();
    const tokens = new TokenManager(fake, { ttlMs: 120_000, now: () => clock.t });

    const first = await tokens.getToken();
    clock.t = 119_000; // ainda válido
    expect(await tokens.getToken()).toBe(first);
    expect(tokens.loginCount).toBe(1);

    clock.t = 121_000; // passou do TTL
    const second = await tokens.getToken();
    expect(second).not.toBe(first);
    expect(tokens.loginCount).toBe(2);
  });

  test('[mock] margem de segurança renova antes de expirar', async () => {
    const clock = { t: 0 };
    const tokens = new TokenManager(createFakeRequest(), { ttlMs: 120_000, safetyMs: 10_000, now: () => clock.t });
    await tokens.getToken();
    clock.t = 111_000; // dentro da margem de 10s
    await tokens.getToken();
    expect(tokens.loginCount).toBe(2);
  });

  test('[mock] 401 do servidor: renova o token e repete a requisição uma vez', async () => {
    const fake = createFakeRequest();
    const tokens = new TokenManager(fake);
    await tokens.getToken();
    fake.expire('token-1'); // servidor invalida o token antes do TTL local

    const res = await tokens.authedGet('/users/2');
    expect(res.status()).toBe(200);
    expect(tokens.loginCount).toBe(2);
    expect(fake.state.gets).toBe(2); // 401 + retry
  });

  test('[mock] 401 persistente não entra em loop (apenas 1 retry)', async () => {
    const fake = createFakeRequest({ alwaysUnauthorized: true });
    const tokens = new TokenManager(fake);
    const res = await tokens.authedGet('/users/2');
    expect(res.status()).toBe(401);
    expect(fake.state.gets).toBe(2);
    expect(tokens.loginCount).toBe(2);
  });

  test('[mock] logins concorrentes compartilham uma única chamada (single-flight)', async () => {
    const fake = createFakeRequest();
    const tokens = new TokenManager(fake);
    const results = await Promise.all([tokens.getToken(), tokens.getToken(), tokens.getToken()]);
    expect(new Set(results).size).toBe(1);
    expect(fake.state.posts).toBe(1);
  });

  test('[mock] 401 atrasado não renova um token que outra requisição já renovou', async () => {
    const fake = createFakeRequest();
    const originalGet = fake.get;
    let liberarLenta;
    const espera = new Promise((resolve) => { liberarLenta = resolve; });
    fake.get = async (url, options) => {
      if (url.endsWith('/lenta') && options.headers.Authorization === 'Bearer token-1') await espera;
      return originalGet(url, options);
    };
    const tokens = new TokenManager(fake);
    await tokens.getToken();
    fake.expire('token-1');

    const lenta = tokens.authedGet('/lenta'); // sai com token-1 e fica presa
    expect((await tokens.authedGet('/rapida')).status()).toBe(200); // 401 -> renova para token-2
    liberarLenta(); // o 401 do token-1 só chega agora
    expect((await lenta).status()).toBe(200); // repete com token-2
    expect(tokens.loginCount).toBe(2); // login inicial + uma única renovação
  });
});
