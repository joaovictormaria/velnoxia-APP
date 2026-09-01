import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { CompositionService } from "@/server/services/composition-service";

/*
 * EXCLUIR UM PREPARADO — contra o Postgres local.
 *
 * A aba não tinha saída: um preparado cadastrado sem ficha não podia ser
 * produzido, editado nem removido, e ficava na lista para sempre.
 *
 * Excluir aqui é DESATIVAR. `InventoryItem` não tem `deletedAt`, e apagar de
 * verdade levaria junto os movimentos que explicam o saldo e as corridas de
 * produção que explicam o custo de vendas já apuradas. O que estes cenários
 * medem são as três recusas — e, principalmente, que o histórico sobrevive.
 */

let storeId = "";
let outraLojaId = "";
let unitKg = "";
let tomateId = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

async function semear() {
  await limparBanco();
  storeId = (await prisma.store.create({ data: { slug: `exc-${Date.now()}`, name: "Cozinha" } })).id;
  outraLojaId = (await prisma.store.create({ data: { slug: `exc2-${Date.now()}`, name: "Vizinha" } })).id;
  unitKg = (await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  })).id;
  tomateId = (await prisma.inventoryItem.create({
    data: { storeId, name: "Tomate", itemType: "INGREDIENT", baseUnitId: unitKg, quantityOnHand: 100, cost: 8 },
  })).id;
}

const receitaPadrao = () => ({
  items: [{ inventoryItemId: tomateId, quantity: 5.2, unitId: unitKg, sortOrder: 0 }],
  yieldQuantity: 4,
  yieldUnitId: unitKg,
  isActive: true,
});

async function criarMolho(nome = "Molho de tomate") {
  const { item, receita }: any = await CompositionService.criarPreparadoComReceita(storeId, {
    nome,
    baseUnitId: unitKg,
    receita: receitaPadrao(),
  });
  return { item, receita };
}

beforeEach(semear);
afterAll(limparBanco);

describe("o caminho feliz", () => {
  it("01 · tira o preparado da lista sem apagar a linha", async () => {
    const { item } = await criarMolho();

    await CompositionService.excluirPreparado(storeId, item.id);

    const depois = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    // A linha continua lá — é dela que os movimentos e as corridas dependem.
    expect(depois).not.toBeNull();
    expect(depois!.isActive).toBe(false);
  });

  /*
   * A RECEITA CAI JUNTO. Deixá-la ativa manteria uma ficha técnica apontando
   * para um item que sumiu da tela — e a próxima produção a encontraria.
   */
  it("02 · desativa a receita do preparado junto", async () => {
    const { item, receita } = await criarMolho();

    await CompositionService.excluirPreparado(storeId, item.id);

    const ficha = await prisma.productComposition.findUnique({ where: { id: receita.id } });
    expect(ficha!.isActive).toBe(false);
  });

  /*
   * O QUE A ABA CONSULTA. `adminListarPreparados` filtra `isActive: true`; se
   * este filtro e a desativação discordarem, o item excluído volta à lista.
   */
  it("03 · some da consulta que a aba faz", async () => {
    const { item } = await criarMolho();
    await CompositionService.excluirPreparado(storeId, item.id);

    const listados = await prisma.inventoryItem.findMany({
      where: { storeId, itemType: "PREPARED", isActive: true },
    });
    expect(listados.map((i) => i.id)).not.toContain(item.id);
  });

  /*
   * O PREPARADO SEM RECEITA É O CASO QUE MOTIVOU ISTO. Ele não tinha nenhum
   * botão na linha: nada de produzir, nada de ficha, nada de excluir.
   */
  it("04 · exclui também quem nunca teve ficha", async () => {
    const orfao = await prisma.inventoryItem.create({
      data: { storeId, name: "Bolo de Chocolate", itemType: "PREPARED", baseUnitId: unitKg },
    });

    await expect(
      CompositionService.excluirPreparado(storeId, orfao.id),
    ).resolves.toMatchObject({ nome: "Bolo de Chocolate" });
  });
});

describe("as três recusas", () => {
  /*
   * SALDO. Sumir com um item que tem 8 kg em estoque não faz os 8 kg deixarem
   * de existir — faz eles deixarem de ser contados, e o valor do inventário
   * cai sem nenhum movimento que explique a queda.
   */
  it("05 · recusa quando ainda há saldo", async () => {
    const { item } = await criarMolho();
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { quantityOnHand: 8 },
    });

    await expect(
      CompositionService.excluirPreparado(storeId, item.id),
    ).rejects.toThrow(/saldo em estoque/i);

    const intacto = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(intacto!.isActive).toBe(true);
  });

  /*
   * RESERVA. Há pedido aberto contando com ele; desativar agora deixaria a
   * reserva presa para sempre, e o consumo não teria o que baixar.
   */
  it("06 · recusa quando há reserva de pedido aberto", async () => {
    const { item } = await criarMolho();
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { quantityReserved: 2 },
    });

    await expect(
      CompositionService.excluirPreparado(storeId, item.id),
    ).rejects.toThrow(/reservado para pedidos/i);
  });

  /*
   * USO EM OUTRA FICHA — a recusa mais importante das três, porque é a única
   * que NÃO daria erro nenhum se passasse: o produto do cardápio simplesmente
   * perderia uma parcela do custo e passaria a parecer mais barato do que é.
   */
  it("07 · recusa quando é ingrediente da ficha de um produto", async () => {
    const { item } = await criarMolho();

    const categoria = await prisma.category.create({
      data: { storeId, name: "Pizzas", slug: "pizzas", sortOrder: 1 },
    });
    const pizza = await prisma.product.create({
      data: {
        storeId,
        categoryId: categoria.id,
        name: "Pizza",
        slug: "pizza",
        description: "",
        basePrice: 50,
      },
    });
    const ficha = await prisma.productComposition.create({
      data: { storeId, productId: pizza.id, version: 1, isActive: true },
    });
    await prisma.compositionItem.create({
      data: {
        compositionId: ficha.id,
        inventoryItemId: item.id,
        quantity: 0.2,
        unitId: unitKg,
        sortOrder: 0,
      },
    });

    await expect(
      CompositionService.excluirPreparado(storeId, item.id),
    ).rejects.toThrow(/Pizza/);
  });

  /*
   * MAS UMA VERSÃO ANTIGA NÃO BLOQUEIA. Ficha desativada é histórico: não vai
   * ser usada em venda nova, e exigir que a loja limpe versões velhas para
   * poder excluir um preparado seria pedir arqueologia por nada.
   */
  it("08 · uma ficha já desativada não impede", async () => {
    const { item } = await criarMolho();

    const categoria = await prisma.category.create({
      data: { storeId, name: "Pizzas", slug: "pizzas", sortOrder: 1 },
    });
    const pizza = await prisma.product.create({
      data: {
        storeId,
        categoryId: categoria.id,
        name: "Pizza",
        slug: "pizza",
        description: "",
        basePrice: 50,
      },
    });
    const antiga = await prisma.productComposition.create({
      data: { storeId, productId: pizza.id, version: 1, isActive: false },
    });
    await prisma.compositionItem.create({
      data: {
        compositionId: antiga.id,
        inventoryItemId: item.id,
        quantity: 0.2,
        unitId: unitKg,
        sortOrder: 0,
      },
    });

    await expect(
      CompositionService.excluirPreparado(storeId, item.id),
    ).resolves.toBeTruthy();
  });
});

describe("o que a exclusão não pode alcançar", () => {
  /*
   * O ISOLAMENTO POR LOJA. A mesma pergunta que todo o módulo faz: a loja A
   * não apaga nada da loja B, e nem descobre que o id existe.
   */
  it("09 · a loja vizinha não consegue excluir", async () => {
    const { item } = await criarMolho();

    await expect(
      CompositionService.excluirPreparado(outraLojaId, item.id),
    ).rejects.toThrow(/não encontrado/i);

    const intacto = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(intacto!.isActive).toBe(true);
  });

  /*
   * E NÃO SERVE PARA INGREDIENTE. `itemType` está no `where` de propósito:
   * esta função é da aba Preparados, e um insumo comprado tem outro ciclo de
   * vida — some da aba errada e ninguém entende por quê.
   */
  it("10 · não exclui um insumo comum por este caminho", async () => {
    await expect(
      CompositionService.excluirPreparado(storeId, tomateId),
    ).rejects.toThrow(/não encontrado/i);
  });

  /*
   * ═════════════════════════════════════════════════════════════════════════
   * O MOTIVO DE ISTO SER DESATIVAÇÃO, e não `DELETE`.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * O movimento é o que explica o saldo de hoje, e a corrida de produção é o
   * que explica quanto custou produzir — número que já entrou no custo de
   * vendas apuradas. Um `DELETE` levaria os dois junto, e um relatório fechado
   * no mês passado deixaria de ter de onde vir.
   */
  it("11 · o histórico de movimentação sobrevive à exclusão", async () => {
    const { item } = await criarMolho();
    await prisma.inventoryMovement.create({
      data: {
        storeId,
        itemId: item.id,
        type: "PRODUCTION",
        quantity: 4,
        unitId: unitKg,
        idempotencyKey: "mov-teste-1",
      },
    });

    await CompositionService.excluirPreparado(storeId, item.id);

    const movimentos = await prisma.inventoryMovement.count({ where: { itemId: item.id } });
    expect(movimentos).toBe(1);
  });
});
