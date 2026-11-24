const { test } = require('@playwright/test');

// Só o modo demonstração (playwright.demo.config.js) define DEMO_PAUSA_MS; nos demais a pausa é zero.
const pausaMs = () => Number(process.env.DEMO_PAUSA_MS) || 0;

/**
 * Passo nomeado: aparece no terminal e no relatório HTML.
 * A pausa vem DEPOIS das asserções e serve só para quem assiste; nenhum teste depende dela.
 */
function passo(titulo, acao) {
  return test.step(titulo, async () => {
    const resultado = await acao();
    if (pausaMs() > 0) await new Promise((resolve) => setTimeout(resolve, pausaMs()));
    return resultado;
  });
}

module.exports = { passo };
