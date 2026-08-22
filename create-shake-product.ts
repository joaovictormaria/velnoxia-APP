import { prisma } from "./src/server/db/client.js";

async function createShakeProduct() {
  try {
    console.log("🏪 Procurando store Velnox...");

    const store = await prisma.store.findFirst({
      where: { slug: "velnox" },
    });

    if (!store) {
      console.log("❌ Store Velnox não encontrada");
      return;
    }

    console.log(`✅ Store: ${store.name}\n`);

    // Procurar ou criar categoria de bebidas
    let category = await prisma.category.findFirst({
      where: { storeId: store.id, name: "Bebidas" },
    });

    if (!category) {
      category = await prisma.category.create({
        data: {
          storeId: store.id,
          name: "Bebidas",
          slug: "bebidas",
          kind: "SIMPLE",
          sortOrder: 0,
        },
      });
    }

    console.log(`✅ Categoria: ${category.name}\n`);

    // Criar produto Shake
    console.log("📦 Criando Produto: Shake...");

    const shakeProduct = await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: category.id,
        name: "Shake",
        slug: "shake",
        description: "Shake delicioso feito com leite em pó",
        basePrice: 12.00,
        sortOrder: 0,
      },
    });

    console.log(`✅ Produto criado com sucesso!\n`);
    console.log(`📝 Detalhes:`);
    console.log(`   Nome: ${shakeProduct.name}`);
    console.log(`   ID: ${shakeProduct.id}`);
    console.log(`   Store: ${store.name}`);

    console.log(`\n✨ Use este ID na receita: ${shakeProduct.id}`);
    console.log(`   Agora você pode criar uma receita para o Shake!`);

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

createShakeProduct();
