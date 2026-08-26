import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";

/*
 * As unidades de medida base, contra o Postgres local.
 *
 * O que está em jogo aqui não é uma tabela de apoio. `recordMovement` faz
 * `if (!unit) throw new Error("Unit not found")` antes de qualquer cálculo, e
 * em produção esta tabela estava vazia: o motor da Fase 1, recém-implantado,
 * não conseguia gravar um único movimento. O cenário 4 é o que mede isso.
 *
 * Todo cenário aplica o ARQUIVO REAL da migration, lido do disco. Testar uma
 * cópia do SQL provaria que a cópia é idempotente — não que a migration é.
 */

const CAMINHO_MIGRATION = resolve(
  __dirname,
  "../../../../prisma/migrations/20260826210000_semear_unidades_base/migration.sql",
);

const ESPERADAS = [
  { id: "unit_kg", code: "kg", name: "Quilograma", system: "WEIGHT" },
  { id: "unit_g", code: "g", name: "Grama", system: "WEIGHT" },
  { id: "unit_l", code: "L", name: "Litro", system: "VOLUME" },
  { id: "unit_ml", code: "ml", name: "Mililitro", system: "VOLUME" },
  { id: "unit_un", code: "un", name: "Unidade", system: "COUNT" },
] as const;

/** Lê a migration do disco e executa. Comentários `--` saem antes. */
async function aplicarMigration() {
  const sql = readFileSync(CAMINHO_MIGRATION, "utf8")
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  if (!sql) throw new Error("migration vazia depois de remover comentários");
  await prisma.$executeRawUnsafe(sql);
}

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

async function contarUnidades() {
  return prisma.inventoryUnit.count();
}

beforeEach(async () => {
  await limparBanco();
  await aplicarMigration();
});

afterAll(async () => {
  await limparBanco();
});

describe("unidades de medida base", () => {
  it("1 · cria as cinco unidades com código, nome, sistema e isBuiltIn exatos", async () => {
    expect(await contarUnidades()).toBe(5);

    for (const esperada of ESPERADAS) {
      const gravada = await prisma.inventoryUnit.findUnique({
        where: { code: esperada.code },
      });

      expect(gravada, `unidade "${esperada.code}" não foi criada`).not.toBeNull();
      expect(gravada!.id).toBe(esperada.id);
      expect(gravada!.name).toBe(esperada.name);
      expect(gravada!.system).toBe(esperada.system);
      expect(gravada!.isBuiltIn).toBe(true);
    }
  });

  it("2 · é idempotente: executar a migration duas vezes deixa cinco linhas", async () => {
    // O beforeEach já aplicou uma vez.
    const idsAntes = (
      await prisma.inventoryUnit.findMany({ orderBy: { code: "asc" } })
    ).map((u) => `${u.id}:${u.name}`);

    await aplicarMigration();
    await aplicarMigration();

    expect(await contarUnidades()).toBe(5);

    /*
     * Contar não basta: uma migration com DO UPDATE também manteria 5 linhas,
     * reescrevendo o conteúdo delas. Comparar id e nome prova que a segunda
     * passada não tocou em nada.
     */
    const idsDepois = (
      await prisma.inventoryUnit.findMany({ orderBy: { code: "asc" } })
    ).map((u) => `${u.id}:${u.name}`);
    expect(idsDepois).toEqual(idsAntes);
  });

  it("3 · não sobrescreve nem duplica uma unidade preexistente com o mesmo código", async () => {
    /*
     * O caso real: um ambiente onde alguém já criou "kg" pelo Prisma, com id
     * cuid. Há movimentos apontando para esse id. A migration não pode nem
     * criar um segundo "kg" nem renomear o que existe.
     */
    await limparBanco();
    const preexistente = await prisma.inventoryUnit.create({
      data: {
        code: "kg",
        name: "Kilo cadastrado antes",
        system: "WEIGHT",
        isBuiltIn: false,
      },
    });
    expect(preexistente.id).not.toBe("unit_kg");

    await aplicarMigration();

    const comCodigoKg = await prisma.inventoryUnit.findMany({ where: { code: "kg" } });
    expect(comCodigoKg).toHaveLength(1);
    expect(comCodigoKg[0].id).toBe(preexistente.id);
    expect(comCodigoKg[0].name).toBe("Kilo cadastrado antes");
    expect(comCodigoKg[0].isBuiltIn).toBe(false);

    // E o id fixo não foi criado à força ao lado dele.
    expect(await prisma.inventoryUnit.findUnique({ where: { id: "unit_kg" } })).toBeNull();

    // As outras quatro entraram normalmente: o conflito é por linha, não por lote.
    expect(await contarUnidades()).toBe(5);
    for (const code of ["g", "L", "ml", "un"]) {
      expect(await prisma.inventoryUnit.findUnique({ where: { code } })).not.toBeNull();
    }
  });

  it("4 · o motor da Fase 1 sai da inércia: recordMovement grava sem 'Unit not found'", async () => {
    const loja = await prisma.store.create({
      data: { slug: `unidades-${Date.now()}`, name: "Cozinha de Teste" },
    });

    const insumo = await prisma.inventoryItem.create({
      data: {
        storeId: loja.id,
        name: "Tomate",
        itemType: "INGREDIENT",
        baseUnitId: "unit_kg",
        quantityOnHand: 0,
        cost: 8,
      },
    });

    const movimento = await InventoryService.recordMovement(loja.id, {
      idempotencyKey: `${loja.id}#TESTE#UNIDADES#PURCHASE#${insumo.id}`,
      itemId: insumo.id,
      type: "PURCHASE",
      quantity: 5.2,
      unitId: "unit_kg",
      reference: "etapa-1",
      referenceType: "TESTE",
      authorType: "SYSTEM",
      authorId: "TESTE",
      authorName: "Etapa 1",
    } as any);

    expect(movimento).toBeTruthy();
    expect(movimento.type).toBe("PURCHASE");

    const depois = await prisma.inventoryItem.findUnique({ where: { id: insumo.id } });
    expect(Number(depois!.quantityOnHand)).toBeCloseTo(5.2, 4);

    // O custo do momento foi congelado a partir da linha travada.
    expect(Number(movimento.costAtTime)).toBeCloseTo(8, 2);
  });

  it("5 · o código continua único: um segundo 'kg' é recusado pelo banco", async () => {
    await expect(
      prisma.inventoryUnit.create({
        data: {
          code: "kg",
          name: "Quilograma duplicado",
          system: "WEIGHT",
          isBuiltIn: false,
        },
      }),
    ).rejects.toThrow();

    expect(await prisma.inventoryUnit.count({ where: { code: "kg" } })).toBe(1);
  });
});
