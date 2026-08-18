import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentAdmin, requireCourierSession } from "../auth/session";
import { prisma } from "../db/client";
import { transitionOrderStatus } from "../services/order-service";

/** O que o entregador vê de um pedido: o necessário para chegar lá e entregar. */
const CAMPOS_DA_ENTREGA = {
  id: true,
  number: true,
  status: true,
  total: true,
  paymentMethod: true,
  paymentStatus: true,
  customerName: true,
  customerPhone: true,
  customerNote: true,
  deliveryStreet: true,
  deliveryNumber: true,
  deliveryComplement: true,
  deliveryNeighborhood: true,
  deliveryCity: true,
  deliveryZipCode: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Sessão do entregador para a tela dele: quem é e de que loja, sem mais nada. */
export const getCurrentCourierFn = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "COURIER") return null;
  return { id: admin.id, name: admin.name, storeName: admin.store.name };
});

/**
 * As entregas deste entregador.
 *
 * O filtro por courierId é o que segura tudo: ele não vê pedido de colega nem
 * pedido de balcão, só o que está na mão dele. O nome e o telefone do cliente
 * vêm porque são o endereço e o contato de quem vai receber; nada de nota
 * interna, faturamento ou histórico da loja.
 */
export const listMyDeliveriesFn = createServerFn({ method: "GET" }).handler(async () => {
  const courier = await requireCourierSession();

  // As de hoje já entregues ficam à vista para ele conferir o dia; ontem já não
  // é assunto da tela e sairia sozinho da lista.
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  const [emRota, entregues] = await Promise.all([
    prisma.order.findMany({
      where: { storeId: courier.storeId, courierId: courier.id, status: "OUT_FOR_DELIVERY" },
      orderBy: { updatedAt: "asc" },
      select: CAMPOS_DA_ENTREGA,
    }),
    prisma.order.findMany({
      where: {
        storeId: courier.storeId,
        courierId: courier.id,
        status: "COMPLETED",
        updatedAt: { gte: inicioDoDia },
      },
      orderBy: { updatedAt: "desc" },
      select: CAMPOS_DA_ENTREGA,
    }),
  ]);

  return { courierName: courier.name, storeName: courier.store.name, emRota, entregues };
});

/**
 * O entregador fecha a própria entrega, e isso finaliza o pedido.
 *
 * Marcar entregue é o mesmo COMPLETED que o dono daria pelo painel — inclusive
 * quitando o pagamento na entrega —, só que quem registra é ele. O pedido tem
 * de ser dele: sem essa checagem, um id copiado fecharia a entrega de outro.
 */
export const markDeliveryDoneFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const courier = await requireCourierSession();

    const pedido = await prisma.order.findFirst({
      where: { id: data.id, storeId: courier.storeId, courierId: courier.id },
      select: { id: true },
    });
    if (!pedido) return { ok: false as const, error: "Esta entrega não é sua." };

    const r = await transitionOrderStatus(courier.storeId, pedido.id, "COMPLETED", {
      authorType: "COURIER",
      authorName: courier.name,
    });
    if (!r.ok) return r;

    // Acabou a última entrega, acabou o motivo de saber onde ele está. Apagar
    // aqui, e não só quando o aparelho para de enviar, garante que a posição
    // não fique no banco se ele fechar a tela no mesmo instante.
    const restantes = await prisma.order.count({
      where: { storeId: courier.storeId, courierId: courier.id, status: "OUT_FOR_DELIVERY" },
    });
    if (restantes === 0) {
      await prisma.courierLocation.deleteMany({ where: { courierId: courier.id } });
    }

    return r;
  });

/**
 * O celular do entregador informa onde ele está.
 *
 * Guarda só a última posição, sobrescrevendo: o cliente quer saber a distância
 * de agora, e um histórico de trajeto seria dado sensível sem pergunta que ele
 * responda. Sem entrega em andamento não há por que saber onde ele está — a
 * linha é apagada e a resposta manda o aparelho parar de enviar.
 */
export const reportCourierLocationFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().nonnegative().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const courier = await requireCourierSession();

    const emRota = await prisma.order.count({
      where: { storeId: courier.storeId, courierId: courier.id, status: "OUT_FOR_DELIVERY" },
    });
    if (emRota === 0) {
      await prisma.courierLocation.deleteMany({ where: { courierId: courier.id } });
      return { ok: true as const, tracking: false as const };
    }

    await prisma.courierLocation.upsert({
      where: { courierId: courier.id },
      create: {
        courierId: courier.id,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy ?? null,
      },
      update: {
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy ?? null,
      },
    });

    return { ok: true as const, tracking: true as const };
  });

/** O entregador desliga o compartilhamento. O aparelho é dele; a posição sai
 *  do banco na hora, sem depender de a entrega terminar. */
export const stopSharingLocationFn = createServerFn({ method: "POST" }).handler(async () => {
  const courier = await requireCourierSession();
  await prisma.courierLocation.deleteMany({ where: { courierId: courier.id } });
  return { ok: true as const };
});
