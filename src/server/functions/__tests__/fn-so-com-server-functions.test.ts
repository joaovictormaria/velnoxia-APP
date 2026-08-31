import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * UM `*.fn.ts` SÓ PODE EXPORTAR SERVER FUNCTIONS E TIPOS.
 *
 * ISTO NASCEU DE UM ESTRAGO REAL, e o estrago foi a tela inteira sumir.
 *
 * O empacotador substitui um `.fn.ts` de server functions puras por um stub de
 * ~200 bytes no navegador: o cliente recebe só a URL de cada função, e nada do
 * que o arquivo importa viaja junto. Um `export` COMUM no meio delas quebra
 * essa substituição — o bundler não tem como saber que ninguém o usa no
 * cliente, então mantém a função e, com ela, todos os imports do arquivo:
 * repositórios, Prisma, `node:crypto`.
 *
 * O sintoma não é um erro de compilação. O build passa, os testes passam, o SSR
 * passa — e o NAVEGADOR morre em `ReferenceError: Buffer is not defined` ao
 * carregar o cliente do banco de dados, derrubando TODA tela que importe aquele
 * módulo. Foi assim que uma função auxiliar exportada de `recebimentos.fn.ts`
 * levou junto a tela de Pedidos, que não tinha nada a ver com a mudança.
 *
 * A REGRA: server function e tipo ficam no `.fn.ts`. Função de verdade mora num
 * serviço; tipo compartilhado com a tela mora num arquivo só de tipos.
 */

const PASTA = resolve(__dirname, "..");

/**
 * Os dois que já estavam fora da regra antes desta verificação existir.
 *
 * NÃO SÃO PERDÃO PERMANENTE — são dívida conhecida, deixada de fora porque
 * corrigi-los é outra tarefa, com outro risco. A lista existe para que
 * qualquer arquivo NOVO caia no teste em vez de cair em produção.
 */
const DIVIDA_ANTIGA = new Set(["order-inventory.fn.ts", "signup.fn.ts"]);

/** Um `export` de topo que não seja `export const X = createServerFn(`. */
function exportsComuns(fonte: string): string[] {
  return [...fonte.matchAll(/^export\s+(?!type\b|interface\b)(.*)$/gm)]
    .map((m) => m[1].trim())
    .filter((linha) => !/^const\s+\w+\s*=\s*createServerFn\(/.test(linha))
    .map((linha) => linha.slice(0, 80));
}

describe("*.fn.ts só exporta server functions", () => {
  const arquivos = readdirSync(PASTA).filter((f) => f.endsWith(".fn.ts"));

  it("a pasta de server functions foi encontrada", () => {
    expect(arquivos.length).toBeGreaterThan(10);
  });

  for (const arquivo of arquivos) {
    const conhecido = DIVIDA_ANTIGA.has(arquivo);
    it(`${arquivo}${conhecido ? " (dívida antiga, ignorado)" : ""}`, () => {
      if (conhecido) return;
      const comuns = exportsComuns(readFileSync(resolve(PASTA, arquivo), "utf8"));
      expect(
        comuns,
        `${arquivo} exporta algo que não é server function: ${comuns.join(" | ")}.\n` +
          `Mova para um serviço (@/server/services/...) ou, se for tipo, para um arquivo de tipos.\n` +
          `Um export comum num .fn.ts arrasta Prisma para o navegador e derruba a tela.`,
      ).toEqual([]);
    });
  }
});
