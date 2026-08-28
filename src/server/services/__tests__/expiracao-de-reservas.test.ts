import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { transitionOrderStatus } from "@/server/services/order-service";
import {
  expirarReservasVencidas,
  MINUTOS_ATE_EXPIRAR,
} from "@/server/services/expiracao-de-reservas";

/*
 * RESERVA DE PEDIDO ABANDONADO VOLTA PARA A PRATELEIRA.
 *
 * A reserva nasce quando o pedido é confirmado e só sai quando o pedido anda:
 * PREPARING vira consumo, CANCELLED vira devolução. Um pedido parado em
 * RECEIVED sem pagar nunca dispara nenhum dos dois — o estoque ficava
 * comprometido para sempre.
 *
 * Isso era um número errado num relatório até o cardápio passar a esconder o
 * botão quando `disponível <= 0`. Depois disso, um cliente que monta o carrinho
 * e some tira o produto do ar para todo mundo.
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
    data: { slug: `exp-${Date.now()}`, name: "Cozinha" },
  });
  storeId = loja.id;
  await prisma.storeSettings.create({
    data: { storeId, whatsappNumber: "11999999999" },
  });
});
afterAll(limparBanco);

async function boloComProduto(saldo: number) {
  const bolo = await InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: "Bolo", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
    { quantidade: saldo, precoDaEmbalagem: 10 },
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
  return { bolo, produto };
}

/** Pedido em RECEIVED com a reserva feita, opcionalmente envelhecida. */
async function pedidoComReserva(
  produtoId: string,
  quantidade: number,
  minutosAtras = 0,
) {
  const pedido = await prisma.order.create({
    data: {
      storeId,
      number: Math.floor(Math.random() * 1000000),
      status: "RECEIVED",
      paymentStatus: "PENDING",
      type: "PICKUP",
      paymentMethod: "CASH",
      customerName: "Cliente",
      customerPhone: "11999999999",
      subtotal: 25 * quantidade,
      total: 25 * quantidade,
      trackingToken: `tk-${Math.random().toString(36).slice(2, 12)}`,
      items: {
        create: [
          {
            product: { connect: { id: produtoId } },
            productNameSnapshot: "Bolo",
            quantity: quantidade,
            unitPrice: 25,
          },
        ],
      },
    },
  });
  await OrderInventoryHandler.onOrderReceived(pedido.id);

  if (minutosAtras > 0) {
    /*
     * Envelhece o MOVIMENTO, não o pedido: é o `createdAt` da reserva que a
     * varredura olha. Mudar o do pedido não teria efeito nenhum, e um teste
     * que fizesse isso passaria verde sem provar nada.
     */
    await prisma.inventoryMovement.updateMany({
      where: { reference: pedido.id, type: "RESERVATION" },
      data: { createdAt: new Date(Date.now() - minutosAtras * 60_000) },
    });
  }
  return pedido;
}

const reservado = async (id: string) =>
  Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantityReserved);
const saldo = async (id: string) =>
  Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantityOnHand);
const statusDo = async (id: string) =>
  (await prisma.order.findUniqueOrThrow({ where: { id } })).status;
const reversoes = (orderId: string) =>
  prisma.inventoryMovement.count({ where: { reference: orderId, type: "REVERSAL" } });

describe("o que expira e o que não expira", () => {
  it("01 · reserva com menos de 30 minutos NÃO expira", async () => {
    const { bolo, produto } = await boloComProduto(5);
    const pedido = await pedidoComReserva(produto.id, 2, MINUTOS_ATE_EXPIRAR - 5);

    const r = await expirarReservasVencidas();

    expect(r.pedidosExpirados).toHaveLength(0);
    expect(await reservado(bolo.id)).toBe(2);
    expect(await statusDo(pedido.id)).toBe("RECEIVED");
  });

  it("02 · reserva vencida em RECEIVED/PENDING cancela e libera", async () => {
    const { bolo, produto } = await boloComProduto(5);
    const pedido = await pedidoComReserva(produto.id, 2, MINUTOS_ATE_EXPIRAR + 5);
    expect(await reservado(bolo.id)).toBe(2);

    const r = await expirarReservasVencidas();

    expect(r.pedidosExpirados).toContain(pedido.id);
    expect(await statusDo(pedido.id)).toBe("CANCELLED");
    expect(await reservado(bolo.id)).toBe(0);
    // O físico não muda: reserva não é baixa.
    expect(await saldo(bolo.id)).toBe(5);
  });

  it("03 · pedido PAGO não expira, mesmo parado", async () => {
    const { bolo, produto } = await boloComProduto(5);
    const pedido = await pedidoComReserva(produto.id, 2, MINUTOS_ATE_EXPIRAR + 60);
    await prisma.order.update({
      where: { id: pedido.id },
      data: { paymentStatus: "PAID" },
    });

    const r = await expirarReservasVencidas();

    // O dinheiro entrou: se o pedido está travado, o problema é de outra natureza.
    expect(r.pedidosExpirados).toHaveLength(0);
    expect(await statusDo(pedido.id)).toBe("RECEIVED");
    expect(await reservado(bolo.id)).toBe(2);
  });

  it("04 · pedido em PREPARING não expira", async () => {
    const { bolo, produto } = await boloComProduto(5);
    const pedido = await pedidoComReserva(produto.id, 2, MINUTOS_ATE_EXPIRAR + 5);

    await transitionOrderStatus(storeId, pedido.id, "PREPARING", {
      authorType: "ADMIN",
    } as any);
    await OrderInventoryHandler.syncOrderStatus(pedido.id, "PREPARING");

    const antesDoSaldo = await saldo(bolo.id);
    const r = await expirarReservasVencidas();

    expect(r.pedidosExpirados).toHaveLength(0);
    expect(await statusDo(pedido.id)).toBe("PREPARING");
    // O consumo já aconteceu e não pode ser desfeito pela varredura.
    expect(await saldo(bolo.id)).toBe(antesDoSaldo);
  });

  it("05 · pedido já CANCELLED não é cancelado de novo", async () => {
    const { bolo, produto } = await boloComProduto(5);
    const pedido = await pedidoComReserva(produto.id, 2, MINUTOS_ATE_EXPIRAR + 5);

    await transitionOrderStatus(storeId, pedido.id, "CANCELLED", {
      authorType: "ADMIN",
    } as any);
    await OrderInventoryHandler.syncOrderStatus(pedido.id, "CANCELLED");
    const reversoesAntes = await reversoes(pedido.id);

    const r = await expirarReservasVencidas();

    expect(r.pedidosExpirados).toHaveLength(0);
    expect(await reversoes(pedido.id)).toBe(reversoesAntes);
    expect(await reservado(bolo.id)).toBe(0);
  });

  it("06 · reserva já revertida não gera outra reversão", async () => {
    const { bolo, produto } = await boloComProduto(5);
    const pedido = await pedidoComReserva(produto.id, 2, MINUTOS_ATE_EXPIRAR + 5);

    await expirarReservasVencidas();
    const reversoesDepoisDaPrimeira = await reversoes(pedido.id);
    expect(reversoesDepoisDaPrimeira).toBeGreaterThan(0);

    // A segunda passada não encontra nada: `reversedBy` deixou de ser nulo.
    const segunda = await expirarReservasVencidas();

    expect(segunda.reservasEncontradas).toBe(0);
    expect(await reversoes(pedido.id)).toBe(reversoesDepoisDaPrimeira);
    expect(await reservado(bolo.id)).toBe(0);
  });
});

describe("concorrência e volume", () => {
  it("07 · duas varreduras simultâneas produzem uma reversão só", async () => {
    const { bolo, produto } = await boloComProduto(5);
    const pedido = await pedidoComReserva(produto.id, 2, MINUTOS_ATE_EXPIRAR + 5);

    /*
     * Duas instâncias varrendo ao mesmo tempo é o caso normal com várias
     * réplicas. Não há lock: quem garante é a chave `store#REVERSAL#{id}`,
     * que é única — a segunda recebe o que a primeira gravou.
     */
    await Promise.allSettled([
      expirarReservasVencidas(),
      expirarReservasVencidas(),
    ]);

    expect(await reversoes(pedido.id)).toBe(1);
    expect(await reservado(bolo.id)).toBe(0);
    expect(await statusDo(pedido.id)).toBe("CANCELLED");
  });

  it("08 · vários pedidos: cada reserva é tratada por si", async () => {
    const { bolo, produto } = await boloComProduto(10);

    const velho1 = await pedidoComReserva(produto.id, 2, MINUTOS_ATE_EXPIRAR + 10);
    const velho2 = await pedidoComReserva(produto.id, 3, MINUTOS_ATE_EXPIRAR + 20);
    const novo = await pedidoComReserva(produto.id, 1, 5);
    expect(await reservado(bolo.id)).toBe(6);

    const r = await expirarReservasVencidas();

    expect(r.pedidosExpirados).toHaveLength(2);
    expect(r.pedidosExpirados).toContain(velho1.id);
    expect(r.pedidosExpirados).toContain(velho2.id);
    expect(await statusDo(novo.id)).toBe("RECEIVED");
    // Sobra só a reserva do pedido novo.
    expect(await reservado(bolo.id)).toBe(1);
  });

  it("09 · o produto volta a ficar disponível depois da expiração", async () => {
    // Todo o estoque preso num único pedido abandonado.
    const { bolo, produto } = await boloComProduto(1);
    await pedidoComReserva(produto.id, 1, MINUTOS_ATE_EXPIRAR + 5);

    const disponivelAntes = (await saldo(bolo.id)) - (await reservado(bolo.id));
    expect(disponivelAntes).toBe(0); // o cardápio mostraria "Indisponível"

    await expirarReservasVencidas();

    const disponivelDepois = (await saldo(bolo.id)) - (await reservado(bolo.id));
    expect(disponivelDepois).toBe(1);
  });

  it("10 · o corte é o createdAt da RESERVA, não o do pedido", async () => {
    /*
     * Um pedido antigo cuja reserva foi feita agora não expira. Parece
     * detalhe, mas é o que impede a varredura de cancelar um pedido que
     * acabou de comprometer estoque.
     */
    const { bolo, produto } = await boloComProduto(5);
    const pedido = await pedidoComReserva(produto.id, 2, 0);
    await prisma.order.update({
      where: { id: pedido.id },
      data: { createdAt: new Date(Date.now() - 5 * 60 * 60_000) },
    });

    const r = await expirarReservasVencidas();

    expect(r.pedidosExpirados).toHaveLength(0);
    expect(await reservado(bolo.id)).toBe(2);
  });
});
