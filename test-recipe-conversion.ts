import { prisma } from "./src/server/db/client.js";

async function testRecipeConversion() {
  try {
    console.log("🔍 Testando conversão de unidades em receitas\n");

    // Encontrar o Shake
    const shake = await prisma.inventoryItem.findFirst({
      where: { name: "Shake" },
      include: { baseUnit: true },
    });

    if (!shake) {
      console.log("❌ Shake não encontrado. Criando para teste...");
      return;
    }

    console.log(`✅ Item encontrado: ${shake.name}`);
    console.log(`   SKU: ${shake.sku}`);
    console.log(`   Unidade base: ${shake.baseUnit.code}`);
    console.log(`   Quantidade: ${shake.quantityOnHand} ${shake.baseUnit.code}`);
    if (shake.contentSize && shake.contentUnit) {
      console.log(`   Conteúdo: ${shake.contentSize} ${shake.contentUnit}`);
    }

    console.log(`\n📝 Cenário de Receita:`);
    console.log(`   Receita usa: 45g de Shake`);
    console.log(`   Cada pote tem: ${shake.contentSize || "?"} ${shake.contentUnit || "?"}`);

    if (shake.contentSize && shake.contentUnit === "g") {
      const portionsUsed = 45 / Number(shake.contentSize);
      console.log(`   Cálculo: 45g ÷ ${shake.contentSize}g = ${portionsUsed.toFixed(3)} potes`);
      console.log(`   Quantidade a decrementar: ${portionsUsed.toFixed(3)} ${shake.baseUnit.code}`);
    }

    console.log(`\n✨ Teste concluído!`);

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

testRecipeConversion();
