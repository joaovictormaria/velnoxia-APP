import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { urlDeBancoLocal } from "./guarda-de-banco-local";

const adapter = new PrismaPg({ connectionString: urlDeBancoLocal() });
const prisma = new PrismaClient({ adapter });

async function main() {
  const stores = await prisma.store.findMany({ take: 10 });
  console.log(`\n📍 ${stores.length} lojas encontradas:\n`);
  stores.forEach((s) => console.log(`  • ${s.name} (ID: ${s.id})`));

  if (stores.length > 0) {
    const primeiraLoja = stores[0];
    const produtos = await prisma.product.findMany({
      where: { storeId: primeiraLoja.id },
      take: 5,
    });
    console.log(
      `\n✅ Primeira loja "${primeiraLoja.name}" tem ${produtos.length} produtos`
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
