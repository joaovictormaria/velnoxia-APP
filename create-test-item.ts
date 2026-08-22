import { prisma } from "./src/server/db/client.js";
import { randomUUID } from "crypto";

async function createTestItem() {
  try {
    console.log("🏪 Procurando store padrão...");

    // Procurar por uma store (usar a primeira ou criar uma)
    let store = await prisma.store.findFirst();

    if (!store) {
      console.log("❌ Nenhuma store encontrada. Abra a aplicação e crie uma loja primeiro.");
      return;
    }

    console.log(`✅ Store encontrada: ${store.name} (${store.id})\n`);

    // Procurar unidade de quilograma
    const kgUnit = await prisma.inventoryUnit.findFirst({
      where: { code: "kg" },
    });

    if (!kgUnit) {
      console.log("❌ Unidade 'kg' não encontrada. Execute o script create-units.ts primeiro.");
      return;
    }

    console.log(`✅ Unidade 'kg' encontrada (${kgUnit.id})\n`);

    // Criar item de teste: Farinha de Trigo
    console.log("📦 Criando item de teste: Farinha de Trigo (1000kg)...\n");

    const testItem = await prisma.inventoryItem.create({
      data: {
        storeId: store.id,
        name: "Farinha de Trigo",
        sku: `TEST-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        barcode: null,
        itemType: "INGREDIENT",
        baseUnitId: kgUnit.id,
        quantityOnHand: new Prisma.Decimal(1000),
        quantityReserved: new Prisma.Decimal(0),
        maximumQuantity: new Prisma.Decimal(1000),
        cost: new Prisma.Decimal(5.5),
        contentSize: new Prisma.Decimal(500),
        contentUnit: "g",
        isActive: true,
      },
    });

    console.log(`✅ Item criado com sucesso!\n`);
    console.log(`Nome: ${testItem.name}`);
    console.log(`SKU: ${testItem.sku}`);
    console.log(`Quantidade: ${testItem.quantityOnHand} kg`);
    console.log(`Máximo: ${testItem.maximumQuantity} kg`);
    console.log(`Conteúdo: ${testItem.contentSize} ${testItem.contentUnit}`);
    console.log(`Custo: R$ ${testItem.cost}`);

    // Criar um segundo item que está em alerta (30% do máximo)
    console.log(`\n\n📦 Criando item em alerta: Fermento...\n`);

    const alertItem = await prisma.inventoryItem.create({
      data: {
        storeId: store.id,
        name: "Fermento",
        sku: `TEST-ALERT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        barcode: null,
        itemType: "INGREDIENT",
        baseUnitId: kgUnit.id,
        quantityOnHand: new Prisma.Decimal(2.7), // 27% do máximo (alerta em 30% = 3kg)
        quantityReserved: new Prisma.Decimal(0),
        maximumQuantity: new Prisma.Decimal(10), // máximo: 10kg
        cost: new Prisma.Decimal(8.0),
        contentSize: new Prisma.Decimal(250),
        contentUnit: "g",
        isActive: true,
      },
    });

    console.log(`✅ Item em alerta criado com sucesso!\n`);
    console.log(`Nome: ${alertItem.name}`);
    console.log(`SKU: ${alertItem.sku}`);
    console.log(`Quantidade: ${alertItem.quantityOnHand} kg (🔴 ABAIXO DO LIMITE)`);
    console.log(`Máximo: ${alertItem.maximumQuantity} kg`);
    console.log(`Limite de alerta: ${Number(alertItem.maximumQuantity) * 0.3} kg (30%)`);
    console.log(`Conteúdo: ${alertItem.contentSize} ${alertItem.contentUnit}`);
    console.log(`Custo: R$ ${alertItem.cost}`);

    console.log(`\n\n✨ Items de teste criados com sucesso!`);
    console.log(`Acesse a aplicação e vá para "Itens de Estoque" para ver os itens.`);
  } catch (error) {
    console.error("❌ Erro:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Import Prisma at the top would be better, but we'll use it inline
import { Prisma } from "@prisma/client";

createTestItem();
