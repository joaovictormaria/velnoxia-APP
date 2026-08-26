/**
 * Roda um comando do Prisma contra o banco LOCAL, nunca contra producao.
 *
 *   node scripts/prisma-local.mjs db push
 *   node scripts/prisma-local.mjs studio
 *
 * Sem esta camada, `npm run db:push` ia parar no Railway: o prisma.config.ts
 * faz `import "dotenv/config"`, que carrega o `.env` da raiz — e la mora a URL
 * de producao. Um `db push` ali reescreve o schema da base real sem perguntar,
 * e `migrate dev` chega a oferecer apagar o banco.
 *
 * Comandos que DEVEM falar com producao (migrate deploy, migrate status) nao
 * passam por aqui: continuam sendo chamados direto, de proposito, para que
 * usar o banco real seja sempre uma decisao explicita.
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arquivo = resolve(raiz, ".env.development");

if (!existsSync(arquivo)) {
  console.error("Falta o .env.development.\n\n  cp .env.development.example .env.development\n");
  process.exit(1);
}

config({ path: arquivo, override: true });

const url = process.env.DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();

const HOSTS_LOCAIS = ["localhost", "127.0.0.1", "::1", "host.docker.internal"];
if (!HOSTS_LOCAIS.includes(host)) {
  console.error(
    `RECUSADO: este comando escreve no banco e so pode rodar contra um local.\n` +
      `  host encontrado: ${host || "(URL invalida ou ausente)"}\n` +
      `  hosts aceitos:   ${HOSTS_LOCAIS.join(", ")}\n`,
  );
  process.exit(1);
}

const argumentos = process.argv.slice(2);
if (argumentos.length === 0) {
  console.error("Informe o comando do Prisma. Ex.: node scripts/prisma-local.mjs db push");
  process.exit(1);
}

console.log(`[prisma-local] banco: ${host}:${new URL(url).port}\n`);

const r = spawnSync("npx", ["prisma", ...argumentos], {
  stdio: "inherit",
  shell: true,
  cwd: raiz,
  env: process.env,
});
process.exit(r.status ?? 1);
