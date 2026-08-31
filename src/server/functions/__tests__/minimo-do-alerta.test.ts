import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { statusDoEstoque } from "@/lib/status-do-estoque";
import {
  createInventoryItemSchema,
  updateInventoryItemSchema,
} from "@/lib/estoque-schemas";

/*
 * O MÍNIMO QUE NUNCA CHEGAVA AO BANCO.
 *
 * A tela de Itens tinha o campo "Estoque mínimo" e mandava o valor. Só que
 * `adminCreateInventoryItem` não o incluía no objeto entregue ao `parse`, e
 * `adminUpdateInventoryItem` não o declarava no `.validator` — e o zod descarta
 * chave não declarada em silêncio. O valor morria no caminho, `minimumThreshold`
 * ficava nulo para sempre, `statusDoEstoque` respondia NORMAL para todo item e o
 * contador de alertas marcava zero mesmo com 1,88 kg de farinha contra um mínimo
 * de 6. Nada dava erro em lugar nenhum.
 *
 * O motor do alerta estava certo — o que faltava era o fio entre o formulário e
 * o banco. Estes testes cobrem o fio inteiro: o formato que a tela envia, o que
 * os schemas aceitam, o que sobrevive à ida e volta ao Postgres, e o estado que
 * a regra deriva daquilo.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

async function semear(migration: string) {
  const sql = readFileSync(
    resolve(__dirname, `../../../../prisma/migrations/${migration}/migration.sql`),
    "utf8",
  )
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);
}

beforeEach(async () => {
  await limparBanco();
  await semear(SEED_UNIDADES);
  const loja = await prisma.store.create({
    data: {
      slug: `minimo-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      name: "Cozinha",
      settings: { create: { storeName: "C", whatsappNumber: "11999999999" } },
    },
  });
  storeId = loja.id;
});
afterAll(limparBanco);

/** Lê o item direto do banco, sem passar por serializador nenhum. */
const doBanco = (id: string) =>
  prisma.inventoryItem.findUniqueOrThrow({ where: { id } });

/** O mínimo como número, ou null — `Decimal` não se compara com `===`. */
const minimoDe = async (id: string) => {
  const item = await doBanco(id);
  return item.minimumThreshold == null ? null : Number(item.minimumThreshold);
};

describe("o mínimo sobrevive à ida e volta ao banco", () => {
  it("criar com mínimo definido grava o mínimo", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Farinha de trigo",
      baseUnitId: "unit_kg",
      itemType: "INGREDIENT",
      minimumThreshold: 6,
    } as any);

    expect(await minimoDe(item.id)).toBe(6);
  });

  it("criar sem mínimo deixa o item sem alerta — nulo, não zero", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Sal",
      baseUnitId: "unit_kg",
      itemType: "INGREDIENT",
    } as any);

    expect(await minimoDe(item.id)).toBeNull();
  });

  it("zero é um mínimo legítimo e não vira nulo", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Fermento",
      baseUnitId: "unit_kg",
      itemType: "INGREDIENT",
      minimumThreshold: 0,
    } as any);

    expect(await minimoDe(item.id)).toBe(0);
  });

  it("editar define o mínimo de um item que nasceu sem ele", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Farinha de trigo",
      baseUnitId: "unit_kg",
      itemType: "INGREDIENT",
    } as any);
    expect(await minimoDe(item.id)).toBeNull();

    await InventoryService.updateItem(storeId, item.id, {
      minimumThreshold: 6,
    } as any);

    expect(await minimoDe(item.id)).toBe(6);
  });

  it("editar com nulo apaga o alerta", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Farinha de trigo",
      baseUnitId: "unit_kg",
      itemType: "INGREDIENT",
      minimumThreshold: 6,
    } as any);

    await InventoryService.updateItem(storeId, item.id, {
      minimumThreshold: null,
    } as any);

    expect(await minimoDe(item.id)).toBeNull();
  });

  it("editar outro campo não mexe no mínimo já gravado", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Farinha de trigo",
      baseUnitId: "unit_kg",
      itemType: "INGREDIENT",
      minimumThreshold: 6,
    } as any);

    await InventoryService.updateItem(storeId, item.id, {
      name: "Farinha de trigo especial",
    } as any);

    expect(await minimoDe(item.id)).toBe(6);
  });
});

describe("os schemas aceitam exatamente o que a tela manda", () => {
  /*
   * O formulário manda `Number(...)` quando há valor e `null` quando o campo
   * está em branco. Se o schema recusar `null`, dá para definir um mínimo e
   * nunca mais tirá-lo — que era o caso antes desta correção.
   */
  it("criação aceita número", () => {
    const r = createInventoryItemSchema.parse({
      name: "Farinha",
      baseUnitId: "unit_kg",
      minimumThreshold: 6,
    });
    expect(r.minimumThreshold).toBe(6);
  });

  it("criação aceita nulo", () => {
    const r = createInventoryItemSchema.parse({
      name: "Farinha",
      baseUnitId: "unit_kg",
      minimumThreshold: null,
    });
    expect(r.minimumThreshold).toBeNull();
  });

  it("edição aceita número e nulo", () => {
    expect(updateInventoryItemSchema.parse({ minimumThreshold: 6 }).minimumThreshold).toBe(6);
    expect(
      updateInventoryItemSchema.parse({ minimumThreshold: null }).minimumThreshold,
    ).toBeNull();
  });

  it("mínimo negativo é recusado", () => {
    expect(() =>
      updateInventoryItemSchema.parse({ minimumThreshold: -1 }),
    ).toThrow();
  });
});

describe("com o mínimo gravado, a regra volta a acender o alerta", () => {
  /*
   * O caso real que abriu esta correção: farinha com 1,88 kg e mínimo 6. Antes,
   * o mínimo não chegava ao banco e o painel mostrava zero alertas.
   */
  it("saldo abaixo do mínimo é LOW_STOCK", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Farinha de trigo",
      baseUnitId: "unit_kg",
      itemType: "INGREDIENT",
      minimumThreshold: 6,
    } as any);
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { quantityOnHand: 1.88 },
    });

    expect(statusDoEstoque(await doBanco(item.id)).status).toBe("LOW_STOCK");
  });

  it("sem mínimo gravado, o mesmo saldo é NORMAL — o sintoma de antes", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Farinha de trigo",
      baseUnitId: "unit_kg",
      itemType: "INGREDIENT",
    } as any);
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { quantityOnHand: 1.88 },
    });

    expect(statusDoEstoque(await doBanco(item.id)).status).toBe("NORMAL");
  });

  it("acima do mínimo continua NORMAL", async () => {
    const item = await InventoryService.createItem(storeId, {
      name: "Farinha de trigo",
      baseUnitId: "unit_kg",
      itemType: "INGREDIENT",
      minimumThreshold: 6,
    } as any);
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { quantityOnHand: 10 },
    });

    expect(statusDoEstoque(await doBanco(item.id)).status).toBe("NORMAL");
  });
});

describe("o campo está declarado nas duas server functions", () => {
  /*
   * ESTA É A GUARDA DO DEFEITO EXATO.
   *
   * Os testes acima provam que serviço, schema e banco fazem a coisa certa —
   * mas o defeito não estava em nenhum deles: estava na camada que MONTA o
   * objeto entregue ao `parse`. Omitir o campo ali não quebra nada visível,
   * porque o zod descarta chave não declarada sem reclamar, e foi assim que o
   * campo passou despercebido desde que entrou na tela.
   *
   * Ler o arquivo é o que consegue afirmar "o campo está na lista". Não
   * substitui os testes de comportamento acima; existe para que remover a linha
   * de novo apague um teste, em vez de apagar um alerta em silêncio.
   */
  const fonte = readFileSync(
    resolve(__dirname, "../inventory.fn.ts"),
    "utf8",
  );

  const trecho = (de: string, ate: string) => {
    const i = fonte.indexOf(de);
    expect(i, `não achei "${de}" em inventory.fn.ts`).toBeGreaterThan(-1);
    const f = fonte.indexOf(ate, i);
    return fonte.slice(i, f > i ? f : undefined);
  };

  it("a criação inclui o mínimo no objeto do parse", () => {
    expect(
      trecho("createInventoryItemSchema.parse({", "});"),
    ).toContain("minimumThreshold");
  });

  it("a edição declara o mínimo no validator", () => {
    expect(
      trecho("export const adminUpdateInventoryItem", ".handler("),
    ).toContain("minimumThreshold");
  });

  it("a edição repassa o mínimo ao parse", () => {
    expect(
      trecho("updateInventoryItemSchema.parse({", "});"),
    ).toContain("minimumThreshold");
  });
});
