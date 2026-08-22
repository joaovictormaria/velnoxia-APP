import { prisma } from "./src/server/db/client.js";

async function resetDatabase() {
  console.log("🔄 Limpando banco de dados...");

  try {
    // Delete all CompositionItems (receitas)
    const deletedItems = await prisma.compositionItem.deleteMany({});
    console.log(`✅ Deletados ${deletedItems.count} itens de receita`);

    // Delete all ProductCompositions (receitas)
    const deletedCompositions = await prisma.productComposition.deleteMany({});
    console.log(`✅ Deletadas ${deletedCompositions.count} receitas`);

    // Delete all InventoryMovements (movimentações)
    const deletedMovements = await prisma.inventoryMovement.deleteMany({});
    console.log(`✅ Deletadas ${deletedMovements.count} movimentações`);

    // Delete all InventoryItems (itens)
    const deletedInvItems = await prisma.inventoryItem.deleteMany({});
    console.log(`✅ Deletados ${deletedInvItems.count} itens de estoque`);

    console.log("\n✨ Banco de dados limpado com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao limpar banco:", error);
  } finally {
    await prisma.$disconnect();
  }
}

resetDatabase();
