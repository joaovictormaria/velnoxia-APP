import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";

/*
 * A ficha técnica com dois donos possíveis — M1, contra o Postgres local.
 *
 * A regra que esta migration instala é uma só: uma composição pertence a um
 * Product OU a um InventoryItem preparado, nunca aos dois e nunca a nenhum.
 *
 * Metade dos cenários abaixo vai ao banco por SQL cru, de propósito. Um teste
 * que só passa pelo Prisma prova que o cliente se comporta; não prova que o
 * banco recusa. E a razão de a regra viver num CHECK, e não numa validação de
 * serviço, é exatamente essa: proteger contra o caminho que ninguém previu.
 *
 * O precedente é concreto. Na Fase 1 um CHECK aceitava metade dos casos
 * inválidos porque avaliava para NULL, e Postgres aceita CHECK que dá NULL —
 * só FALSE recusa. Aquilo passou por validação de aplicação e por revisão;
 * quem pegou foi um teste que inseriu a linha inválida direto na tabela.
 */

let storeId = "";
let categoryId = "";
let unitKg = "";
let unitL = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

async function semear() {
  await limparBanco();
  const loja = await prisma.store.create({
    data: { slug: `ficha-${Date.now()}`, name: "Cozinha de Teste" },
  });
  storeId = loja.id;

  const categoria = await prisma.category.create({
    data: { storeId, name: "Pizzas", slug: "pizzas", kind: "PIZZA" },
  });
  categoryId = categoria.id;

  const kg = await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  });
  const litro = await prisma.inventoryUnit.create({
    data: { code: "L", name: "Litro", system: "VOLUME", isBuiltIn: true },
  });
  unitKg = kg.id;
  unitL = litro.id;
}

async function criarProduto(nome: string) {
  return prisma.product.create({
    data: {
      storeId,
      categoryId,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}${Math.random()}`,
      description: "",
      basePrice: 50,
    },
  });
}

async function criarPreparado(nome: string) {
  return prisma.inventoryItem.create({
    data: {
      storeId,
      name: nome,
      itemType: "PREPARED",
      baseUnitId: unitKg,
      quantityOnHand: 0,
    },
  });
}

/** INSERT direto na tabela: contorna o Prisma para medir o banco. */
async function inserirCru(campos: {
  id: string;
  productId: string | null;
  inventoryItemId: string | null;
  version?: number;
}) {
  return prisma.$executeRawUnsafe(
    `INSERT INTO "ProductComposition"
       ("id","storeId","productId","inventoryItemId","version","isActive","usageCount","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,true,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    campos.id,
    storeId,
    campos.productId,
    campos.inventoryItemId,
    campos.version ?? 1,
  );
}

beforeEach(semear);
afterAll(limparBanco);

describe("ficha técnica: produto ou preparado", () => {
  it("1 · composição de produto continua funcionando como antes", async () => {
    const pizza = await criarProduto("Pizza Margherita");

    const ficha = await prisma.productComposition.create({
      data: { storeId, productId: pizza.id, version: 1 },
    });

    expect(ficha.productId).toBe(pizza.id);
    expect(ficha.inventoryItemId).toBeNull();
    expect(ficha.yieldQuantity).toBeNull();
    expect(ficha.isActive).toBe(true);

    // E segue navegável pela relação, que é como o resto do código a lê.
    const relida = await prisma.productComposition.findUnique({
      where: { id: ficha.id },
      include: { product: true, inventoryItem: true },
    });
    expect(relida!.product!.name).toBe("Pizza Margherita");
    expect(relida!.inventoryItem).toBeNull();
  });

  it("2 · composição de preparado funciona, com rendimento", async () => {
    const molho = await criarPreparado("Molho de tomate");

    const ficha = await prisma.productComposition.create({
      data: {
        storeId,
        inventoryItemId: molho.id,
        version: 1,
        yieldQuantity: 4,
        yieldUnitId: unitKg,
      },
    });

    expect(ficha.inventoryItemId).toBe(molho.id);
    expect(ficha.productId).toBeNull();
    expect(Number(ficha.yieldQuantity)).toBeCloseTo(4, 4);
    expect(ficha.yieldUnitId).toBe(unitKg);

    const relida = await prisma.productComposition.findUnique({
      where: { id: ficha.id },
      include: { inventoryItem: true, product: true, yieldUnit: true },
    });
    expect(relida!.inventoryItem!.name).toBe("Molho de tomate");
    expect(relida!.inventoryItem!.itemType).toBe("PREPARED");
    expect(relida!.product).toBeNull();
    expect(relida!.yieldUnit!.code).toBe("kg");
  });

  it("3 · os DOIS donos preenchidos são recusados pelo CHECK do banco", async () => {
    const pizza = await criarProduto("Pizza");
    const molho = await criarPreparado("Molho");

    // Pelo Prisma: os dois campos são opcionais, então o cliente deixa passar.
    await expect(
      prisma.productComposition.create({
        data: { storeId, productId: pizza.id, inventoryItemId: molho.id, version: 1 },
      }),
    ).rejects.toThrow();

    // E por SQL cru, que é o que prova que quem recusou foi o banco.
    await expect(
      inserirCru({ id: "cru-dois-donos", productId: pizza.id, inventoryItemId: molho.id }),
    ).rejects.toThrow(/dono_exclusivo|check constraint/i);

    expect(await prisma.productComposition.count()).toBe(0);
  });

  it("4 · os dois donos nulos são recusados pelo CHECK do banco", async () => {
    await expect(
      prisma.productComposition.create({
        data: { storeId, version: 1 },
      }),
    ).rejects.toThrow();

    await expect(
      inserirCru({ id: "cru-sem-dono", productId: null, inventoryItemId: null }),
    ).rejects.toThrow(/dono_exclusivo|check constraint/i);

    expect(await prisma.productComposition.count()).toBe(0);
  });

  it("5 · duas versões do mesmo produto convivem; a mesma versão duas vezes não", async () => {
    const pizza = await criarProduto("Pizza");

    await prisma.productComposition.create({
      data: { storeId, productId: pizza.id, version: 1, isActive: false },
    });
    await prisma.productComposition.create({
      data: { storeId, productId: pizza.id, version: 2 },
    });
    expect(await prisma.productComposition.count()).toBe(2);

    // O unique de (productId, version) segue mordendo.
    await expect(
      prisma.productComposition.create({
        data: { storeId, productId: pizza.id, version: 2 },
      }),
    ).rejects.toThrow();
  });

  it("6 · duas versões do mesmo preparado convivem; a mesma versão duas vezes não", async () => {
    const molho = await criarPreparado("Molho");

    await prisma.productComposition.create({
      data: { storeId, inventoryItemId: molho.id, version: 1, isActive: false, yieldQuantity: 4, yieldUnitId: unitKg },
    });
    await prisma.productComposition.create({
      data: { storeId, inventoryItemId: molho.id, version: 2, yieldQuantity: 5, yieldUnitId: unitKg },
    });
    expect(await prisma.productComposition.count()).toBe(2);

    /*
     * Esta é a asserção que o projeto original errava. Sem o segundo unique,
     * versões repetidas de preparado entrariam em silêncio: o unique de
     * (productId, version) não restringe nada quando productId é nulo, porque
     * NULLs são distintos entre si em Postgres.
     */
    await expect(
      prisma.productComposition.create({
        data: { storeId, inventoryItemId: molho.id, version: 2, yieldQuantity: 9, yieldUnitId: unitKg },
      }),
    ).rejects.toThrow();
  });

  it("7 · produtos diferentes usam a mesma versão numérica sem colidir", async () => {
    const a = await criarProduto("Pizza A");
    const b = await criarProduto("Pizza B");
    const c = await criarProduto("Pizza C");

    for (const p of [a, b, c]) {
      await prisma.productComposition.create({
        data: { storeId, productId: p.id, version: 1 },
      });
    }

    /*
     * Aqui mora o risco do unique NÃO parcial: as três linhas têm
     * `inventoryItemId` nulo e `version` 1. Se o unique de
     * (inventoryItemId, version) fosse restritivo sobre NULL, a segunda
     * ficha de produto do sistema seria recusada — e o módulo inteiro
     * pararia. Passa porque NULLs são distintos, que é exatamente a
     * propriedade que torna os dois uniques comuns suficientes.
     */
    expect(await prisma.productComposition.count()).toBe(3);
  });

  it("8 · preparados diferentes usam a mesma versão numérica sem colidir", async () => {
    const molho = await criarPreparado("Molho");
    const massa = await criarPreparado("Massa");
    const recheio = await criarPreparado("Recheio");

    for (const i of [molho, massa, recheio]) {
      await prisma.productComposition.create({
        data: { storeId, inventoryItemId: i.id, version: 1, yieldQuantity: 1, yieldUnitId: unitKg },
      });
    }

    // O espelho do cenário 7, do lado do productId nulo.
    expect(await prisma.productComposition.count()).toBe(3);
  });

  it("9 · ON DELETE: apagar o produto apaga a ficha dele", async () => {
    const pizza = await criarProduto("Pizza");
    await prisma.productComposition.create({
      data: { storeId, productId: pizza.id, version: 1 },
    });

    await prisma.product.delete({ where: { id: pizza.id } });
    expect(await prisma.productComposition.count()).toBe(0);
  });

  it("10 · ON DELETE: apagar o preparado apaga a receita dele", async () => {
    const molho = await criarPreparado("Molho");
    await prisma.productComposition.create({
      data: { storeId, inventoryItemId: molho.id, version: 1, yieldQuantity: 4, yieldUnitId: unitKg },
    });

    /*
     * CASCADE, e não SET NULL como o projeto dizia. SET NULL deixaria a linha
     * com os dois donos nulos, o CHECK abortaria o DELETE, e o operador
     * receberia "check constraint violated" ao tentar apagar um item — uma
     * mensagem que não explica nada. CASCADE é simétrico ao que productId já
     * faz, e diz a verdade: sem o preparado, a receita dele não significa
     * mais nada.
     */
    await prisma.inventoryItem.delete({ where: { id: molho.id } });
    expect(await prisma.productComposition.count()).toBe(0);
  });

  it("11 · ON DELETE: a unidade de rendimento é protegida por RESTRICT", async () => {
    const molho = await criarPreparado("Molho");
    await prisma.productComposition.create({
      data: { storeId, inventoryItemId: molho.id, version: 1, yieldQuantity: 4, yieldUnitId: unitL },
    });

    // Apagar "L" tornaria o rendimento ilegível: 4 de quê?
    await expect(
      prisma.inventoryUnit.delete({ where: { id: unitL } }),
    ).rejects.toThrow();

    expect(await prisma.inventoryUnit.count({ where: { id: unitL } })).toBe(1);
  });

  it("12 · preparado usado como insumo de outra receita não pode ser apagado", async () => {
    const molho = await criarPreparado("Molho");
    const pizza = await criarProduto("Pizza");

    const fichaDaPizza = await prisma.productComposition.create({
      data: { storeId, productId: pizza.id, version: 1 },
    });
    await prisma.compositionItem.create({
      data: {
        compositionId: fichaDaPizza.id,
        inventoryItemId: molho.id,
        quantity: 0.2,
        unitId: unitKg,
      },
    });

    /*
     * A cascata do cenário 10 alcança só a ficha que o item PRODUZ. Como
     * insumo, ele segue protegido por `CompositionItem.inventoryItemId`, que
     * é RESTRICT. Sem isso, apagar o molho levaria junto a ficha da pizza.
     */
    await expect(
      prisma.inventoryItem.delete({ where: { id: molho.id } }),
    ).rejects.toThrow();

    expect(await prisma.compositionItem.count()).toBe(1);
  });
});

/*
 * Os cenários acima medem COMPORTAMENTO. Os de baixo medem a ESTRUTURA, lendo
 * os catálogos do Postgres.
 *
 * Existem porque comportamento certo por acaso é possível: um teste de CASCADE
 * passa igual se a linha some por causa de outra cascata qualquer. Ler
 * `pg_constraint` responde o que de fato está gravado no banco.
 */
describe("estrutura real no banco", () => {
  async function colunas() {
    return prisma.$queryRawUnsafe<Array<{ column_name: string; is_nullable: string; data_type: string }>>(
      `SELECT column_name, is_nullable, data_type
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='ProductComposition'`,
    );
  }

  async function constraintDef(nome: string) {
    const r = await prisma.$queryRawUnsafe<Array<{ d: string }>>(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = $1`,
      nome,
    );
    return r[0]?.d ?? null;
  }

  it("13 · as três colunas novas existem, com tipo e nulidade corretos", async () => {
    const cols = await colunas();
    const por = (n: string) => cols.find((c) => c.column_name === n);

    expect(por("inventoryItemId")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(por("yieldQuantity")).toMatchObject({ data_type: "numeric", is_nullable: "YES" });
    expect(por("yieldUnitId")).toMatchObject({ data_type: "text", is_nullable: "YES" });
  });

  it("14 · productId passou a aceitar nulo", async () => {
    const cols = await colunas();
    expect(cols.find((c) => c.column_name === "productId")!.is_nullable).toBe("YES");
  });

  it("15 · o CHECK gravado é o do dono exclusivo", async () => {
    const d = await constraintDef("ProductComposition_dono_exclusivo");
    expect(d).not.toBeNull();
    expect(d!.replace(/\s+/g, " ")).toMatch(/num_nonnulls\("productId", "inventoryItemId"\) = 1/);
  });

  it("16 · as FKs têm exatamente o ON DELETE do projeto", async () => {
    const item = await constraintDef("ProductComposition_inventoryItemId_fkey");
    expect(item).not.toBeNull();
    expect(item).toMatch(/REFERENCES "InventoryItem"\(id\)/);
    expect(item).toMatch(/ON UPDATE CASCADE/);
    expect(item).toMatch(/ON DELETE CASCADE/);
    // Explícito: SET NULL quebraria o CHECK. Ver cenário 10.
    expect(item).not.toMatch(/ON DELETE SET NULL/);

    const unidade = await constraintDef("ProductComposition_yieldUnitId_fkey");
    expect(unidade).not.toBeNull();
    expect(unidade).toMatch(/REFERENCES "InventoryUnit"\(id\)/);
    expect(unidade).toMatch(/ON DELETE RESTRICT/);
  });

  it("17 · os dois uniques de (dono, version) existem e NÃO são parciais", async () => {
    const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname='public' AND tablename='ProductComposition'`,
    );
    const por = (n: string) => idx.find((i) => i.indexname === n);

    const doProduto = por("ProductComposition_productId_version_key");
    const doPreparado = por("ProductComposition_inventoryItemId_version_key");

    expect(doProduto, "unique de (productId, version) ausente").toBeTruthy();
    expect(doPreparado, "unique de (inventoryItemId, version) ausente").toBeTruthy();
    expect(doProduto!.indexdef).toMatch(/CREATE UNIQUE INDEX/);
    expect(doPreparado!.indexdef).toMatch(/CREATE UNIQUE INDEX/);

    /*
     * Sem WHERE: são índices comuns. Se um dia alguém os tornar parciais, os
     * cenários 7 e 8 continuam passando — os dois desenhos funcionam — mas o
     * schema.prisma deixaria de descrever o banco, e o `migrate dev` proporia
     * derrubá-los. Esta asserção existe para que essa mudança seja deliberada.
     */
    expect(doProduto!.indexdef).not.toMatch(/WHERE/);
    expect(doPreparado!.indexdef).not.toMatch(/WHERE/);

    expect(por("ProductComposition_inventoryItemId_isActive_idx")).toBeTruthy();
  });

  it("18 · a migration é idempotente: rodar de novo não muda nada", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const caminho = resolve(
      __dirname,
      "../../../../prisma/migrations/20260826220000_preparado_na_ficha_tecnica/migration.sql",
    );

    const antes = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM pg_constraint
        WHERE conrelid = '"ProductComposition"'::regclass`,
    );

    // O arquivo real, executado inteiro pela segunda vez.
    await prisma.$executeRawUnsafe(readFileSync(caminho, "utf8"));

    const depois = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM pg_constraint
        WHERE conrelid = '"ProductComposition"'::regclass`,
    );

    expect(depois[0].n).toBe(antes[0].n);
    expect(await constraintDef("ProductComposition_dono_exclusivo")).not.toBeNull();
  });
});
