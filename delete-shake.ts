import { prisma } from "./src/server/db/client.js";

async function deleteShake() {
  try {
    // Primeiro encontra o item
    const item = await prisma.inventoryItem.findFirst({
      where: { sku: "ING-1787354535-SCCU" },
    });

    if (!item) {
      console.log("❌ Item não encontrado");
      return;
    }

    // Deleta movimentos do item
    const deletedMovements = await prisma.inventoryMovement.deleteMany({
      where: { itemId: item.id },
    });
    console.log(`✅ Deletadas ${deletedMovements.count} movimentações`);

    // Deleta o item
    const deleted = await prisma.inventoryItem.delete({
      where: { id: item.id },
    });
    console.log(`✅ Item "${deleted.name}" deletado!`);
  } catch (error) {
    console.error("❌ Erro:", error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteShake();
