import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { CompositionService } from "@/server/services/composition-service";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { InventoryCostService } from "@/server/services/inventory-cost-service";

/*
 * A UNIDADE DA RECEITA, DE PONTA A PONTA.
 *
 * O motor de conversao sempre esteve certo; o que faltava era alguem poder
 * usa-lo. A ficha tecnica copiava a unidade do estoque e nao deixava trocar,
 * entao `converterParaUnidadeBase` voltava na primeira linha, sempre.
 *
 * Estes testes exercitam o caminho inteiro com a unidade da receita DIFERENTE
 * da unidade base: gravacao, recusa do que nao converte, baixa de estoque e
 * custo. Se algum dia alguem voltar a travar a unidade na tela, o de baixa
 * convertida continua passando e ninguem percebe — por isso o primeiro grupo
 * afirma que a gravacao guarda a unidade escolhida, e nao a base.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
const SEED_CONVERSOES = "20260827000000_semear_conversoes_de_unidade";
let storeId = "";
let categoriaId = "";

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
  await semear(SEED_CONVERSOES);
  const loja = await prisma.store.create({
    data: {
      slug: `unid-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      name: "Cozinha",
      settings: {
        create: {
          storeName: "Cozinha",
          whatsappNumber: "11999999999",
          inventoryControlEnabled: true,
        },
      },
    },
  });
  storeId = loja.id;
  categoriaId = (
    await prisma.category.create({
      data: { storeId, name: "Geral", slug: "geral", icon: "🍽", kind: "SIMPLE" },
    })
  ).id;
});
afterAll(limparBanco);

/** Insumo com saldo e custo conhecido, contado na unidade base pedida. */
async function insumo(
  name: string,
  baseUnitId: string,
  custoUnitario: number,
  qtd = 100,
) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name, baseUnitId, itemType: "INGREDIENT" } as any,
    { quantidade: qtd, precoDaEmbalagem: custoUnitario },
  );
}

async function produto(nome: string, dados: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoriaId,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2)}`,
      description: nome,
      basePrice: 50,
      ...dados,
    },
  });
}

const criarFicha = (productId: string, linhas: Array<{ inventoryItemId: string; quantity: number; unitId: string }>) =>
  CompositionService.createComposition(storeId, productId, {
    productId,
    isActive: true,
    items: linhas.map((l, i) => ({ ...l, sortOrder: i })),
  } as any);

/** Um pedido vendido de verdade: reservado, preparado, consumido. */
async function vender(productId: string, quantity: number, total = 50) {
  const order = await prisma.order.create({
    data: {
      storeId,
      number: Math.floor(Math.random() * 1000000),
      customerName: "Cliente",
      customerPhone: "11999999999",
      paymentMethod: "PIX",
      status: "COMPLETED",
      subtotal: total,
      total,
      items: {
        create: [{ productId, productNameSnapshot: "Item", unitPrice: total, quantity }],
      },
    },
  });
  await prisma.$transaction((tx) =>
    OrderInventoryHandler.reservarNaCriacao(tx, order.id, storeId),
  );
  await OrderInventoryHandler.onOrderPreparing(order.id);
  return order;
}

const consumoDe = (itemId: string) =>
  prisma.inventoryMovement.findFirst({
    where: { storeId, itemId, type: "CONSUMPTION" },
    include: { unit: true },
  });

// ══════════════════════════════════════════════════════════════════════
describe("a receita guarda a unidade escolhida, e nao a do estoque", () => {
  it("acucar em kg aceita ficha em g, e grava g", async () => {
    const acucar = await insumo("Açúcar", "unit_kg", 5, 10);
    const p = await produto("Bolo", { tipoDeControle: "PRODUCAO" });

    const ficha: any = await criarFicha(p.id, [
      { inventoryItemId: acucar.id, quantity: 100, unitId: "unit_g" },
    ]);

    const linha = await prisma.compositionItem.findFirst({
      where: { compositionId: ficha.id },
    });
    expect(linha!.unitId).toBe("unit_g");
    expect(Number(linha!.quantity)).toBe(100);
    // O insumo NAO foi tocado: a unidade da receita nao muda o estoque.
    const noBanco = await prisma.inventoryItem.findUnique({ where: { id: acucar.id } });
    expect(noBanco!.baseUnitId).toBe("unit_kg");
  });

  it("leite em L aceita ficha em ml", async () => {
    const leite = await insumo("Leite", "unit_l", 4, 10);
    const p = await produto("Vitamina", { tipoDeControle: "PRODUCAO" });
    const ficha: any = await criarFicha(p.id, [
      { inventoryItemId: leite.id, quantity: 250, unitId: "unit_ml" },
    ]);
    const linha = await prisma.compositionItem.findFirst({
      where: { compositionId: ficha.id },
    });
    expect(linha!.unitId).toBe("unit_ml");
  });
});

describe("o servidor recusa unidade incompativel — sem confiar na tela", () => {
  const incompativeis: Array<[string, string, string, string]> = [
    ["Açúcar", "unit_kg", "unit_ml", "kg com ml"],
    ["Açúcar", "unit_kg", "unit_un", "kg com un"],
    ["Leite", "unit_l", "unit_g", "L com g"],
    ["Leite", "unit_l", "unit_un", "L com un"],
    ["Ovos", "unit_un", "unit_kg", "un com kg"],
    ["Ovos", "unit_un", "unit_l", "un com L"],
  ];

  for (const [nome, base, daFicha, rotulo] of incompativeis) {
    it(`recusa ${rotulo}`, async () => {
      const item = await insumo(nome, base, 1, 10);
      const p = await produto(`Prato ${rotulo}`, { tipoDeControle: "PRODUCAO" });
      await expect(
        criarFicha(p.id, [{ inventoryItemId: item.id, quantity: 1, unitId: daFicha }]),
      ).rejects.toThrow(/não se converte|mesma grandeza/i);
      // E nada foi gravado pela metade.
      expect(await prisma.productComposition.count({ where: { productId: p.id } })).toBe(0);
    });
  }

  const compativeis: Array<[string, string, string]> = [
    ["unit_kg", "unit_g", "kg + g"],
    ["unit_kg", "unit_kg", "kg + kg"],
    ["unit_g", "unit_kg", "g + kg"],
    ["unit_l", "unit_ml", "L + ml"],
    ["unit_l", "unit_l", "L + L"],
    ["unit_ml", "unit_l", "ml + L"],
    ["unit_un", "unit_un", "un + un"],
  ];

  for (const [base, daFicha, rotulo] of compativeis) {
    it(`aceita ${rotulo}`, async () => {
      const item = await insumo(`Insumo ${rotulo}`, base, 1, 100);
      const p = await produto(`Prato ${rotulo}`, { tipoDeControle: "PRODUCAO" });
      const ficha: any = await criarFicha(p.id, [
        { inventoryItemId: item.id, quantity: 1, unitId: daFicha },
      ]);
      expect(ficha.id).toBeTruthy();
    });
  }
});

describe("a venda baixa na unidade BASE, convertida", () => {
  it("CENÁRIO 1 — açúcar 10 kg a R$5/kg, receita 100 g", async () => {
    const acucar = await insumo("Açúcar", "unit_kg", 5, 10);
    const p = await produto("Bolo", { tipoDeControle: "PRODUCAO" });
    await criarFicha(p.id, [{ inventoryItemId: acucar.id, quantity: 100, unitId: "unit_g" }]);

    const order = await vender(p.id, 1);

    const mov = await consumoDe(acucar.id);
    expect(mov!.unitId).toBe("unit_kg"); // o razao fala em unidade base
    expect(Number(mov!.quantity)).toBeCloseTo(-0.1, 6);
    expect(Number(mov!.costAtTime)).toBeCloseTo(5, 6);

    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(0.5, 6);
  });

  it("CENÁRIO 3 — leite 10 L a R$4/L, receita 250 ml", async () => {
    const leite = await insumo("Leite", "unit_l", 4, 10);
    const p = await produto("Vitamina", { tipoDeControle: "PRODUCAO" });
    await criarFicha(p.id, [{ inventoryItemId: leite.id, quantity: 250, unitId: "unit_ml" }]);

    const order = await vender(p.id, 1);

    const mov = await consumoDe(leite.id);
    expect(mov!.unitId).toBe("unit_l");
    expect(Number(mov!.quantity)).toBeCloseTo(-0.25, 6);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(1, 6);
  });

  it("CENÁRIO 5 — ovos 30 un a R$0,80, receita 4 un", async () => {
    const ovos = await insumo("Ovos", "unit_un", 0.8, 30);
    const p = await produto("Omelete", { tipoDeControle: "PRODUCAO" });
    await criarFicha(p.id, [{ inventoryItemId: ovos.id, quantity: 4, unitId: "unit_un" }]);

    const order = await vender(p.id, 1);

    expect(Number((await consumoDe(ovos.id))!.quantity)).toBeCloseTo(-4, 6);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(3.2, 6);
  });

  /*
   * O criterio de aceite explicito: dois produtos dobram o consumo, e a conta
   * de dobrar acontece ANTES da conversao, nao depois.
   */
  it("vender 2 dobra o consumo convertido: 2 × 250 ml = 0,5 L", async () => {
    const leite = await insumo("Leite", "unit_l", 4, 10);
    const p = await produto("Vitamina", { tipoDeControle: "PRODUCAO" });
    await criarFicha(p.id, [{ inventoryItemId: leite.id, quantity: 250, unitId: "unit_ml" }]);

    const order = await vender(p.id, 2);

    expect(Number((await consumoDe(leite.id))!.quantity)).toBeCloseTo(-0.5, 6);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(2, 6);
  });

  it("vender 2 de açúcar consome 0,2 kg", async () => {
    const acucar = await insumo("Açúcar", "unit_kg", 5, 10);
    const p = await produto("Bolo", { tipoDeControle: "PRODUCAO" });
    await criarFicha(p.id, [{ inventoryItemId: acucar.id, quantity: 100, unitId: "unit_g" }]);

    await vender(p.id, 2);

    expect(Number((await consumoDe(acucar.id))!.quantity)).toBeCloseTo(-0.2, 6);
    const item = await prisma.inventoryItem.findUnique({ where: { id: acucar.id } });
    expect(Number(item!.quantityOnHand)).toBeCloseTo(9.8, 6); // 10 kg − 0,2
  });
});

describe("o que já funcionava continua funcionando", () => {
  it("REVENDA baixa o item vinculado, sem receita", async () => {
    const coca = await insumo("Coca lata", "unit_un", 5, 50);
    const p = await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });

    const order = await vender(p.id, 3);

    expect(Number((await consumoDe(coca.id))!.quantity)).toBeCloseTo(-3, 6);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(15, 6);
  });

  it("NAO_CONTROLA nao gera consumo nenhum", async () => {
    const coca = await insumo("Coca lata", "unit_un", 5, 50);
    const p = await produto("Taxa de entrega", {
      tipoDeControle: "NAO_CONTROLA",
      inventoryItemId: coca.id,
    });

    await vender(p.id, 2);

    expect(await consumoDe(coca.id)).toBeNull();
  });

  it("produto LEGADO (tipo nulo) com ficha continua baixando e custando", async () => {
    const acucar = await insumo("Açúcar", "unit_kg", 5, 10);
    const p = await produto("Bolo antigo"); // tipoDeControle = NULL
    await criarFicha(p.id, [{ inventoryItemId: acucar.id, quantity: 200, unitId: "unit_g" }]);

    const order = await vender(p.id, 1);

    expect(Number((await consumoDe(acucar.id))!.quantity)).toBeCloseTo(-0.2, 6);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(1, 6);
  });

  it("produto sem receita e sem vinculo nao quebra a venda", async () => {
    const p = await produto("Só um nome", { tipoDeControle: "NAO_CONTROLA" });
    await expect(vender(p.id, 1)).resolves.toBeTruthy();
  });
});
