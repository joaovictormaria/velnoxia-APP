import { prisma } from "./src/server/db/client.js";

async function createMilkshakeVelnox() {
  try {
    console.log("🏪 Procurando store Velnox...");

    const store = await prisma.store.findFirst({
      where: { slug: "velnox" },
    });

    if (!store) {
      console.log("❌ Store Velnox não encontrada");
      const allStores = await prisma.store.findMany({
        select: { id: true, name: true, slug: true },
      });
      console.log("\n📋 Stores disponíveis:");
      allStores.forEach((s) => {
        console.log(`   - ${s.name} (${s.slug}): ${s.id}`);
      });
      return;
    }

    console.log(`✅ Store: ${store.name}\n`);

    // Procurar ou criar categoria
    console.log("📂 Procurando categoria...");

    let category = await prisma.category.findFirst({
      where: { storeId: store.id, name: "Bebidas" },
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

    // Criar produto Milkshake
    console.log("📦 Criando Milkshake...");

    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: category.id,
        name: "Milkshake",
        slug: "milkshake",
        description: "Milkshake caseiro",
        basePrice: 15.00,
        sortOrder: 0,
      },
    });

    console.log(`✅ Milkshake criado com sucesso!\n`);
    console.log(`📝 Detalhes:`);
    console.log(`   Nome: ${product.name}`);
    console.log(`   ID: ${product.id}`);
    console.log(`   Store: ${store.name}`);

    console.log(`\n✨ Use este ID na interface: ${product.id}`);

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

createMilkshakeVelnox();
