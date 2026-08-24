import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentAdmin, requireCourierSession } from "../auth/session";
import { prisma } from "../db/client";
import { transitionOrderStatus } from "../services/order-service";

/** O que o entregador vÃª de um pedido: o necessÃ¡rio para chegar lÃ¡ e entregar. */
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
  deliveryState: true,
  deliveryZipCode: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** SessÃ£o do entregador para a tela dele: quem Ã© e de que loja, sem mais nada. */
export const getCurrentCourierFn = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "COURIER") return null;
  return { id: admin.id, name: admin.name, storeName: admin.store.name };
});

/**
 * As entregas deste entregador.
 *
 * O filtro por courierId Ã© o que segura tudo: ele nÃ£o vÃª pedido de colega nem
 * pedido de balcÃ£o, sÃ³ o que estÃ¡ na mÃ£o dele. O nome e o telefone do cliente
 * vÃªm porque sÃ£o o endereÃ§o e o contato de quem vai receber; nada de nota
 * interna, faturamento ou histÃ³rico da loja.
 */
export const listMyDeliveriesFn = createServerFn({ method: "GET" }).handler(async () => {
  const courier = await requireCourierSession();

  // As de hoje jÃ¡ entregues ficam Ã  vista para ele conferir o dia; ontem jÃ¡ nÃ£o
  // Ã© assunto da tela e sairia sozinho da lista.
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

  return { courierName: courier.name, storeName: courier.store.name, emRota, entregues } as any;
});

/**
 * O entregador fecha a prÃ³pria entrega, e isso finaliza o pedido.
 *
 * Marcar entregue Ã© o mesmo COMPLETED que o dono daria pelo painel â€” inclusive
 * quitando o pagamento na entrega â€”, sÃ³ que quem registra Ã© ele. O pedido tem
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
    if (!pedido) return { ok: false as const, error: "Esta entrega nÃ£o Ã© sua." };

    const r = await transitionOrderStatus(courier.storeId, pedido.id, "COMPLETED", {
      authorType: "COURIER",
      authorName: courier.name,
    });
    if (!r.ok) return r;

    // Acabou a Ãºltima entrega, acabou o motivo de saber onde ele estÃ¡. Apagar
    // aqui, e nÃ£o sÃ³ quando o aparelho para de enviar, garante que a posiÃ§Ã£o
    // nÃ£o fique no banco se ele fechar a tela no mesmo instante.
    const restantes = await prisma.order.count({
      where: { storeId: courier.storeId, courierId: courier.id, status: "OUT_FOR_DELIVERY" },
    });
    if (restantes === 0) {
      await prisma.courierLocation.deleteMany({ where: { courierId: courier.id } });
    }

    return r;
  });

/**
 * O celular do entregador informa onde ele estÃ¡.
 *
 * Guarda sÃ³ a Ãºltima posiÃ§Ã£o, sobrescrevendo: o cliente quer saber a distÃ¢ncia
 * de agora, e um histÃ³rico de trajeto seria dado sensÃ­vel sem pergunta que ele
 * responda. Sem entrega em andamento nÃ£o hÃ¡ por que saber onde ele estÃ¡ â€” a
 * linha Ã© apagada e a resposta manda o aparelho parar de enviar.
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

/** O entregador desliga o compartilhamento. O aparelho Ã© dele; a posiÃ§Ã£o sai
 *  do banco na hora, sem depender de a entrega terminar. */
export const stopSharingLocationFn = createServerFn({ method: "POST" }).handler(async () => {
  const courier = await requireCourierSession();
  await prisma.courierLocation.deleteMany({ where: { courierId: courier.id } });
  return { ok: true as const };
});

