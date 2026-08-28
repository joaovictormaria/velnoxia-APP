import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { createOrderFromCheckout } from "@/server/services/order-service";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";

/*
 * A RESERVA ACONTECE ANTES DE O PEDIDO SER CONFIRMADO.
 *
 * NASCEU DE PEDIDO CONFIRMADO SEM ESTOQUE. A reserva rodava DEPOIS do commit,
 * disparada sem espera: `orderStatusSync.onStatusChange(...).catch(console.error)`.
 * Faltando saldo, a reserva falhava, o pedido já estava confirmado ao cliente, e
 * sobrava a marca `inventoryInconsistentAt` para alguém conferir na mão. O
 * cliente pagava por um bolo que não existia.
 *
 * Agora a reserva entra na MESMA transação do pedido. Falhar derruba tudo: sem
 * Order, sem OrderItem, sem reserva órfã. Quem desfaz é o rollback do banco, e
 * é por isso que não há compensação a escrever — compensação é o que dá errado
 * pela metade.
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

async function semearUnidades() {
  const sql = readFileSync(
    resolve(__dirname, `../../../../prisma/migrations/${SEED_UNIDADES}/migration.sql`),
    "utf8",
  )
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);
}

let slugDaLoja = "";

beforeEach(async () => {
  await limparBanco();
  await semearUnidades();
  slugDaLoja = `chk-${Date.now()}`;
  const loja = await prisma.store.create({
    data: { slug: slugDaLoja, name: "Cozinha" },
  });
  storeId = loja.id;
  await prisma.storeSettings.create({
    data: { storeId, whatsappNumber: "11999999999" },
  });
});
afterAll(limparBanco);

/** Um preparado com saldo, como sai de uma produção. */
async function boloEmEstoque(unidades: number) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: "Bolo de Chocolate", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
    unidades > 0 ? { quantidade: unidades, precoDaEmbalagem: 9.71 } : undefined,
  );
}

/** Produto de cardápio, opcionalmente ligado a um item de estoque. */
async function produto(nome: string, inventoryItemId?: string) {
  const categoria = await prisma.category.create({
    data: {
      storeId,
      name: "Doces",
      slug: `doces-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      icon: "🍰",
      kind: "SIMPLE",
    },
  });
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoria.id,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 7)}`,
      description: nome,
      basePrice: 25,
      ...(inventoryItemId ? { inventoryItemId } : {}),
    },
  });
}

const comprar = (slugDoProduto: string, quantity: number) =>
  createOrderFromCheckout(storeId, {
    storeSlug: slugDaLoja,
    items: [{ productSlug: slugDoProduto, quantity, extraIds: [] }],
    customerName: "Cliente",
    customerPhone: "11999999999",
    type: "PICKUP",
    paymentMethod: "CASH",
  } as any);

const saldo = async (id: string) =>
  Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantityOnHand);
const reservado = async (id: string) =>
  Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantityReserved);

describe("estoque suficiente", () => {
  it("01 · estoque exato: o pedido é aprovado e a reserva fica de pé", async () => {
    const bolo = await boloEmEstoque(2);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const r = await comprar(p.slug, 2);

    expect(r.ok).toBe(true);
    expect(await prisma.order.count({ where: { storeId } })).toBe(1);
    // O saldo físico não muda na reserva — o que muda é o comprometido.
    expect(await saldo(bolo.id)).toBe(2);
    expect(await reservado(bolo.id)).toBe(2);
    // Disponível zerado: não sobra nada para um segundo pedido.
    expect((await saldo(bolo.id)) - (await reservado(bolo.id))).toBe(0);
  });

  it("02 · o movimento de RESERVATION é gravado com referência ao pedido", async () => {
    const bolo = await boloEmEstoque(3);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const r = await comprar(p.slug, 1);
    expect(r.ok).toBe(true);

    const mov = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: bolo.id, type: "RESERVATION" },
    });
    expect(Number(mov.quantity)).toBe(1);
    expect(mov.reference).toBe((r as any).orderId);
    expect(mov.referenceType).toBe("ORDER");
  });
});

describe("estoque insuficiente", () => {
  it("03 · pedido é RECUSADO quando falta saldo", async () => {
    const bolo = await boloEmEstoque(1);
    const p = await produto("Bolo de Chocolate", bolo.id);

    // 1 em estoque, cliente pede 2.
    await expect(comprar(p.slug, 2)).rejects.toThrow(/estoque|Insufficient|suficiente/i);
  });

  it("04 · nenhuma Order fica no banco depois da recusa", async () => {
    const bolo = await boloEmEstoque(1);
    const p = await produto("Bolo de Chocolate", bolo.id);

    await expect(comprar(p.slug, 2)).rejects.toThrow();

    /*
     * O que o caminho antigo não conseguia: lá o pedido já estava gravado
     * quando a reserva falhava.
     */
    expect(await prisma.order.count({ where: { storeId } })).toBe(0);
    expect(await prisma.orderItem.count()).toBe(0);
  });

  it("05 · nenhuma reserva parcial permanece", async () => {
    const bolo = await boloEmEstoque(1);
    const p = await produto("Bolo de Chocolate", bolo.id);

    await expect(comprar(p.slug, 2)).rejects.toThrow();

    expect(await reservado(bolo.id)).toBe(0);
    expect(await saldo(bolo.id)).toBe(1);
    expect(
      await prisma.inventoryMovement.count({
        where: { itemId: bolo.id, type: "RESERVATION" },
      }),
    ).toBe(0);
  });

  it("06 · saldo zero recusa qualquer quantidade", async () => {
    const bolo = await boloEmEstoque(0);
    const p = await produto("Bolo de Chocolate", bolo.id);

    await expect(comprar(p.slug, 1)).rejects.toThrow();
    expect(await prisma.order.count({ where: { storeId } })).toBe(0);
  });
});

describe("concorrência", () => {
  it("07 · dois pedidos pela última unidade: exatamente um passa", async () => {
    const bolo = await boloEmEstoque(1);
    const p = await produto("Bolo de Chocolate", bolo.id);

    /*
     * A serialização é do banco: `SELECT ... FOR UPDATE` dentro de
     * `recordMovement`, agora sob a transação do pedido. Sem o lock, os dois
     * leriam "há 1 disponível" e os dois passariam.
     */
    const resultados = await Promise.allSettled([
      comprar(p.slug, 1),
      comprar(p.slug, 1),
    ]);

    const aprovados = resultados.filter(
      (r) => r.status === "fulfilled" && (r.value as any).ok,
    );
    expect(aprovados).toHaveLength(1);

    expect(await prisma.order.count({ where: { storeId } })).toBe(1);
    expect(await reservado(bolo.id)).toBe(1);
    // Nunca negativo: é o que a disputa poderia produzir sem o lock.
    expect((await saldo(bolo.id)) - (await reservado(bolo.id))).toBe(0);
  });

  it("08 · cinco pedidos para três unidades: três passam, dois falham", async () => {
    const bolo = await boloEmEstoque(3);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const resultados = await Promise.allSettled(
      [1, 2, 3, 4, 5].map(() => comprar(p.slug, 1)),
    );
    const aprovados = resultados.filter(
      (r) => r.status === "fulfilled" && (r.value as any).ok,
    );

    expect(aprovados).toHaveLength(3);
    expect(await reservado(bolo.id)).toBe(3);
    expect((await saldo(bolo.id)) - (await reservado(bolo.id))).toBe(0);
  });
});

describe("idempotência", () => {
  it("09 · reprocessar o mesmo pedido não duplica a reserva", async () => {
    const bolo = await boloEmEstoque(5);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const r = await comprar(p.slug, 2);
    expect(r.ok).toBe(true);
    expect(await reservado(bolo.id)).toBe(2);

    /*
     * O gancho antigo continua existindo para os status posteriores. Chamá-lo
     * com RECEIVED tem que ser inofensivo: a chave determinística reconhece a
     * reserva já gravada em vez de somar de novo.
     */
    await OrderInventoryHandler.onOrderReceived((r as any).orderId);

    expect(await reservado(bolo.id)).toBe(2);
    expect(
      await prisma.inventoryMovement.count({
        where: { itemId: bolo.id, type: "RESERVATION" },
      }),
    ).toBe(1);
  });
});

describe("o que NÃO pode ter mudado", () => {
  it("10 · produto sem vínculo com estoque continua vendendo normalmente", async () => {
    const p = await produto("Refrigerante");

    const r = await comprar(p.slug, 3);

    expect(r.ok).toBe(true);
    expect(await prisma.order.count({ where: { storeId } })).toBe(1);
    // Nenhum movimento: não há estoque a mexer.
    expect(await prisma.inventoryMovement.count()).toBe(0);
  });

  it("11 · vender o preparado NÃO desce nos ingredientes da receita", async () => {
    const bolo = await boloEmEstoque(3);
    const farinha = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Farinha", baseUnitId: "unit_kg", itemType: "INGREDIENT" } as any,
      { quantidade: 10, precoDaEmbalagem: 6 },
    );
    // A receita do bolo existe e leva farinha — é o que torna o caso válido.
    await prisma.productComposition.create({
      data: {
        storeId,
        inventoryItemId: bolo.id,
        isActive: true,
        yieldQuantity: 1,
        yieldUnitId: "unit_un",
        items: {
          create: [
            { inventoryItemId: farinha.id, quantity: 240, unitId: "unit_g", sortOrder: 0 },
          ],
        },
      },
    });
    const p = await produto("Bolo de Chocolate", bolo.id);

    const antesDaFarinha = await saldo(farinha.id);
    const r = await comprar(p.slug, 1);

    expect(r.ok).toBe(true);
    expect(await reservado(bolo.id)).toBe(1);
    // Os ingredientes já saíram na PRODUÇÃO; descer de novo cobraria duas vezes.
    expect(await saldo(farinha.id)).toBe(antesDaFarinha);
    expect(await reservado(farinha.id)).toBe(0);
  });

  it("12 · cancelar o pedido devolve a reserva, como antes", async () => {
    const bolo = await boloEmEstoque(3);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const r = await comprar(p.slug, 2);
    expect(await reservado(bolo.id)).toBe(2);

    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "CANCELLED" as any);

    expect(await reservado(bolo.id)).toBe(0);
    expect(await saldo(bolo.id)).toBe(3);
  });
});

describe("pedido com DOIS itens: ou reserva tudo, ou nada", () => {
  /*
   * O CASO QUE PROVA A TRANSAÇÃO COMPARTILHADA.
   *
   * Com um item só, ignorar o `tx` de fora não muda nada: quando falta saldo, o
   * `recordMovement` lança antes de gravar, e não há o que desfazer. A diferença
   * aparece quando o PRIMEIRO item reserva e o SEGUNDO falha — aí a reserva do
   * primeiro precisa cair junto.
   *
   * Sem a transação compartilhada, ela ficaria commitada sozinha: estoque
   * comprometido para um pedido que não existe, e ninguém para liberá-lo.
   */
  it("13 · o primeiro item reserva, o segundo falta, e nada permanece", async () => {
    const bolo = await boloEmEstoque(5);
    const torta = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Torta", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
      { quantidade: 1, precoDaEmbalagem: 20 },
    );
    const pBolo = await produto("Bolo de Chocolate", bolo.id);
    const pTorta = await produto("Torta", torta.id);

    // Bolo tem 5 (sobra), Torta tem 1 e o cliente pede 3.
    await expect(
      createOrderFromCheckout(storeId, {
        storeSlug: slugDaLoja,
        items: [
          { productSlug: pBolo.slug, quantity: 2, extraIds: [] },
          { productSlug: pTorta.slug, quantity: 3, extraIds: [] },
        ],
        customerName: "Cliente",
        customerPhone: "11999999999",
        type: "PICKUP",
        paymentMethod: "CASH",
      } as any),
    ).rejects.toThrow();

    // O bolo NÃO pode ficar com reserva órfã.
    expect(await reservado(bolo.id)).toBe(0);
    expect(await reservado(torta.id)).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { type: "RESERVATION" } })).toBe(0);
    expect(await prisma.order.count({ where: { storeId } })).toBe(0);
  });

  it("14 · dois itens com saldo: os dois reservam no mesmo pedido", async () => {
    const bolo = await boloEmEstoque(5);
    const torta = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Torta", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
      { quantidade: 4, precoDaEmbalagem: 20 },
    );
    const pBolo = await produto("Bolo de Chocolate", bolo.id);
    const pTorta = await produto("Torta", torta.id);

    const r = await createOrderFromCheckout(storeId, {
      storeSlug: slugDaLoja,
      items: [
        { productSlug: pBolo.slug, quantity: 2, extraIds: [] },
        { productSlug: pTorta.slug, quantity: 3, extraIds: [] },
      ],
      customerName: "Cliente",
      customerPhone: "11999999999",
      type: "PICKUP",
      paymentMethod: "CASH",
    } as any);

    expect(r.ok).toBe(true);
    expect(await reservado(bolo.id)).toBe(2);
    expect(await reservado(torta.id)).toBe(3);
  });
});
