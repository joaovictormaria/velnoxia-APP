import { prisma } from "./src/server/db/client.js";

async function createTestProduct() {
  try {
    console.log("🏪 Procurando store...");

    const store = await prisma.store.findFirst();
    if (!store) {
      console.log("❌ Store não encontrada");
      return;
    }

    console.log(`✅ Store: ${store.name}\n`);

    // Procurar ou criar categoria
    console.log("📂 Procurando categoria...");

    let category = await prisma.category.findFirst({
      where: { storeId: store.id },
    });

    if (!category) {
      console.log("   Criando categoria 'Bebidas'...");
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

    // Criar produto de teste
    console.log("📦 Criando produto de teste: 'Milkshake'...");

    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: category.id,
        name: "Milkshake",
        slug: "milkshake",
        description: "Milkshake caseiro de frutas",
        basePrice: 15.00,
        sortOrder: 0,
      },
    });

    console.log(`✅ Produto criado com sucesso!\n`);
    console.log(`📝 Detalhes:`);
    console.log(`   Nome: ${product.name}`);
    console.log(`   ID: ${product.id}`);
    console.log(`   Preço: R$ ${(product.price / 100).toFixed(2)}`);
    console.log(`   Categoria: ${category.name}`);

    console.log(`\n✨ Agora você pode criar uma receita para este produto!`);
    console.log(`   Use o ID: ${product.id}`);

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

createTestProduct();
