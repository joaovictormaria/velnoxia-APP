import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { urlDeBancoLocal } from "./guarda-de-banco-local";

const adapter = new PrismaPg({ connectionString: urlDeBancoLocal() });
const prisma = new PrismaClient({ adapter });

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: "Burger", mode: "insensitive" } },
  });

  if (!store) {
    console.log("❌ Loja não encontrada");
    return;
  }

  console.log(`✅ Loja: ${store.name}\n`);

  const produtos = await prisma.product.findMany({
    where: { storeId: store.id },
    take: 10,
  });

  console.log(`✅ ${produtos.length} produtos encontrados\n`);

  const extras = [
    { name: "Bacon Extra", price: 5.0 },
    { name: "Queijo Cheddar Extra", price: 4.0 },
    { name: "Alface", price: 0 },
    { name: "Tomate", price: 0 },
    { name: "Picles", price: 0 },
    { name: "Maionese Caseira", price: 2.0 },
    { name: "Molho BBQ", price: 2.0 },
    { name: "Ovos", price: 3.0 },
    { name: "Cebola Roxa", price: 0 },
    { name: "Molho Pimenta", price: 1.5 },
  ];

  for (const extra of extras) {
    const inicio = Math.floor(Math.random() * (produtos.length - 2));
    const produtosVinculados = produtos.slice(inicio, inicio + 3);

    await prisma.extra.create({
      data: {
        storeId: store.id,
        name: extra.name,
        price: extra.price,
        isActive: true,
        productIds: produtosVinculados.map((p) => p.id),
        categoryIds: [],
      },
    });

    console.log(
      `✅ "${extra.name}" - R$ ${extra.price.toFixed(2)} - ${produtosVinculados.length} produtos`
    );
  }

  console.log(`\n✨ ${extras.length} extras criados!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
