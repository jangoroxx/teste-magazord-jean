// @ts-check
// Modo demonstração (`npm run demo`): navegador visível, um teste por vez e pausas entre os passos.
process.env.DEMO_PAUSA_MS = process.env.DEMO_PAUSA_MS || '1500';

const base = require('./playwright.config');

module.exports = {
  ...base,
  timeout: 180_000, // as pausas contam no tempo do teste
  workers: 1,
  retries: 0,
  use: {
    ...base.use,
    headless: false,
    launchOptions: { slowMo: 500 }, // ms entre as ações no navegador
  },
};
