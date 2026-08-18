import type {
  OrderStatus,
  OrderType,
  PaymentMethod,
  SizeLabel,
  StatusAuthorType,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "../db/client";

/**
 * Secret for the tracking link the customer gets. Generated with crypto rather
 * than from a sequence: a guessable token would let anyone read another person's
 * order by changing a number in the address.
 */
function newTrackingToken() {
  return randomBytes(24).toString("base64url");
}

const SIZE_BY_KEY: Record<string, SizeLabel> = {
  broto: "BROTINHO",
  media: "MEDIA",
  grande: "GRANDE",
  gigante: "GIGANTE",
};

export type CheckoutItem = {
  productSlug: string;
  sizeKey?: string;
  secondProductSlug?: string;
  extraIds: string[];
  quantity: number;
  note?: string;
};

export type CheckoutInput = {
  items: CheckoutItem[];
  customerName: string;
  customerPhone: string;
  type: OrderType;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  customerNote?: string;
  delivery?: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
};

export type CheckoutResult =
  | { ok: true; orderId: string; orderNumber: number; total: number; trackingToken: string | null }
  | { ok: false; error: string };

/** Price of one product at a given size — falls back to the base price. */
function priceForSize(
  product: { basePrice: number; sizes: { size: SizeLabel; price: number }[] },
  sizeLabel: SizeLabel | null,
): number {
  if (!sizeLabel) return product.basePrice;
  return product.sizes.find((s) => s.size === sizeLabel)?.price ?? product.basePrice;
}

/**
 * Creates an order, recomputing every price from the database. Nothing the
 * client sends about money is trusted — only ids, sizes and quantities.
 */
export async function createOrderFromCheckout(
  storeId: string,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  if (input.items.length === 0) return { ok: false, error: "O carrinho está vazio." };

  const settings = await prisma.storeSettings.findUnique({ where: { storeId } });
  if (!settings) return { ok: false, error: "A loja ainda não está configurada." };

  if (input.type === "DELIVERY" && !settings.acceptsDelivery) {
    return { ok: false, error: "A loja não está aceitando entregas no momento." };
  }
  if (input.type === "PICKUP" && !settings.acceptsPickup) {
    return { ok: false, error: "A loja não está aceitando retiradas no momento." };
  }
  if (!settings.acceptedPaymentMethods.includes(input.paymentMethod)) {
    return { ok: false, error: "Forma de pagamento não aceita." };
  }

  const slugs = [
    ...new Set(
      input.items.flatMap((i) =>
        [i.productSlug, i.secondProductSlug].filter((s): s is string => Boolean(s)),
      ),
    ),
  ];
  const products = await prisma.product.findMany({
    where: { storeId, slug: { in: slugs }, isActive: true },
    include: { sizes: { where: { isAvailable: true } } },
  });
  const productBySlug = new Map(products.map((p) => [p.slug, p]));

  const extraIds = [...new Set(input.items.flatMap((i) => i.extraIds))];
  const extras = extraIds.length
    ? await prisma.extra.findMany({ where: { storeId, id: { in: extraIds }, isActive: true } })
    : [];
  const extraById = new Map(extras.map((e) => [e.id, e]));

  const lines: {
    productId: string;
    productNameSnapshot: string;
    sizeLabel: SizeLabel | null;
    isHalfAndHalf: boolean;
    secondProductId: string | null;
    secondProductNameSnapshot: string | null;
    unitPrice: number;
    quantity: number;
    note: string | null;
    extras: { extraId: string; nameSnapshot: string; priceSnapshot: number }[];
  }[] = [];

  let subtotal = 0;

  for (const item of input.items) {
    const product = productBySlug.get(item.productSlug);
    if (!product) {
      return { ok: false, error: `"${item.productSlug}" não está mais disponível.` };
    }
    if (item.quantity < 1) return { ok: false, error: "Quantidade inválida." };

    const sizeLabel = item.sizeKey ? (SIZE_BY_KEY[item.sizeKey] ?? null) : null;
    if (sizeLabel && !product.sizes.some((s) => s.size === sizeLabel)) {
      return { ok: false, error: `O tamanho escolhido para "${product.name}" não está disponível.` };
    }

    const second = item.secondProductSlug ? productBySlug.get(item.secondProductSlug) : undefined;
    if (item.secondProductSlug && !second) {
      return { ok: false, error: "O segundo sabor não está mais disponível." };
    }
    if (second && !product.allowHalfAndHalf) {
      return { ok: false, error: `"${product.name}" não aceita meia-pizza.` };
    }

    let unitPrice = priceForSize(product, sizeLabel);
    if (second) {
      const secondPrice = priceForSize(second, sizeLabel);
      unitPrice =
        product.halfPizzaPricingRule === "AVERAGE_PRICE"
          ? (unitPrice + secondPrice) / 2
          : Math.max(unitPrice, secondPrice);
    }

    const lineExtras = item.extraIds.map((id) => {
      const extra = extraById.get(id);
      return extra
        ? { extraId: extra.id, nameSnapshot: extra.name, priceSnapshot: extra.price }
        : null;
    });
    if (lineExtras.some((e) => e === null)) {
      return { ok: false, error: "Um dos adicionais não está mais disponível." };
    }
    const resolvedExtras = lineExtras as { extraId: string; nameSnapshot: string; priceSnapshot: number }[];

    const extrasTotal = resolvedExtras.reduce((s, e) => s + e.priceSnapshot, 0);
    subtotal += (unitPrice + extrasTotal) * item.quantity;

    lines.push({
      productId: product.id,
      productNameSnapshot: product.name,
      sizeLabel,
      isHalfAndHalf: Boolean(second),
      secondProductId: second?.id ?? null,
      secondProductNameSnapshot: second?.name ?? null,
      unitPrice: Math.round(unitPrice * 100) / 100,
      quantity: item.quantity,
      note: item.note?.trim() || null,
      extras: resolvedExtras,
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;

  if (subtotal < settings.minOrderValue) {
    return {
      ok: false,
      error: `O pedido mínimo é de R$ ${settings.minOrderValue.toFixed(2).replace(".", ",")}.`,
    };
  }

  // Coupon
  let discount = 0;
  let couponId: string | null = null;
  if (input.couponCode) {
    const coupon = await prisma.coupon.findFirst({
      where: { storeId, code: input.couponCode.trim().toUpperCase() },
    });
    const now = new Date();
    if (
      !coupon ||
      !coupon.isActive ||
      coupon.validFrom > now ||
      coupon.validUntil < now ||
      (coupon.maxUsage !== null && coupon.usageCount >= coupon.maxUsage) ||
      (coupon.minOrderValue !== null && subtotal < coupon.minOrderValue)
    ) {
      return { ok: false, error: "Cupom inválido ou expirado." };
    }
    discount =
      coupon.discountType === "PERCENTAGE"
        ? (subtotal * coupon.discountValue) / 100
        : coupon.discountValue;
    discount = Math.min(Math.round(discount * 100) / 100, subtotal);
    couponId = coupon.id;
  }

  const deliveryFee =
    input.type === "DELIVERY" &&
    !(settings.freeDeliveryMinOrder !== null && subtotal >= settings.freeDeliveryMinOrder)
      ? settings.deliveryFee
      : 0;

  const total = Math.round((subtotal + deliveryFee - discount) * 100) / 100;

  const estimatedMinutes =
    input.type === "DELIVERY" ? settings.estimatedDeliveryMinMax : settings.estimatedPickupMinMax;

  const phone = input.customerPhone.replace(/\D/g, "");

  const order = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { storeId_phone: { storeId, phone } },
      create: { storeId, phone, name: input.customerName },
      update: { name: input.customerName },
    });

    // Order numbers restart at #1 for every store, so each lanchonete sees a
    // clean sequence instead of a database-wide counter. Computed inside the
    // transaction and protected by the unique (storeId, number) index: two
    // simultaneous checkouts cannot land on the same number.
    const last = await tx.order.findFirst({
      where: { storeId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const nextNumber = (last?.number ?? 0) + 1;

    const created = await tx.order.create({
      data: {
        storeId,
        number: nextNumber,
        customerId: customer.id,
        customerName: input.customerName,
        customerPhone: phone,
        trackingToken: newTrackingToken(),
        type: input.type,
        status: "RECEIVED",
        source: "SITE",
        paymentMethod: input.paymentMethod,
        subtotal,
        deliveryFee,
        discount,
        total,
        couponId,
        deliveryStreet: input.delivery?.street ?? null,
        deliveryNumber: input.delivery?.number ?? null,
        deliveryComplement: input.delivery?.complement ?? null,
        deliveryNeighborhood: input.delivery?.neighborhood ?? null,
        deliveryCity: input.delivery?.city ?? null,
        deliveryState: input.delivery?.state ?? null,
        deliveryZipCode: input.delivery?.zipCode ?? null,
        customerNote: input.customerNote?.trim() || null,
        estimatedDeliveryAt: new Date(Date.now() + estimatedMinutes * 60_000),
        autoPrintRequested: settings.autoPrintEnabled,
        items: {
          create: lines.map(({ extras: lineExtras, ...line }) => ({
            ...line,
            extras: { create: lineExtras },
          })),
        },
        statusHistory: {
          create: { status: "RECEIVED", authorType: "CUSTOMER", authorName: input.customerName },
        },
      },
    });

    if (couponId) {
      await tx.coupon.update({ where: { id: couponId }, data: { usageCount: { increment: 1 } } });
    }

    await tx.notification.create({
      data: {
        storeId,
        type: "NEW_ORDER",
        title: "Novo pedido recebido",
        message: `Pedido #${created.number} de ${input.customerName}`,
        relatedOrderId: created.id,
      },
    });

    return created;
  });

  return {
    ok: true,
    orderId: order.id,
    orderNumber: order.number,
    total: order.total,
    trackingToken: order.trackingToken,
  };
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  RECEIVED: ["PREPARING", "CANCELLED"],
  PREPARING: ["OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export async function transitionOrderStatus(
  storeId: string,
  orderId: string,
  status: OrderStatus,
  author: { authorType: StatusAuthorType; authorName?: string; note?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  // storeId is part of the lookup: an order id from another store must simply
  // not be found, not be moved.
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId },
    select: { status: true, type: true, courierId: true },
  });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (order.status === status) return { ok: true };

  if (!ALLOWED_TRANSITIONS[order.status].includes(status)) {
    return {
      ok: false,
      error: `Não é possível mudar de "${order.status}" para "${status}".`,
    };
  }
  // Pickup orders never go out for delivery.
  if (status === "OUT_FOR_DELIVERY" && order.type === "PICKUP") {
    return { ok: false, error: "Pedidos para retirada não saem para entrega." };
  }
  /**
   * Entrega sem entregador nao sai. Nao e so a tela que exige: qualquer
   * caminho ate aqui — o botao do quadro, a tela do pedido — passa por esta
   * checagem, entao um pedido nunca fica "na rua" sem alguem responsavel.
   * Quem despacha usa dispatchOrder, que escolhe o entregador junto.
   */
  if (status === "OUT_FOR_DELIVERY" && order.type === "DELIVERY" && !order.courierId) {
    return { ok: false, error: "Escolha quem vai levar antes de liberar a saída." };
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        // Completing an order settles the payment for cash/on-delivery flows.
        ...(status === "COMPLETED" ? { paymentStatus: "PAID" as const } : {}),
        // Sair do preparo encerra a espera de qualquer jeito: o pedido saiu,
        // foi cancelado ou virou retirada, e nenhum deles ainda aguarda alguem.
        awaitingCourierSince: null,
      },
    }),
    prisma.orderStatusHistory.create({
      data: {
        orderId,
        status,
        authorType: author.authorType,
        authorName: author.authorName ?? null,
        note: author.note ?? null,
      },
    }),
  ]);

  return { ok: true };
}

/**
 * Escolhe quem leva e libera a saída no mesmo passo.
 *
 * Os dois juntos de propósito: um pedido com entregador escolhido mas ainda no
 * preparo, ou na rua sem ninguém, são estados que ninguém pediu e que a tela
 * teria de explicar. Aqui a escolha é o que faz o pedido sair.
 */
export async function dispatchOrder(
  storeId: string,
  orderId: string,
  courierId: string,
  author: { authorType: StatusAuthorType; authorName?: string },
): Promise<{ ok: true; courierName: string } | { ok: false; error: string }> {
  // O entregador tem de ser desta loja: um id de outra lanchonete simplesmente
  // não é encontrado, e uma conta desativada não recebe entrega nova.
  const courier = await prisma.adminUser.findFirst({
    where: { id: courierId, storeId, role: "COURIER", isActive: true },
    select: { id: true, name: true },
  });
  if (!courier) return { ok: false, error: "Entregador não encontrado." };

  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId },
    select: { status: true, type: true },
  });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (order.type !== "DELIVERY") {
    return { ok: false, error: "Este pedido é para retirada no balcão." };
  }
  if (order.status !== "PREPARING") {
    return { ok: false, error: "Só um pedido em preparo pode sair para entrega." };
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        courierId: courier.id,
        awaitingCourierSince: null,
        status: "OUT_FOR_DELIVERY",
      },
    }),
    prisma.orderStatusHistory.create({
      data: {
        orderId,
        status: "OUT_FOR_DELIVERY",
        authorType: author.authorType,
        authorName: author.authorName ?? null,
        note: `Entrega com ${courier.name}`,
      },
    }),
  ]);

  return { ok: true, courierName: courier.name };
}

/**
 * Põe o pedido na lista de espera, ou o tira dela.
 *
 * A comida ficou pronta e não há quem leve. O status continua "em preparo" —
 * mentir dizendo que saiu quebraria o acompanhamento do cliente — mas a marca
 * de espera tira o pedido do meio dos que ainda estão no forno.
 */
export async function setOrderAwaitingCourier(
  storeId: string,
  orderId: string,
  awaiting: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId },
    select: { status: true, type: true },
  });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (order.type !== "DELIVERY") {
    return { ok: false, error: "Só pedido de entrega espera por entregador." };
  }
  if (order.status !== "PREPARING") {
    return { ok: false, error: "Só um pedido em preparo pode aguardar entregador." };
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { awaitingCourierSince: awaiting ? new Date() : null },
  });
  return { ok: true };
}
