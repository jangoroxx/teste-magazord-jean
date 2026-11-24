// Gerador e validador de CSV (Questão 3.1).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fakerPT_BR: faker } = require('@faker-js/faker');

const HEADER = ['nome', 'email', 'idade', 'cidade'];

function escapeField(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  return rows.map((r) => r.map(escapeField).join(',')).join('\n') + '\n';
}

/** Gera `count` linhas de dados válidos (e-mails únicos, idade 18-80). */
function generateRows(count) {
  return Array.from({ length: count }, (_, i) => [
    faker.person.fullName(),
    `u${i + 1}.${faker.internet.email({ provider: 'exemplo.com' }).toLowerCase()}`,
    faker.number.int({ min: 18, max: 80 }),
    faker.location.city(),
  ]);
}

function generateCsv(count) {
  return toCsv([HEADER, ...generateRows(count)]);
}

/** Grava o conteúdo em um diretório temporário e devolve o caminho do arquivo. */
function writeTempCsv(fileName, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-test-'));
  const file = path.join(dir, fileName);
  fs.writeFileSync(file, content);
  return file;
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { fields.push(current); current = ''; }
    else current += ch;
  }
  fields.push(current);
  return fields;
}

/**
 * Validador do conteúdo: formato, regras de negócio e duplicatas.
 * (O site de exemplo não valida nada; aqui mostramos como seria a checagem.)
 */
function validateCsv(content) {
  if (content.trim() === '') return { valid: false, rowCount: 0, errors: ['arquivo vazio'] };
  if (/[\u0000\uFFFD]/.test(content)) {
    return { valid: false, rowCount: 0, errors: ['arquivo corrompido (bytes inválidos)'] };
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
  const errors = [];
  const header = parseCsvLine(lines[0]);
  if (header.join(',') !== HEADER.join(',')) {
    return { valid: false, rowCount: 0, errors: [`cabeçalho inválido: esperado "${HEADER.join(',')}"`] };
  }

  const seenEmails = new Set();
  lines.slice(1).forEach((line, idx) => {
    const n = idx + 2; // número da linha no arquivo
    const cols = parseCsvLine(line);
    if (cols.length !== HEADER.length) {
      errors.push(`linha ${n}: esperado ${HEADER.length} colunas, encontrado ${cols.length}`);
      return;
    }
    const [nome, email, idade, cidade] = cols;
    if (!nome.trim()) errors.push(`linha ${n}: nome vazio`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`linha ${n}: e-mail inválido "${email}"`);
    if (!/^\d+$/.test(idade) || Number(idade) > 120) errors.push(`linha ${n}: idade inválida "${idade}"`);
    if (!cidade.trim()) errors.push(`linha ${n}: cidade vazia`);
    if (seenEmails.has(email)) errors.push(`linha ${n}: e-mail duplicado "${email}"`);
    seenEmails.add(email);
  });

  return { valid: errors.length === 0, rowCount: lines.length - 1, errors };
}

module.exports = { HEADER, generateCsv, toCsv, writeTempCsv, validateCsv, parseCsvLine };
