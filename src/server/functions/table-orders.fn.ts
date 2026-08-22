import { createServerFn } from "@tanstack/react-start/server";
import { prisma } from "@/server/db";

/**
 * Obter informações públicas de uma mesa (sem autenticação)
 * Usado quando cliente escaneia QRCode
 */
export const getTableInfoFn = createServerFn({ method: "GET" }).handler(
  async ({ data }: { data: { storeSlug: string; tableId: string } }) => {
    const { storeSlug, tableId } = data;

    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, name: true, businessType: true },
    });

    if (!store) {
      throw new Error("Loja não encontrada");
    }

    const table = await prisma.table.findFirst({
      where: {
        id: tableId,
        storeId: store.id,
      },
    });

    if (!table) {
      throw new Error("Mesa não encontrada");
    }

    return {
      table: {
        id: table.id,
        number: table.number,
        capacity: table.capacity,
        status: table.status,
      },
      store: {
        id: store.id,
        name: store.name,
        slug: storeSlug,
      },
    };
  }
);

/**
 * Listar pedidos de uma mesa (público, sem autenticação)
 * Cliente pode acompanhar seu próprio pedido pela mesa
 */
export const getTableOrdersFn = createServerFn({ method: "GET" }).handler(
  async ({ data }: { data: { storeSlug: string; tableId: string } }) => {
    const { storeSlug, tableId } = data;

    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true },
    });

    if (!store) {
      throw new Error("Loja não encontrada");
    }

    const orders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        tableId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        customerName: true,
        createdAt: true,
        estimatedDeliveryAt: true,
        items: {
          select: {
            id: true,
            productName: true,
            quantity: true,
            price: true,
          },
        },
      },
    });

    return orders;
  }
);

/**
 * Obter status consolidado da mesa
 */
export const getTableStatusFn = createServerFn({ method: "GET" }).handler(
  async ({ data }: { data: { storeSlug: string; tableId: string } }) => {
    const { storeSlug, tableId } = data;

    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true },
    });

    if (!store) {
      throw new Error("Loja não encontrada");
    }

    const table = await prisma.table.findFirst({
      where: {
        id: tableId,
        storeId: store.id,
      },
    });

    if (!table) {
      throw new Error("Mesa não encontrada");
    }

    const orders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        tableId,
      },
      select: {
        status: true,
      },
    });

    return {
      tableStatus: table.status,
      ordersCount: orders.length,
      pendingOrders: orders.filter(o => o.status !== "COMPLETED").length,
    };
  }
);
