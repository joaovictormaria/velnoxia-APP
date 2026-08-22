import { prisma } from "./src/server/db/client.js";

async function listProducts() {
  try {
    console.log("🔍 Listando produtos...\n");

    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        category: { select: { name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    console.log(`Total de produtos: ${products.length}\n`);

    if (products.length === 0) {
      console.log("❌ Nenhum produto encontrado!");
      return;
    }

    products.forEach((p) => {
      console.log(`📦 ${p.name}`);
      console.log(`   ID: ${p.id}`);
      console.log(`   Categoria: ${p.category.name}`);
      console.log();
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

listProducts();
