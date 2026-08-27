import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { ProducaoService } from "@/server/services/producao-service";

/*
 * As consultas que as telas fazem, exatamente como fazem.
 *
 * NASCEU DE UM ERRO REAL. A aba Preparados abriu com
 * "Cannot read properties of undefined (reading 'findMany')", e a causa não
 * estava no código: o servidor de desenvolvimento tinha sido iniciado ÀS 23h32,
 * o schema mudou às 23h35 e o `prisma generate` só rodou às 01h38 — duas horas
 * depois. O processo segurava um cliente Prisma gerado antes de `ProductionRun`
 * existir, e `prisma.productionRun` era `undefined`.
 *
 * O que torna esse erro caro é a mensagem: "undefined.findMany" não diz qual
 * modelo faltou, nem por quê. São quinze minutos de caça a um problema que a
 * frase certa resolveria em cinco segundos.
 *
 * Os testes existentes não pegavam porque exercitavam os SERVIÇOS, e as
 * consultas dos handlers de listagem não passam por serviço nenhum — moram na
 * própria server function, que o vitest não consegue chamar. Estes cenários
 * fecham essa lacuna: rodam as consultas verbatim, fora do runtime da server
 * function.
 */

/** Todo modelo que o módulo de estoque e produção toca. */
const MODELOS = [
  "inventoryItem",
  "inventoryUnit",
  "inventoryMovement",
  "productComposition",
  "compositionItem",
  "productionRun",
  "product",
  "order",
  "orderItem",
  "store",
] as const;

let storeId = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

beforeAll(async () => {
  await limparBanco();
  storeId = (await prisma.store.create({
    data: { slug: `cons-${Date.now()}`, name: "Cozinha" },
  })).id;
});

afterAll(limparBanco);

describe("o cliente Prisma tem o que o módulo precisa", () => {
  it("01 · todos os acessores de modelo existem", () => {
    const faltando = MODELOS.filter((m) => !(prisma as any)[m]);

    /*
     * Esta asserção é a que teria economizado a caçada. Um acessor ausente
     * significa cliente desatualizado — `npx prisma generate` e reiniciar o
     * processo — e a mensagem diz isso em vez de "undefined.findMany".
     */
    expect(
      faltando,
      `Modelos ausentes no cliente Prisma: ${faltando.join(", ")}. ` +
        `O cliente está desatualizado em relação ao schema: rode "npx prisma generate" ` +
        `e REINICIE o processo — um servidor já em execução continua com o cliente antigo.`,
    ).toEqual([]);
  });

  it("02 · todos respondem a findMany", () => {
    const semFindMany = MODELOS.filter(
      (m) => typeof (prisma as any)[m]?.findMany !== "function",
    );
    expect(semFindMany, `Sem findMany: ${semFindMany.join(", ")}`).toEqual([]);
  });
});

describe("as consultas dos handlers, verbatim", () => {
  it("03 · adminListarPreparados", async () => {
    /*
     * Cópia exata da consulta em `preparado.fn.ts`. Cobre não só o acessor
     * `inventoryItem`, mas as RELAÇÕES `receitas`, `yieldUnit` e `baseUnit` —
     * que também nascem do generate e também somem num cliente velho.
     */
    const r = await prisma.inventoryItem.findMany({
      where: { storeId, itemType: "PREPARED", isActive: true },
      orderBy: { name: "asc" },
      include: {
        baseUnit: true,
        receitas: {
          where: { isActive: true },
          orderBy: { version: "desc" },
          take: 1,
          include: {
            yieldUnit: true,
            items: {
              include: { inventoryItem: true, unit: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });
    expect(Array.isArray(r)).toBe(true);
  });

  it("04 · adminOpcoesDePreparado", async () => {
    const [itens, unidades] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { storeId, isActive: true },
        orderBy: { name: "asc" },
        include: { baseUnit: true },
      }),
      prisma.inventoryUnit.findMany({ orderBy: { code: "asc" } }),
    ]);
    expect(Array.isArray(itens)).toBe(true);
    expect(Array.isArray(unidades)).toBe(true);
  });

  it("05 · adminHistoricoDeProducao — o que quebrou de verdade", async () => {
    /*
     * `productionRun` é o modelo mais novo do schema, e por isso o primeiro a
     * faltar num cliente desatualizado. Foi ele que produziu o erro na tela.
     */
    const r = await ProducaoService.historico(storeId, { limite: 50 });
    expect(Array.isArray(r)).toBe(true);
  });

  it("06 · as três em paralelo, como a tela faz", async () => {
    /*
     * A tela dispara as três num `Promise.all`. Se qualquer uma rejeita, a
     * lista fica vazia e só o erro aparece — foi exatamente o que se viu.
     */
    await expect(
      Promise.all([
        prisma.inventoryItem.findMany({ where: { storeId, itemType: "PREPARED" }, include: { receitas: true } }),
        prisma.inventoryUnit.findMany(),
        ProducaoService.historico(storeId, { limite: 50 }),
      ]),
    ).resolves.toHaveLength(3);
  });
});

describe("o banco tem o que o cliente espera", () => {
  it("07 · as tabelas e colunas das migrations 4 a 6 existem", async () => {
    /*
     * O outro lado do mesmo problema: cliente atualizado contra banco antigo.
     * Aqui a falha seria "table does not exist" em vez de "undefined", mas o
     * conserto é irmão — rodar as migrations e reiniciar.
     */
    const tabelas = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name IN ('ProductionRun','InventoryUnit','ProductComposition')`,
    );
    expect(tabelas.map((t) => t.table_name).sort()).toEqual([
      "InventoryUnit",
      "ProductComposition",
      "ProductionRun",
    ]);

    const colunas = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='ProductComposition'
          AND column_name IN ('inventoryItemId','yieldQuantity','yieldUnitId')`,
    );
    expect(colunas).toHaveLength(3);

    const noMovimento = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='InventoryMovement'
          AND column_name='productionRunId'`,
    );
    expect(noMovimento).toHaveLength(1);
  });
});
