import { prisma } from "./src/server/db/client.js";

async function listAllItems() {
  try {
    console.log("🔍 Listando TODOS os itens (incluindo inativos)...\n");

    const items = await prisma.inventoryItem.findMany({
      include: { baseUnit: true },
      orderBy: { createdAt: "desc" },
    });

    console.log(`Total de itens: ${items.length}\n`);

    items.forEach((item) => {
      console.log(`${item.isActive ? "✅" : "❌"} ${item.name} (${item.sku})`);
      console.log(`   ID: ${item.id}`);
      console.log(`   Ativo: ${item.isActive}`);
      console.log(`   Quantidade: ${item.quantityOnHand} ${item.baseUnit.code}`);
      console.log(`   Criado em: ${item.createdAt.toLocaleString("pt-BR")}`);
      console.log();
    });

    console.log("✨ Listagem concluída!");

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

listAllItems();
