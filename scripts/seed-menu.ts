import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seedMenu() {
  console.log("🍽️  Criando cardápio...\n");

  // Pegar última loja
  const store = await prisma.store.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!store) {
    console.log("❌ Nenhuma loja encontrada");
    return;
  }

  console.log(`✅ Loja: ${store.name} (${store.id})\n`);

  // Criar/atualizar categorias
  const pratos = await prisma.category.upsert({
    where: { storeId_name: { storeId: store.id, name: "Pratos" } },
    update: {},
    create: {
      storeId: store.id,
      name: "Pratos",
      slug: "pratos",
      icon: "🍔",
      sortOrder: 1,
    },
  });

  const bebidas = await prisma.category.upsert({
    where: { storeId_name: { storeId: store.id, name: "Bebidas" } },
    update: {},
    create: {
      storeId: store.id,
      name: "Bebidas",
      slug: "bebidas",
      icon: "🥤",
      sortOrder: 2,
    },
  });

  console.log("📂 Categorias criadas: Pratos, Bebidas\n");

  // Pratos
  const pratosData = [
    { name: "Hambúrguer Clássico", price: 35 },
    { name: "Hambúrguer Duplo", price: 45 },
    { name: "Hambúrguer com Bacon", price: 42 },
    { name: "Pizza Margherita", price: 38 },
    { name: "Pizza Pepperoni", price: 42 },
    { name: "Frango Grelhado", price: 40 },
    { name: "Costela BBQ", price: 55 },
    { name: "Salmão Grelhado", price: 58 },
    { name: "Moqueca de Peixe", price: 48 },
    { name: "Feijoada", price: 42 },
    { name: "Churrascaria", price: 65 },
    { name: "Lasanha à Bolonhesa", price: 38 },
    { name: "Macarrão Carbonara", price: 36 },
    { name: "Risoto de Cogumelos", price: 44 },
    { name: "Bruschettas Variadas", price: 28 },
  ];

  for (const prato of pratosData) {
    await prisma.product.upsert({
      where: {
        storeId_slug: { storeId: store.id, slug: prato.name.toLowerCase().replace(/\s+/g, "-") },
      },
      update: {},
      create: {
        storeId: store.id,
        categoryId: pratos.id,
        name: prato.name,
        slug: prato.name.toLowerCase().replace(/\s+/g, "-"),
        description: `Delicioso ${prato.name.toLowerCase()}`,
        basePrice: prato.price,
        isActive: true,
        sortOrder: 1,
      },
    });
  }

  console.log(`✅ ${pratosData.length} pratos criados!\n`);

  // Bebidas
  const bebidasData = [
    { name: "Refrigerante Coca-Cola", price: 8 },
    { name: "Refrigerante Guaraná", price: 8 },
    { name: "Refrigerante Fanta Laranja", price: 7 },
    { name: "Suco Natural Laranja", price: 12 },
    { name: "Suco Natural Morango", price: 12 },
    { name: "Água Mineral", price: 3 },
    { name: "Chá Gelado Limão", price: 6 },
    { name: "Café Expresso", price: 5 },
    { name: "Capuccino", price: 8 },
    { name: "Batida de Frutas", path: 14 },
  ];

  for (const bebida of bebidasData) {
    await prisma.product.upsert({
      where: {
        storeId_slug: { storeId: store.id, slug: bebida.name.toLowerCase().replace(/\s+/g, "-") },
      },
      update: {},
      create: {
        storeId: store.id,
        categoryId: bebidas.id,
        name: bebida.name,
        slug: bebida.name.toLowerCase().replace(/\s+/g, "-"),
        description: `Refrescante ${bebida.name.toLowerCase()}`,
        basePrice: bebida.price,
        isActive: true,
        sortOrder: 1,
      },
    });
  }

  console.log(`✅ ${bebidasData.length} bebidas criadas!\n`);
  console.log("🎉 Cardápio completo!");
}

seedMenu()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
