import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";

/*
 * A corrida de produção — M2, contra o Postgres local.
 *
 * Esta etapa cria estrutura, não comportamento: nada no sistema escreve em
 * `ProductionRun` ainda. O que dá para testar, então, é o que a estrutura
 * PROMETE — e é justamente o que costuma sair errado sem ninguém ver, porque
 * uma tabela vazia parece correta de qualquer jeito.
 *
 * Metade dos cenários lê os catálogos do Postgres em vez de passar pelo
 * Prisma. Um teste que só exercita o cliente prova que o cliente se comporta;
 * a Etapa 3 já mostrou que essas duas coisas não são a mesma.
 */

let storeId = "";
let unitKg = "";
let unitL = "";
let molhoId = "";
let receitaId = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

async function semear() {
  await limparBanco();
  const loja = await prisma.store.create({
    data: { slug: `corrida-${Date.now()}`, name: "Cozinha de Teste" },
  });
  storeId = loja.id;

  const kg = await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  });
  const litro = await prisma.inventoryUnit.create({
    data: { code: "L", name: "Litro", system: "VOLUME", isBuiltIn: true },
  });
  unitKg = kg.id;
  unitL = litro.id;

  const molho = await prisma.inventoryItem.create({
    data: {
      storeId,
      name: "Molho de tomate",
      itemType: "PREPARED",
      baseUnitId: unitKg,
      quantityOnHand: 0,
    },
  });
  molhoId = molho.id;

  const receita = await prisma.productComposition.create({
    data: {
      storeId,
      inventoryItemId: molhoId,
      version: 1,
      yieldQuantity: 4,
      yieldUnitId: unitKg,
    },
  });
  receitaId = receita.id;
}

async function criarCorrida(extra: Record<string, unknown> = {}) {
  return prisma.productionRun.create({
    data: {
      storeId,
      compositionId: receitaId,
      plannedQuantity: 4,
      producedQuantity: 3.8,
      unitId: unitKg,
      idempotencyKey: `${storeId}#PRODUCTION_RUN#${Math.random()}`,
      ...extra,
    },
  });
}

beforeEach(semear);
afterAll(limparBanco);

describe("corrida de produção: comportamento", () => {
  it("1 · grava uma corrida com planejado, produzido e a receita congelada", async () => {
    const corrida = await criarCorrida({ note: "panela da tarde" });

    expect(Number(corrida.plannedQuantity)).toBeCloseTo(4, 4);
    expect(Number(corrida.producedQuantity)).toBeCloseTo(3.8, 4);
    expect(corrida.compositionId).toBe(receitaId);
    expect(corrida.lossQuantity).toBeNull();

    // Navegável até o preparado, passando pela receita.
    const relida = await prisma.productionRun.findUnique({
      where: { id: corrida.id },
      include: { composition: { include: { inventoryItem: true } }, unit: true },
    });
    expect(relida!.composition.inventoryItem!.name).toBe("Molho de tomate");
    expect(relida!.composition.inventoryItem!.itemType).toBe("PREPARED");
    expect(Number(relida!.composition.yieldQuantity)).toBeCloseTo(4, 4);
    expect(relida!.unit.code).toBe("kg");
  });

  it("2 · nasce COMPLETED, e os campos que a Etapa 5 preenche nascem nulos", async () => {
    const corrida = await criarCorrida();

    expect(corrida.status).toBe("COMPLETED");
    expect(corrida.totalInputCost).toBeNull();
    expect(corrida.unitCost).toBeNull();
    expect(corrida.completedAt).toBeNull();
    expect(corrida.reversedAt).toBeNull();
    expect(corrida.reversedById).toBeNull();
    expect(corrida.inventoryInconsistentAt).toBeNull();
    expect(corrida.inventoryInconsistency).toBeNull();
    expect(corrida.createdAt).toBeInstanceOf(Date);
  });

  it("3 · a chave de idempotência é única: a mesma corrida não entra duas vezes", async () => {
    const chave = `${storeId}#PRODUCTION_RUN#token-fixo`;
    await criarCorrida({ idempotencyKey: chave });

    /*
     * É esta linha que substitui o `"AVULSO"`. Reenviar o mesmo token — um
     * duplo clique, um refresh no celular — é a mesma panela repetida, e o
     * índice único é quem recusa.
     */
    await expect(criarCorrida({ idempotencyKey: chave })).rejects.toThrow();
    expect(await prisma.productionRun.count()).toBe(1);
  });

  it("4 · duas panelas de verdade, com tokens diferentes, coexistem", async () => {
    await criarCorrida({ idempotencyKey: `${storeId}#PRODUCTION_RUN#a` });
    await criarCorrida({ idempotencyKey: `${storeId}#PRODUCTION_RUN#b` });

    /*
     * O espelho do cenário 3, e o que o default `"AVULSO"` impedia: duas
     * produções distintas da MESMA receita são dois fatos reais, e as duas
     * precisam caber.
     */
    expect(await prisma.productionRun.count()).toBe(2);
  });

  it("5 · movimento aponta para a corrida, e o vínculo separa produzido de comprado", async () => {
    const corrida = await criarCorrida();

    const daCozinha = await prisma.inventoryMovement.create({
      data: {
        storeId,
        idempotencyKey: `${storeId}#PRODUCTION_RUN#${corrida.id}#PRODUCTION#${molhoId}`,
        itemId: molhoId,
        type: "PRODUCTION",
        quantity: 3.8,
        unitId: unitKg,
        productionRunId: corrida.id,
      },
    });

    const compradoPronto = await prisma.inventoryMovement.create({
      data: {
        storeId,
        idempotencyKey: `${storeId}#PURCHASE#nota-123#${molhoId}`,
        itemId: molhoId,
        type: "PURCHASE",
        quantity: 2,
        unitId: unitKg,
      },
    });

    expect(daCozinha.productionRunId).toBe(corrida.id);
    expect(compradoPronto.productionRunId).toBeNull();

    /*
     * A consulta que os relatórios de rendimento vão precisar fazer: sem este
     * filtro, o molho comprado poluiria a eficiência da cozinha.
     */
    const produzidos = await prisma.inventoryMovement.count({
      where: { storeId, productionRunId: { not: null } },
    });
    expect(produzidos).toBe(1);

    const daCorrida = await prisma.productionRun.findUnique({
      where: { id: corrida.id },
      include: { movements: true },
    });
    expect(daCorrida!.movements).toHaveLength(1);
  });

  it("6 · ON DELETE: apagar a corrida NÃO apaga o movimento", async () => {
    const corrida = await criarCorrida();
    await prisma.inventoryMovement.create({
      data: {
        storeId,
        idempotencyKey: `${storeId}#m1`,
        itemId: molhoId,
        type: "PRODUCTION",
        quantity: 3.8,
        unitId: unitKg,
        productionRunId: corrida.id,
      },
    });

    await prisma.productionRun.delete({ where: { id: corrida.id } });

    /*
     * SetNull, não Cascade. O razão é imutável — é dele que o saldo é
     * derivado. Uma corrida apagada não pode levar junto a prova de que
     * 3,8 kg entraram no estoque, ou o saldo passa a não fechar com a
     * história.
     */
    const movimentos = await prisma.inventoryMovement.findMany({ where: { storeId } });
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0].productionRunId).toBeNull();
    expect(Number(movimentos[0].quantity)).toBeCloseTo(3.8, 4);
  });

  it("7 · ON DELETE: a versão de receita que já produziu não pode ser apagada", async () => {
    await criarCorrida();

    // Restrict: a corrida sempre sabe qual receita usou.
    await expect(
      prisma.productComposition.delete({ where: { id: receitaId } }),
    ).rejects.toThrow();

    expect(await prisma.productComposition.count()).toBe(1);
  });

  it("8 · ON DELETE: a unidade da corrida é protegida por RESTRICT", async () => {
    await criarCorrida({ unitId: unitL });

    await expect(
      prisma.inventoryUnit.delete({ where: { id: unitL } }),
    ).rejects.toThrow();
  });

  it("9 · o Restrict do compositionId NÃO atrapalha a exclusão da loja", async () => {
    const corrida = await criarCorrida();
    await prisma.inventoryMovement.create({
      data: {
        storeId,
        idempotencyKey: `${storeId}#m1`,
        itemId: molhoId,
        type: "PRODUCTION",
        quantity: 3.8,
        unitId: unitKg,
        productionRunId: corrida.id,
      },
    });

    /*
     * A dúvida que quase me fez escolher SetNull: um RESTRICT no meio de uma
     * cascata bloquearia a exclusão da loja? Não bloqueia — o Postgres remove
     * as corridas na mesma passada, antes de checar o Restrict. Excluir loja é
     * operação real neste projeto, então isto vira teste, não suposição.
     */
    await prisma.store.delete({ where: { id: storeId } });

    expect(await prisma.productionRun.count()).toBe(0);
    expect(await prisma.productComposition.count()).toBe(0);
    expect(await prisma.inventoryMovement.count()).toBe(0);
  });

  it("10 · averageCost existe, nasce nulo e nada o escreve nesta etapa", async () => {
    const item = await prisma.inventoryItem.findUnique({ where: { id: molhoId } });
    expect(item!.averageCost).toBeNull();

    // Aceita valor quando alguém decidir usá-lo — é reserva, não decoração.
    await prisma.inventoryItem.update({
      where: { id: molhoId },
      data: { averageCost: 10.4 },
    });
    const depois = await prisma.inventoryItem.findUnique({ where: { id: molhoId } });
    expect(Number(depois!.averageCost)).toBeCloseTo(10.4, 4);
  });

  it("11 · a corrida aceita perda declarada e a marca de inconsistência", async () => {
    const corrida = await criarCorrida({
      lossQuantity: 0.3,
      inventoryInconsistentAt: new Date(),
      inventoryInconsistency: "Reversão deixou o saldo negativo; precisa de contagem física.",
      reversedAt: new Date(),
      reversedById: "admin-42",
      status: "REVERSED",
    });

    expect(Number(corrida.lossQuantity)).toBeCloseTo(0.3, 4);
    expect(corrida.status).toBe("REVERSED");
    expect(corrida.reversedById).toBe("admin-42");
    expect(corrida.inventoryInconsistency).toMatch(/contagem física/);
  });
});

/*
 * Estrutura real, lida dos catálogos do Postgres.
 */
describe("corrida de produção: estrutura real", () => {
  async function constraintDef(nome: string) {
    const r = await prisma.$queryRawUnsafe<Array<{ d: string }>>(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = $1`,
      nome,
    );
    return r[0]?.d ?? null;
  }

  it("12 · a tabela tem exatamente as 21 colunas do projeto", async () => {
    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; is_nullable: string }>>(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='ProductionRun'`,
    );
    const nomes = cols.map((c) => c.column_name).sort();

    expect(nomes).toEqual(
      [
        "authorId", "authorName", "authorType", "completedAt", "compositionId",
        "createdAt", "id", "idempotencyKey", "inventoryInconsistency",
        "inventoryInconsistentAt", "lossQuantity", "note", "plannedQuantity",
        "producedQuantity", "reversedAt", "reversedById", "status",
        "storeId", "totalInputCost", "unitCost", "unitId",
      ].sort(),
    );

    const nulavel = (n: string) => cols.find((c) => c.column_name === n)!.is_nullable;
    // Obrigatórias: sem elas a corrida não é um fato completo.
    for (const n of ["storeId", "compositionId", "plannedQuantity", "producedQuantity", "unitId", "idempotencyKey", "status"]) {
      expect(nulavel(n), `${n} deveria ser NOT NULL`).toBe("NO");
    }
    // Preenchidas depois, pela Etapa 5, ou só em caso de reversão.
    for (const n of ["totalInputCost", "unitCost", "lossQuantity", "completedAt", "reversedAt", "reversedById", "inventoryInconsistentAt", "inventoryInconsistency"]) {
      expect(nulavel(n), `${n} deveria aceitar nulo`).toBe("YES");
    }
  });

  it("13 · idempotencyKey tem índice ÚNICO — é a garantia, não a consulta prévia", async () => {
    const idx = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname='public' AND tablename='ProductionRun'
          AND indexname='ProductionRun_idempotencyKey_key'`,
    );
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toMatch(/CREATE UNIQUE INDEX/);
    expect(idx[0].indexdef).not.toMatch(/WHERE/);
  });

  it("14 · as quatro FKs têm exatamente o ON DELETE decidido", async () => {
    const movimento = await constraintDef("InventoryMovement_productionRunId_fkey");
    expect(movimento).toMatch(/REFERENCES "ProductionRun"\(id\)/);
    expect(movimento).toMatch(/ON DELETE SET NULL/);

    const loja = await constraintDef("ProductionRun_storeId_fkey");
    expect(loja).toMatch(/REFERENCES "Store"\(id\)/);
    expect(loja).toMatch(/ON DELETE CASCADE/);

    const receita = await constraintDef("ProductionRun_compositionId_fkey");
    expect(receita).toMatch(/REFERENCES "ProductComposition"\(id\)/);
    // Restrict e não SetNull: decisão tomada nesta etapa, travada aqui.
    expect(receita).not.toMatch(/ON DELETE (SET NULL|CASCADE)/);

    const unidade = await constraintDef("ProductionRun_unitId_fkey");
    expect(unidade).toMatch(/REFERENCES "InventoryUnit"\(id\)/);
    expect(unidade).not.toMatch(/ON DELETE (SET NULL|CASCADE)/);
  });

  it("15 · os índices de consulta existem", async () => {
    const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname='public' AND tablename IN ('ProductionRun','InventoryMovement')`,
    );
    const nomes = idx.map((i) => i.indexname);

    expect(nomes).toContain("ProductionRun_storeId_createdAt_idx");
    expect(nomes).toContain("ProductionRun_storeId_status_idx");
    expect(nomes).toContain("ProductionRun_compositionId_idx");
    expect(nomes).toContain("InventoryMovement_productionRunId_idx");
  });

  it("16 · a migration é idempotente: rodar de novo não muda nada", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const caminho = resolve(
      __dirname,
      "../../../../prisma/migrations/20260826230000_corrida_de_producao/migration.sql",
    );

    const contar = async () => {
      const r = await prisma.$queryRawUnsafe<Array<{ c: number; i: number }>>(
        `SELECT
           (SELECT COUNT(*)::int FROM pg_constraint WHERE conrelid = '"ProductionRun"'::regclass) AS c,
           (SELECT COUNT(*)::int FROM pg_indexes WHERE tablename = 'ProductionRun') AS i`,
      );
      return r[0];
    };

    const antes = await contar();
    await prisma.$executeRawUnsafe(readFileSync(caminho, "utf8"));
    const depois = await contar();

    expect(depois.c).toBe(antes.c);
    expect(depois.i).toBe(antes.i);
    // E a tabela seguiu utilizável depois da segunda passada.
    await expect(criarCorrida()).resolves.toBeTruthy();
  });

  it("17 · a Fase 1 seguiu intacta: os uniques do movimento continuam de pé", async () => {
    /*
     * Esta etapa acrescentou uma coluna e um índice a `InventoryMovement`.
     * O que garante a idempotência do motor da Fase 1 são dois índices únicos
     * na mesma tabela — vale confirmar que ainda estão lá depois de mexer nela.
     */
    const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname='public' AND tablename='InventoryMovement'`,
    );
    const unicos = idx.filter((i) => i.indexdef.includes("UNIQUE")).map((i) => i.indexname);

    expect(unicos).toContain("InventoryMovement_idempotencyKey_key");
    expect(unicos).toContain("InventoryMovement_originalMovementId_key");
  });
});
