import * as dotenv from "dotenv";
dotenv.config();

import { prisma } from "@/server/db/client";

async function auditDates() {
  console.log("=== AUDITORIA DE DATAS ===\n");

  // Verificar data/hora do servidor
  const now = new Date();
  const tzOffset = new Date().getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(Date.now() - tzOffset);

  console.log("Data/Hora do servidor:");
  console.log("  UTC:", now.toISOString());
  console.log("  Timezone offset (ms):", tzOffset);
  console.log("  Data local calculada:", localDate.toISOString());
  console.log("  Local (formato legível):", localDate.toString());

  // Verificar últimos pedidos criados
  const recentOrders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      number: true,
      customerName: true,
      createdAt: true,
      status: true,
    },
  });

  console.log("\nÚltimos 5 pedidos do banco:");
  for (const order of recentOrders) {
    console.log(`  #${order.number} (${order.status})`);
    console.log(`    createdAt (raw): ${order.createdAt}`);
    console.log(`    createdAt (ISO): ${order.createdAt.toISOString()}`);
    console.log(`    Dia: ${order.createdAt.toISOString().split("T")[0]}`);
  }

  // Verificar qual é a data que a query de hoje retorna
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const dateString = `${year}-${month}-${day}`;

  console.log(`\nData de "hoje" (ISO): ${dateString}`);

  // Verificar quantos pedidos encontra para hoje
  const todayOrders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: new Date(year, today.getMonth(), today.getDate()),
        lt: new Date(year, today.getMonth(), today.getDate() + 1),
      },
    },
    select: {
      id: true,
      number: true,
      createdAt: true,
    },
  });

  console.log(`\nPedidos encontrados para hoje: ${todayOrders.length}`);
  for (const order of todayOrders) {
    console.log(`  #${order.number}: ${order.createdAt.toISOString()}`);
  }
}

auditDates()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Erro:", error);
    process.exit(1);
  });
