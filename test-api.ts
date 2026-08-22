import { adminGetLowStockAlerts } from "./src/server/functions/inventory.fn";
import { InventoryService } from "./src/server/services/inventory-service";

async function testAlerts() {
  try {
    console.log("🔍 Testando system de alertas de estoque baixo...\n");

    // Precisamos de um contexto de admin para testar
    // Como não temos acesso ao contexto real, vamos testar direto no banco

    const { prisma } = await import("./src/server/db/client.js");

    // Pegar a store de teste
    const store = await prisma.store.findFirst();
    if (!store) {
      console.log("❌ Store não encontrada");
      return;
    }

    console.log(`📦 Verificando alertas para store: ${store.name}\n`);

    // Pegar todos os itens da store
    const items = await prisma.inventoryItem.findMany({
      where: { storeId: store.id },
      include: {
        baseUnit: true,
      },
    });

    console.log(`Total de itens: ${items.length}\n`);

    // Simular a lógica de alerta
    const alerts = [];
    items.forEach((item) => {
      const maxQty = Number(item.maximumQuantity ?? 0);
      const currentQty = Number(item.quantityOnHand ?? 0);

      if (maxQty > 0) {
        const threshold = maxQty * 0.3;
        if (currentQty < threshold) {
          alerts.push({
            name: item.name,
            sku: item.sku,
            quantity: currentQty,
            maximum: maxQty,
            threshold: threshold,
            unit: item.baseUnit.code,
            percentage: ((currentQty / maxQty) * 100).toFixed(1),
          });
        }
      }
    });

    console.log(`🚨 Itens em alerta: ${alerts.length}\n`);

    if (alerts.length === 0) {
      console.log("✅ Nenhum item em alerta");
    } else {
      alerts.forEach((alert) => {
        console.log(`⚠️ ${alert.name} (${alert.sku})`);
        console.log(`   Quantidade: ${alert.quantity} ${alert.unit} (${alert.percentage}%)`);
        console.log(`   Máximo: ${alert.maximum} ${alert.unit}`);
        console.log(`   Limite: ${alert.threshold.toFixed(2)} ${alert.unit}`);
        console.log();
      });
    }

    console.log("✨ Teste concluído!");

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

testAlerts();
