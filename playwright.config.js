// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * Um projeto por parte prática, para poder rodar `npm run test:parte1|2|3`.
 * As partes 4 e 5 são teóricas (sem execução).
 */
module.exports = defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  reporter: [['list', { printSteps: true }], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'parte1-api', testMatch: 'parte1-api/**/*.spec.js' },
    { name: 'parte2-e2e', testMatch: 'parte2-e2e/**/*.spec.js', use: { browserName: 'chromium' } },
    { name: 'parte3-arquivos', testMatch: 'parte3-arquivos/**/*.spec.js', use: { browserName: 'chromium' } },
  ],
});
