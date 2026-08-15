import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type SizeLabel, type Weekday } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PIZZA_SIZE_DELTAS: { size: SizeLabel; delta: number }[] = [
  { size: "BROTINHO", delta: -10 },
  { size: "MEDIA", delta: 0 },
  { size: "GRANDE", delta: 10 },
  { size: "GIGANTE", delta: 20 },
];

const WEEKDAYS: Weekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

const categories = [
  { slug: "tradicionais", name: "Pizzas Tradicionais", icon: "Pizza", kind: "PIZZA" as const, sortOrder: 1 },
  { slug: "especiais", name: "Pizzas Especiais", icon: "Star", kind: "PIZZA" as const, sortOrder: 2 },
  { slug: "doces", name: "Pizzas Doces", icon: "Cake", kind: "PIZZA" as const, sortOrder: 3 },
  { slug: "bebidas", name: "Bebidas", icon: "CupSoda", kind: "SIMPLE" as const, sortOrder: 4 },
  { slug: "acompanhamentos", name: "Acompanhamentos", icon: "UtensilsCrossed", kind: "SIMPLE" as const, sortOrder: 5 },
];

const products = [
  { slug: "calabresa", name: "Calabresa", description: "Molho de tomate, mussarela, calabresa fatiada e cebola.", basePrice: 39.9, categorySlug: "tradicionais", tag: "Mais pedida" },
  { slug: "frango-com-catupiry", name: "Frango com Catupiry", description: "Frango desfiado, catupiry cremoso e milho.", basePrice: 44.9, categorySlug: "tradicionais" },
  { slug: "marguerita", name: "Marguerita", description: "Molho de tomate, mussarela, tomate fatiado e manjericão fresco.", basePrice: 41.9, categorySlug: "tradicionais" },
  { slug: "portuguesa", name: "Portuguesa", description: "Presunto, ovos, cebola, azeitona e mussarela.", basePrice: 45.9, categorySlug: "tradicionais" },
  { slug: "pepperoni-duplo", name: "Pepperoni Duplo", description: "Dose dupla de pepperoni importado e mussarela.", basePrice: 56.9, categorySlug: "especiais", tag: "Mais pedida" },
  { slug: "quatro-queijos", name: "Quatro Queijos", description: "Mussarela, provolone, parmesão e gorgonzola.", basePrice: 55.9, categorySlug: "especiais" },
  { slug: "bacon-cheddar", name: "Bacon Cheddar", description: "Bacon crocante, cheddar cremoso e cebola caramelizada.", basePrice: 54.9, categorySlug: "especiais", tag: "Novidade" },
  { slug: "chocolate-com-morango", name: "Chocolate com Morango", description: "Chocolate ao leite derretido e morangos frescos.", basePrice: 44.9, categorySlug: "doces" },
  { slug: "banana-com-canela", name: "Banana com Canela", description: "Banana caramelizada, canela e leite condensado.", basePrice: 41.9, categorySlug: "doces" },
  { slug: "ninho-com-nutella", name: "Ninho com Nutella", description: "Leite ninho, Nutella e morango.", basePrice: 47.9, categorySlug: "doces", tag: "Mais pedida" },
  { slug: "coca-cola-2l", name: "Coca-Cola 2L", description: "Garrafa 2 litros, geladinha.", basePrice: 12.9, categorySlug: "bebidas", tag: "Mais pedida" },
  { slug: "guarana-antarctica-2l", name: "Guaraná Antarctica 2L", description: "Garrafa 2 litros.", basePrice: 12.9, categorySlug: "bebidas" },
  { slug: "ice-tea-limao-2l", name: "Ice Tea Limão 2L", description: "Garrafa 2 litros, chá gelado sabor limão.", basePrice: 11.9, categorySlug: "bebidas" },
  { slug: "agua-mineral", name: "Água Mineral", description: "500ml, com ou sem gás.", basePrice: 4.5, categorySlug: "bebidas" },
  { slug: "pao-de-alho", name: "Pão de Alho", description: "Porção com 4 unidades, na brasa.", basePrice: 14.9, categorySlug: "acompanhamentos" },
  { slug: "batata-frita", name: "Batata Frita", description: "Porção grande, crocante.", basePrice: 18.9, categorySlug: "acompanhamentos" },
  { slug: "nuggets", name: "Nuggets", description: "Porção com 10 unidades e molho.", basePrice: 16.9, categorySlug: "acompanhamentos" },
  { slug: "brownie", name: "Brownie", description: "Brownie de chocolate com nozes.", basePrice: 16.9, categorySlug: "acompanhamentos" },
];

const extras = [
  { name: "Queijo extra", price: 5 },
  { name: "Catupiry", price: 6 },
  { name: "Bacon", price: 7 },
  { name: "Borda recheada", price: 8 },
  { name: "Milho", price: 3 },
];

const coupons = [
  { code: "PIZZA10", description: "10% de desconto", discountType: "PERCENTAGE" as const, discountValue: 10, validUntil: "2026-12-31" },
  { code: "SEXTA20", description: "20% às sextas", discountType: "PERCENTAGE" as const, discountValue: 20, validUntil: "2026-12-31" },
  { code: "BEMVINDO", description: "R$ 15 off na primeira compra", discountType: "FIXED_AMOUNT" as const, discountValue: 15, validUntil: "2026-06-30" },
];

const customers = [
  { name: "João da Silva", phone: "11987654321" },
  { name: "Maria Oliveira", phone: "11987654322" },
  { name: "Carlos Lima", phone: "11987654323" },
  { name: "Juliana Martins", phone: "11987654324" },
  { name: "Rafael Costa", phone: "11987654325" },
  { name: "Ana Souza", phone: "11987654326" },
  { name: "Beatriz Lima", phone: "11987654327" },
];

const reviewSeeds = [
  { customer: "Maria Oliveira", rating: 5, comment: "Pizza maravilhosa! Chegou quentinha e no tempo certo. Massa perfeita e ingredientes frescos. Recomendo!", channel: "GOOGLE" as const, status: "RESPONDED" as const, response: "Muito obrigado, Maria! Volte sempre." },
  { customer: "João da Silva", rating: 4, comment: "Boa pizza, mas demorou um pouco mais que o esperado. No geral, gostei!", channel: "GOOGLE" as const, status: "RESPONDED" as const, response: "Obrigado pelo retorno! Vamos melhorar o tempo de entrega." },
  { customer: "Carlos Lima", rating: 5, comment: "Melhor pizza da região! Ingredientes de qualidade e sabor incrível. Já sou cliente fiel!", channel: "GOOGLE" as const, status: "RESPONDED" as const, response: "Que alegria, Carlos! Muito obrigado." },
  { customer: "Rafael Costa", rating: 3, comment: "Pizza ok, mas já foi melhor. A massa estava um pouco queimada nas bordas.", channel: "GOOGLE" as const, status: "PENDING" as const },
  { customer: "Juliana Martins", rating: 5, comment: "Entrega rápida, pizza deliciosa e bem servida. Parabéns pelo excelente serviço!", channel: "WHATSAPP" as const, status: "RESPONDED" as const, response: "Obrigado, Juliana!" },
  { customer: "Ana Souza", rating: 5, comment: "Atendimento impecável e sabor incrível.", channel: "SITE" as const, status: "PENDING" as const },
  { customer: "Beatriz Lima", rating: 4, comment: "Muito boa, só achei a taxa de entrega um pouco alta.", channel: "SITE" as const, status: "PENDING" as const },
];

// Distribui pedidos ao longo de hoje para o Dashboard e o gráfico "Pedidos por hora".
const orderSeeds = [
  { hour: 18, minute: 5, customer: "João da Silva", status: "COMPLETED" as const, type: "DELIVERY" as const, items: [{ product: "calabresa", size: "GRANDE" as const, qty: 2 }, { product: "coca-cola-2l", qty: 1 }] },
  { hour: 18, minute: 32, customer: "Maria Oliveira", status: "COMPLETED" as const, type: "PICKUP" as const, items: [{ product: "frango-com-catupiry", size: "MEDIA" as const, qty: 1 }] },
  { hour: 19, minute: 10, customer: "Carlos Lima", status: "COMPLETED" as const, type: "DELIVERY" as const, items: [{ product: "quatro-queijos", size: "GRANDE" as const, qty: 1 }, { product: "brownie", qty: 1 }] },
  { hour: 19, minute: 45, customer: "Juliana Martins", status: "COMPLETED" as const, type: "DELIVERY" as const, items: [{ product: "portuguesa", size: "GRANDE" as const, qty: 1 }, { product: "guarana-antarctica-2l", qty: 1 }] },
  { hour: 20, minute: 12, customer: "Rafael Costa", status: "COMPLETED" as const, type: "DELIVERY" as const, items: [{ product: "pepperoni-duplo", size: "GIGANTE" as const, qty: 1 }] },
  { hour: 20, minute: 40, customer: "Ana Souza", status: "OUT_FOR_DELIVERY" as const, type: "DELIVERY" as const, items: [{ product: "marguerita", size: "MEDIA" as const, qty: 1 }, { product: "batata-frita", qty: 1 }] },
  { hour: 21, minute: 3, customer: "Beatriz Lima", status: "OUT_FOR_DELIVERY" as const, type: "DELIVERY" as const, items: [{ product: "ninho-com-nutella", size: "GRANDE" as const, qty: 1 }] },
  { hour: 21, minute: 25, customer: "João da Silva", status: "PREPARING" as const, type: "DELIVERY" as const, items: [{ product: "bacon-cheddar", size: "GRANDE" as const, qty: 1 }, { product: "pao-de-alho", qty: 1 }] },
  { hour: 21, minute: 48, customer: "Maria Oliveira", status: "PREPARING" as const, type: "PICKUP" as const, items: [{ product: "calabresa", size: "MEDIA" as const, qty: 1 }] },
  { hour: 22, minute: 5, customer: "Carlos Lima", status: "RECEIVED" as const, type: "DELIVERY" as const, items: [{ product: "frango-com-catupiry", size: "GRANDE" as const, qty: 1 }, { product: "coca-cola-2l", qty: 1 }] },
  { hour: 22, minute: 18, customer: "Ana Souza", status: "RECEIVED" as const, type: "DELIVERY" as const, items: [{ product: "chocolate-com-morango", size: "MEDIA" as const, qty: 1 }] },
];

function todayAt(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log("Limpando dados existentes...");
  await prisma.orderItemExtra.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.review.deleteMany();
  await prisma.order.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.extra.deleteMany();
  await prisma.productSize.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.openingHour.deleteMany();
  await prisma.restaurantPhoto.deleteMany();
  await prisma.storeSettings.deleteMany();
  await prisma.adminUser.deleteMany();

  console.log("Criando admin...");
  const email = process.env.ADMIN_SEED_EMAIL ?? "admin@bellapizza.com";
  const password = process.env.ADMIN_SEED_PASSWORD ?? "admin123";
  const admin = await prisma.adminUser.create({
    data: {
      name: "Gabriel",
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "OWNER",
    },
  });

  console.log("Criando configurações da loja...");
  await prisma.storeSettings.create({
    data: {
      id: "singleton",
      storeName: "Bella Pizza",
      whatsappNumber: "5511987654321",
      addressStreet: "Rua das Flores",
      addressNumber: "123",
      addressNeighborhood: "Centro",
      addressCity: "São Paulo",
      addressState: "SP",
      deliveryFee: 7,
      openingHours: {
        create: WEEKDAYS.map((weekday) => ({
          weekday,
          isOpen: weekday !== "MONDAY",
          opensAt: "18:00",
          closesAt: "23:30",
        })),
      },
    },
  });

  console.log("Criando categorias e produtos...");
  const categoryIdBySlug = new Map<string, string>();
  for (const c of categories) {
    const created = await prisma.category.create({ data: c });
    categoryIdBySlug.set(c.slug, created.id);
  }

  const productIdBySlug = new Map<string, string>();
  const productPriceBySlug = new Map<string, number>();
  for (const [index, p] of products.entries()) {
    const isPizza = ["tradicionais", "especiais", "doces"].includes(p.categorySlug);
    const created = await prisma.product.create({
      data: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        basePrice: p.basePrice,
        tag: p.tag,
        sortOrder: index,
        categoryId: categoryIdBySlug.get(p.categorySlug)!,
        allowHalfAndHalf: isPizza,
        sizes: isPizza
          ? {
              create: PIZZA_SIZE_DELTAS.map(({ size, delta }) => ({
                size,
                price: Math.round((p.basePrice + delta) * 100) / 100,
                isAvailable: size !== "GIGANTE",
              })),
            }
          : undefined,
      },
    });
    productIdBySlug.set(p.slug, created.id);
    productPriceBySlug.set(p.slug, p.basePrice);
  }

  console.log("Criando extras e cupons...");
  await prisma.extra.createMany({ data: extras });
  for (const c of coupons) {
    await prisma.coupon.create({
      data: {
        code: c.code,
        description: c.description,
        discountType: c.discountType,
        discountValue: c.discountValue,
        validFrom: new Date("2026-01-01"),
        validUntil: new Date(c.validUntil),
      },
    });
  }

  console.log("Criando clientes...");
  const customerIdByName = new Map<string, string>();
  for (const c of customers) {
    const created = await prisma.customer.create({ data: c });
    customerIdByName.set(c.name, created.id);
  }

  console.log("Criando pedidos...");
  const settings = await prisma.storeSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  const orderIdByIndex: string[] = [];

  for (const seed of orderSeeds) {
    const createdAt = todayAt(seed.hour, seed.minute);
    const customer = customers.find((c) => c.name === seed.customer)!;

    const items = seed.items.map((item) => {
      const base = productPriceBySlug.get(item.product)!;
      const delta = item.size ? PIZZA_SIZE_DELTAS.find((s) => s.size === item.size)!.delta : 0;
      const unitPrice = Math.round((base + delta) * 100) / 100;
      return {
        productId: productIdBySlug.get(item.product)!,
        productNameSnapshot: products.find((p) => p.slug === item.product)!.name,
        sizeLabel: item.size ?? null,
        unitPrice,
        quantity: item.qty,
      };
    });

    const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const deliveryFee = seed.type === "DELIVERY" ? settings.deliveryFee : 0;

    const order = await prisma.order.create({
      data: {
        customerId: customerIdByName.get(seed.customer)!,
        customerName: customer.name,
        customerPhone: customer.phone,
        type: seed.type,
        status: seed.status,
        source: "SITE",
        paymentMethod: "PIX",
        paymentStatus: seed.status === "COMPLETED" ? "PAID" : "PENDING",
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee,
        deliveryStreet: seed.type === "DELIVERY" ? "Rua das Flores" : null,
        deliveryNumber: seed.type === "DELIVERY" ? "123" : null,
        deliveryNeighborhood: seed.type === "DELIVERY" ? "Centro" : null,
        deliveryCity: seed.type === "DELIVERY" ? "São Paulo" : null,
        deliveryState: seed.type === "DELIVERY" ? "SP" : null,
        createdAt,
        updatedAt: createdAt,
        items: { create: items },
        statusHistory: {
          create: {
            status: seed.status,
            authorType: "SYSTEM",
            createdAt,
          },
        },
      },
    });
    orderIdByIndex.push(order.id);
  }

  console.log("Criando avaliações...");
  for (const [index, r] of reviewSeeds.entries()) {
    await prisma.review.create({
      data: {
        customerId: customerIdByName.get(r.customer)!,
        customerNameSnapshot: r.customer,
        orderId: orderIdByIndex[index] ?? null,
        rating: r.rating,
        comment: r.comment,
        channel: r.channel,
        status: r.status,
        response: r.response ?? null,
        respondedAt: r.response ? new Date() : null,
        respondedByAdminId: r.response ? admin.id : null,
      },
    });
  }

  console.log("Criando notificações...");
  const receivedOrders = await prisma.order.findMany({
    where: { status: "RECEIVED" },
    select: { id: true, number: true, customerName: true },
  });
  for (const o of receivedOrders) {
    await prisma.notification.create({
      data: {
        type: "NEW_ORDER",
        title: "Novo pedido recebido",
        message: `Pedido #${o.number} de ${o.customerName}`,
        relatedOrderId: o.id,
      },
    });
  }

  console.log(`\nSeed concluído.`);
  console.log(`Login: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
