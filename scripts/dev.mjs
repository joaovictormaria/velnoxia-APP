/**
 * Sobe o servidor de desenvolvimento contra o banco local.
 *
 * Existe porque o Nitro carrega o `.env` da raiz sozinho, e naquele arquivo
 * mora a URL do Railway. Sem esta camada, `npm run dev` abre um servidor que
 * grava direto em producao: quem preenchesse o formulario de cadastro em
 * localhost criava uma loja real. Aconteceu.
 *
 * O `.env` de producao continua intocado — ele so deixa de ser o que o
 * desenvolvimento enxerga.
 */
import { config } from "dotenv";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arquivo = resolve(raiz, ".env.development");

if (!existsSync(arquivo)) {
  console.error(
    "Falta o .env.development.\n\n" +
      "  cp .env.development.example .env.development\n",
  );
  process.exit(1);
}

// override: sem isto, uma DATABASE_URL que ja esteja no ambiente — a de
// producao, deixada por outro comando — venceria a local.
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
    `RECUSADO: o desenvolvimento precisa de um banco local.\n` +
      `  host encontrado: ${host || "(URL invalida ou ausente)"}\n` +
      `  hosts aceitos:   ${HOSTS_LOCAIS.join(", ")}\n\n` +
      `Corrija o .env.development. O .env da raiz aponta para producao e nao\n` +
      `deve ser usado aqui.\n`,
  );
  process.exit(1);
}

console.log(`[dev] banco: ${host}:${new URL(url).port} — local, nao e producao\n`);

/*
 * O Nitro le o `.env` da raiz depois deste ponto. Se ele sobrescrevesse a
 * variavel, o servidor voltaria a falar com producao em silencio — por isso a
 * conferencia final vive dentro da app, em src/server/db/client.ts, que roda
 * com o valor que realmente vale na hora de abrir a conexao.
 */
const filho = spawn("npx", ["vite", "dev"], {
  stdio: "inherit",
  shell: true,
  cwd: raiz,
  env: process.env,
});
filho.on("exit", (codigo) => process.exit(codigo ?? 0));
