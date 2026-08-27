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
import { conferirAgora } from "./guarda-do-prisma.mjs";
import { existsSync, readFileSync } from "node:fs";
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
/*
 * O cliente Prisma bate com o schema?
 *
 * ISTO NASCEU DE UMA CACADA DE UMA HORA. A aba Preparados abriu com
 * "Cannot read properties of undefined (reading 'findMany')" e nao havia
 * defeito nenhum no codigo: o servidor tinha sido iniciado as 23h32, o schema
 * mudou as 23h35 e o `prisma generate` so rodou as 01h38. O processo segurava
 * um cliente gerado antes de `ProductionRun` existir, e `prisma.productionRun`
 * era `undefined`.
 *
 * O `prisma generate` no script do npm impede que aconteca de novo. Esta
 * conferencia existe para o caso em que ele falha em silencio — e porque a
 * mensagem "undefined.findMany" nao diz qual modelo faltou nem por que, o que
 * transforma cinco segundos de conserto em uma hora de investigacao.
 */
async function conferirCliente() {
  const schema = readFileSync(resolve(raiz, "prisma/schema.prisma"), "utf8");
  const doSchema = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
    .map((m) => m[1])
    .map((n) => n[0].toLowerCase() + n.slice(1));

  let cliente;
  try {
    cliente = await import("@prisma/client");
  } catch {
    console.error("\nNao consegui carregar @prisma/client. Rode: npx prisma generate\n");
    process.exit(1);
  }

  /*
   * `Prisma.ModelName` e o mapa de modelos que o generate escreve. Ler dali nao
   * abre conexao nenhuma — instanciar o PrismaClient exigiria um adapter, e a
   * pergunta aqui e sobre o CLIENTE, nao sobre o banco.
   */
  const doCliente = new Set(
    Object.keys(cliente.Prisma?.ModelName ?? {}).map(
      (n) => n[0].toLowerCase() + n.slice(1),
    ),
  );

  if (doCliente.size === 0) {
    console.error("\nO cliente Prisma nao expoe modelo nenhum. Rode: npx prisma generate\n");
    process.exit(1);
  }

  const faltando = doSchema.filter((m) => !doCliente.has(m));

  if (faltando.length > 0) {
    console.error(
      `\nO cliente Prisma esta desatualizado em relacao ao schema.\n\n` +
        `  modelos ausentes: ${faltando.join(", ")}\n\n` +
        `Rode "npx prisma generate" e suba o servidor de novo. Um processo ja em\n` +
        `execucao NAO recarrega o cliente: e preciso reinicia-lo.\n`,
    );
    process.exit(1);
  }

  console.log(`[dev] cliente Prisma confere com o schema (${doSchema.length} modelos)`);

  /*
   * A checagem acima ve MODELOS. Um CAMPO novo passa por ela — foi assim que
   * `Unknown argument purchasePackSize` chegou ao navegador. Esta compara o
   * schema com a copia que o generate deixou, entao enxerga qualquer diferenca.
   */
  const veredito = conferirAgora(raiz);
  if (!veredito.ok) {
    console.error("\n" + veredito.mensagem + "\n");
    process.exit(1);
  }
}

await conferirCliente();

const filho = spawn("npx", ["vite", "dev"], {
  stdio: "inherit",
  shell: true,
  cwd: raiz,
  env: process.env,
});
filho.on("exit", (codigo) => process.exit(codigo ?? 0));
