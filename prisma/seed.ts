/**
 * Seed: Unidades de Medida Padrão para Estoque
 * Arquivo: prisma/seed.ts (executar via: npx prisma db seed)
 *
 * Cria unidades built-in do sistema e conversões explícitas.
 * Deve ser executado UMA ÚNICA VEZ após migration.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  console.log("🌱 Iniciando seed de unidades de medida...\n");

  // ========================================================================
  // UNIDADES PESO
  // ========================================================================

  console.log("📏 Criando unidades de PESO...");

  const mg = await prisma.inventoryUnit.upsert({
    where: { code: "mg" },
    update: {},
    create: {
      code: "mg",
      name: "Miligrama",
      system: "WEIGHT",
      isBuiltIn: true,
    },
  });

  const g = await prisma.inventoryUnit.upsert({
    where: { code: "g" },
    update: {},
    create: {
      code: "g",
      name: "Grama",
      system: "WEIGHT",
      isBuiltIn: true,
    },
  });

  const kg = await prisma.inventoryUnit.upsert({
    where: { code: "kg" },
    update: {},
    create: {
      code: "kg",
      name: "Quilograma",
      system: "WEIGHT",
      isBuiltIn: true,
    },
  });

  const ton = await prisma.inventoryUnit.upsert({
    where: { code: "ton" },
    update: {},
    create: {
      code: "ton",
      name: "Tonelada",
      system: "WEIGHT",
      isBuiltIn: true,
    },
  });

  // ========================================================================
  // UNIDADES VOLUME
  // ========================================================================

  console.log("🧪 Criando unidades de VOLUME...");

  const ml = await prisma.inventoryUnit.upsert({
    where: { code: "ml" },
    update: {},
    create: {
      code: "ml",
      name: "Mililitro",
      system: "VOLUME",
      isBuiltIn: true,
    },
  });

  const dl = await prisma.inventoryUnit.upsert({
    where: { code: "dl" },
    update: {},
    create: {
      code: "dl",
      name: "Decilitro",
      system: "VOLUME",
      isBuiltIn: true,
    },
  });

  const l = await prisma.inventoryUnit.upsert({
    where: { code: "l" },
    update: {},
    create: {
      code: "l",
      name: "Litro",
      system: "VOLUME",
      isBuiltIn: true,
    },
  });

  // ========================================================================
  // UNIDADES CONTAGEM
  // ========================================================================

  console.log("📦 Criando unidades de CONTAGEM...");

  const un = await prisma.inventoryUnit.upsert({
    where: { code: "un" },
    update: {},
    create: {
      code: "un",
      name: "Unidade",
      system: "COUNT",
      isBuiltIn: true,
    },
  });

  const dozen = await prisma.inventoryUnit.upsert({
    where: { code: "dz" },
    update: {},
    create: {
      code: "dz",
      name: "Dúzia",
      system: "COUNT",
      isBuiltIn: true,
    },
  });

  // ========================================================================
  // UNIDADES COMPRIMENTO
  // ========================================================================

  console.log("📐 Criando unidades de COMPRIMENTO...");

  const mm = await prisma.inventoryUnit.upsert({
    where: { code: "mm" },
    update: {},
    create: {
      code: "mm",
      name: "Milímetro",
      system: "LENGTH",
      isBuiltIn: true,
    },
  });

  const cm = await prisma.inventoryUnit.upsert({
    where: { code: "cm" },
    update: {},
    create: {
      code: "cm",
      name: "Centímetro",
      system: "LENGTH",
      isBuiltIn: true,
    },
  });

  const m = await prisma.inventoryUnit.upsert({
    where: { code: "m" },
    update: {},
    create: {
      code: "m",
      name: "Metro",
      system: "LENGTH",
      isBuiltIn: true,
    },
  });

  // ========================================================================
  // CONVERSÕES PESO
  // ========================================================================

  console.log("🔄 Criando conversões de PESO...");

  const conversionsWeight = [
    { from: mg, to: g, factor: 0.001 },      // 1 g = 1000 mg
    { from: g, to: mg, factor: 1000 },       // 1 g = 1000 mg
    { from: g, to: kg, factor: 0.001 },      // 1 kg = 1000 g
    { from: kg, to: g, factor: 1000 },       // 1 kg = 1000 g
    { from: kg, to: ton, factor: 0.001 },    // 1 ton = 1000 kg
    { from: ton, to: kg, factor: 1000 },     // 1 ton = 1000 kg
  ];

  for (const conv of conversionsWeight) {
    await createConversion(conv.from, conv.to, conv.factor);
  }

  // ========================================================================
  // CONVERSÕES VOLUME
  // ========================================================================

  console.log("🔄 Criando conversões de VOLUME...");

  const conversionsVolume = [
    { from: ml, to: dl, factor: 0.1 },       // 1 dl = 10 ml
    { from: dl, to: ml, factor: 10 },        // 1 dl = 10 ml
    { from: ml, to: l, factor: 0.001 },      // 1 l = 1000 ml
    { from: l, to: ml, factor: 1000 },       // 1 l = 1000 ml
    { from: dl, to: l, factor: 0.1 },        // 1 l = 10 dl
    { from: l, to: dl, factor: 10 },         // 1 l = 10 dl
  ];

  for (const conv of conversionsVolume) {
    await createConversion(conv.from, conv.to, conv.factor);
  }

  // ========================================================================
  // CONVERSÕES CONTAGEM
  // ========================================================================

  console.log("🔄 Criando conversões de CONTAGEM...");

  const conversionsCount = [
    { from: un, to: dozen, factor: 1 / 12 }, // 1 un = 1/12 dúzia
    { from: dozen, to: un, factor: 12 },     // 1 dúzia = 12 un
  ];

  for (const conv of conversionsCount) {
    await createConversion(conv.from, conv.to, conv.factor);
  }

  // ========================================================================
  // CONVERSÕES COMPRIMENTO
  // ========================================================================

  console.log("🔄 Criando conversões de COMPRIMENTO...");

  const conversionsLength = [
    { from: mm, to: cm, factor: 0.1 },       // 1 cm = 10 mm
    { from: cm, to: mm, factor: 10 },        // 1 cm = 10 mm
    { from: cm, to: m, factor: 0.01 },       // 1 m = 100 cm
    { from: m, to: cm, factor: 100 },        // 1 m = 100 cm
    { from: mm, to: m, factor: 0.001 },      // 1 m = 1000 mm
    { from: m, to: mm, factor: 1000 },       // 1 m = 1000 mm
  ];

  for (const conv of conversionsLength) {
    await createConversion(conv.from, conv.to, conv.factor);
  }

  console.log("✅ Seed de unidades concluído com sucesso!\n");

  // ========================================================================
  // RESUMO
  // ========================================================================

  const unitCount = await prisma.inventoryUnit.count();
  const conversionCount = await prisma.inventoryUnitConversion.count();

  console.log(`📊 Resumo:`);
  console.log(`   - Unidades criadas: ${unitCount}`);
  console.log(`   - Conversões criadas: ${conversionCount}`);
  console.log(`\n🎉 Sistema de unidades pronto para usar!\n`);
}

/**
 * Cria conversão entre duas unidades (evita duplicação)
 */
async function createConversion(
  from: { id: string; code: string },
  to: { id: string; code: string },
  factor: number
) {
  try {
    await prisma.inventoryUnitConversion.upsert({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId: from.id,
          toUnitId: to.id,
        },
      },
      update: {},
      create: {
        fromUnitId: from.id,
        toUnitId: to.id,
        conversionFactor: factor,
      },
    });
  } catch (error) {
    console.error(
      `⚠️  Erro ao criar conversão ${from.code} → ${to.code}:`,
      error
    );
  }
}

// Executar seed
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Erro fatal no seed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
