// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "../db/client";
import { distanciaDoEntregador } from "../services/delivery-tracking-service";
import { decimalToNumber } from "../utils/decimal-converter";

/** How long the link keeps answering after the order is finished, so whoever
 *  opens it right as the food arrives still sees the last state instead of a
 *  dead page. */
const GRACE_MINUTES = 30;

/**
 * Public: no session. The token in the address is the whole authorisation, so
 * this returns only what the person who placed the order should see â€” no
 * internal notes, no other customer's data, and nothing that identifies the
 * order beyond what they already typed.
 */
export const trackOrderFn = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string().trim().min(10).max(64) }))
  .handler(async ({ data }) => {
    const order = await prisma.order.findUnique({
      where: { trackingToken: data.token },
      select: {
        id: true,
        number: true,
        status: true,
        type: true,
        total: true,
        createdAt: true,
        updatedAt: true,
        estimatedDeliveryAt: true,
        customerName: true,
        storeId: true,
        store: { select: { slug: true } },
        items: {
          select: { productNameSnapshot: true, quantity: true, sizeLabel: true },
        },
        statusHistory: {
          select: { status: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // A wrong token and a deleted order answer the same way. Saying "expired"
    // for one and "not found" for the other would confirm which tokens exist.
    if (!order) return { ok: false as const };

    const finished = order.status === "COMPLETED" || order.status === "CANCELLED";
    if (finished) {
      const since = Date.now() - order.updatedAt.getTime();
      if (since > GRACE_MINUTES * 60_000) return { ok: false as const };
    }

    /**
     * Position in the queue: how many orders of this store are still waiting
     * and arrived before this one. Only meaningful while it is waiting â€” once
     * it is being made, its place in the line stopped mattering.
     */
    const queuePosition =
      order.status === "RECEIVED"
        ? (await prisma.order.count({
            where: {
              storeId: order.storeId,
              status: "RECEIVED",
              createdAt: { lt: order.createdAt },
            },
          })) + 1
        : null;

    return {
      ok: true as const,
      order: {
        number: order.number,
        status: order.status,
        type: order.type,
        total: decimalToNumber(order.total),
        customerName: order.customerName,
        createdAt: order.createdAt,
        estimatedDeliveryAt: order.estimatedDeliveryAt,
        storeSlug: order.store.slug,
        items: order.items,
        history: order.statusHistory,
        queuePosition,
        finished,
      },
    };
  });

/**
 * A que distÃ¢ncia o entregador estÃ¡ do cliente.
 *
 * PÃºblico, autorizado pelo token do pedido â€” quem tem o link Ã© quem fez a
 * compra. A regra e a conta ficam na service; aqui Ã© sÃ³ a porta.
 */
export const getCourierDistanceFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string().trim().min(10).max(64),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }),
  )
  .handler(({ data }) =>
    distanciaDoEntregador(data.token, { latitude: data.latitude, longitude: data.longitude }),
  );

