import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function deleteItems() {
  try {
    // Delete by name "etste"
    const deleted1 = await prisma.inventoryItem.deleteMany({
      where: {
        name: "etste",
      },
    });
    console.log(`✅ Deleted ${deleted1.count} item(s) named "etste"`);

    // Delete by SKU "ING-1787338616-LFTA"
    const deleted2 = await prisma.inventoryItem.deleteMany({
      where: {
        sku: "ING-1787338616-LFTA",
      },
    });
    console.log(`✅ Deleted ${deleted2.count} item(s) with SKU "ING-1787338616-LFTA"`);

    console.log("✅ Done!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

deleteItems();
