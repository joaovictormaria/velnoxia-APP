import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";

/*
 * O motor de estoque, contra o Postgres local.
 *
 * Cada cenário confere o SALDO no banco depois de rodar, não o retorno da
 * função. É a diferença entre os dois que revela uma reversão que não repõe ou
 * uma corrida que perdeu uma baixa.
 */

let storeId = "";
let unitKg = "";
let unitG = "";
let unitUn = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

/** Unidades são globais e não pertencem à loja; recriadas a cada truncate. */
async function semear() {
  await limparBanco();
  const loja = await prisma.store.create({
    data: { slug: `motor-${Date.now()}`, name: "Cozinha de Teste" },
  });
  storeId = loja.id;
  const kg = await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  });
  const un = await prisma.inventoryUnit.create({
    data: { code: "un", name: "Unidade", system: "COUNT", isBuiltIn: true },
  });
  const g = await prisma.inventoryUnit.create({
    data: { code: "g", name: "Grama", system: "WEIGHT", isBuiltIn: true },
  });
  // A conversao g -> kg precisa existir: a ficha pede gramas e o pote
  // tem seu conteudo declarado em gramas.
  await prisma.inventoryUnitConversion.create({
    data: { fromUnitId: g.id, toUnitId: kg.id, conversionFactor: 0.001 },
  });
  unitG = g.id;
  unitKg = kg.id;
  unitUn = un.id;
}

async function criarInsumo(nome: string, saldo: number, custo = 10) {
  return prisma.inventoryItem.create({
    data: {
      storeId,
      name: nome,
      itemType: "INGREDIENT",
      baseUnitId: unitKg,
      quantityOnHand: saldo,
      cost: custo,
    },
  });
}

/** Produto de venda com ficha técnica versionada. */
async function criarProdutoComFicha(
  nome: string,
  ingredientes: Array<{ itemId: string; quantidade: number }>,
  versao = 1,
) {
  const categoria = await prisma.category.create({
    data: { storeId, name: `Cat ${nome}`, slug: `cat-${nome}-${Date.now()}`, icon: "x", kind: "SIMPLE" },
  });
  const produto = await prisma.product.create({
    data: {
      storeId,
      categoryId: categoria.id,
      name: nome,
      slug: `${nome}-${Date.now()}`.toLowerCase(),
      description: nome,
      basePrice: 30,
    },
  });
  const ficha = await prisma.productComposition.create({
    data: {
      storeId,
      productId: produto.id,
      version: versao,
      isActive: true,
      items: {
        create: ingredientes.map((i, ordem) => ({
          inventoryItemId: i.itemId,
          quantity: i.quantidade,
          unitId: unitKg,
          sortOrder: ordem,
        })),
      },
    },
  });
  return { produto, ficha };
}

async function criarPedido(itens: Array<{ productId: string; quantity: number }>) {
  const ultimo = await prisma.order.findFirst({
    where: { storeId }, orderBy: { number: "desc" }, select: { number: true },
  });
  return prisma.order.create({
    data: {
      storeId,
      number: (ultimo?.number ?? 0) + 1,
      customerName: "Cliente",
      customerPhone: "11999999999",
      paymentMethod: "PIX",
      subtotal: 30,
      total: 30,
      items: {
        create: itens.map((i) => ({
          productId: i.productId,
          productNameSnapshot: "Prato",
          unitPrice: 30,
          quantity: i.quantity,
        })),
      },
    },
    include: { items: true },
  });
}

const saldo = async (id: string) => {
  const i = await prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
  return { onHand: Number(i.quantityOnHand), reserved: Number(i.quantityReserved) };
};

beforeEach(semear);
afterAll(async () => {
  await limparBanco();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------- IDEMPOTÊNCIA
describe("idempotência", () => {
  it("1. mesma chave duas vezes cria um único movimento", async () => {
    const item = await criarInsumo("Arroz", 10);
    const chave = `${storeId}#TESTE#1`;
    const dados = {
      idempotencyKey: chave, itemId: item.id, type: "PURCHASE",
      quantity: 5, unitId: unitKg,
    } as any;

    await InventoryService.recordMovement(storeId, dados);
    await InventoryService.recordMovement(storeId, dados);

    expect(await prisma.inventoryMovement.count({ where: { idempotencyKey: chave } })).toBe(1);
    // E o saldo subiu uma vez só.
    expect((await saldo(item.id)).onHand).toBe(15);
  });

  it("2. syncOrderStatus dez vezes tem o efeito de uma", async () => {
    const frango = await criarInsumo("Frango", 100);
    const { produto } = await criarProdutoComFicha("Bowl", [{ itemId: frango.id, quantidade: 2 }]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 3 }]);

    for (let i = 0; i < 10; i++) {
      await OrderInventoryHandler.syncOrderStatus(pedido.id, "RECEIVED");
    }
    expect((await saldo(frango.id)).reserved).toBe(6);
  });

  it("3. duas chamadas simultâneas com a mesma chave criam um só", async () => {
    const item = await criarInsumo("Sal", 10);
    const dados = {
      idempotencyKey: `${storeId}#CORRIDA#1`, itemId: item.id,
      type: "PURCHASE", quantity: 4, unitId: unitKg,
    } as any;

    await Promise.allSettled([
      InventoryService.recordMovement(storeId, dados),
      InventoryService.recordMovement(storeId, dados),
    ]);

    expect(await prisma.inventoryMovement.count({ where: { itemId: item.id } })).toBe(1);
    expect((await saldo(item.id)).onHand).toBe(14);
  });

  it("4. retentativa depois de falha parcial não duplica", async () => {
    const a = await criarInsumo("A", 10);
    const b = await criarInsumo("B", 0); // vai faltar
    const { produto } = await criarProdutoComFicha("Prato", [
      { itemId: a.id, quantidade: 1 },
      { itemId: b.id, quantidade: 1 },
    ]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await expect(OrderInventoryHandler.onOrderReceived(pedido.id)).rejects.toThrow();
    await expect(OrderInventoryHandler.onOrderReceived(pedido.id)).rejects.toThrow();

    // Nada ficou reservado em nenhuma das tentativas.
    expect((await saldo(a.id)).reserved).toBe(0);
    expect((await saldo(b.id)).reserved).toBe(0);
  });
});

// --------------------------------------------------------------------- RESERVA
describe("reserva", () => {
  it("5. produto com ficha reserva os insumos da ficha", async () => {
    const frango = await criarInsumo("Frango", 50);
    const arroz = await criarInsumo("Arroz", 50);
    const { produto } = await criarProdutoComFicha("Bowl", [
      { itemId: frango.id, quantidade: 0.12 },
      { itemId: arroz.id, quantidade: 0.18 },
    ]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 2 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);

    expect((await saldo(frango.id)).reserved).toBeCloseTo(0.24, 4);
    expect((await saldo(arroz.id)).reserved).toBeCloseTo(0.36, 4);
    // Reserva não tira da prateleira.
    expect((await saldo(frango.id)).onHand).toBe(50);
  });

  it("6. produto sem ficha usa o vínculo direto", async () => {
    const refri = await criarInsumo("Refrigerante", 20);
    const categoria = await prisma.category.create({
      data: { storeId, name: "Bebidas", slug: `beb-${Date.now()}`, icon: "x", kind: "SIMPLE" },
    });
    const produto = await prisma.product.create({
      data: {
        storeId, categoryId: categoria.id, name: "Lata", slug: `lata-${Date.now()}`,
        description: "Lata", basePrice: 8, inventoryItemId: refri.id,
      },
    });
    const pedido = await criarPedido([{ productId: produto.id, quantity: 3 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    expect((await saldo(refri.id)).reserved).toBe(3);
  });

  it("7. dois itens com ingrediente comum agregam numa reserva só", async () => {
    const frango = await criarInsumo("Frango", 100);
    const { produto: bowl } = await criarProdutoComFicha("Bowl", [{ itemId: frango.id, quantidade: 1 }]);
    const { produto: wrap } = await criarProdutoComFicha("Wrap", [{ itemId: frango.id, quantidade: 2 }]);
    const pedido = await criarPedido([
      { productId: bowl.id, quantity: 1 },
      { productId: wrap.id, quantity: 1 },
    ]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);

    expect((await saldo(frango.id)).reserved).toBe(3);
    // Um movimento por insumo, não um por item do pedido.
    expect(await prisma.inventoryMovement.count({
      where: { itemId: frango.id, type: "RESERVATION" },
    })).toBe(1);
  });

  it("8. saldo insuficiente recusa o pedido inteiro", async () => {
    const ok = await criarInsumo("Tem", 100);
    const falta = await criarInsumo("Falta", 1);
    const { produto } = await criarProdutoComFicha("Prato", [
      { itemId: ok.id, quantidade: 1 },
      { itemId: falta.id, quantidade: 5 },
    ]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await expect(OrderInventoryHandler.onOrderReceived(pedido.id)).rejects.toThrow();

    // O que chegou a ser reservado foi desfeito: ou tudo, ou nada.
    expect((await saldo(ok.id)).reserved).toBe(0);
    expect((await saldo(falta.id)).reserved).toBe(0);
  });

  it("9. converte a unidade da ficha para a do estoque", async () => {
    const iogurte = await prisma.inventoryItem.create({
      data: {
        storeId, name: "Iogurte", itemType: "INGREDIENT", baseUnitId: unitUn,
        quantityOnHand: 10, contentSize: 500, contentUnit: unitG, cost: 6,
      },
    });
    const categoria = await prisma.category.create({
      data: { storeId, name: "C", slug: `c-${Date.now()}`, icon: "x", kind: "SIMPLE" },
    });
    const produto = await prisma.product.create({
      data: {
        storeId, categoryId: categoria.id, name: "Molho",
        slug: `molho-${Date.now()}`, description: "Molho", basePrice: 5,
      },
    });
    // A ficha pede 250 g; o estoque conta potes de 500 g.
    await prisma.productComposition.create({
      data: {
        storeId, productId: produto.id, version: 1, isActive: true,
        items: { create: [{ inventoryItemId: iogurte.id, quantity: 250, unitId: unitG, sortOrder: 0 }] },
      },
    });
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    expect((await saldo(iogurte.id)).reserved).toBeCloseTo(0.5, 4);
  });
});

// ---------------------------------------------------------------- CONCORRÊNCIA
describe("concorrência", () => {
  it("10. dez reservas simultâneas com saldo para três: só três passam", async () => {
    const frango = await criarInsumo("Frango", 3);
    const { produto } = await criarProdutoComFicha("Bowl", [{ itemId: frango.id, quantidade: 1 }]);
    const pedidos = [];
    for (let i = 0; i < 10; i++) pedidos.push(await criarPedido([{ productId: produto.id, quantity: 1 }]));

    const r = await Promise.allSettled(
      pedidos.map((p) => OrderInventoryHandler.onOrderReceived(p.id)),
    );

    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(3);
    expect((await saldo(frango.id)).reserved).toBe(3);
  });

  it("11. quantityReserved final bate com a soma dos movimentos", async () => {
    const item = await criarInsumo("Insumo", 100);
    const { produto } = await criarProdutoComFicha("P", [{ itemId: item.id, quantidade: 1 }]);
    const pedidos = [];
    for (let i = 0; i < 8; i++) pedidos.push(await criarPedido([{ productId: produto.id, quantity: 2 }]));

    await Promise.allSettled(pedidos.map((p) => OrderInventoryHandler.onOrderReceived(p.id)));

    const movimentos = await prisma.inventoryMovement.findMany({
      where: { itemId: item.id, type: "RESERVATION" },
    });
    const somado = movimentos.reduce((s, m) => s + Number(m.quantity), 0);
    expect((await saldo(item.id)).reserved).toBeCloseTo(somado, 4);
  });

  it("12. cinquenta compras paralelas não perdem nenhuma", async () => {
    const item = await criarInsumo("Arroz", 0);
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        InventoryService.recordMovement(storeId, {
          idempotencyKey: `${storeId}#PAR#${i}`, itemId: item.id,
          type: "PURCHASE", quantity: 1, unitId: unitKg,
        } as any),
      ),
    );
    // Sem lost update, os 50 incrementos aparecem.
    expect((await saldo(item.id)).onHand).toBe(50);
  });

  it("13. travas em ordem estável não travam entre si", async () => {
    const a = await criarInsumo("A", 500);
    const b = await criarInsumo("B", 500);
    // Duas fichas com os mesmos insumos em ordem inversa.
    const { produto: p1 } = await criarProdutoComFicha("X", [
      { itemId: a.id, quantidade: 1 }, { itemId: b.id, quantidade: 1 },
    ]);
    const { produto: p2 } = await criarProdutoComFicha("Y", [
      { itemId: b.id, quantidade: 1 }, { itemId: a.id, quantidade: 1 },
    ]);
    const pedidos = [];
    for (let i = 0; i < 6; i++) {
      pedidos.push(await criarPedido([{ productId: i % 2 ? p1.id : p2.id, quantity: 1 }]));
    }

    const r = await Promise.allSettled(pedidos.map((p) => OrderInventoryHandler.onOrderReceived(p.id)));
    // Nenhuma falha por deadlock.
    const deadlocks = r.filter(
      (x) => x.status === "rejected" && /deadlock/i.test(String((x as any).reason?.message)),
    );
    expect(deadlocks).toHaveLength(0);
  });
});

// -------------------------------------------------------------- VERSIONAMENTO
describe("versionamento da ficha", () => {
  it("14. receita alterada entre pedido e preparo consome a congelada", async () => {
    const frango = await criarInsumo("Frango", 100);
    const { produto, ficha } = await criarProdutoComFicha("Bowl", [
      { itemId: frango.id, quantidade: 2 },
    ]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    expect((await saldo(frango.id)).reserved).toBe(2);

    // Publica a v2, com menos frango.
    await prisma.productComposition.update({ where: { id: ficha.id }, data: { isActive: false } });
    await prisma.productComposition.create({
      data: {
        storeId, productId: produto.id, version: 2, isActive: true,
        items: { create: [{ inventoryItemId: frango.id, quantity: 1, unitId: unitKg, sortOrder: 0 }] },
      },
    });

    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    // Consumiu 2 (a v1 congelada), não 1 (a v2 ativa).
    expect((await saldo(frango.id)).onHand).toBe(98);
    // E a reserva foi liberada por inteiro.
    expect((await saldo(frango.id)).reserved).toBe(0);
  });

  it("15. a reversão usa a versão congelada", async () => {
    const frango = await criarInsumo("Frango", 100);
    const { produto, ficha } = await criarProdutoComFicha("Bowl", [
      { itemId: frango.id, quantidade: 3 },
    ]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await prisma.productComposition.update({ where: { id: ficha.id }, data: { isActive: false } });
    await OrderInventoryHandler.onOrderCancelled(pedido.id);

    expect((await saldo(frango.id)).reserved).toBe(0);
    expect((await saldo(frango.id)).onHand).toBe(100);
  });

  it("16. versão inativa continua consumível por pedido antigo", async () => {
    const item = await criarInsumo("Insumo", 50);
    const { produto, ficha } = await criarProdutoComFicha("P", [{ itemId: item.id, quantidade: 4 }]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await prisma.productComposition.update({ where: { id: ficha.id }, data: { isActive: false } });

    await OrderInventoryHandler.onOrderPreparing(pedido.id);
    expect((await saldo(item.id)).onHand).toBe(46);
  });
});

// ------------------------------------------------------------------- REVERSÃO
describe("reversão", () => {
  it("17. cancelar devolve a reserva", async () => {
    const item = await criarInsumo("Insumo", 20);
    const { produto } = await criarProdutoComFicha("P", [{ itemId: item.id, quantidade: 5 }]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    expect((await saldo(item.id)).reserved).toBe(5);

    await OrderInventoryHandler.onOrderCancelled(pedido.id);
    expect((await saldo(item.id)).reserved).toBe(0);
  });

  it("18. cancelar depois do preparo NÃO devolve o saldo físico", async () => {
    const item = await criarInsumo("Insumo", 20);
    const { produto } = await criarProdutoComFicha("P", [{ itemId: item.id, quantidade: 5 }]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);
    expect((await saldo(item.id)).onHand).toBe(15);

    await OrderInventoryHandler.onOrderCancelled(pedido.id);

    /*
     * O insumo NÃO volta. Em PREPARING a cozinha já usou — é o que a permissão
     * de saldo negativo daquele passo admite. O que o cancelamento faz é trocar
     * o nome do que aconteceu: a saída deixa de ser venda e passa a ser perda.
     * Devolver aqui inventaria material que a contagem física não encontraria.
     */
    expect((await saldo(item.id)).onHand).toBe(15);

    const perda = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: item.id, type: "LOSS", reference: pedido.id },
    });
    expect(Math.abs(Number(perda.quantity))).toBe(5);
    // O custo viaja congelado, do consumo para a perda.
    expect(Number(perda.costAtTime)).toBe(10);

    // E o consumo sai do CMV: o pedido não virou receita.
    const consumo = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: item.id, type: "CONSUMPTION", reference: pedido.id },
      include: { reversedBy: true },
    });
    expect(consumo.reversedBy).not.toBeNull();
  });

  it("19. reverter duas vezes é recusado", async () => {
    const item = await criarInsumo("Insumo", 20);
    const movimento = await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#REV#1`, itemId: item.id,
      type: "PURCHASE", quantity: 5, unitId: unitKg,
    } as any);

    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#REVERSAL#${movimento.id}`, itemId: item.id,
      type: "REVERSAL", quantity: -5, unitId: unitKg, originalMovementId: movimento.id,
    } as any);

    // Segunda reversão do mesmo movimento, com outra chave: o índice único em
    // originalMovementId é quem barra.
    await expect(
      InventoryService.recordMovement(storeId, {
        idempotencyKey: `${storeId}#REVERSAL#OUTRA#${movimento.id}`, itemId: item.id,
        type: "REVERSAL", quantity: -5, unitId: unitKg, originalMovementId: movimento.id,
      } as any),
    ).rejects.toThrow();

    expect((await saldo(item.id)).onHand).toBe(20);
  });

  it("20. o ciclo completo devolve a reserva e converte o consumo em perda", async () => {
    const item = await criarInsumo("Insumo", 30);
    const { produto } = await criarProdutoComFicha("P", [{ itemId: item.id, quantidade: 3 }]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 2 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);
    await OrderInventoryHandler.onOrderCancelled(pedido.id);

    /*
     * O ciclo NÃO fecha no saldo inicial, e é essa a regra: a reserva volta
     * porque nada tinha saído da prateleira, mas os 6 baixados no preparo
     * continuam fora. Um ciclo que voltasse a 30 estaria dizendo que o pedido
     * não custou nada à cozinha.
     */
    const s = await saldo(item.id);
    expect(s.onHand).toBe(24);
    expect(s.reserved).toBe(0);

    const perdas = await prisma.inventoryMovement.findMany({
      where: { itemId: item.id, type: "LOSS", reference: pedido.id },
    });
    expect(perdas).toHaveLength(1);
    expect(Math.abs(Number(perdas[0].quantity))).toBe(6);
  });
});

// --------------------------------------------------------------- INSUFICIÊNCIA
describe("estoque insuficiente", () => {
  it("21. reserva recusa e não deixa resto", async () => {
    const item = await criarInsumo("Insumo", 2);
    const { produto } = await criarProdutoComFicha("P", [{ itemId: item.id, quantidade: 10 }]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await expect(OrderInventoryHandler.onOrderReceived(pedido.id)).rejects.toThrow();
    const s = await saldo(item.id);
    expect(s.reserved).toBe(0);
    expect(s.onHand).toBe(2);
  });

  it("22. consumo não recusa, fica negativo e marca o pedido", async () => {
    const item = await criarInsumo("Insumo", 1);
    const { produto } = await criarProdutoComFicha("P", [{ itemId: item.id, quantidade: 4 }]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    // Vai direto ao preparo, sem passar pela reserva.
    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    // O prato foi montado: o saldo reflete isso, mesmo negativo.
    expect((await saldo(item.id)).onHand).toBe(-3);

    const depois = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(depois.inventoryInconsistentAt).not.toBeNull();
    expect(depois.inventoryInconsistency).toContain("Insumo");
  });

  it("23. o banco barra reserva negativa", async () => {
    const item = await criarInsumo("Insumo", 10);
    await expect(
      prisma.$executeRaw`UPDATE "InventoryItem" SET "quantityReserved" = -1 WHERE id = ${item.id}`,
    ).rejects.toThrow();
  });
});

// ------------------------------------------------------------------ AUDITORIA
describe("auditoria", () => {
  it("24. todo movimento registra o autor", async () => {
    const item = await criarInsumo("Insumo", 50);
    const { produto } = await criarProdutoComFicha("P", [{ itemId: item.id, quantidade: 2 }]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    const movimentos = await prisma.inventoryMovement.findMany({ where: { storeId } });
    expect(movimentos.length).toBeGreaterThan(0);
    for (const m of movimentos) {
      expect(m.authorType).toBeTruthy();
      expect(m.reference).toBe(pedido.id);
      expect(m.referenceType).toBe("ORDER");
    }
  });

  it("25. costAtTime é congelado no momento da baixa", async () => {
    const item = await criarInsumo("Insumo", 50, 7.5);
    const { produto } = await criarProdutoComFicha("P", [{ itemId: item.id, quantidade: 2 }]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    // O preço do insumo muda depois da venda.
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { cost: 99 } });

    const consumo = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: item.id, type: "CONSUMPTION" },
    });
    // O custo histórico não acompanha a mudança.
    expect(Number(consumo.costAtTime)).toBe(7.5);
  });

  it("26. o item do pedido guarda a versão da ficha usada", async () => {
    const item = await criarInsumo("Insumo", 50);
    const { produto, ficha } = await criarProdutoComFicha("P", [{ itemId: item.id, quantidade: 1 }]);
    const pedido = await criarPedido([{ productId: produto.id, quantity: 1 }]);

    await OrderInventoryHandler.onOrderReceived(pedido.id);

    const itemDoPedido = await prisma.orderItem.findFirstOrThrow({ where: { orderId: pedido.id } });
    expect(itemDoPedido.compositionVersionId).toBe(ficha.id);
  });
});
