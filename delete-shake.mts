import { prisma } from "./src/server/db/client.js";

async function deleteShake() {
  try {
    const deleted = await prisma.inventoryItem.deleteMany({
      where: { name: "Shake" },
    });
    console.log(`✅ Deletado(s) ${deleted.count} item(ns) chamado "Shake"`);
  } catch (error) {
    console.error("❌ Erro ao deletar:", error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteShake();
