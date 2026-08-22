import { prisma } from "./src/server/db/client.js";

async function testInventoryAlert() {
  try {
    console.log("🔍 Verificando estado do banco de dados...\n");

    // Primeiro, verificar total de itens
    const totalItems = await prisma.inventoryItem.count();
    console.log(`Total de itens no banco: ${totalItems}\n`);

    if (totalItems === 0) {
      console.log("❌ Nenhum item encontrado. Banco parece estar vazio ou não inicializado.");
      return;
    }

    // Agora listar todos os itens
    const items = await prisma.inventoryItem.findMany({
      select: {
        id: true,
        name: true,
        sku: true,
        quantityOnHand: true,
        quantityReserved: true,
        maximumQuantity: true,
        contentSize: true,
        contentUnit: true,
        baseUnit: {
          select: { code: true },
        },
      },
      take: 20,
    });

    console.log(`Mostrando até 20 itens:\n`);

    items.forEach((item) => {
      const maxQty = Number(item.maximumQuantity ?? 0);
      const currentQty = Number(item.quantityOnHand ?? 0);
      const alertThreshold = maxQty * 0.3;
      const isAlert = currentQty < alertThreshold && maxQty > 0;

      console.log(`📦 ${item.name} (${item.sku})`);
      console.log(`   Quantidade: ${currentQty} ${item.baseUnit.code}`);
      console.log(`   Máximo: ${maxQty} ${item.baseUnit.code}`);
      if (item.contentSize && item.contentUnit) {
        console.log(`   Conteúdo: ${item.contentSize} ${item.contentUnit}`);
      }
      if (maxQty > 0) {
        console.log(`   Alerta em: ${alertThreshold.toFixed(2)} ${item.baseUnit.code} (30% do máximo)`);
        console.log(`   Status: ${isAlert ? "🔴 ALERTA!" : "✅ OK"}`);
      } else {
        console.log(`   Status: ⚠️ Sem máximo definido`);
      }
      console.log();
    });

    console.log("✨ Teste concluído!");
  } catch (error) {
    console.error("❌ Erro:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testInventoryAlert();
