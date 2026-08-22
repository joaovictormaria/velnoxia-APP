import { prisma } from "./src/server/db/client.js";

async function createUnits() {
  const units = [
    { code: "kg", name: "quilograma", system: "WEIGHT" },
    { code: "g", name: "grama", system: "WEIGHT" },
    { code: "L", name: "litro", system: "VOLUME" },
    { code: "ml", name: "mililitro", system: "VOLUME" },
    { code: "un", name: "unidade", system: "COUNT" },
    { code: "m", name: "metro", system: "LENGTH" },
    { code: "cm", name: "centímetro", system: "LENGTH" },
  ];

  console.log("Criando unidades...");

  for (const unit of units) {
    try {
      await prisma.inventoryUnit.create({
        data: {
          code: unit.code,
          name: unit.name,
          system: unit.system as any,
          isBuiltIn: true,
        },
      });
      console.log(`✅ ${unit.code} criada`);
    } catch (err: any) {
      if (err.code === "P2002") {
        console.log(`⚠️ ${unit.code} já existe`);
      } else {
        console.error(`❌ Erro ao criar ${unit.code}:`, err.message);
      }
    }
  }

  console.log("\n✨ Unidades criadas com sucesso!");
  await prisma.$disconnect();
}

createUnits();
