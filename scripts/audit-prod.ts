import { prisma } from "../src/server/db/client";

async function audit() {
  const orders = await prisma.order.findMany({
    where: { storeId: "burger-megabrains-7j77" },
    select: { id: true, number: true, createdAt: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  console.log("📊 Últimos 5 pedidos em produção:");
  orders.forEach((o) => {
    console.log(
      `#${o.number} - ${o.createdAt.toISOString().split("T")[0]} ${o.status}`
    );
  });

  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fromMs = base.getTime();
  const toMs = fromMs + 24 * 60 * 60 * 1000 - 1;

  console.log(
    `\n🔍 Filtrando por hoje (${new Date(fromMs).toISOString().split("T")[0]}):`
  );
  console.log(`De: ${new Date(fromMs).toISOString()}`);
  console.log(`Até: ${new Date(toMs).toISOString()}`);

  const today = await prisma.order.count({
    where: {
      storeId: "burger-megabrains-7j77",
      createdAt: { gte: new Date(fromMs), lte: new Date(toMs) },
    },
  });

  console.log(`✅ Pedidos encontrados hoje: ${today}`);

  process.exit(0);
}

audit().catch((err) => {
  console.error(err);
  process.exit(1);
});
