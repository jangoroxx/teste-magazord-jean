const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { passo } = require('../../../utils/passo');
const { generateCsv, writeTempCsv, validateCsv } = require('./utils/csv-generator');

const UPLOAD_URL = 'https://the-internet.herokuapp.com/upload';
const FIXTURES = path.join(__dirname, 'fixtures');
const readFixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

/** Faz o upload pela UI e devolve o locator do título da página resultante. */
async function upload(page, filePath) {
  await page.goto(UPLOAD_URL);
  await page.locator('#file-upload').setInputFiles(filePath);
  await page.locator('#file-submit').click();
}

test.describe('Upload de CSV válido (10, 100 e 1000 linhas)', () => {
  for (const size of [10, 100, 1000]) {
    test(`${size} linhas: conteúdo é consistente e o upload é concluído`, async ({ page }) => {
      const content = await passo(`Gera o CSV com ${size} linhas`, async () => generateCsv(size));

      // 1) o arquivo gerado é válido e tem exatamente `size` registros
      await passo(`Validador confirma ${size} registros sem erros`, async () => {
        const result = validateCsv(content);
        expect(result.errors).toEqual([]);
        expect(result.rowCount).toBe(size);
      });

      // 2) upload pela UI e confirmação
      await passo('Faz o upload e o site confirma o arquivo', async () => {
        const fileName = `clientes-${size}.csv`;
        await upload(page, writeTempCsv(fileName, content));
        await expect(page.locator('h3')).toHaveText('File Uploaded!');
        await expect(page.locator('#uploaded-files')).toHaveText(fileName);
      });
    });
  }

  test('fixture válido de exemplo (README) é aceito', async ({ page }) => {
    await passo('Validador aprova o fixture', async () => {
      expect(validateCsv(readFixture('valid-sample.csv'))).toMatchObject({ valid: true, rowCount: 2 });
    });
    await passo('Faz o upload e o site confirma', async () => {
      await upload(page, path.join(FIXTURES, 'valid-sample.csv'));
      await expect(page.locator('h3')).toHaveText('File Uploaded!');
    });
  });
});

/**
 * ATENÇÃO: o site the-internet.herokuapp.com NÃO valida o conteúdo do arquivo.
 * Por isso, nos cenários inválidos o teste:
 *   (a) prova que o conteúdo é inválido com o validador (o que um sistema real deveria rejeitar), e
 *   (b) verifica como o site se comporta (o upload "passa"), sem fingir que ele rejeita.
 * Se o site passar a rejeitar, ou devolver página de erro, o teste falha e o cenário deve ser revisto.
 */
test.describe('Upload de CSV inválido', () => {
  const cenarios = [
    { arquivo: 'empty.csv', descricao: 'CSV vazio', erroEsperado: /vazio/ },
    { arquivo: 'invalid-format.csv', descricao: 'formato incorreto (delimitador/cabeçalho)', erroEsperado: /cabeçalho/ },
    { arquivo: 'malformed-data.csv', descricao: 'dados malformados', erroEsperado: /e-mail inválido|idade inválida|colunas|duplicado|nome vazio/ },
    { arquivo: 'corrupted.csv', descricao: 'arquivo corrompido (binário)', erroEsperado: /corrompido/ },
  ];

  for (const { arquivo, descricao, erroEsperado } of cenarios) {
    test(`${descricao}: validador rejeita e o comportamento do site é registrado`, async ({ page }) => {
      await passo(`Validador reprova ${arquivo}`, async () => {
        const result = validateCsv(readFixture(arquivo));
        expect(result.valid).toBe(false);
        expect(result.errors.join(' | ')).toMatch(erroEsperado);
      });

      await passo(`Upload de ${arquivo}: o site aceita mesmo inválido`, async () => {
        await upload(page, path.join(FIXTURES, arquivo));
        // o site de exemplo aceita o arquivo inválido; a asserção fixa esse comportamento observado
        await expect(page.locator('h3')).toHaveText('File Uploaded!');
        await expect(page.locator('#uploaded-files')).toHaveText(arquivo);
        test.info().annotations.push({ type: 'comportamento-do-site', description: `${arquivo}: aceito pelo site` });
      });
    });
  }

  test('malformed-data.csv: reporta TODAS as linhas problemáticas', async () => {
    await passo('Validador reporta todos os tipos de erro do arquivo', async () => {
      const { errors } = validateCsv(readFixture('malformed-data.csv'));
      expect(errors.some((e) => e.includes('e-mail inválido'))).toBe(true);
      expect(errors.some((e) => e.includes('idade inválida'))).toBe(true);
      expect(errors.some((e) => e.includes('colunas'))).toBe(true);
      expect(errors.some((e) => e.includes('duplicado'))).toBe(true);
      expect(errors.some((e) => e.includes('nome vazio'))).toBe(true);
    });
  });
});

test.describe('[unit] gerador e validador de CSV', () => {
  test('[unit] gerador respeita a quantidade e não repete e-mails', async () => {
    await passo('Gera 1000 linhas: quantidade exata e sem duplicatas', async () => {
      const result = validateCsv(generateCsv(1000));
      expect(result.rowCount).toBe(1000);
      expect(result.errors).toEqual([]);
    });
  });

  test('[unit] fixture corrupted.csv contém bytes binários reais (não é texto comum)', async () => {
    await passo('Arquivo tem byte nulo e é reprovado como corrompido', async () => {
      const bytes = fs.readFileSync(path.join(FIXTURES, 'corrupted.csv'));
      expect(bytes.includes(0x00)).toBe(true); // byte nulo só existe em arquivo binário/corrompido
      expect(validateCsv(bytes.toString('utf8')).errors.join(' ')).toMatch(/corrompido/);
    });
  });

  test('[unit] detecta e-mail duplicado', async () => {
    await passo('Validador detecta e-mail duplicado', async () => {
      const csv = 'nome,email,idade,cidade\nA,a@x.com,20,SP\nB,a@x.com,21,RJ\n';
      expect(validateCsv(csv).errors[0]).toContain('duplicado');
    });
  });

  test('[unit] campos com vírgula entre aspas são lidos corretamente', async () => {
    await passo('Validador lê vírgula entre aspas corretamente', async () => {
      const csv = 'nome,email,idade,cidade\n"Silva, João",joao@x.com,30,"São Paulo"\n';
      expect(validateCsv(csv)).toMatchObject({ valid: true, rowCount: 1 });
    });
  });
});
