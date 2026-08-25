/**
 * Seed: Unidades de Medida Padrão para Estoque
 * Arquivo: prisma/seed.ts (executar via: npx prisma db seed)
 *
 * Cria unidades built-in do sistema e conversões explícitas.
 * Deve ser executado UMA ÚNICA VEZ após migration.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  console.log("🌱 Iniciando seed de unidades de medida...\n");

  // ========================================================================
  // UNIDADES PESO
  // ========================================================================

  console.log("📏 Criando unidades de PESO...");

  const mg = await prisma.inventoryUnit.upsert({
    where: { code: "mg" },
    update: {},
    create: {
      code: "mg",
      name: "Miligrama",
      system: "WEIGHT",
      isBuiltIn: true,
    },
  });

  const g = await prisma.inventoryUnit.upsert({
    where: { code: "g" },
    update: {},
    create: {
      code: "g",
      name: "Grama",
      system: "WEIGHT",
      isBuiltIn: true,
    },
  });

  const kg = await prisma.inventoryUnit.upsert({
    where: { code: "kg" },
    update: {},
    create: {
      code: "kg",
      name: "Quilograma",
      system: "WEIGHT",
      isBuiltIn: true,
    },
  });

  const ton = await prisma.inventoryUnit.upsert({
    where: { code: "ton" },
    update: {},
    create: {
      code: "ton",
      name: "Tonelada",
      system: "WEIGHT",
      isBuiltIn: true,
    },
  });

  // ========================================================================
  // UNIDADES VOLUME
  // ========================================================================

  console.log("🧪 Criando unidades de VOLUME...");

  const ml = await prisma.inventoryUnit.upsert({
    where: { code: "ml" },
    update: {},
    create: {
      code: "ml",
      name: "Mililitro",
      system: "VOLUME",
      isBuiltIn: true,
    },
  });

  const dl = await prisma.inventoryUnit.upsert({
    where: { code: "dl" },
    update: {},
    create: {
      code: "dl",
      name: "Decilitro",
      system: "VOLUME",
      isBuiltIn: true,
    },
  });

  const l = await prisma.inventoryUnit.upsert({
    where: { code: "l" },
    update: {},
    create: {
      code: "l",
      name: "Litro",
      system: "VOLUME",
      isBuiltIn: true,
    },
  });

  // ========================================================================
  // UNIDADES CONTAGEM
  // ========================================================================

  console.log("📦 Criando unidades de CONTAGEM...");

  const un = await prisma.inventoryUnit.upsert({
    where: { code: "un" },
    update: {},
    create: {
      code: "un",
      name: "Unidade",
      system: "COUNT",
      isBuiltIn: true,
    },
  });

  const dozen = await prisma.inventoryUnit.upsert({
    where: { code: "dz" },
    update: {},
    create: {
      code: "dz",
      name: "Dúzia",
      system: "COUNT",
      isBuiltIn: true,
    },
  });

  // ========================================================================
  // UNIDADES COMPRIMENTO
  // ========================================================================

  console.log("📐 Criando unidades de COMPRIMENTO...");

  const mm = await prisma.inventoryUnit.upsert({
    where: { code: "mm" },
    update: {},
    create: {
      code: "mm",
      name: "Milímetro",
      system: "LENGTH",
      isBuiltIn: true,
    },
  });

  const cm = await prisma.inventoryUnit.upsert({
    where: { code: "cm" },
    update: {},
    create: {
      code: "cm",
      name: "Centímetro",
      system: "LENGTH",
      isBuiltIn: true,
    },
  });

  const m = await prisma.inventoryUnit.upsert({
    where: { code: "m" },
    update: {},
    create: {
      code: "m",
      name: "Metro",
      system: "LENGTH",
      isBuiltIn: true,
    },
  });

  // ========================================================================
  // CONVERSÕES PESO
  // ========================================================================

  console.log("🔄 Criando conversões de PESO...");

  const conversionsWeight = [
    { from: mg, to: g, factor: 0.001 },      // 1 g = 1000 mg
    { from: g, to: mg, factor: 1000 },       // 1 g = 1000 mg
    { from: g, to: kg, factor: 0.001 },      // 1 kg = 1000 g
    { from: kg, to: g, factor: 1000 },       // 1 kg = 1000 g
    { from: kg, to: ton, factor: 0.001 },    // 1 ton = 1000 kg
    { from: ton, to: kg, factor: 1000 },     // 1 ton = 1000 kg
  ];

  for (const conv of conversionsWeight) {
    await createConversion(conv.from, conv.to, conv.factor);
  }

  // ========================================================================
  // CONVERSÕES VOLUME
  // ========================================================================

  console.log("🔄 Criando conversões de VOLUME...");

  const conversionsVolume = [
    { from: ml, to: dl, factor: 0.1 },       // 1 dl = 10 ml
    { from: dl, to: ml, factor: 10 },        // 1 dl = 10 ml
    { from: ml, to: l, factor: 0.001 },      // 1 l = 1000 ml
    { from: l, to: ml, factor: 1000 },       // 1 l = 1000 ml
    { from: dl, to: l, factor: 0.1 },        // 1 l = 10 dl
    { from: l, to: dl, factor: 10 },         // 1 l = 10 dl
  ];

  for (const conv of conversionsVolume) {
    await createConversion(conv.from, conv.to, conv.factor);
  }

  // ========================================================================
  // CONVERSÕES CONTAGEM
  // ========================================================================

  console.log("🔄 Criando conversões de CONTAGEM...");

  const conversionsCount = [
    { from: un, to: dozen, factor: 1 / 12 }, // 1 un = 1/12 dúzia
    { from: dozen, to: un, factor: 12 },     // 1 dúzia = 12 un
  ];

  for (const conv of conversionsCount) {
    await createConversion(conv.from, conv.to, conv.factor);
  }

  // ========================================================================
  // CONVERSÕES COMPRIMENTO
  // ========================================================================

  console.log("🔄 Criando conversões de COMPRIMENTO...");

  const conversionsLength = [
    { from: mm, to: cm, factor: 0.1 },       // 1 cm = 10 mm
    { from: cm, to: mm, factor: 10 },        // 1 cm = 10 mm
    { from: cm, to: m, factor: 0.01 },       // 1 m = 100 cm
    { from: m, to: cm, factor: 100 },        // 1 m = 100 cm
    { from: mm, to: m, factor: 0.001 },      // 1 m = 1000 mm
    { from: m, to: mm, factor: 1000 },       // 1 m = 1000 mm
  ];

  for (const conv of conversionsLength) {
    await createConversion(conv.from, conv.to, conv.factor);
  }

  console.log("✅ Seed de unidades concluído com sucesso!\n");

  // ========================================================================
  // RESUMO
  // ========================================================================

  const unitCount = await prisma.inventoryUnit.count();
  const conversionCount = await prisma.inventoryUnitConversion.count();

  console.log(`📊 Resumo:`);
  console.log(`   - Unidades criadas: ${unitCount}`);
  console.log(`   - Conversões criadas: ${conversionCount}`);
  console.log(`\n🎉 Sistema de unidades pronto para usar!\n`);
}

/**
 * Cria conversão entre duas unidades (evita duplicação)
 */
async function createConversion(
  from: { id: string; code: string },
  to: { id: string; code: string },
  factor: number
) {
  try {
    await prisma.inventoryUnitConversion.upsert({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId: from.id,
          toUnitId: to.id,
        },
      },
      update: {},
      create: {
        fromUnitId: from.id,
        toUnitId: to.id,
        conversionFactor: factor,
      },
    });
  } catch (error) {
    console.error(
      `⚠️  Erro ao criar conversão ${from.code} → ${to.code}:`,
      error
    );
  }
}

/**
 * Seed de dados financeiros fakes para testes
 */
async function seedFinancialData() {
  console.log("\n💰 Seeding dados financeiros de teste...");

  // Criar ou pegar store
  let store = await prisma.store.findFirst();
  if (!store) {
    console.log("📦 Criando loja de teste...");
    store = await prisma.store.create({
      data: {
        id: "store_dev",
        name: "Loja teste de desenvolvedor",
        slug: "loja-teste",
      },
    });
    console.log(`✅ Loja criada: ${store.name}`);
  }

  console.log(`📍 Usando loja: ${store.name}`);

  // Pegar ou criar categoria
  let category = await prisma.category.findFirst({
    where: { storeId: store.id },
  });

  if (!category) {
    console.log("📂 Criando categoria de teste...");
    category = await prisma.category.create({
      data: {
        storeId: store.id,
        name: "Produtos Teste",
        slug: "produtos-teste",
        sortOrder: 1,
        imageUrl: null,
      },
    });
  }

  // Criar alguns produtos fakes
  console.log("🍔 Criando produtos de teste...");
  const productNames = [
    "Hambúrguer Simples",
    "Hambúrguer Duplo",
    "Pizza Margherita",
    "Refrigerante 2L",
    "Batata Frita",
  ];

  const createdProducts = [];
  const costs: Record<string, number> = {
    "hambúrguer-simples": 15,
    "hambúrguer-duplo": 22,
    "pizza-margherita": 12,
    "refrigerante-2l": 5,
    "batata-frita": 8,
  };

  for (const name of productNames) {
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const cost = costs[slug] || 10;

    const product = await prisma.product.upsert({
      where: { storeId_slug: { storeId: store.id, slug } },
      update: {},
      create: {
        storeId: store.id,
        categoryId: category.id,
        name: name,
        slug: slug,
        description: `Produto teste: ${name}`,
        basePrice: 50, // R$ 50 padrão
        isActive: true,
        sortOrder: 1,
        imageUrl: null,
      },
    });
    createdProducts.push(product);
  }

  console.log(`✅ ${createdProducts.length} produtos criados!\n`);

  // Pegar alguns produtos
  const products = await prisma.product.findMany({
    where: { storeId: store.id, isActive: true },
    take: 5,
  });

  if (products.length === 0) {
    console.log("⚠️  Erro ao encontrar produtos. Pulando seed financeiro.");
    return;
  }

  console.log(`📦 Criando pedidos com ${products.length} produtos...\n`);

  // Criar pedidos para os últimos 30 dias
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  let orderCount = 0;
  let orderNumber = Math.floor(Date.now() / 1000) % 1000000; // Base em timestamp para evitar colisões

  for (let day = 0; day < 30; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + day);

    // 2-5 pedidos por dia
    const ordersPerDay = Math.floor(Math.random() * 4) + 2;

    for (let i = 0; i < ordersPerDay; i++) {
      try {
        // Selecionar 1-3 produtos aleatórios
        const selectedProducts = products
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.floor(Math.random() * 3) + 1);

        let subtotal = 0;
        const items: any[] = [];

        for (const product of selectedProducts) {
          const quantity = Math.floor(Math.random() * 3) + 1;
          // Preço entre R$ 20 e R$ 80
          const unitPrice = Math.floor(Math.random() * 60) + 20;
          const lineTotal = unitPrice * quantity;

          subtotal += lineTotal;

          items.push({
            productId: product.id,
            productNameSnapshot: product.name,
            unitPrice: unitPrice,
            quantity: quantity,
            note: null,
            employeeDiscount: 0,
            benefitQuantity: 0,
            extras: {
              create: [],
            },
          });
        }

        // Aplicar desconto aleatório (0-15%)
        const discountPercent = Math.floor(Math.random() * 15);
        const discount = Math.round(subtotal * (discountPercent / 100));

        const total = subtotal - discount;

        // Criar cliente fictício
        const customerPhone = `1199${String(day * 100 + i).padStart(6, "0")}`;
        const customer = await prisma.customer.upsert({
          where: {
            storeId_phone: {
              storeId: store.id,
              phone: customerPhone,
            },
          },
          update: {},
          create: {
            storeId: store.id,
            phone: customerPhone,
            name: `Cliente Teste ${day}-${i}`,
          },
        });

        // Criar pedido
        await prisma.order.create({
          data: {
            storeId: store.id,
            number: orderNumber++, // Incrementar sequência
            customerId: customer.id,
            customerName: `Cliente Teste ${day}-${i}`,
            customerPhone: customer.phone,
            trackingToken: `test-${day}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            type: "PICKUP",
            status: "COMPLETED",
            source: "SITE",
            paymentMethod: Math.random() > 0.5 ? "PIX" : "CASH",
            paymentStatus: Math.random() > 0.1 ? "PAID" : "PENDING",
            subtotal,
            deliveryFee: 0,
            discount,
            total,
            createdAt: currentDate,
            updatedAt: currentDate,
            items: {
              create: items,
            },
            statusHistory: {
              create: {
                status: "COMPLETED",
                authorType: "SYSTEM",
                authorName: "Seed",
                createdAt: currentDate,
              },
            },
          },
        });

        orderCount++;
      } catch (error) {
        console.error(`⚠️  Erro ao criar pedido ${day}-${i}:`, error);
      }
    }
  }

  console.log(`✅ ${orderCount} pedidos de teste criados!\n`);
}

// Executar seeds
async function runAllSeeds() {
  await main();
  await seedFinancialData();
}

runAllSeeds()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Erro fatal no seed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
