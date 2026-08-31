import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { reportRepository } from "@/server/repositories/report-repository";
import { ProductionService } from "@/server/services/production-service";
import { getDashboardData } from "@/server/services/dashboard-service";
import { statusDoEstoque } from "@/lib/status-do-estoque";

/*
 * O ALERTA DE ESTOQUE, DE PONTA A PONTA.
 *
 * Havia OITO implementacoes desta pergunta espalhadas pelo projeto, em dois
 * regimes que nem usavam o mesmo campo. Cinco ignoravam o reservado: um item
 * com 10 unidades e 8 prometidas era "normal", com duas livres.
 *
 * Estes testes provam que os consumidores passaram a responder a MESMA coisa,
 * e que essa coisa e a regra nova — com o reservado descontado.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

async function semear(migration: string) {
  const sql = readFileSync(
    resolve(__dirname, `../../../../prisma/migrations/${migration}/migration.sql`),
    "utf8",
  )
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);
}

beforeEach(async () => {
  await limparBanco();
  await semear(SEED_UNIDADES);
  const loja = await prisma.store.create({
    data: {
      slug: `alerta-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      name: "Cozinha",
      settings: { create: { storeName: "C", whatsappNumber: "11999999999" } },
    },
  });
  storeId = loja.id;
});
afterAll(limparBanco);

/** Um item com saldo, reserva e mínimo escritos direto — sem passar pelo razão. */
const item = (
  name: string,
  quantityOnHand: number,
  quantityReserved: number,
  minimumThreshold: number | null,
  isActive = true,
) =>
  prisma.inventoryItem.create({
    data: {
      storeId,
      name,
      itemType: "INGREDIENT",
      baseUnitId: "unit_un",
      quantityOnHand,
      quantityReserved,
      minimumThreshold,
      isActive,
    },
  });

const nomesEmAlerta = async () =>
  (await ProductionService.getLowStockItems(storeId)).map((i: any) => i.name).sort();

const nomesNoRelatorio = async () =>
  (await reportRepository.getLowStockItems(storeId)).map((i: any) => i.name).sort();

const contadorDoPainel = async () =>
  (await getDashboardData(storeId)).operacao.estoqueBaixo;

// ══════════════════════════════════════════════════════════════════════
describe("os cinco cenários obrigatórios", () => {
  it("CENÁRIO 1 — 10 físico, 8 reservado, mínimo 3 → LOW_STOCK", async () => {
    const i = await item("Alvo", 10, 8, 3);
    const lido = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: i.id } });

    expect(statusDoEstoque(lido).status).toBe("LOW_STOCK");
    expect(statusDoEstoque(lido).disponivel).toBe(2);
    // E aparece nos consumidores.
    expect(await nomesEmAlerta()).toEqual(["Alvo"]);
    expect(await nomesNoRelatorio()).toEqual(["Alvo"]);
    expect(await contadorDoPainel()).toBe(1);
  });

  it("CENÁRIO 2 — 3 físico, 3 reservado, mínimo 3 → OUT_OF_STOCK", async () => {
    const i = await item("Alvo", 3, 3, 3);
    const lido = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: i.id } });

    expect(statusDoEstoque(lido).status).toBe("OUT_OF_STOCK");
    expect(await nomesEmAlerta()).toEqual(["Alvo"]);
    /*
     * O contador do painel conta LOW_STOCK, e nao "tudo que nao esta normal":
     * o texto que ele alimenta diz "itens abaixo do minimo", e um item sem
     * disponivel nao esta abaixo do minimo — esta sem nada.
     */
    expect(await contadorDoPainel()).toBe(0);
  });

  it("CENÁRIO 3 — 5 físico, 0 reservado, mínimo null → NORMAL", async () => {
    const i = await item("Alvo", 5, 0, null);
    const lido = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: i.id } });

    expect(statusDoEstoque(lido).status).toBe("NORMAL");
    expect(await nomesEmAlerta()).toEqual([]);
    expect(await nomesNoRelatorio()).toEqual([]);
    expect(await contadorDoPainel()).toBe(0);
  });

  it("CENÁRIO 4 — 0 físico, 0 reservado, mínimo null → OUT_OF_STOCK", async () => {
    const i = await item("Alvo", 0, 0, null);
    const lido = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: i.id } });

    expect(statusDoEstoque(lido).status).toBe("OUT_OF_STOCK");
    /*
     * ANTES ELE NAO APARECIA EM LUGAR NENHUM: as consultas filtravam
     * `minimumThreshold: { not: null }` no SQL, e um item sem minimo nunca era
     * lido. Um item zerado ficava invisivel por nao ter alerta configurado.
     */
    expect(await nomesEmAlerta()).toEqual(["Alvo"]);
    expect(await nomesNoRelatorio()).toEqual(["Alvo"]);
  });

  it("CENÁRIO 5 — 2,99999999 físico, mínimo 3 → LOW_STOCK", async () => {
    const i = await item("Alvo", 2.99999999, 0, 3);
    const lido = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: i.id } });

    expect(statusDoEstoque(lido).status).toBe("LOW_STOCK");
    expect(await contadorDoPainel()).toBe(1);
  });
});

describe("os consumidores concordam entre si", () => {
  /*
   * O TESTE QUE NAO PASSARIA ANTES. Cada consumidor tinha a sua regra: a
   * producao e o painel usavam `onHand < minimo`, o relatorio usava `<`, a
   * server function usava `<=` com comparacao de Decimal crua. Este caso —
   * disponivel abaixo do minimo com saldo fisico acima — separava todos eles.
   */
  it("um item com reserva alta aparece em TODOS os consumidores", async () => {
    await item("Reservado", 10, 9, 3);
    await item("Tranquilo", 10, 0, 3);

    expect(await nomesEmAlerta()).toEqual(["Reservado"]);
    expect(await nomesNoRelatorio()).toEqual(["Reservado"]);
    expect(await contadorDoPainel()).toBe(1);
  });

  it("o relatório traz os campos que a tela usa", async () => {
    await item("Alvo", 10, 8, 3);
    const linhas: any[] = await reportRepository.getLowStockItems(storeId);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toHaveProperty("name");
    expect(linhas[0]).toHaveProperty("baseUnit");
    expect(linhas[0]).toHaveProperty("cost");
    expect(linhas[0]).toHaveProperty("quantityReserved");
  });
});

describe("a comparação entre Decimal deixou de mentir", () => {
  /*
   * `10 <= 9` com dois Decimal do Prisma respondia TRUE: o valueOf() devolve
   * string e o operador comparava texto. Dois pontos do projeto faziam isso.
   */
  it("10 no estoque com mínimo 9 é NORMAL", async () => {
    await item("Alvo", 10, 0, 9);
    expect(await nomesEmAlerta()).toEqual([]);
    expect(await contadorDoPainel()).toBe(0);
  });

  it("100 no estoque com mínimo 20 é NORMAL", async () => {
    await item("Alvo", 100, 0, 20);
    expect(await nomesEmAlerta()).toEqual([]);
  });

  it("2 no estoque com mínimo 10 é LOW_STOCK", async () => {
    await item("Alvo", 2, 0, 10);
    expect(await nomesEmAlerta()).toEqual(["Alvo"]);
  });
});

describe("itens inativos ficam de fora", () => {
  it("item inativo em falta não entra em nenhum consumidor", async () => {
    await item("Inativo", 0, 0, 5, false);
    await item("Ativo", 10, 0, 3, true);

    expect(await nomesEmAlerta()).toEqual([]);
    expect(await nomesNoRelatorio()).toEqual([]);
    expect(await contadorDoPainel()).toBe(0);
  });
});

describe("o mínimo continua sendo lido na unidade base", () => {
  /*
   * Um item contado em garrafas com 900 ml cada: minimo 3 quer dizer TRES
   * GARRAFAS. O `contentSize` nao participa desta comparacao, e este teste
   * existe para que ninguem o adicione depois achando que falta.
   */
  it("contentSize não interfere no alerta", async () => {
    const oleo = await prisma.inventoryItem.create({
      data: {
        storeId,
        name: "Óleo",
        itemType: "INGREDIENT",
        baseUnitId: "unit_un",
        contentSize: 900,
        contentUnit: "unit_ml",
        quantityOnHand: 5.78,
        quantityReserved: 0.1,
        minimumThreshold: 1,
      },
    });
    const lido = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: oleo.id } });

    // 5,78 − 0,1 = 5,68 garrafas, contra um mínimo de 1 garrafa.
    expect(statusDoEstoque(lido).disponivel).toBeCloseTo(5.68, 8);
    expect(statusDoEstoque(lido).status).toBe("NORMAL");
  });

  it("o mesmo óleo com mínimo 6 garrafas é LOW_STOCK", async () => {
    const oleo = await prisma.inventoryItem.create({
      data: {
        storeId,
        name: "Óleo",
        itemType: "INGREDIENT",
        baseUnitId: "unit_un",
        contentSize: 900,
        contentUnit: "unit_ml",
        quantityOnHand: 5.78,
        quantityReserved: 0.1,
        minimumThreshold: 6,
      },
    });
    const lido = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: oleo.id } });
    expect(statusDoEstoque(lido).status).toBe("LOW_STOCK");
  });
});
