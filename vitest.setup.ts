import { config } from 'dotenv';
import { resolve } from 'path';

/**
 * Preparação do ambiente de teste.
 *
 * `override: true` não é detalhe: sem ele o dotenv respeita uma DATABASE_URL
 * que já esteja no ambiente, e o shell de quem rodou `npm run dev` antes
 * carrega a de produção. O teste então apagaria dados do Railway achando que
 * está num banco descartável.
 */
config({ path: resolve(__dirname, '.env.test'), override: true });

/**
 * A trava que impede um teste de tocar em produção.
 *
 * Os testes de integração fazem `deleteMany` e recriam lojas inteiras. Rodar
 * isso contra o Railway apagaria a loja de um cliente real, e o erro só
 * apareceria quando alguém reclamasse. Por isso a checagem é por lista de
 * permissão (só host local passa), e não por lista de proibição: um host de
 * produção novo, que ninguém lembrou de proibir, continua barrado por padrão.
 */
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    'DATABASE_URL não definida para testes.\n' +
    'Rode: cp .env.test.example .env.test && npm run test:db:up',
  );
}

const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error('DATABASE_URL dos testes não é uma URL válida.');
  }
})();

const HOSTS_LOCAIS = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];

if (!HOSTS_LOCAIS.includes(host)) {
  throw new Error(
    `RECUSADO: os testes só rodam contra um banco local.\n` +
    `  host encontrado: ${host}\n` +
    `  hosts aceitos:   ${HOSTS_LOCAIS.join(', ')}\n\n` +
    `Seu .env.test está apontando para um banco remoto — provavelmente o de\n` +
    `produção. Os testes apagam dados. Corrija com:\n` +
    `  cp .env.test.example .env.test`,
  );
}
