// Helpers da Questão 1.1: rate limiting (GitHub) e token com expiração (ReqRes).
const GITHUB_USER_URL = 'https://api.github.com/users/github';
const REQRES_BASE = 'https://reqres.in/api';
const REQRES_CREDENTIALS = { email: 'eve.holt@reqres.in', password: 'cityslicka' };

/** Headers da GitHub API. Se GITHUB_TOKEN existir, usa o limite autenticado (5000/h). */
function githubHeaders() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'magazord-quality-test' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

/** Headers do ReqRes. Se a API passar a exigir chave, defina REQRES_API_KEY. */
function reqresHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (process.env.REQRES_API_KEY) headers['x-api-key'] = process.env.REQRES_API_KEY;
  return headers;
}

/** Converte os headers X-RateLimit-* (Playwright já os devolve em minúsculas) em números. */
function parseRateLimit(headers) {
  return {
    limit: Number(headers['x-ratelimit-limit']),
    remaining: Number(headers['x-ratelimit-remaining']),
    reset: Number(headers['x-ratelimit-reset']), // epoch em segundos
  };
}

/** Rate limit atingido: 403 (primário do GitHub) ou 429, com remaining=0 ou Retry-After. */
function isRateLimited(status, headers) {
  return [403, 429].includes(status) &&
    (Number(headers['x-ratelimit-remaining']) === 0 || 'retry-after' in headers);
}

/** Segundos até o reset da janela (nunca negativo). */
function secondsUntilReset(rateLimit, nowMs = Date.now()) {
  return Math.max(0, rateLimit.reset - Math.floor(nowMs / 1000));
}

/**
 * Obtém e reutiliza o token entre os testes.
 *  - Reuso: só faz login se não houver token ou se ele estiver expirado (TTL).
 *  - Single-flight: logins concorrentes compartilham a mesma Promise.
 *  - Reativo: se o servidor responder 401, renova e repete UMA vez (sem loop).
 *  - 401 atrasado: se outra requisição já renovou o token, não faz um novo login.
 *  - `now` é injetável para simular a passagem do tempo sem esperar 2 minutos.
 */
class TokenManager {
  constructor(request, { ttlMs = 2 * 60 * 1000, safetyMs = 0, now = () => Date.now() } = {}) {
    this.request = request;
    this.ttlMs = ttlMs;
    this.safetyMs = safetyMs; // renova um pouco antes de expirar (margem de segurança)
    this.now = now;
    this.token = null;
    this.expiresAt = 0;
    this.loginCount = 0;
    this.pending = null;
  }

  isExpired() {
    return !this.token || this.now() >= this.expiresAt - this.safetyMs;
  }

  async login() {
    const res = await this.request.post(`${REQRES_BASE}/login`, {
      headers: reqresHeaders(),
      data: REQRES_CREDENTIALS,
    });
    if (res.status() !== 200) throw new Error(`Login falhou: HTTP ${res.status()}`);
    const body = await res.json();
    if (!body.token) throw new Error('Resposta de login sem token');
    this.token = body.token;
    this.expiresAt = this.now() + this.ttlMs;
    this.loginCount += 1;
  }

  async getToken({ force = false } = {}) {
    if (!force && !this.isExpired()) return this.token;
    if (!this.pending) this.pending = this.login().finally(() => { this.pending = null; });
    await this.pending;
    return this.token;
  }

  async authedGet(path) {
    const call = async (token) =>
      this.request.get(`${REQRES_BASE}${path}`, { headers: reqresHeaders({ Authorization: `Bearer ${token}` }) });

    const usedToken = await this.getToken();
    let res = await call(usedToken);
    if (res.status() === 401) {
      // Só renova se o token recusado ainda for o atual; se outra requisição já renovou, usa o novo.
      const force = this.token === usedToken;
      res = await call(await this.getToken({ force })); // uma única nova tentativa
    }
    return res;
  }
}

module.exports = {
  GITHUB_USER_URL, REQRES_BASE, githubHeaders, reqresHeaders,
  parseRateLimit, isRateLimited, secondsUntilReset, TokenManager,
};
