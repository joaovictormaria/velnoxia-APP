/**
 * O Prisma Client em memória confere com o schema em disco?
 *
 * ISTO NASCEU DE DOIS ERROS REAIS, DA MESMA FAMÍLIA. Primeiro
 * `undefined.findMany`, quando `ProductionRun` foi criado com o servidor no ar.
 * Depois `Unknown argument purchasePackSize`, quando um CAMPO nasceu com o
 * servidor no ar. Nos dois casos não havia defeito no código: o processo
 * segurava um client gerado antes da mudança.
 *
 * A checagem que já existe em `dev.mjs` compara MODELOS, lendo
 * `Prisma.ModelName`. Ela pegou o primeiro caso e passou verde no segundo:
 * `InventoryItem` já existia, foi um campo que mudou. E ela roda no boot, então
 * não vê nada que aconteça depois — que é justamente quando o problema aparece.
 *
 * A COMPARAÇÃO AQUI É COM A CÓPIA QUE O `generate` DEIXA em
 * `node_modules/.prisma/client/schema.prisma`. Ela é o schema exato de quando o
 * client foi gerado, então a diferença entre as duas é, literalmente, o que o
 * client não sabe. Isso enxerga campo, modelo, enum, atributo — qualquer coisa.
 * Sem abrir conexão: são dois arquivos.
 */

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SCHEMA = "prisma/schema.prisma";
const COPIA = "node_modules/.prisma/client/schema.prisma";

/**
 * O núcleo, puro e sem filesystem, para poder ser testado.
 *
 * O MTIME É O VEREDITO, e não o conteúdo. Schema mais novo que o client reprova,
 * mesmo que o conteúdo seja igual — um `touch` sozinho já reprova. É de
 * propósito: `prisma generate` é idempotente e barato, então um falso positivo
 * custa três segundos, enquanto um falso negativo custa a tarde inteira
 * perseguindo um erro do Prisma que não tem nada a ver com o código.
 *
 * O conteúdo entra só para dizer O QUE mudou, porque "rode generate" sem dizer
 * o que ficou para trás é o tipo de aviso que se aprende a ignorar.
 */
export function avaliarSchema(estado) {
  const { schemaMtimeMs, clientMtimeMs, schemaConteudo, clientConteudo } = estado;

  if (clientMtimeMs == null || clientConteudo == null) {
    return {
      ok: false,
      motivo: "sem-client",
      mensagem:
        '[dev] Prisma Client não encontrado.\n' +
        'Execute "npx prisma generate" e REINICIE o servidor de desenvolvimento.',
    };
  }

  if (schemaMtimeMs <= clientMtimeMs) return { ok: true, motivo: "em-dia" };

  const dif = diferencas(clientConteudo, schemaConteudo);
  return {
    ok: false,
    motivo: "desatualizado",
    diferencas: dif,
    mensagem:
      "[dev] Prisma Client desatualizado em relação ao schema.\n" +
      "O schema foi alterado depois que o Prisma Client foi gerado.\n" +
      `  schema alterado em: ${quando(schemaMtimeMs)}\n` +
      `  client gerado em:   ${quando(clientMtimeMs)}\n` +
      (dif.length ? `  o client não conhece: ${dif.join(", ")}\n` : "") +
      'Execute "npx prisma generate" e REINICIE o servidor de desenvolvimento.\n' +
      "O processo atual segura o client antigo em memória: regenerar sem\n" +
      "reiniciar não resolve.",
  };
}

const quando = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

/** Modelos e campos que existem no schema e faltam na cópia do client. */
function diferencas(antes, depois) {
  const de = mapear(antes);
  const para = mapear(depois);
  const fora = [];
  for (const [modelo, campos] of para) {
    if (!de.has(modelo)) { fora.push(`modelo ${modelo}`); continue; }
    for (const campo of campos) {
      if (!de.get(modelo).has(campo)) fora.push(`${modelo}.${campo}`);
    }
  }
  return fora.slice(0, 12);
}

function mapear(texto) {
  const mapa = new Map();
  for (const m of texto.matchAll(/^(?:model|type)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const campos = new Set();
    for (const linha of m[2].split("\n")) {
      const c = linha.trim().match(/^(\w+)\s+\S/);
      if (c) campos.add(c[1]);
    }
    mapa.set(m[1], campos);
  }
  return mapa;
}

/** Lê os dois arquivos. Nenhuma conexão com banco — são dois `stat` e dois `read`. */
export function lerEstado(raiz = process.cwd()) {
  const s = resolve(raiz, SCHEMA);
  const c = resolve(raiz, COPIA);
  const estado = {
    schemaMtimeMs: statSync(s).mtimeMs,
    schemaConteudo: readFileSync(s, "utf8"),
    clientMtimeMs: null,
    clientConteudo: null,
  };
  try {
    estado.clientMtimeMs = statSync(c).mtimeMs;
    estado.clientConteudo = readFileSync(c, "utf8");
  } catch {
    /* client ausente: avaliarSchema trata */
  }
  return estado;
}

export function conferirAgora(raiz) {
  return avaliarSchema(lerEstado(raiz));
}

/**
 * Plugin do Vite: a checagem por requisição, só no servidor de dev.
 *
 * `apply: "serve"` e o hook `configureServer` garantem que nada disto existe no
 * build de produção — o plugin nem é instanciado lá.
 *
 * O CUSTO É UM `statSync` A CADA 2 SEGUNDOS, no máximo, e não por requisição:
 * um recarregamento de página dispara dezenas de pedidos e todos menos o
 * primeiro leem a resposta em cache. Ler o conteúdo só acontece quando o mtime
 * já acusou diferença, ou seja, uma vez antes de o dev ir reiniciar.
 */
export function guardaDoPrisma({ intervaloMs = 2000, raiz } = {}) {
  let ultima = 0;
  let veredito = { ok: true };
  return {
    name: "guarda-do-prisma",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        const agora = Date.now();
        if (agora - ultima > intervaloMs) {
          ultima = agora;
          try {
            veredito = conferirAgora(raiz);
          } catch {
            // Nao mascarar: se nem da para ler o schema, deixa passar e o erro
            // real aparece onde nasceu, em vez de virar erro deste guarda.
            veredito = { ok: true };
          }
          if (!veredito.ok) console.error("\n" + veredito.mensagem + "\n");
        }
        if (veredito.ok) return next();
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(veredito.mensagem);
      });
    },
  };
}
