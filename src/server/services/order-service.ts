import type {
  OrderStatus,
  OrderType,
  PaymentMethod,
  StatusAuthorType,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "../db/client";
import { verifyPassword } from "../auth/password";
import { findEmployeeForCheckout, lerUsoDoDia } from "../repositories/employee-repository";
import { extrasPermitidosPorProduto } from "../repositories/extra-repository";
import {
  calcularBeneficio,
  type LinhaParaBeneficio,
  type ResultadoDoBeneficio,
} from "./employee-benefit";
import { conferirOpcoes } from "./option-pricing";
import { orderStatusSync } from "./order-status-sync";

/**
 * Secret for the tracking link the customer gets. Generated with crypto rather
 * than from a sequence: a guessable token would let anyone read another person's
 * order by changing a number in the address.
 */
function newTrackingToken() {
  return randomBytes(24).toString("base64url");
}

export type CheckoutItem = {
  productSlug: string;
  /** Id do tamanho da categoria; ausente quando o produto não tem tamanhos. */
  sizeId?: string;
  secondProductSlug?: string;
  extraIds: string[];
  /** Ids das opções escolhidas nos grupos da categoria. */
  optionIds?: string[];
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
  /**
   * O PIN de quem se declarou funcionário. Ausente na esmagadora maioria dos
   * pedidos, e aí nada neste arquivo muda de comportamento.
   */
  employeePin?: string;
  customerNote?: string;
  /** Mesa QRCode ID para pedidos de balcão/mesa. */
  tableId?: string;
  /** Número da mesa para exibição (Mesa 1, Mesa 2...). */
  tableNumber?: number;
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

/**
 * Preço de um produto num tamanho.
 *
 * Devolve null quando o produto não tem preço para aquele tamanho, em vez de
 * cair no preço base: numa meia a meia isso cobraria o preço de uma pizza
 * pequena por uma gigante, e o erro só apareceria no fim do mês.
 */
function priceForSize(
  product: { basePrice: number; sizes: { categorySizeId: string; price: number }[] },
  sizeId: string | null,
): number | null {
  if (!sizeId) return product.basePrice;
  return product.sizes.find((s) => s.categorySizeId === sizeId)?.price ?? null;
}


/** Uma linha do pedido, com o preço e os nomes já copiados do cardápio. */
type LinhaDoPedido = {
  productId: string;
  productNameSnapshot: string;
  sizeLabel: string | null;
  isHalfAndHalf: boolean;
  secondProductId: string | null;
  secondProductNameSnapshot: string | null;
  unitPrice: number;
  quantity: number;
  note: string | null;
  extras: {
    extraId: string | null;
    optionItemId: string | null;
    groupNameSnapshot: string | null;
    nameSnapshot: string;
    priceSnapshot: number;
  }[];
};

export type Precificacao =
  | { ok: true; lines: LinhaDoPedido[]; linhasParaBeneficio: LinhaParaBeneficio[]; subtotal: number }
  | { ok: false; error: string };

/**
 * Transforma o que o navegador mandou — slugs, tamanhos e quantidades — nas
 * linhas do pedido, com cada preço relido do banco.
 *
 * Separada de `createOrderFromCheckout` para a prévia do carrinho poder chamar
 * exatamente esta conta. Se a prévia refizesse a precificação por conta
 * própria, as duas divergiriam no primeiro ajuste de regra, e o funcionário
 * veria um desconto na tela e pagaria outro.
 */
export async function precificarItens(
  storeId: string,
  items: CheckoutItem[],
): Promise<Precificacao> {
  const slugs = [
    ...new Set(
      items.flatMap((i) =>
        [i.productSlug, i.secondProductSlug].filter((s): s is string => Boolean(s)),
      ),
    ),
  ];
  const products = await prisma.product.findMany({
    where: { storeId, slug: { in: slugs }, isActive: true },
    include: { sizes: { where: { isAvailable: true } } },
  });
  const productBySlug = new Map(products.map((p) => [p.slug, p]));

  /**
   * Os tamanhos que estes produtos podem usar, lidos do banco e não do que o
   * navegador mandou. É o que impede um id de tamanho de outra loja de entrar
   * no pedido, e é onde sai o nome gravado no item.
   */
  const sizes = await prisma.categorySize.findMany({
    where: { categoryId: { in: [...new Set(products.map((p) => p.categoryId))] } },
    select: { id: true, label: true },
  });
  const sizesById = new Map(sizes.map((s) => [s.id, s]));

  /**
   * As perguntas de cada produto: as da categoria dele mais as dele próprio.
   * Lidas do banco e não do que o navegador mandou — é aqui que se sabe o que
   * é obrigatório, o que cabe e quanto custa, e o cliente pode mandar
   * qualquer coisa.
   *
   * As da categoria vêm primeiro porque é a ordem em que a vitrine pergunta:
   * primeiro o que vale para tudo da categoria, depois o que é só daquele
   * item.
   */
  const gruposPorProduto = new Map<string, Awaited<ReturnType<typeof buscarGrupos>>>();
  for (const produto of products) {
    gruposPorProduto.set(produto.id, [
      ...(await buscarGrupos({ categoryId: produto.categoryId })),
      ...(await buscarGrupos({ productId: produto.id })),
    ]);
  }

  const extraIds = [...new Set(items.flatMap((i) => i.extraIds))];
  const extras = extraIds.length
    ? await prisma.extra.findMany({ where: { storeId, id: { in: extraIds }, isActive: true } })
    : [];
  const extraById = new Map(extras.map((e) => [e.id, e]));

  /**
   * Onde cada adicional pode ser pedido.
   *
   * Sem isto, "existe nesta loja" era a única condição: dava para mandar borda
   * de catupiry num refrigerante e o pedido saía com a borda cobrada. A tela
   * não oferece, mas quem chama o servidor direto não passa pela tela.
   */
  const permitidosPorProduto = extraIds.length
    ? await extrasPermitidosPorProduto(
        storeId,
        products.map((p) => ({ id: p.id, categoryId: p.categoryId })),
      )
    : new Map<string, Set<string>>();

  const lines: LinhaDoPedido[] = [];

  let subtotal = 0;

  /**
   * As mesmas linhas, no mesmo índice, com o que o cálculo do benefício
   * precisa saber. Separadas de `lines` porque aquele objeto vai inteiro para
   * o `create` do Prisma, e um campo a mais ali quebraria a criação.
   */
  const linhasParaBeneficio: LinhaParaBeneficio[] = [];

  for (const item of items) {
    const product = productBySlug.get(item.productSlug);
    if (!product) {
      return { ok: false, error: `"${item.productSlug}" não está mais disponível.` };
    }
    if (item.quantity < 1) return { ok: false, error: "Quantidade inválida." };

    const sizeId = item.sizeId ?? null;
    const tamanho = sizeId ? sizesById.get(sizeId) : null;
    if (sizeId && !tamanho) {
      return { ok: false, error: `O tamanho escolhido para "${product.name}" não está disponível.` };
    }

    const second = item.secondProductSlug ? productBySlug.get(item.secondProductSlug) : undefined;
    if (item.secondProductSlug && !second) {
      return { ok: false, error: "O segundo sabor não está mais disponível." };
    }
    if (second && !product.allowHalfAndHalf) {
      return { ok: false, error: `"${product.name}" não aceita meia-pizza.` };
    }

    const primeiroPreco = priceForSize(product, sizeId);
    if (primeiroPreco === null) {
      return { ok: false, error: `O tamanho escolhido para "${product.name}" não está disponível.` };
    }

    let unitPrice = primeiroPreco;
    if (second) {
      /**
       * Os dois sabores precisam do mesmo tamanho, e o tamanho pertence à
       * categoria — então isto só falha se um dos sabores não tiver preço
       * cadastrado ali. Antes essa falta virava o preço base em silêncio: uma
       * gigante saía pelo preço de uma broto.
       */
      const secondPrice = priceForSize(second, sizeId);
      if (secondPrice === null) {
        return {
          ok: false,
          error: `"${second.name}" não tem preço nesse tamanho. Escolha outro sabor ou outro tamanho.`,
        };
      }
      unitPrice =
        product.halfPizzaPricingRule === "AVERAGE_PRICE"
          ? (unitPrice + secondPrice) / 2
          : Math.max(unitPrice, secondPrice);
    }

    const opcoes = conferirOpcoes(gruposPorProduto.get(product.id) ?? [], item.optionIds ?? []);
    if (!opcoes.ok) return { ok: false, error: opcoes.error };

    const permitidos = permitidosPorProduto.get(product.id) ?? new Set<string>();
    const naoPermitido = item.extraIds.find((id) => !permitidos.has(id));
    if (naoPermitido) {
      // Diz o nome do produto, e não o do adicional: quem lê é quem montou o
      // carrinho, e o que ele precisa saber é onde a escolha não cabe.
      return {
        ok: false,
        error: `Um dos adicionais escolhidos não é oferecido em "${product.name}".`,
      };
    }

    const lineExtras = item.extraIds.map((id) => {
      const extra = extraById.get(id);
      return extra
        ? {
            extraId: extra.id,
            optionItemId: null,
            groupNameSnapshot: null,
            nameSnapshot: extra.name,
            priceSnapshot: extra.price,
          }
        : null;
    });
    if (lineExtras.some((e) => e === null)) {
      return { ok: false, error: "Um dos adicionais não está mais disponível." };
    }
    const resolvedExtras = lineExtras as {
      extraId: string | null;
      optionItemId: string | null;
      groupNameSnapshot: string | null;
      nameSnapshot: string;
      priceSnapshot: number;
    }[];

    // As escolhas dos grupos entram na mesma lista dos adicionais: para o
    // pedido, ambos são "algo que o cliente escolheu e entrou na conta".
    const escolhas = opcoes.escolhas.map((e) => ({
      extraId: null,
      optionItemId: e.optionItemId,
      groupNameSnapshot: e.groupName,
      nameSnapshot: e.name,
      priceSnapshot: e.price,
    }));

    const todosAdicionais = [...resolvedExtras, ...escolhas];
    const extrasTotal = todosAdicionais.reduce((s, e) => s + e.priceSnapshot, 0);
    subtotal += (unitPrice + extrasTotal) * item.quantity;

    lines.push({
      productId: product.id,
      productNameSnapshot: product.name,
      sizeLabel: tamanho?.label ?? null,
      isHalfAndHalf: Boolean(second),
      secondProductId: second?.id ?? null,
      secondProductNameSnapshot: second?.name ?? null,
      unitPrice: Math.round(unitPrice * 100) / 100,
      quantity: item.quantity,
      note: item.note?.trim() || null,
      extras: todosAdicionais,
    });

    linhasParaBeneficio.push({
      productId: product.id,
      categoryId: product.categoryId,
      // O preço do item, sem os adicionais: o benefício é sobre a refeição, e
      // não sobre a borda recheada que a pessoa escolheu pôr nela.
      unitPrice: Math.round(unitPrice * 100) / 100,
      quantity: item.quantity,
    });
  }

  return {
    ok: true,
    lines,
    linhasParaBeneficio,
    subtotal: Math.round(subtotal * 100) / 100,
  };
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
  const phone = input.customerPhone.replace(/\D/g, "");

  /*
   * Quem pediu é funcionário?
   *
   * A pergunta vem antes da forma de pagamento porque "desconto em folha" só
   * existe para quem for reconhecido — e antes dos produtos porque um PIN
   * errado tem de falhar dizendo que o PIN está errado, não depois de uma
   * lista de outras conferências.
   *
   * Sem PIN informado, nada aqui acontece e o pedido segue o caminho de sempre.
   */
  const funcionario = input.employeePin
    ? await findEmployeeForCheckout(prisma, storeId, phone)
    : null;
  if (input.employeePin) {
    if (!funcionario || !(await verifyPassword(input.employeePin, funcionario.pinHash))) {
      // A mesma mensagem para "não é funcionário" e "PIN errado": separá-las
      // transformaria o checkout num jeito de descobrir quem trabalha na loja.
      return { ok: false, error: "Telefone ou PIN de funcionário não confere." };
    }
    if (!funcionario.plano) {
      return {
        ok: false,
        error: "Seu cadastro ainda não tem um benefício definido. Fale com a loja.",
      };
    }
  }

  if (input.paymentMethod === "PAYROLL") {
    // Desconto em folha não é forma de pagamento da loja: não está em
    // `acceptedPaymentMethods` e é o plano que o libera, pessoa a pessoa.
    if (!funcionario?.plano?.allowPayroll) {
      return { ok: false, error: "Desconto em folha não está liberado para este pedido." };
    }
  } else if (!settings.acceptedPaymentMethods.includes(input.paymentMethod)) {
    return { ok: false, error: "Forma de pagamento não aceita." };
  }

  const precos = await precificarItens(storeId, input.items);
  if (!precos.ok) return precos;
  const { lines, linhasParaBeneficio, subtotal } = precos;

  if (subtotal < settings.minOrderValue) {
    return {
      ok: false,
      error: `O pedido mínimo é de R$ ${settings.minOrderValue.toFixed(2).replace(".", ",")}.`,
    };
  }

  /*
   * O benefício do funcionário.
   *
   * Calculado aqui, e não só dentro da transação, por dois motivos: é o que
   * decide se o cupom logo abaixo pode ser aceito, e um erro precisa poder
   * sair antes de qualquer escrita. O número é refeito lá dentro, com a cota
   * relida — este aqui não é o que vai para o pedido.
   */
  const beneficio: ResultadoDoBeneficio | null = funcionario?.plano
    ? calcularBeneficio(
        funcionario.plano,
        linhasParaBeneficio,
        await lerUsoDoDia(prisma, storeId, funcionario.id),
      )
    : null;

  // Coupon
  let descontoDoCupom = 0;
  let couponId: string | null = null;
  if (input.couponCode) {
    /*
     * Os dois não somam. Somar deixaria um lanche de funcionário chegar perto
     * de zero com um cupom de campanha que não foi feito para ele, e o dono
     * só descobriria isso no fechamento do mês.
     */
    if (beneficio && beneficio.descontoTotal > 0) {
      return {
        ok: false,
        error: "Este pedido já tem o desconto de funcionário; o cupom não acumula.",
      };
    }
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
    descontoDoCupom =
      coupon.discountType === "PERCENTAGE"
        ? (subtotal * coupon.discountValue) / 100
        : coupon.discountValue;
    descontoDoCupom = Math.min(Math.round(descontoDoCupom * 100) / 100, subtotal);
    couponId = coupon.id;
  }

  const deliveryFee =
    input.type === "DELIVERY" &&
    !(settings.freeDeliveryMinOrder !== null && subtotal >= settings.freeDeliveryMinOrder)
      ? settings.deliveryFee
      : 0;

  const estimatedMinutes =
    input.type === "DELIVERY" ? settings.estimatedDeliveryMinMax : settings.estimatedPickupMinMax;

  const order = await prisma.$transaction(async (tx) => {
    /*
     * A cota é relida aqui dentro, e o desconto refeito com ela.
     *
     * Sem isto, duas abas abertas gastariam a mesma cota duas vezes: as duas
     * leriam "nenhum item usado hoje", as duas dariam o desconto inteiro, e o
     * funcionário almoçaria de graça duas vezes com uma cota de uma. O número
     * calculado lá em cima serve para conferir o cupom e para a prévia; o que
     * vai para o pedido é este.
     */
    const beneficioFinal = funcionario?.plano
      ? calcularBeneficio(
          funcionario.plano,
          linhasParaBeneficio,
          await lerUsoDoDia(tx, storeId, funcionario.id),
        )
      : null;

    const employeeDiscount = beneficioFinal?.descontoTotal ?? 0;
    const discount = Math.min(
      Math.round((employeeDiscount + descontoDoCupom) * 100) / 100,
      subtotal,
    );
    const total = Math.round((subtotal + deliveryFee - discount) * 100) / 100;

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
        tableId: input.tableId ?? null,
        tableNumber: input.tableNumber ?? null,
        employeeId: funcionario?.id ?? null,
        // O nome vai copiado: apagar a ficha do funcionário um dia não pode
        // apagar o registro de quem pegou o quê.
        employeeNameSnapshot: funcionario?.name ?? null,
        employeeDiscount,
        employeeBenefitNote: beneficioFinal?.nota ?? null,
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
          create: lines.map(({ extras: lineExtras, ...line }, i) => ({
            ...line,
            // Por linha, porque a cota pode acabar no meio de uma: dois com
            // desconto e o terceiro cheio não cabe num campo único do pedido.
            employeeDiscount: beneficioFinal?.porLinha[i]?.desconto ?? 0,
            benefitQuantity: beneficioFinal?.porLinha[i]?.quantidade ?? 0,
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

  // Sync inventory after order creation (fire-and-forget)
  orderStatusSync.onStatusChange(order.id, "RECEIVED").catch((err) => {
    console.error(`Inventory sync failed for new order ${order.id}:`, err);
  });

  return {
    ok: true,
    orderId: order.id,
    orderNumber: order.number,
    total: order.total,
    trackingToken: order.trackingToken,
  };
}

/** Grupos e opções de um dono — categoria ou produto — na ordem da tela. */
function buscarGrupos(dono: { categoryId: string } | { productId: string }) {
  return prisma.optionGroup.findMany({
    where: dono,
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      minChoices: true,
      maxChoices: true,
      freeChoices: true,
      options: {
        where: { isAvailable: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, price: true },
      },
    },
  });
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
    select: { status: true, type: true, courierId: true, paymentMethod: true },
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
        /*
         * Completing an order settles the payment for cash/on-delivery flows.
         *
         * Menos o desconto em folha: ali o pedido é entregue e continua não
         * pago de propósito, porque o acerto é no salário no fim do mês. Sem
         * esta exceção, todo pedido de funcionário se quitaria sozinho ao ser
         * concluído e o total a descontar seria sempre zero.
         */
        ...(status === "COMPLETED" && order.paymentMethod !== "PAYROLL"
          ? { paymentStatus: "PAID" as const }
          : {}),
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

  // Sync inventory after status change (fire-and-forget, doesn't block order update)
  orderStatusSync.onStatusChange(orderId, status).catch((err) => {
    console.error(`Inventory sync failed for order ${orderId} (status: ${status}):`, err);
  });

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
        // O nome vai junto: se a conta dele for apagada um dia, o pedido ainda
        // sabe dizer quem levou.
        courierNameSnapshot: courier.name,
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

  // Sync inventory after dispatch (fire-and-forget)
  orderStatusSync.onStatusChange(orderId, "OUT_FOR_DELIVERY").catch((err) => {
    console.error(`Inventory sync failed for order ${orderId} (status: OUT_FOR_DELIVERY):`, err);
  });

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
