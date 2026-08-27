import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import {
  createInventoryItemSchema,
  createInventoryMovementSchema,
} from "@/lib/estoque-schemas";

/*
 * A unidade de um item de estoque, contra o Postgres local.
 *
 * NASCEU DE UM ERRO REAL. Criar um item pela tela devolvia
 * `Invalid cuid` em `baseUnitId`, e a causa estava a oito etapas de distância:
 * a migration que semeia as unidades usa ids fixos e legíveis (`unit_kg`),
 * escolhidos para que a mesma unidade tenha o mesmo id em local, teste e
 * produção. `unit_kg` não é um cuid, e o schema exigia `.cuid()` — ou seja,
 * recusava justamente os ids REAIS do sistema.
 *
 * POR QUE 595 TESTES VERDES CONVIVIAM COM A TELA QUEBRADA: todos criavam as
 * unidades com `prisma.inventoryUnit.create()`, e o Prisma gera cuid. Nenhum
 * exercitava os ids que a migration semeia. Estes cenários usam os ids
 * SEMEADOS de propósito — é a única forma de a regressão aparecer.
 */

const SEMEADAS = ["unit_kg", "unit_g", "unit_l", "unit_ml", "unit_un"] as const;
const CAMINHO_SEED = resolve(
  __dirname,
  "../../../../prisma/migrations/20260826210000_semear_unidades_base/migration.sql",
);

let storeId = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

/** Semeia pelo ARQUIVO REAL da migration: os ids têm que ser os de produção. */
async function semearUnidadesReais() {
  const sql = readFileSync(CAMINHO_SEED, "utf8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);
}

beforeEach(async () => {
  await limparBanco();
  await semearUnidadesReais();
  storeId = (await prisma.store.create({
    data: { slug: `un-${Date.now()}`, name: "Cozinha" },
  })).id;
});

afterAll(limparBanco);

describe("a unidade semeada é aceita", () => {
  it("01 · o schema aceita os ids que a migration cria", () => {
    for (const id of SEMEADAS) {
      const r = createInventoryItemSchema.safeParse({
        name: "Tomate",
        baseUnitId: id,
        itemType: "INGREDIENT",
      });

      /*
       * A asserção que reprovava antes. `.cuid()` recusava `unit_kg` — o id
       * REAL — e a tela morria em "Invalid cuid" sem nenhuma pista de que o
       * problema era o formato do id, e não o valor enviado.
       */
      expect(r.success, `o schema recusou o id semeado "${id}"`).toBe(true);
    }
  });

  it("02 · criar item com o id semeado funciona ponta a ponta", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Tomate",
      baseUnitId: "unit_kg",
      itemType: "INGREDIENT",
    } as any);

    expect(item.baseUnitId).toBe("unit_kg");
    const relido = await prisma.inventoryItem.findUnique({
      where: { id: item.id },
      include: { baseUnit: true },
    });
    expect(relido!.baseUnit.code).toBe("kg");
  });

  it("03 · o CÓDIGO continua recusado — não é id de nada", async () => {
    /*
     * O ponto que a troca de `.cuid()` por existência não podia perder. Trocar
     * o padrão pelo fato não afrouxa: "kg" passa no `min(1)` e morre no
     * `findById`, que é onde a verdade mora.
     */
    await expect(
      InventoryService.createItem(storeId, {
        name: "Tomate",
        baseUnitId: "kg",
        itemType: "INGREDIENT",
      } as any),
    ).rejects.toThrow(/Invalid baseUnitId/i);

    expect(await prisma.inventoryItem.count()).toBe(0);
  });

  it("04 · id inexistente, mesmo bem formado, é recusado", async () => {
    // Um cuid válido de outra tabela passaria no `.cuid()` e não existe aqui.
    for (const falso of ["cmtb1klo700006couhei72uiy", "unit_tonelada", "", "   "]) {
      await expect(
        InventoryService.createItem(storeId, {
          name: "X",
          baseUnitId: falso,
          itemType: "INGREDIENT",
        } as any),
      ).rejects.toThrow();
    }
    expect(await prisma.inventoryItem.count()).toBe(0);
  });

  it("05 · o item guarda o ID, e o código só é derivado dele", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Leite",
      baseUnitId: "unit_l",
      itemType: "INGREDIENT",
    } as any);

    /*
     * A tela mostra o código e envia o id. Guardar o código seria perder a
     * referência: renomear "L" para "l" quebraria todo item que o tivesse
     * copiado.
     */
    const relido = await prisma.inventoryItem.findUnique({
      where: { id: item.id },
      include: { baseUnit: true },
    });
    expect(relido!.baseUnitId).toBe("unit_l");
    expect(relido!.baseUnit.code).toBe("L");
  });
});

describe("os ids semeados são os que a tela vai oferecer", () => {
  it("06 · a listagem devolve id e código de cada unidade", async () => {
    const { inventoryUnitRepository } = await import("@/server/repositories");
    const unidades = await inventoryUnitRepository.findAll();

    expect(unidades.map((u: any) => u.id).sort()).toEqual([...SEMEADAS].sort());
    for (const u of unidades as any[]) {
      expect(u.code, "toda unidade precisa de código para a tela mostrar").toBeTruthy();
      expect(u.id, "e de id, que é o que a tela envia").toBeTruthy();
      expect(u.id).not.toBe(u.code);
    }
  });

  it("07 · a tela não pode oferecer unidade que não existe", async () => {
    const { inventoryUnitRepository } = await import("@/server/repositories");
    const codigos = (await inventoryUnitRepository.findAll()).map((u: any) => u.code);

    /*
     * O select trazia "m" e "cm" fixos no código, e nenhum dos dois existe no
     * banco — escolher um deles dava erro sem explicação. Carregando do banco,
     * a tela só pode oferecer o que dá para gravar.
     */
    expect(codigos).not.toContain("m");
    expect(codigos).not.toContain("cm");
    expect(codigos.sort()).toEqual(["L", "g", "kg", "ml", "un"]);
  });
});


describe("movimentação: a unidade do movimento", () => {
  it("08b · o SCHEMA do movimento aceita os ids semeados", () => {
    /*
     * Cenário nascido de uma mutação que passou verde: os outros cenários
     * chamam `recordMovement` direto e nunca tocam o zod — que é justamente
     * onde o `.cuid()` morava. A validação de formato só aparece no caminho da
     * server function, que o vitest não consegue chamar, então ela precisa ser
     * exercitada aqui de propósito.
     */
    for (const id of SEMEADAS) {
      const r = createInventoryMovementSchema.safeParse({
        itemId: "cmtb1klo700006couhei72uiy",
        type: "PURCHASE",
        quantity: 1,
        unitId: id,
      });
      expect(r.success, `o schema do movimento recusou "${id}"`).toBe(true);
    }
  });

  it("08c · o schema do movimento recusa unitId vazio", () => {
    const r = createInventoryMovementSchema.safeParse({
      itemId: "cmtb1klo700006couhei72uiy",
      type: "PURCHASE",
      quantity: 1,
      unitId: "",
    });
    expect(r.success).toBe(false);
  });

  it("09 · o CÓDIGO como unitId do movimento é recusado", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Tomate", baseUnitId: "unit_kg", itemType: "INGREDIENT",
    } as any);

    await expect(
      InventoryService.recordMovement(storeId, {
        idempotencyKey: `${storeId}#T#1`,
        itemId: item.id, type: "PURCHASE", quantity: 1, unitId: "kg",
      } as any),
    ).rejects.toThrow(/Unit not found/i);

    const depois = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(Number(depois!.quantityOnHand)).toBe(0);
  });

  it("10 · unidade inexistente no movimento é recusada", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Tomate", baseUnitId: "unit_kg", itemType: "INGREDIENT",
    } as any);

    for (const falso of ["unit_tonelada", "cmtb1klo700006couhei72uiy"]) {
      await expect(
        InventoryService.recordMovement(storeId, {
          idempotencyKey: `${storeId}#T#${falso}`,
          itemId: item.id, type: "PURCHASE", quantity: 1, unitId: falso,
        } as any),
      ).rejects.toThrow(/Unit not found/i);
    }
  });

});