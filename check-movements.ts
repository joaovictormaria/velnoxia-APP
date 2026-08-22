import { prisma } from "./src/server/db/client.js";

async function checkMovements() {
  try {
    console.log("🔍 Verificando movimentações dos itens...\n");

    const items = await prisma.inventoryItem.findMany({
      include: {
        baseUnit: true,
        movements: {
          select: {
            id: true,
            type: true,
            quantity: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    items.forEach((item) => {
      console.log(`📦 ${item.name} (${item.sku})`);
      console.log(`   Quantidade: ${item.quantityOnHand} ${item.baseUnit.code}`);
      console.log(`   Movimentações: ${item.movements.length}`);

      if (item.movements.length === 0) {
        console.log(`   ⚠️ SEM MOVIMENTAÇÕES (a quantidade é padrão)`);
      } else {
        item.movements.forEach((mov) => {
          console.log(`      - ${mov.type}: ${mov.quantity} (${mov.createdAt.toLocaleString("pt-BR")})`);
        });
      }
      console.log();
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

checkMovements();
