/**
 * Sobe (ou derruba) o Postgres de teste e aplica as migrations nele.
 *
 * Existe como script em vez de uma linha no package.json porque o `prisma
 * migrate deploy` lê a URL do prisma.config.ts, que carrega o `.env` — o de
 * produção. Passar a URL de teste por variável de ambiente na linha do npm não
 * é portável entre o cmd.exe do Windows e o sh do resto do mundo; aqui o
 * ambiente é montado em Node, que se comporta igual nos dois.
 */
import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(raiz, '.env.test'), override: true });

const url = process.env.DATABASE_URL ?? '';
const host = (() => {
  try { return new URL(url).hostname; } catch { return ''; }
})();

// A mesma trava do vitest.setup.ts: migrations também escrevem no banco.
if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
  console.error(
    `RECUSADO: o banco de teste precisa ser local.\n` +
    `  host encontrado: ${host || '(URL inválida ou ausente)'}\n\n` +
    `Rode: cp .env.test.example .env.test`,
  );
  process.exit(1);
}

const acao = process.argv[2];
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: raiz });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (acao === 'down') {
  run('docker', ['compose', '-f', 'docker-compose.test.yml', 'down', '-v']);
  process.exit(0);
}

run('docker', ['compose', '-f', 'docker-compose.test.yml', 'up', '-d', '--wait']);
run('npx', ['prisma', 'migrate', 'deploy']);

/*
 * A marca que autoriza a suíte a destruir este banco.
 *
 * A suíte faz `TRUNCATE ... CASCADE` em todas as tabelas, e se recusa a rodar
 * sem encontrar esta tabela. Ela é criada AQUI, e só aqui: se o próprio
 * `vitest.setup.ts` a criasse, a trava se abriria sozinha no primeiro banco em
 * que fosse apontada — que é exatamente o acidente que ela existe para impedir.
 *
 * Durante a Fase 2, desenvolvimento e teste dividiam o mesmo banco e cada
 * `npm test` apagava o ambiente de trabalho de alguém. Esta linha é o que
 * torna aquilo impossível de repetir por engano.
 */
const marcador = `
  CREATE TABLE IF NOT EXISTS "_banco_descartavel" (
    id        int PRIMARY KEY DEFAULT 1,
    criado_em timestamptz NOT NULL DEFAULT now(),
    aviso     text NOT NULL DEFAULT 'Este banco e descartavel: a suite de testes apaga todas as tabelas dele. NUNCA aponte desenvolvimento ou producao para ca.',
    CONSTRAINT "_banco_descartavel_uma_linha" CHECK (id = 1)
  );
  INSERT INTO "_banco_descartavel" (id) VALUES (1) ON CONFLICT DO NOTHING;
`;

const { Client } = await import('pg');
const conexao = new Client({ connectionString: url });
await conexao.connect();
await conexao.query(marcador);
await conexao.end();

console.log(`\nBanco de teste pronto em ${host}, marcado como descartável.`);
console.log(`Rode: npm test`);
