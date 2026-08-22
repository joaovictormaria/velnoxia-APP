import { prisma } from "./src/server/db/client.js";

async function deleteShakeRecipe() {
  try {
    console.log("🔍 Procurando receita do Shake...\n");

    // Procurar o produto Shake
    const shakeProduct = await prisma.product.findFirst({
      where: { name: "Shake" },
    });

    if (!shakeProduct) {
      console.log("❌ Produto Shake não encontrado");
      return;
    }

    console.log(`✅ Produto encontrado: ${shakeProduct.name} (${shakeProduct.id})\n`);

    // Procurar composições (receitas) do Shake
    const compositions = await prisma.productComposition.findMany({
      where: { productId: shakeProduct.id },
      include: {
        items: true,
      },
    });

    if (compositions.length === 0) {
      console.log("❌ Nenhuma receita encontrada para o Shake");
      return;
    }

    console.log(`📋 Receitas encontradas: ${compositions.length}\n`);

    // Deletar todas as receitas do Shake
    for (const comp of compositions) {
      console.log(`   Deletando receita versão ${comp.version}...`);

      // Deletar os itens da composição
      await prisma.compositionItem.deleteMany({
        where: { compositionId: comp.id },
      });

      // Deletar a composição
      await prisma.productComposition.delete({
        where: { id: comp.id },
      });

      console.log(`   ✅ Deletada`);
    }

    console.log(`\n✨ Todas as receitas do Shake foram deletadas!`);

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

deleteShakeRecipe();
