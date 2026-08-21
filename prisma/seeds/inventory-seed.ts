import { PrismaClient, Decimal } from "@prisma/client";

/**
 * Seed de dados de teste para módulo Estoque
 * Executa: npm run db:seed
 */

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed de estoque...");

  // 1. Garantir que temos as unidades
  console.log("📏 Criando unidades de medida...");
  const units = {
    kg: await prisma.inventoryUnit.upsert({
      where: { code: "kg" },
      update: {},
      create: {
        code: "kg",
        name: "Quilograma",
        system: "WEIGHT",
        isBuiltIn: true,
      },
    }),
    g: await prisma.inventoryUnit.upsert({
      where: { code: "g" },
      update: {},
      create: {
        code: "g",
        name: "Grama",
        system: "WEIGHT",
        isBuiltIn: true,
      },
    }),
    L: await prisma.inventoryUnit.upsert({
      where: { code: "L" },
      update: {},
      create: {
        code: "L",
        name: "Litro",
        system: "VOLUME",
        isBuiltIn: true,
      },
    }),
    ml: await prisma.inventoryUnit.upsert({
      where: { code: "ml" },
      update: {},
      create: {
        code: "ml",
        name: "Mililitro",
        system: "VOLUME",
        isBuiltIn: true,
      },
    }),
    un: await prisma.inventoryUnit.upsert({
      where: { code: "un" },
      update: {},
      create: {
        code: "un",
        name: "Unidade",
        system: "COUNT",
        isBuiltIn: true,
      },
    }),
  };

  // 2. Criar conversões
  console.log("🔄 Criando conversões...");
  await prisma.inventoryUnitConversion.upsert({
    where: {
      fromUnitId_toUnitId: {
        fromUnitId: units.kg.id,
        toUnitId: units.g.id,
      },
    },
    update: {},
    create: {
      fromUnitId: units.kg.id,
      toUnitId: units.g.id,
      conversionFactor: new Decimal(1000),
    },
  });

  await prisma.inventoryUnitConversion.upsert({
    where: {
      fromUnitId_toUnitId: {
        fromUnitId: units.L.id,
        toUnitId: units.ml.id,
      },
    },
    update: {},
    create: {
      fromUnitId: units.L.id,
      toUnitId: units.ml.id,
      conversionFactor: new Decimal(1000),
    },
  });

  // 3. Encontrar loja de teste (ou primeira store)
  console.log("🏪 Procurando store...");
  let store = await prisma.store.findFirst();

  if (!store) {
    console.log("   Criando store de teste...");
    store = await prisma.store.create({
      data: {
        slug: "teste-estoque-" + Date.now(),
        name: "Teste Estoque",
      },
    });
  }

  console.log(`   Store: ${store.name} (${store.id})`);

  // 4. Criar itens de teste
  console.log("📦 Criando itens de estoque...");
  const items = {
    farinha: await prisma.inventoryItem.upsert({
      where: {
        storeId_sku: {
          storeId: store.id,
          sku: "FARINHA-001",
        },
      },
      update: {
        quantityOnHand: new Decimal(50),
      },
      create: {
        storeId: store.id,
        name: "Farinha de Trigo",
        sku: "FARINHA-001",
        baseUnitId: units.kg.id,
        itemType: "INGREDIENT",
        cost: new Decimal(5.5),
        minimumThreshold: new Decimal(10),
        idealQuantity: new Decimal(30),
        maximumCapacity: new Decimal(50),
        quantityOnHand: new Decimal(50),
      },
    }),
    queijo: await prisma.inventoryItem.upsert({
      where: {
        storeId_sku: {
          storeId: store.id,
          sku: "QUEIJO-MOZ-001",
        },
      },
      update: {
        quantityOnHand: new Decimal(5),
      },
      create: {
        storeId: store.id,
        name: "Mozzarella Ralada",
        sku: "QUEIJO-MOZ-001",
        baseUnitId: units.kg.id,
        itemType: "INGREDIENT",
        cost: new Decimal(28),
        minimumThreshold: new Decimal(3),
        idealQuantity: new Decimal(10),
        maximumCapacity: new Decimal(15),
        quantityOnHand: new Decimal(5),
      },
    }),
    molho: await prisma.inventoryItem.upsert({
      where: {
        storeId_sku: {
          storeId: store.id,
          sku: "MOLHO-VERMLH-001",
        },
      },
      update: {
        quantityOnHand: new Decimal(8),
      },
      create: {
        storeId: store.id,
        name: "Molho Vermelho",
        sku: "MOLHO-VERMLH-001",
        baseUnitId: units.L.id,
        itemType: "INGREDIENT",
        cost: new Decimal(12),
        minimumThreshold: new Decimal(5),
        idealQuantity: new Decimal(15),
        maximumCapacity: new Decimal(25),
        quantityOnHand: new Decimal(8),
      },
    }),
    calabresa: await prisma.inventoryItem.upsert({
      where: {
        storeId_sku: {
          storeId: store.id,
          sku: "CALABRESA-001",
        },
      },
      update: {
        quantityOnHand: new Decimal(2),
      },
      create: {
        storeId: store.id,
        name: "Calabresa Fatiada",
        sku: "CALABRESA-001",
        baseUnitId: units.kg.id,
        itemType: "INGREDIENT",
        cost: new Decimal(35),
        minimumThreshold: new Decimal(1),
        idealQuantity: new Decimal(3),
        maximumCapacity: new Decimal(5),
        quantityOnHand: new Decimal(2),
      },
    }),
    cebola: await prisma.inventoryItem.upsert({
      where: {
        storeId_sku: {
          storeId: store.id,
          sku: "CEBOLA-001",
        },
      },
      update: {
        quantityOnHand: new Decimal(0),
      },
      create: {
        storeId: store.id,
        name: "Cebola",
        sku: "CEBOLA-001",
        baseUnitId: units.kg.id,
        itemType: "INGREDIENT",
        cost: new Decimal(3),
        minimumThreshold: new Decimal(2),
        idealQuantity: new Decimal(5),
        maximumCapacity: new Decimal(10),
        quantityOnHand: new Decimal(0),
      },
    }),
  };

  // 5. Criar movimentações de teste (histórico)
  console.log("📊 Criando histórico de movimentações...");

  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  // Compra de farinha (3 dias atrás)
  await prisma.inventoryMovement.upsert({
    where: {
      idempotencyKey: "seed-purchase-farinha",
    },
    update: {},
    create: {
      storeId: store.id,
      idempotencyKey: "seed-purchase-farinha",
      itemId: items.farinha.id,
      type: "PURCHASE",
      quantity: new Decimal(50),
      unitId: units.kg.id,
      reference: "FORNECEDOR-001",
      referenceType: "SUPPLIER",
      authorType: "ADMIN",
      authorName: "Admin Seed",
      createdAt: threeDaysAgo,
    },
  });

  // Consumos simulados (últimos 3 dias)
  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getTime() - (2 - i) * 24 * 60 * 60 * 1000);
    await prisma.inventoryMovement.create({
      data: {
        storeId: store.id,
        idempotencyKey: `seed-consumption-day-${i}`,
        itemId: items.farinha.id,
        type: "CONSUMPTION",
        quantity: new Decimal(-8),
        unitId: units.kg.id,
        reference: `PEDIDO-${1000 + i}`,
        referenceType: "ORDER",
        authorType: "SYSTEM",
        authorName: "Order Processing",
        createdAt: date,
      },
    });
  }

  console.log("✅ Seed concluído!");
  console.log(`   Store: ${store.name}`);
  console.log(`   Items criados:`);
  console.log(`     - Farinha: ${items.farinha.quantityOnHand} kg`);
  console.log(`     - Queijo: ${items.queijo.quantityOnHand} kg (BAIXO!)`);
  console.log(`     - Molho: ${items.molho.quantityOnHand} L`);
  console.log(`     - Calabresa: ${items.calabresa.quantityOnHand} kg (BAIXO!)`);
  console.log(`     - Cebola: ${items.cebola.quantityOnHand} kg (SEM ESTOQUE!)`);
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
