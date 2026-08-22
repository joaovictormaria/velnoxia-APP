import { prisma } from "./src/server/db/client.js";

const updates = [
  { sku: "ING-1787347331381-4RQC", qty: 100 }, // Açúcar
  { sku: "ING-1787347332157-CWK6", qty: 50 }, // Chocolate em Pó
  { sku: "ING-1787347334056-8WVQ", qty: 100 }, // Farinha de trigo
  { sku: "ING-1787347333324-6PFY", qty: 10 }, // Fermento em Pó
  { sku: "ING-1787347332548-6OOM", qty: 100 }, // Leite
  { sku: "ING-1787347334499-ZG95", qty: 50 }, // Leite Condensado
  { sku: "ING-1787347334099-3RGH", qty: 50 }, // Manteiga
  { sku: "ING-1787347332936-7SAQ", qty: 50 }, // Óleo de Soja
  { sku: "ING-1787347331770-YL05", qty: 1000 }, // Ovos
  { sku: "ING-1787347333711-4GLS", qty: 10 }, // Sal Fino
];

let updated = 0;
for (const { sku, qty } of updates) {
  const r = await prisma.inventoryItem.updateMany({
    where: { sku },
    data: { quantityOnHand: qty },
  });
  updated += r.count;
  console.log(`✅ ${sku}: ${qty}`);
}

console.log(`\n✅ Total: ${updated} itens atualizados!`);
await prisma.$disconnect();
