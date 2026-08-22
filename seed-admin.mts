import { prisma } from "./src/server/db/client.js";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";

async function seedAdmin() {
  try {
    // Hash da senha: Velnox@2026
    const hashedPassword = await hash("Velnox@2026", 10);

    // Criar Store
    const store = await prisma.store.create({
      data: {
        name: "Velnox",
        slug: "velnox-" + randomUUID().substring(0, 8),
        businessType: "FOOD",
        status: "ACTIVE",
      },
    });

    console.log("✅ Store criada:", store.id);

    // Criar ou atualizar Admin
    const admin = await prisma.adminUser.upsert({
      where: { email: "pizzaria@velnox.app.br" },
      create: {
        email: "pizzaria@velnox.app.br",
        name: "Admin Velnox",
        passwordHash: hashedPassword,
        storeId: store.id,
      },
      update: {
        passwordHash: hashedPassword,
        storeId: store.id,
      },
    });

    console.log("✅ Admin criado:", admin.email);

    // Criar unidades padrão
    const units = [
      { code: "kg", name: "quilograma" },
      { code: "g", name: "grama" },
      { code: "L", name: "litro" },
      { code: "ml", name: "mililitro" },
      { code: "un", name: "unidade" },
      { code: "m", name: "metro" },
      { code: "cm", name: "centímetro" },
    ];

    for (const unit of units) {
      try {
        await prisma.inventoryUnit.upsert({
          where: { code: unit.code },
          create: {
            code: unit.code,
            name: unit.name,
            system: "SI",
          },
          update: {
            name: unit.name,
          },
        });
      } catch (err) {
        console.log(`⚠️ Unidade ${unit.code} ignorada`);
      }
    }

    console.log("✅ Unidades criadas");
    console.log("\n📧 Email: pizzaria@velnox.app.br");
    console.log("🔐 Senha: Velnox@2026");
  } catch (error) {
    console.error("❌ Erro:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin();
