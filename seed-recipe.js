const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  // Get store ID
  const store = await prisma.store.findFirst();
  if (!store) {
    console.log("❌ Nenhuma loja encontrada");
    return;
  }

  // Get inventory item IDs by SKU
  const items = await prisma.inventoryItem.findMany({
    where: {
      storeId: store.id,
      sku: {
        in: [
          "ING-1787347331381-4RQC", // Açúcar
          "ING-1787347332157-CWK6", // Chocolate em Pó
          "ING-1787347334056-8WVQ", // Farinha de trigo
          "ING-1787347333324-6PFY", // Fermento em Pó
          "ING-1787347332548-6OOM", // Leite
          "ING-1787347334499-ZG95", // Leite Condensado
          "ING-1787347334099-3RGH", // Manteiga
          "ING-1787347332936-7SAQ", // Óleo de Soja
          "ING-1787347331770-YL05", // Ovos
          "ING-1787347333711-4GLS", // Sal Fino
        ],
      },
    },
  });

  console.log(`✅ Encontrados ${items.length} itens`);

  if (items.length < 10) {
    console.log("❌ Faltam itens. Verifique os SKUs");
    return;
  }

  // Get unit ID for "kg" (or use first available)
  const unit = await prisma.inventoryUnit.findFirst({
    where: { storeId: store.id },
  });

  if (!unit) {
    console.log("❌ Nenhuma unidade encontrada");
    return;
  }

  // Create composition
  const composition = await prisma.productComposition.create({
    data: {
      storeId: store.id,
      productId: "bolo-de-chocolate",
      version: 1,
      isActive: true,
      items: {
        create: items.map((item, idx) => ({
          inventoryItemId: item.id,
          quantity: 1, // 1 unidade de cada
          unitId: unit.id,
          sortOrder: idx,
        })),
      },
    },
    include: {
      items: true,
    },
  });

  console.log(`✅ Receita "bolo-de-chocolate" criada com ${composition.items.length} itens!`);
}

main()
  .catch((e) => console.error("❌ Erro:", e.message))
  .finally(() => prisma.$disconnect());
