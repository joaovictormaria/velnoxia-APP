import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { transitionOrderStatus } from "@/server/services/order-service";

/*
 * CONFIRMAR PAGAMENTO NÃO PODE PULAR O CONSUMO.
 *
 * `confirmPaymentFn` fazia `prisma.order.update({ status: "COMPLETED" })` direto,
 * contornando a máquina de estados. Um pedido em RECEIVED pulava PREPARING
 * inteiro — e PREPARING é onde a reserva é liberada e o CONSUMPTION é gravado.
 *
 * O resultado era determinístico, não uma corrida: todo pedido pago sem passar
 * pela cozinha deixava `quantityReserved` preso para sempre. Material físico
 * intacto, estoque comprometido, e — depois do bloqueador da vitrine — o
 * produto sumindo do cardápio por causa de um pedido já entregue.
 *
 * A server function não roda em vitest (AsyncLocalStorage), então o que se
 * verifica aqui é a sequência que ela executa: transição válida + sync.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
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

beforeEach(async () => {
  await limparBanco();
  await semearUnidades();
  categoriaId = "";
  const loja = await prisma.store.create({
    data: { slug: `pag-${Date.now()}`, name: "Cozinha" },
  });
  storeId = loja.id;
  await prisma.storeSettings.create({
    data: { storeId, whatsappNumber: "11999999999" },
  });
});
afterAll(limparBanco);

/** Bolo com saldo, produto de cardápio ligado a ele, e um pedido em RECEIVED. */
async function pedidoEmRecebido(saldoInicial = 5, quantidade = 2) {
  const bolo = await InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: "Bolo", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
    { quantidade: saldoInicial, precoDaEmbalagem: 10 },
  );

  if (!categoriaId) {
    categoriaId = (
      await prisma.category.create({
        data: {
          storeId,
          name: "Doces",
          slug: `doces-${Date.now()}`,
          icon: "🍰",
          kind: "SIMPLE",
        },
      })
    ).id;
  }
  const produto = await prisma.product.create({
    data: {
      storeId,
      categoryId: categoriaId,
      name: "Bolo",
      slug: `bolo-${Math.random().toString(36).slice(2, 7)}`,
      description: "Bolo",
      basePrice: 25,
      inventoryItemId: bolo.id,
    },
  });

  const pedido = await prisma.order.create({
    data: {
      storeId,
      number: Math.floor(Math.random() * 100000),
      status: "RECEIVED",
      paymentStatus: "PENDING",
      type: "PICKUP",
      paymentMethod: "CASH",
      customerName: "Cliente",
      customerPhone: "11999999999",
      subtotal: 50,
      total: 50,
      trackingToken: `tk-${Math.random().toString(36).slice(2, 12)}`,
      items: {
        create: [
          {
            product: { connect: { id: produto.id } },
            productNameSnapshot: "Bolo",
            quantity: quantidade,
            unitPrice: 25,
          },
        ],
      },
    },
  });

  await OrderInventoryHandler.onOrderReceived(pedido.id);
  return { bolo, produto, pedido };
}

const item = (id: string) =>
  prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
const reservado = async (id: string) => Number((await item(id)).quantityReserved);
const saldo = async (id: string) => Number((await item(id)).quantityOnHand);
const movimentos = (itemId: string, type: string) =>
  prisma.inventoryMovement.count({ where: { itemId, type: type as any } });

/** A sequência que `confirmPaymentFn` executa depois da correção. */
async function confirmarPagamento(orderId: string) {
  const pedido = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: "PAID" },
  });
  if (pedido.status === "RECEIVED") {
    const r = await transitionOrderStatus(storeId, orderId, "PREPARING", {
      authorType: "SYSTEM",
    } as any);
    if (!r.ok) return r;
    await OrderInventoryHandler.syncOrderStatus(orderId, "PREPARING");
  }
  return transitionOrderStatus(storeId, orderId, "COMPLETED", {
    authorType: "SYSTEM",
  } as any);
}

describe("pagamento confirmado a partir de RECEIVED", () => {
  it("01 · a reserva existe antes de confirmar", async () => {
    const { bolo } = await pedidoEmRecebido(5, 2);
    expect(await reservado(bolo.id)).toBe(2);
    expect(await saldo(bolo.id)).toBe(5);
  });

  it("02 · confirmar libera a reserva", async () => {
    const { bolo, pedido } = await pedidoEmRecebido(5, 2);

    await confirmarPagamento(pedido.id);

    // Era isto que ficava preso: reserva de pedido pago e entregue.
    expect(await reservado(bolo.id)).toBe(0);
  });

  it("03 · confirmar registra o consumo e baixa o físico", async () => {
    const { bolo, pedido } = await pedidoEmRecebido(5, 2);

    await confirmarPagamento(pedido.id);

    expect(await movimentos(bolo.id, "CONSUMPTION")).toBe(1);
    expect(await saldo(bolo.id)).toBe(3);
  });

  it("04 · o pedido passa por PREPARING e termina em COMPLETED", async () => {
    const { pedido } = await pedidoEmRecebido();

    const r = await confirmarPagamento(pedido.id);

    expect(r.ok).toBe(true);
    const depois = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(depois.status).toBe("COMPLETED");
    expect(depois.paymentStatus).toBe("PAID");
  });

  it("05 · nenhum saldo fica reservado indevidamente", async () => {
    const { bolo, pedido } = await pedidoEmRecebido(5, 2);
    await confirmarPagamento(pedido.id);

    const x = await item(bolo.id);
    expect(Number(x.quantityReserved)).toBe(0);
    // Disponível volta a refletir o que existe de verdade.
    expect(Number(x.quantityOnHand) - Number(x.quantityReserved)).toBe(3);
  });
});

describe("repetição e estados já processados", () => {
  it("06 · confirmar duas vezes não duplica movimentos", async () => {
    const { bolo, pedido } = await pedidoEmRecebido(5, 2);

    await confirmarPagamento(pedido.id);
    const consumosDepoisDaPrimeira = await movimentos(bolo.id, "CONSUMPTION");
    const saldoDepoisDaPrimeira = await saldo(bolo.id);

    // A segunda passagem encontra o pedido já em COMPLETED.
    await confirmarPagamento(pedido.id);

    expect(await movimentos(bolo.id, "CONSUMPTION")).toBe(consumosDepoisDaPrimeira);
    expect(await saldo(bolo.id)).toBe(saldoDepoisDaPrimeira);
    expect(await reservado(bolo.id)).toBe(0);
  });

  it("07 · pedido que JÁ passou por PREPARING não consome de novo", async () => {
    const { bolo, pedido } = await pedidoEmRecebido(5, 2);

    // A cozinha já preparou pelo painel, antes de o pagamento ser confirmado.
    await transitionOrderStatus(storeId, pedido.id, "PREPARING", {
      authorType: "ADMIN",
    } as any);
    await OrderInventoryHandler.syncOrderStatus(pedido.id, "PREPARING");

    const saldoAntes = await saldo(bolo.id);
    expect(await reservado(bolo.id)).toBe(0);

    await confirmarPagamento(pedido.id);

    expect(await saldo(bolo.id)).toBe(saldoAntes);
    expect(await movimentos(bolo.id, "CONSUMPTION")).toBe(1);
  });

  it("08 · o salto direto RECEIVED → COMPLETED continua recusado", async () => {
    /*
     * A garantia estrutural: mesmo que algum caminho futuro tente, a máquina
     * de estados recusa. Era contorná-la que produzia a reserva presa.
     */
    const { pedido } = await pedidoEmRecebido();

    const r = await transitionOrderStatus(storeId, pedido.id, "COMPLETED", {
      authorType: "SYSTEM",
    } as any);

    expect(r.ok).toBe(false);
    const depois = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(depois.status).toBe("RECEIVED");
  });
});
