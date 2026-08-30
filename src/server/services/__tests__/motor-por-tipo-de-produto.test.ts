import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { insumosDoPedido } from "@/server/services/composicao-do-pedido";

/*
 * O MOTOR, LIDO PELO TIPO DECLARADO DO PRODUTO.
 *
 * `insumosDoPedido` é a única função que muda nesta fase, e é ela que decide o
 * que sai da prateleira quando alguém compra. Tudo depois dela — reserva,
 * consumo, reversão, custo, CMV — recebe a mesma lista de sempre e não sabe que
 * algo mudou. É por isso que estes testes olham a LISTA, e não os movimentos:
 * a lista é o contrato.
 *
 * Os quatro comportamentos, e o quinto que é a compatibilidade:
 *
 *   NAO_CONTROLA  não desce o produto; a embalagem ainda desce
 *   REVENDA       desce N unidades do item vinculado
 *   PRODUCAO+ficha       desce os ingredientes da receita
 *   PRODUCAO+preparado   desce N unidades do preparado, e NÃO os ingredientes
 *   null          exatamente o comportamento anterior a esta fase
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
/* As conversões (1 kg = 1000 g) são outra migration, e a receita que pede
 * gramas de um item contado em kg precisa delas. */
const SEED_CONVERSOES = "20260827000000_semear_conversoes_de_unidade";
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
  await semear(SEED_CONVERSOES);
  storeId = (
    await prisma.store.create({ data: { slug: `tipo-${Date.now()}`, name: "Cozinha" } })
  ).id;
});
afterAll(limparBanco);

async function item(
  name: string,
  itemType: string,
  baseUnitId = "unit_un",
  quantidade = 50,
) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name, baseUnitId, itemType } as any,
    { quantidade, precoDaEmbalagem: 10 },
  );
}

async function produto(
  nome: string,
  dados: Record<string, unknown> = {},
) {
  const categoria = await prisma.category.create({
    data: {
      storeId,
      name: "Geral",
      slug: `geral-${nome}-${Date.now()}`,
      icon: "🍽",
      kind: "SIMPLE",
    },
  });
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoria.id,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      description: nome,
      basePrice: 10,
      ...dados,
    },
  });
}

/** Uma ficha ativa com as linhas dadas. */
async function ficha(
  productId: string,
  linhas: Array<{ inventoryItemId: string; quantity: number; unitId: string }>,
) {
  return prisma.productComposition.create({
    data: {
      storeId,
      productId,
      version: 1,
      isActive: true,
      items: { create: linhas.map((l, i) => ({ ...l, sortOrder: i })) },
    },
  });
}

/** O pedido, como `insumosDoPedido` o recebe. */
const pedido = (productId: string, quantity: number) => [
  { productId, quantity, compositionVersionId: null },
];

describe("NAO_CONTROLA", () => {
  it("a venda não desce nada do produto", async () => {
    const coca = await item("Coca lata", "RESALE");
    const p = await produto("Cortesia", {
      tipoDeControle: "NAO_CONTROLA",
      // O vínculo existe no banco e é IGNORADO: a declaração do dono vence a
      // dedução. Antes desta fase, este produto baixaria a lata.
      inventoryItemId: coca.id,
    });

    const { insumos } = await insumosDoPedido(pedido(p.id, 3));

    expect(insumos).toHaveLength(0);
  });

  it("a venda não desce ingredientes, mesmo com ficha ativa", async () => {
    const farinha = await item("Farinha", "INGREDIENT", "unit_kg", 10);
    const p = await produto("Brinde", { tipoDeControle: "NAO_CONTROLA" });
    await ficha(p.id, [
      { inventoryItemId: farinha.id, quantity: 1, unitId: "unit_kg" },
    ]);

    const { insumos } = await insumosDoPedido(pedido(p.id, 2));

    expect(insumos).toHaveLength(0);
  });

  /*
   * A DECISÃO DO JOÃO, e o teste que a fixa: não controlar é não descer o
   * PRODUTO. A sacola sai da prateleira do mesmo jeito, e recusar registrá-la
   * seria criar uma exceção sem razão física.
   */
  it("a EMBALAGEM ainda desce", async () => {
    const sacola = await item("Sacola", "PACKAGING");
    const p = await produto("Brinde", { tipoDeControle: "NAO_CONTROLA" });
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: sacola.id,
        quantity: 1,
        unitId: "unit_un",
      },
    });

    const { insumos } = await insumosDoPedido(pedido(p.id, 4));

    expect(insumos).toHaveLength(1);
    expect(insumos[0]).toMatchObject({
      inventoryItemId: sacola.id,
      quantidade: 4,
    });
  });
});

describe("REVENDA", () => {
  it("a venda de 1 baixa 1 unidade do item vinculado", async () => {
    const coca = await item("Coca-Cola lata 350ml", "RESALE");
    const p = await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });

    const { insumos } = await insumosDoPedido(pedido(p.id, 1));

    expect(insumos).toEqual([
      { inventoryItemId: coca.id, unitId: "unit_un", quantidade: 1 },
    ]);
  });

  it("a venda de 10 baixa 10", async () => {
    const coca = await item("Coca-Cola lata 350ml", "RESALE");
    const p = await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });

    const { insumos } = await insumosDoPedido(pedido(p.id, 10));

    expect(insumos[0].quantidade).toBe(10);
  });

  /*
   * A ambiguidade que esta fase existe para acabar. Antes, uma ficha criada por
   * engano numa Coca-Cola fazia o motor descer os ingredientes dela e IGNORAR a
   * lata — em silêncio, com a tela mostrando tudo verde. Agora a declaração do
   * dono vence.
   */
  it("a ficha é ignorada: o tipo declarado vence a dedução antiga", async () => {
    const coca = await item("Coca lata", "RESALE");
    const acucar = await item("Açúcar", "INGREDIENT", "unit_kg", 10);
    const p = await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });
    await ficha(p.id, [
      { inventoryItemId: acucar.id, quantity: 1, unitId: "unit_kg" },
    ]);

    const { insumos } = await insumosDoPedido(pedido(p.id, 2));

    expect(insumos).toHaveLength(1);
    expect(insumos[0].inventoryItemId).toBe(coca.id);
    expect(insumos[0].quantidade).toBe(2);
  });

  it("a embalagem desce junto, somada na mesma lista", async () => {
    const coca = await item("Coca lata", "RESALE");
    const copo = await item("Copo", "PACKAGING");
    const p = await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: copo.id,
        quantity: 1,
        unitId: "unit_un",
      },
    });

    const { insumos } = await insumosDoPedido(pedido(p.id, 3));

    expect(insumos).toHaveLength(2);
    expect(insumos.find((i) => i.inventoryItemId === coca.id)?.quantidade).toBe(3);
    expect(insumos.find((i) => i.inventoryItemId === copo.id)?.quantidade).toBe(3);
  });
});

describe("PRODUCAO com receita própria", () => {
  it("a venda baixa os ingredientes nas quantidades da ficha", async () => {
    const massa = await item("Massa", "INGREDIENT", "unit_un", 20);
    const queijo = await item("Queijo", "INGREDIENT", "unit_kg", 10);
    const p = await produto("Pizza Calabresa", { tipoDeControle: "PRODUCAO" });
    await ficha(p.id, [
      { inventoryItemId: massa.id, quantity: 1, unitId: "unit_un" },
      // 150 g pedidos de um item contado em kg: a conversão é a de sempre.
      { inventoryItemId: queijo.id, quantity: 150, unitId: "unit_g" },
    ]);

    const { insumos } = await insumosDoPedido(pedido(p.id, 2));

    expect(insumos.find((i) => i.inventoryItemId === massa.id)?.quantidade).toBe(2);
    expect(
      insumos.find((i) => i.inventoryItemId === queijo.id)?.quantidade,
    ).toBeCloseTo(0.3, 6);
  });

  it("a embalagem desce junto dos ingredientes", async () => {
    const massa = await item("Massa", "INGREDIENT");
    const caixa = await item("Caixa de pizza 35cm", "PACKAGING");
    const p = await produto("Pizza Calabresa", { tipoDeControle: "PRODUCAO" });
    await ficha(p.id, [
      { inventoryItemId: massa.id, quantity: 1, unitId: "unit_un" },
    ]);
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: caixa.id,
        quantity: 1,
        unitId: "unit_un",
      },
    });

    const { insumos } = await insumosDoPedido(pedido(p.id, 2));

    expect(insumos).toHaveLength(2);
    expect(insumos.find((i) => i.inventoryItemId === caixa.id)?.quantidade).toBe(2);
  });
});

describe("PRODUCAO com preparado vinculado", () => {
  /*
   * A segunda forma de produção, e a razão de ela não ser REVENDA: o bolo não
   * foi comprado pronto, foi feito em lote. A mecânica de baixa coincide — uma
   * unidade por venda — mas a origem é outra, e a tela precisa dizer a verdade
   * ao dono.
   */
  it("a venda baixa 1 unidade do preparado", async () => {
    const bolo = await item("Bolo de Chocolate", "PREPARED");
    const p = await produto("Fatia de Bolo", {
      tipoDeControle: "PRODUCAO",
      inventoryItemId: bolo.id,
    });

    const { insumos } = await insumosDoPedido(pedido(p.id, 5));

    expect(insumos).toEqual([
      { inventoryItemId: bolo.id, unitId: "unit_un", quantidade: 5 },
    ]);
  });

  /*
   * UM NÍVEL, E PARA AQUI — a regra que já existia, agora sob o tipo declarado.
   * Os ingredientes saíram da prateleira quando a corrida de produção fez o
   * lote. Descê-los de novo tiraria uma farinha que não está mais lá.
   */
  it("NÃO desce os ingredientes do preparado de novo", async () => {
    const farinha = await item("Farinha", "INGREDIENT", "unit_kg", 10);
    const bolo = await item("Bolo de Chocolate", "PREPARED");
    // A receita do PREPARADO, que é de outro dono: o item, não o produto.
    await prisma.productComposition.create({
      data: {
        storeId,
        inventoryItemId: bolo.id,
        version: 1,
        isActive: true,
        items: {
          create: [
            { inventoryItemId: farinha.id, quantity: 2, unitId: "unit_kg", sortOrder: 0 },
          ],
        },
      },
    });
    const p = await produto("Fatia de Bolo", {
      tipoDeControle: "PRODUCAO",
      inventoryItemId: bolo.id,
    });

    const { insumos } = await insumosDoPedido(pedido(p.id, 3));

    expect(insumos).toHaveLength(1);
    expect(insumos[0].inventoryItemId).toBe(bolo.id);
    expect(insumos.some((i) => i.inventoryItemId === farinha.id)).toBe(false);
  });
});

describe("compatibilidade: tipoDeControle nulo", () => {
  /*
   * O TESTE MAIS IMPORTANTE DA FASE. Todo produto que existia antes desta
   * migration tem tipo nulo, e nenhum deles foi classificado automaticamente.
   * Se o ramo legado divergisse em um único caso, o estoque de toda loja em
   * produção passaria a se comportar de forma diferente da noite para o dia.
   */
  it("com ficha: desce os ingredientes, como antes", async () => {
    const farinha = await item("Farinha", "INGREDIENT", "unit_kg", 10);
    const p = await produto("Bolo caseiro");
    await ficha(p.id, [
      { inventoryItemId: farinha.id, quantity: 0.5, unitId: "unit_kg" },
    ]);

    const { insumos } = await insumosDoPedido(pedido(p.id, 2));

    expect(insumos).toEqual([
      { inventoryItemId: farinha.id, unitId: "unit_kg", quantidade: 1 },
    ]);
  });

  it("sem ficha e com vínculo: desce uma unidade, como antes", async () => {
    const coca = await item("Coca lata", "RESALE");
    const p = await produto("Coca-Cola", { inventoryItemId: coca.id });

    const { insumos } = await insumosDoPedido(pedido(p.id, 4));

    expect(insumos).toEqual([
      { inventoryItemId: coca.id, unitId: "unit_un", quantidade: 4 },
    ]);
  });

  /*
   * A ORDEM ANTIGA SE MANTÉM: com os dois, a ficha vence e o vínculo é
   * ignorado. Não é o comportamento desejável — é justamente a ambiguidade que
   * o tipo declarado resolve — mas mudá-lo para o produto legado seria alterar
   * silenciosamente o estoque de quem não pediu nada.
   */
  it("com os dois: a ficha vence, como antes", async () => {
    const farinha = await item("Farinha", "INGREDIENT", "unit_kg", 10);
    const coca = await item("Coca lata", "RESALE");
    const p = await produto("Ambíguo", { inventoryItemId: coca.id });
    await ficha(p.id, [
      { inventoryItemId: farinha.id, quantity: 1, unitId: "unit_kg" },
    ]);

    const { insumos } = await insumosDoPedido(pedido(p.id, 1));

    expect(insumos).toHaveLength(1);
    expect(insumos[0].inventoryItemId).toBe(farinha.id);
  });

  it("sem ficha e sem vínculo: silêncio, como antes", async () => {
    const p = await produto("Taxa de entrega");

    const { insumos } = await insumosDoPedido(pedido(p.id, 1));

    expect(insumos).toHaveLength(0);
  });

  /*
   * A embalagem é a ÚNICA coisa nova que alcança o produto legado, e só quando
   * alguém a configura de propósito. Uma tabela vazia não muda nada — que é o
   * que torna a migration dela sem efeito até o primeiro cadastro.
   */
  it("a embalagem funciona no produto legado, quando configurada", async () => {
    const guardanapo = await item("Guardanapo", "PACKAGING");
    const p = await produto("Prato do dia");
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: guardanapo.id,
        quantity: 2,
        unitId: "unit_un",
      },
    });

    const { insumos } = await insumosDoPedido(pedido(p.id, 3));

    expect(insumos).toEqual([
      { inventoryItemId: guardanapo.id, unitId: "unit_un", quantidade: 6 },
    ]);
  });
});

describe("a soma, com tipos misturados no mesmo pedido", () => {
  /*
   * Dois itens diferentes do mesmo pedido podem tocar o mesmo insumo — aqui, a
   * mesma sacola. Somar é obrigatório: duas linhas separadas gerariam duas
   * chaves de idempotência para o mesmo par pedido+insumo, e a segunda colidiria
   * com a primeira.
   */
  it("soma a mesma embalagem usada por produtos de tipos diferentes", async () => {
    const sacola = await item("Sacola", "PACKAGING");
    const coca = await item("Coca lata", "RESALE");
    const massa = await item("Massa", "INGREDIENT");

    const bebida = await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });
    const pizza = await produto("Pizza", { tipoDeControle: "PRODUCAO" });
    await ficha(pizza.id, [
      { inventoryItemId: massa.id, quantity: 1, unitId: "unit_un" },
    ]);

    for (const productId of [bebida.id, pizza.id]) {
      await prisma.productPackaging.create({
        data: {
          storeId,
          productId,
          inventoryItemId: sacola.id,
          quantity: 1,
          unitId: "unit_un",
        },
      });
    }

    const { insumos } = await insumosDoPedido([
      { productId: bebida.id, quantity: 2, compositionVersionId: null },
      { productId: pizza.id, quantity: 3, compositionVersionId: null },
    ]);

    expect(insumos.find((i) => i.inventoryItemId === sacola.id)?.quantidade).toBe(5);
    expect(insumos.find((i) => i.inventoryItemId === coca.id)?.quantidade).toBe(2);
    expect(insumos.find((i) => i.inventoryItemId === massa.id)?.quantidade).toBe(3);
  });

  /*
   * A ordenação por id é o que impede deadlock: duas transações que travam os
   * mesmos insumos em ordem inversa esperam uma pela outra para sempre. A
   * embalagem entra no mesmo acumulador justamente para herdar isso.
   */
  it("a lista continua ordenada por id, com a embalagem dentro", async () => {
    const sacola = await item("Sacola", "PACKAGING");
    const coca = await item("Coca lata", "RESALE");
    const p = await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: sacola.id,
        quantity: 1,
        unitId: "unit_un",
      },
    });

    const { insumos } = await insumosDoPedido(pedido(p.id, 1));

    const ids = insumos.map((i) => i.inventoryItemId);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });
});
