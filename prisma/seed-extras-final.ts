import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { urlDeBancoLocal } from "./guarda-de-banco-local";

const adapter = new PrismaPg({ connectionString: urlDeBancoLocal() });
const prisma = new PrismaClient({ adapter });

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: "Burguer", mode: "insensitive" } },
  });

  if (!store) {
    console.log("❌ Loja não encontrada");
    return;
  }

  console.log(`✅ Loja: ${store.name}\n`);

  const produtos = await prisma.product.findMany({
    where: { storeId: store.id },
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

  for (let i = 0; i < extras.length; i++) {
    const extra = extras[i];
    const inicio = Math.floor(Math.random() * Math.max(1, produtos.length - 2));
    const produtosVinculados = produtos.slice(inicio, Math.min(inicio + 3, produtos.length));

    const criado = await prisma.extra.create({
      data: {
        storeId: store.id,
        name: extra.name,
        price: extra.price,
        isActive: true,
        productIds: produtosVinculados.map((p) => p.id),
        categoryIds: [],
      },
    });

    const prods = produtosVinculados.map((p) => `"${p.name}"`).join(", ");
    console.log(
      `✅ "${extra.name}" - R$ ${extra.price.toFixed(2)} → ${prods}`
    );
  }

  console.log(`\n✨ ${extras.length} extras criados com sucesso!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
