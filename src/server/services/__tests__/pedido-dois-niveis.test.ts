import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { ProducaoService } from "@/server/services/producao-service";
import { InventoryService } from "@/server/services/inventory-service";

/*
 * O pedido diante de um preparado, contra o Postgres local.
 *
 * A regra que estes cenários trancam cabe numa frase: a ficha do produto PARA
 * no primeiro item estocado. A Pizza consome molho; o tomate do molho já saiu
 * do estoque quando o molho foi produzido.
 *
 * Descer do molho até o tomate no pedido tiraria da prateleira um tomate que
 * não está mais lá. Por isso o cenário 08b existe: ele falha se alguém
 * "consertar" o motor adicionando recursão.
 */

let storeId = "";
let outraLojaId = "";
let unitKg = "";
let unitUn = "";
let categoriaId = "";

let tomateId = "";
let molhoId = "";
let pizzaId = "";
let fichaDaPizzaId = "";

let numeroDoPedido = 1;

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

async function criarItem(nome: string, tipo: string, saldo: number, custo: number | null, loja = storeId) {
  return prisma.inventoryItem.create({
    data: { storeId: loja, name: nome, itemType: tipo, baseUnitId: unitKg, quantityOnHand: saldo, cost: custo },
  });
}

async function semear() {
  await limparBanco();
  numeroDoPedido = 1;

  const loja = await prisma.store.create({ data: { slug: `ped-${Date.now()}`, name: "Cozinha" } });
  storeId = loja.id;
  const outra = await prisma.store.create({ data: { slug: `out-${Date.now()}`, name: "Outra" } });
  outraLojaId = outra.id;

  unitKg = (await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  })).id;
  unitUn = (await prisma.inventoryUnit.create({
    data: { code: "un", name: "Unidade", system: "COUNT", isBuiltIn: true },
  })).id;

  categoriaId = (await prisma.category.create({
    data: { storeId, name: "Pizzas", slug: `pz-${Date.now()}`, kind: "PIZZA" },
  })).id;

  tomateId = (await criarItem("Tomate", "INGREDIENT", 100, 8)).id;
  molhoId = (await criarItem("Molho", "PREPARED", 0, null)).id;

  // Receita do molho: 5,2 kg de tomate rendem 4 kg.
  await prisma.productComposition.create({
    data: {
      storeId, inventoryItemId: molhoId, version: 1,
      yieldQuantity: 4, yieldUnitId: unitKg,
      items: { create: [{ inventoryItemId: tomateId, quantity: 5.2, unitId: unitKg }] },
    },
  });

  // Pizza: 0,2 kg de molho por unidade.
  const pizza = await prisma.product.create({
    data: { storeId, categoryId: categoriaId, name: "Margherita", slug: `mg-${Date.now()}`, description: "", basePrice: 50 },
  });
  pizzaId = pizza.id;
  fichaDaPizzaId = (await prisma.productComposition.create({
    data: {
      storeId, productId: pizzaId, version: 1,
      items: { create: [{ inventoryItemId: molhoId, quantity: 0.2, unitId: unitKg }] },
    },
  })).id;
}

async function criarPedido(itens: Array<{ productId: string | null; quantity: number }>, loja = storeId) {
  return prisma.order.create({
    data: {
      storeId: loja,
      number: numeroDoPedido++,
      customerName: "Cliente",
      customerPhone: "11999999999",
      paymentMethod: "PIX",
      subtotal: 100,
      total: 100,
      items: {
        create: itens.map((i) => ({
          productId: i.productId,
          productNameSnapshot: "Item",
          unitPrice: 50,
          quantity: i.quantity,
        })),
      },
    },
    include: { items: true },
  });
}

/** Produz molho de verdade, pelo motor da Etapa 5. */
async function produzirMolho(quantidade = 4) {
  const receita = await prisma.productComposition.findFirst({
    where: { inventoryItemId: molhoId, isActive: true },
  });
  return ProducaoService.produzir(storeId, {
    compositionId: receita!.id,
    plannedQuantity: quantidade,
    producedQuantity: quantidade,
    runToken: `p-${Date.now()}-${Math.random()}`,
  });
}

const saldo = async (id: string) =>
  Number((await prisma.inventoryItem.findUnique({ where: { id } }))!.quantityOnHand);
const reservado = async (id: string) =>
  Number((await prisma.inventoryItem.findUnique({ where: { id } }))!.quantityReserved);

beforeEach(semear);
afterAll(limparBanco);

describe("pedido com composição", () => {
  it("01 · pedido de produto com ficha reserva o insumo que a ficha aponta", async () => {
    await produzirMolho(4);
    const pedido = await criarPedido([{ productId: pizzaId, quantity: 3 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);

    expect(await reservado(molhoId)).toBeCloseTo(0.6, 4); // 3 × 0,2
    expect(await saldo(molhoId)).toBeCloseTo(4, 4); // reserva não tira da prateleira

    // E a versão da ficha ficou congelada no item do pedido.
    const item = await prisma.orderItem.findFirst({ where: { orderId: pedido.id } });
    expect(item!.compositionVersionId).toBe(fichaDaPizzaId);
  });

  it("08 · dois níveis: o pedido consome o MOLHO, e o tomate não é tocado", async () => {
    await produzirMolho(4);
    const tomateDepoisDaProducao = await saldo(tomateId); // 100 − 5,2 = 94,8
    expect(tomateDepoisDaProducao).toBeCloseTo(94.8, 4);

    const pedido = await criarPedido([{ productId: pizzaId, quantity: 3 }]);
    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    expect(await saldo(molhoId)).toBeCloseTo(3.4, 4); // 4 − 0,6
    expect(await reservado(molhoId)).toBeCloseTo(0, 4);

    /*
     * A asserção central da etapa. O tomate saiu do estoque UMA vez, quando o
     * molho foi produzido. Se o pedido descesse até ele, sairia de novo — e o
     * saldo passaria a divergir do que existe fisicamente na prateleira.
     */
    expect(await saldo(tomateId)).toBeCloseTo(tomateDepoisDaProducao, 4);
  });

  it("08b · nenhum movimento do pedido toca o tomate, nem com quantidade zero", async () => {
    await produzirMolho(4);
    const pedido = await criarPedido([{ productId: pizzaId, quantity: 3 }]);
    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    /*
     * Conferir o saldo não basta: uma recursão que consumisse 0 do tomate
     * deixaria o saldo igual e ainda assim criaria movimento. Este cenário
     * falha se alguém adicionar recursão ao caminho do pedido.
     */
    const doPedido = await prisma.inventoryMovement.findMany({
      where: { storeId, reference: pedido.id, referenceType: "ORDER" },
    });
    const itensTocados = new Set(doPedido.map((m) => m.itemId));

    expect(itensTocados.has(molhoId)).toBe(true);
    expect(itensTocados.has(tomateId), "o pedido criou movimento no tomate").toBe(false);
    expect(itensTocados.size).toBe(1);
  });

  it("03 · três níveis: o pedido para no primeiro item estocado, não no último", async () => {
    // base ← molho ← tomate, e a pizza passa a levar base.
    const baseId = (await criarItem("Base", "PREPARED", 0, null)).id;
    await prisma.productComposition.create({
      data: {
        storeId, inventoryItemId: baseId, version: 1,
        yieldQuantity: 2, yieldUnitId: unitKg,
        items: { create: [{ inventoryItemId: molhoId, quantity: 1, unitId: unitKg }] },
      },
    });
    await prisma.compositionItem.deleteMany({ where: { compositionId: fichaDaPizzaId } });
    await prisma.compositionItem.create({
      data: { compositionId: fichaDaPizzaId, inventoryItemId: baseId, quantity: 0.1, unitId: unitKg },
    });

    await produzirMolho(4);
    const receitaDaBase = await prisma.productComposition.findFirst({
      where: { inventoryItemId: baseId, isActive: true },
    });
    await ProducaoService.produzir(storeId, {
      compositionId: receitaDaBase!.id,
      plannedQuantity: 2, producedQuantity: 2,
      runToken: `b-${Date.now()}`,
    });

    const tomateAntes = await saldo(tomateId);
    const molhoAntes = await saldo(molhoId);

    const pedido = await criarPedido([{ productId: pizzaId, quantity: 2 }]);
    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    // Só a base cai. Molho e tomate ficam onde estavam.
    expect(await saldo(baseId)).toBeCloseTo(1.8, 4); // 2 − 0,2
    expect(await saldo(molhoId)).toBeCloseTo(molhoAntes, 4);
    expect(await saldo(tomateId)).toBeCloseTo(tomateAntes, 4);
  });

  it("09 · a reserva de preparado respeita o teto onHand − reserved", async () => {
    await produzirMolho(4); // 4 kg de molho = 20 pizzas

    const primeiro = await criarPedido([{ productId: pizzaId, quantity: 18 }]);
    await OrderInventoryHandler.onOrderReceived(primeiro.id);
    expect(await reservado(molhoId)).toBeCloseTo(3.6, 4);

    /*
     * Sobram 0,4 kg livres — 2 pizzas. Um pedido de 5 promete molho que não
     * existe, e é recusado inteiro. É aqui que o teto ganha sentido: você só
     * promete o molho que de fato fez, não o que poderia fazer.
     */
    const segundo = await criarPedido([{ productId: pizzaId, quantity: 5 }]);
    await expect(OrderInventoryHandler.onOrderReceived(segundo.id)).rejects.toThrow();

    // E a recusa não deixou reserva pela metade.
    expect(await reservado(molhoId)).toBeCloseTo(3.6, 4);
  });

  it("14 · cancelar não devolve o PREPARADO, e nunca os ingredientes dele", async () => {
    await produzirMolho(4);
    const tomateAposProducao = await saldo(tomateId);

    const pedido = await criarPedido([{ productId: pizzaId, quantity: 3 }]);
    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);
    expect(await saldo(molhoId)).toBeCloseTo(3.4, 4);

    await OrderInventoryHandler.onOrderCancelled(pedido.id);

    /*
     * Nada volta, em nenhum dos dois níveis — por dois motivos diferentes.
     *
     * O tomate não volta porque virou molho, e molho não se desfaz em tomate:
     * é o consumo da PRODUÇÃO, que o cancelamento de um pedido nem enxerga.
     * O molho não volta porque em PREPARING ele já foi usado na pizza — o
     * cancelamento reclassifica essa saída como perda, não a desfaz.
     */
    expect(await saldo(molhoId)).toBeCloseTo(3.4, 4);
    expect(await saldo(tomateId)).toBeCloseTo(tomateAposProducao, 4);
    expect(await reservado(molhoId)).toBeCloseTo(0, 4);

    // A perda é do MOLHO, o nível que o pedido consome. O tomate não aparece.
    const perdas = await prisma.inventoryMovement.findMany({
      where: { type: "LOSS", reference: pedido.id },
    });
    expect(perdas).toHaveLength(1);
    expect(perdas[0].itemId).toBe(molhoId);
  });

  it("14b · cancelar sobre estoque JA negativo não mexe no saldo", async () => {
    await produzirMolho(4);
    const pedido = await criarPedido([{ productId: pizzaId, quantity: 3 }]);
    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id); // molho 4 -> 3,4

    // A cozinha usou muito mais do que existia, por fora do sistema.
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: storeId + "#AJUSTE#neg",
      itemId: molhoId, type: "CONSUMPTION", quantity: -5, unitId: unitKg,
      permitirSaldoNegativo: true,
    } as any);
    expect(await saldo(molhoId)).toBeCloseTo(-1.6, 4);

    await OrderInventoryHandler.onOrderCancelled(pedido.id);

    /*
     * O saldo fica exatamente onde estava: o par REVERSAL+LOSS repõe 0,6 e
     * tira 0,6 de novo, e a soma é zero de propósito.
     *
     * É AQUI QUE A PERMISSÃO EXPLÍCITA DE SALDO NEGATIVO NO LOSS SE PAGA. A
     * perda recusa negativo por padrão — ali o negativo seria erro de digitação.
     * Sem a permissão, a segunda metade do par seria rejeitada e sobraria só a
     * reversão: molho devolvido ao estoque, perda nunca registrada, e o saldo
     * subindo para −1 sem que nada tivesse voltado à prateleira.
     *
     * O consumo avulso acima não é tocado: ele não tem `reference` do pedido,
     * e a conversão em perda só alcança o que o pedido baixou.
     */
    expect(await saldo(molhoId)).toBeCloseTo(-1.6, 4);

    const perda = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: molhoId, type: "LOSS", reference: pedido.id },
    });
    expect(Math.abs(Number(perda.quantity))).toBeCloseTo(0.6, 4);
  });
});

describe("pedido: garantias do motor", () => {
  it("04 · estoque insuficiente no preparo NÃO recusa: baixa, fica negativo e marca", async () => {
    await produzirMolho(4);
    const pedido = await criarPedido([{ productId: pizzaId, quantity: 3 }]);
    await OrderInventoryHandler.onOrderReceived(pedido.id);

    // Entre a reserva e o preparo, alguém deu baixa manual de quase tudo.
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#AJUSTE#1`,
      itemId: molhoId, type: "CONSUMPTION", quantity: -3.9, unitId: unitKg,
      permitirSaldoNegativo: true,
    } as any);

    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    /*
     * O prato foi vendido e a cozinha já usou. Recusar não devolveria molho,
     * só apagaria o registro de que ele saiu. O saldo vai a negativo e o
     * pedido recebe uma marca legível.
     */
    expect(await saldo(molhoId)).toBeLessThan(0);
    const depois = await prisma.order.findUnique({ where: { id: pedido.id } });
    expect(depois!.inventoryInconsistentAt).toBeInstanceOf(Date);
    expect(depois!.inventoryInconsistency).toMatch(/negativo|contagem/i);
  });

  it("05 · concorrência: dez pedidos disputando molho para dois", async () => {
    await produzirMolho(0.4); // 0,4 kg = 2 pizzas de 0,2

    const pedidos = await Promise.all(
      Array.from({ length: 10 }, () => criarPedido([{ productId: pizzaId, quantity: 1 }])),
    );
    const r = await Promise.allSettled(
      pedidos.map((p) => OrderInventoryHandler.onOrderReceived(p.id)),
    );
    const aceitos = r.filter((x) => x.status === "fulfilled").length;

    expect(aceitos).toBe(2);
    expect(await reservado(molhoId)).toBeCloseTo(0.4, 4);
    expect(await reservado(molhoId)).toBeLessThanOrEqual(await saldo(molhoId));
  });

  it("06 · retry: reprocessar o mesmo pedido não consome duas vezes", async () => {
    await produzirMolho(4);
    const pedido = await criarPedido([{ productId: pizzaId, quantity: 3 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderReceived(pedido.id); // retry
    expect(await reservado(molhoId)).toBeCloseTo(0.6, 4);

    await OrderInventoryHandler.onOrderPreparing(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id); // retry

    /*
     * A chave é `store#ORDER#{id}#CONSUMPTION#{item}` — determinística por
     * pedido e insumo. A segunda passada bate no índice único e é reconhecida
     * como repetição, sem descontar de novo.
     */
    expect(await saldo(molhoId)).toBeCloseTo(3.4, 4);
    const consumos = await prisma.inventoryMovement.count({
      where: { storeId, reference: pedido.id, type: "CONSUMPTION" },
    });
    expect(consumos).toBe(1);
  });

  it("07 · isolamento: o motor recusa insumo de outra loja", async () => {
    const alheio = await criarItem("Molho alheio", "PREPARED", 100, 5, outraLojaId);

    await expect(
      InventoryService.reserveForOrder(storeId, alheio.id, 1, "pedido-x"),
    ).rejects.toThrow();

    expect(await saldo(alheio.id)).toBeCloseTo(100, 4);
    expect(await reservado(alheio.id)).toBeCloseTo(0, 4);
  });

  it("08c · falha no meio da reserva desfaz as reservas já feitas", async () => {
    await produzirMolho(4);
    // Um segundo insumo na ficha, sem saldo nenhum.
    const queijoId = (await criarItem("Queijo", "INGREDIENT", 0, 30)).id;
    await prisma.compositionItem.create({
      data: { compositionId: fichaDaPizzaId, inventoryItemId: queijoId, quantity: 0.1, unitId: unitKg },
    });

    const pedido = await criarPedido([{ productId: pizzaId, quantity: 3 }]);
    await expect(OrderInventoryHandler.onOrderReceived(pedido.id)).rejects.toThrow();

    /*
     * Reservar metade deixaria molho comprometido para um prato que não vai
     * sair, e ninguém liberaria essa metade depois.
     */
    expect(await reservado(molhoId)).toBeCloseTo(0, 4);
    expect(await reservado(queijoId)).toBeCloseTo(0, 4);
  });

  it("09b · custo histórico: o consumo congela o custo do molho no momento", async () => {
    await produzirMolho(4); // molho a 10,40/kg
    const pedido = await criarPedido([{ productId: pizzaId, quantity: 3 }]);
    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    const consumo = await prisma.inventoryMovement.findFirst({
      where: { storeId, reference: pedido.id, type: "CONSUMPTION" },
    });
    expect(Number(consumo!.costAtTime)).toBeCloseTo(10.4, 2);

    // Uma produção mais cara depois não reescreve o que já foi vendido.
    await prisma.inventoryItem.update({ where: { id: tomateId }, data: { cost: 32 } });
    await produzirMolho(4);

    const relido = await prisma.inventoryMovement.findUnique({ where: { id: consumo!.id } });
    expect(Number(relido!.costAtTime)).toBeCloseTo(10.4, 2);
  });
});

describe("pedido sem preparado", () => {
  it("10 · produto sem ficha e sem vínculo não move estoque nenhum", async () => {
    const avulso = await prisma.product.create({
      data: { storeId, categoryId: categoriaId, name: "Couvert", slug: `cv-${Date.now()}`, description: "", basePrice: 10 },
    });
    const pedido = await criarPedido([{ productId: avulso.id, quantity: 2 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    expect(await prisma.inventoryMovement.count({ where: { storeId } })).toBe(0);
  });

  it("11 · produto de revenda cai no vínculo direto, sem virar preparado", async () => {
    // Uma garrafa: item de estoque ligado ao produto, sem ficha nenhuma.
    const refriId = (await criarItem("Refrigerante", "RESALE", 50, 4)).id;
    const refri = await prisma.product.create({
      data: {
        storeId, categoryId: categoriaId, name: "Refri", slug: `rf-${Date.now()}`,
        description: "", basePrice: 8, inventoryItemId: refriId,
      },
    });
    const pedido = await criarPedido([{ productId: refri.id, quantity: 4 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    /*
     * O item é RESALE, não PREPARED: nada de receita, nada de produção. Sai
     * uma unidade por unidade vendida.
     */
    expect(await saldo(refriId)).toBeCloseTo(46, 4);
    const item = await prisma.orderItem.findFirst({ where: { orderId: pedido.id } });
    expect(item!.compositionVersionId).toBeNull();
  });

  it("12 · pedido misto: cada linha usa o seu caminho", async () => {
    await produzirMolho(4);
    const refriId = (await criarItem("Refrigerante", "RESALE", 50, 4)).id;
    const refri = await prisma.product.create({
      data: {
        storeId, categoryId: categoriaId, name: "Refri", slug: `rf2-${Date.now()}`,
        description: "", basePrice: 8, inventoryItemId: refriId,
      },
    });

    const pedido = await criarPedido([
      { productId: pizzaId, quantity: 2 },
      { productId: refri.id, quantity: 3 },
    ]);
    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    expect(await saldo(molhoId)).toBeCloseTo(3.6, 4); // 4 − 0,4
    expect(await saldo(refriId)).toBeCloseTo(47, 4); // 50 − 3
  });
});
