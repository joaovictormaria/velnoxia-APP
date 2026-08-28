import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { CustoDoPreparado } from "@/server/services/custo-do-preparado";
import { ProducaoService } from "@/server/services/producao-service";
import { InventoryService } from "@/server/services/inventory-service";
import { InventoryCostService } from "@/server/services/inventory-cost-service";

/*
 * O custo, contra o Postgres local.
 *
 * A ideia inteira cabe numa frase: PRODUZIR e COMPRAR são a mesma categoria de
 * fato — entrou material, a um custo unitário conhecido — e diferem só em de
 * onde vem o número. A produção calcula (entrada ÷ produzido); a compra
 * informa (pago ÷ quantidade).
 *
 * Daí a regra ser "a aquisição mais recente", e não "a última produção": numa
 * sequência que mistura os dois, só esta leitura acerta em cada ponto.
 */

let storeId = "";
let unitKg = "";
let unitG = "";
let tomateId = "";
let molhoId = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

async function semear() {
  await limparBanco();
  storeId = (await prisma.store.create({ data: { slug: `cst-${Date.now()}`, name: "Cozinha" } })).id;
  unitKg = (await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  })).id;
  unitG = (await prisma.inventoryUnit.create({
    data: { code: "g", name: "Grama", system: "WEIGHT", isBuiltIn: true },
  })).id;

  tomateId = (await prisma.inventoryItem.create({
    data: { storeId, name: "Tomate", itemType: "INGREDIENT", baseUnitId: unitKg, quantityOnHand: 100, cost: 8 },
  })).id;
  molhoId = (await prisma.inventoryItem.create({
    data: { storeId, name: "Molho", itemType: "PREPARED", baseUnitId: unitKg, quantityOnHand: 0 },
  })).id;
}

async function receitaDoMolho() {
  return prisma.productComposition.create({
    data: {
      storeId, inventoryItemId: molhoId, version: 1,
      yieldQuantity: 4, yieldUnitId: unitKg,
      items: { create: [{ inventoryItemId: tomateId, quantity: 5.2, unitId: unitKg }] },
    },
  });
}

async function produzir(compositionId: string, planejado = 4, produzido = 4) {
  return ProducaoService.produzir(storeId, {
    compositionId, plannedQuantity: planejado, producedQuantity: produzido,
    runToken: `t-${Date.now()}-${Math.random()}`,
  });
}

async function comprar(itemId: string, quantidade: number, custoUnitario: number | null, ref = "nota") {
  return InventoryService.recordMovement(storeId, {
    idempotencyKey: `${storeId}#PURCHASE#${ref}#${itemId}#${Math.random()}`,
    itemId, type: "PURCHASE", quantity: quantidade, unitId: unitKg,
    ...(custoUnitario == null ? {} : { costAtTime: custoUnitario }),
  } as any);
}

const custoDoItem = async (id: string) => {
  const c = (await prisma.inventoryItem.findUnique({ where: { id } }))!.cost;
  return c == null ? null : Number(c);
};

beforeEach(semear);
afterAll(limparBanco);

describe("custo da aquisição mais recente", () => {
  it("01 · só produção: o custo é o da corrida", async () => {
    const r = await receitaDoMolho();
    await produzir(r.id);

    expect(Number(await CustoDoPreparado.custoDeAquisicaoMaisRecente(storeId, molhoId))).toBeCloseTo(10.4, 2);
    expect(await custoDoItem(molhoId)).toBeCloseTo(10.4, 2);
  });

  it("02 · só compra: a compra estabelece o custo do item", async () => {
    await comprar(molhoId, 2, 15);

    /*
     * A metade que faltava. Antes, comprar não mexia no custo de nada — e um
     * preparado comprado pronto ficava sem preço, gravando `costAtTime` nulo
     * no primeiro consumo.
     */
    expect(await custoDoItem(molhoId)).toBeCloseTo(15, 2);
    expect(Number(await CustoDoPreparado.custoDeAquisicaoMaisRecente(storeId, molhoId))).toBeCloseTo(15, 2);
  });

  it("03 · compra SEM preço não mexe no custo — comportamento de hoje", async () => {
    const r = await receitaDoMolho();
    await produzir(r.id); // 10,40
    await comprar(molhoId, 2, null);

    /*
     * O formulário de movimento ainda não tem campo de preço. Até ele ter, uma
     * compra continua sendo só entrada de quantidade, e o custo permanece o da
     * última aquisição que informou valor.
     */
    expect(await custoDoItem(molhoId)).toBeCloseTo(10.4, 2);
  });

  it("04 · sequência mista: produz, compra, produz — o custo segue o mais recente", async () => {
    const r = await receitaDoMolho();
    await produzir(r.id);
    expect(await custoDoItem(molhoId)).toBeCloseTo(10.4, 2);

    await new Promise((res) => setTimeout(res, 5));
    await comprar(molhoId, 2, 15);
    expect(await custoDoItem(molhoId)).toBeCloseTo(15, 2);

    await new Promise((res) => setTimeout(res, 5));
    await prisma.inventoryItem.update({ where: { id: tomateId }, data: { cost: 7.538461538 } });
    const segunda = await produzir(r.id);
    expect(Number(segunda.unitCost)).toBeCloseTo(9.8, 1);
    expect(await custoDoItem(molhoId)).toBeCloseTo(Number(segunda.unitCost), 2);

    /*
     * "Última produção" acertaria o primeiro e o terceiro ponto e erraria o
     * segundo. É por isso que a regra é "última aquisição".
     */
    expect(Number(await CustoDoPreparado.custoDeAquisicaoMaisRecente(storeId, molhoId)))
      .toBeCloseTo(Number(segunda.unitCost), 2);
  });

  it("05 · reverter a produção mais recente devolve o custo à COMPRA anterior", async () => {
    const r = await receitaDoMolho();
    await comprar(molhoId, 2, 15);
    await new Promise((res) => setTimeout(res, 5));
    const corrida = await produzir(r.id);
    expect(await custoDoItem(molhoId)).toBeCloseTo(10.4, 2);

    await ProducaoService.reverter(storeId, corrida.id);

    /*
     * O ponto onde "última produção" falharia feio: não existe produção
     * anterior, então ele devolveria nulo — e o molho perderia o preço que a
     * compra tinha estabelecido.
     */
    expect(await custoDoItem(molhoId)).toBeCloseTo(15, 2);
  });

  it("06 · compra revertida deixa de precificar", async () => {
    const compra = await comprar(molhoId, 2, 15);
    expect(await custoDoItem(molhoId)).toBeCloseTo(15, 2);

    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#REVERSAL#${compra.id}`,
      itemId: molhoId, type: "REVERSAL",
      quantity: Number(compra.quantity) * -1, unitId: unitKg,
      originalMovementId: compra.id,
    } as any);

    // O material voltou; o preço dele não precifica mais nada.
    expect(await CustoDoPreparado.custoDeAquisicaoMaisRecente(storeId, molhoId)).toBeNull();
  });

  it("07 · item sem aquisição nenhuma não tem custo inventado", async () => {
    expect(await CustoDoPreparado.custoDeAquisicaoMaisRecente(storeId, molhoId)).toBeNull();
  });
});

describe("custo da ficha", () => {
  it("08 · converte a unidade antes de multiplicar", async () => {
    /*
     * O defeito que isto tranca: a ficha pensa em gramas, o estoque conta
     * potes. Sem converter, 45 g de um item a R$ 10,40 o pote viravam
     * R$ 468,00 — duas ordens de grandeza, num número que ninguém confere de
     * cabeça.
     */
    const pote = await prisma.inventoryItem.create({
      data: {
        storeId, name: "Creme", itemType: "INGREDIENT", baseUnitId: unitKg,
        quantityOnHand: 10, cost: 10.4,
        // `contentUnit` guarda o ID da unidade, igual a `baseUnitId`: e por
        // ele que a conversao encontra o fator no mapa.
        contentSize: 500, contentUnit: unitG,
      },
    });
    const ficha = await prisma.productComposition.create({
      data: {
        storeId, inventoryItemId: molhoId, version: 1,
        yieldQuantity: 1, yieldUnitId: unitKg,
        items: { create: [{ inventoryItemId: pote.id, quantity: 45, unitId: unitG }] },
      },
    });

    const { total, linhas } = await CustoDoPreparado.custoDaFicha(storeId, ficha.id);

    expect(linhas[0].quantidadeNaBase).toBeCloseTo(0.09, 4); // 45 ÷ 500
    expect(Number(total)).toBeCloseTo(0.936, 3); // 0,09 × 10,40
    expect(Number(total)).not.toBeCloseTo(468, 0);
  });

  it("09 · soma várias linhas, em Decimal", async () => {
    const sal = await prisma.inventoryItem.create({
      data: { storeId, name: "Sal", itemType: "INGREDIENT", baseUnitId: unitKg, quantityOnHand: 10, cost: 2 },
    });
    const ficha = await prisma.productComposition.create({
      data: {
        storeId, inventoryItemId: molhoId, version: 1,
        yieldQuantity: 4, yieldUnitId: unitKg,
        items: {
          create: [
            { inventoryItemId: tomateId, quantity: 5.2, unitId: unitKg }, // 41,60
            { inventoryItemId: sal.id, quantity: 0.1, unitId: unitKg }, //  0,20
          ],
        },
      },
    });

    const { total, linhas, linhasSemCusto } = await CustoDoPreparado.custoDaFicha(storeId, ficha.id);
    expect(Number(total)).toBeCloseTo(41.8, 2);
    expect(linhas).toHaveLength(2);
    expect(linhasSemCusto).toBe(0);
    // Dinheiro sai como Decimal, não number: centavos somados em laço acumulam.
    expect(typeof (total as any).add).toBe("function");
  });

  it("10 · insumo sem custo fica de fora e é CONTADO, em vez de virar zero silencioso", async () => {
    const misterio = await prisma.inventoryItem.create({
      data: { storeId, name: "Sem custo", itemType: "INGREDIENT", baseUnitId: unitKg, quantityOnHand: 10, cost: null },
    });
    const ficha = await prisma.productComposition.create({
      data: {
        storeId, inventoryItemId: molhoId, version: 1,
        yieldQuantity: 4, yieldUnitId: unitKg,
        items: {
          create: [
            { inventoryItemId: tomateId, quantity: 5.2, unitId: unitKg },
            { inventoryItemId: misterio.id, quantity: 1, unitId: unitKg },
          ],
        },
      },
    });

    const { total, linhasSemCusto } = await CustoDoPreparado.custoDaFicha(storeId, ficha.id);
    expect(Number(total)).toBeCloseTo(41.6, 2);
    expect(linhasSemCusto, "o relatório precisa dizer que está incompleto").toBe(1);
  });

  it("11 · a ficha que leva preparado lê o custo DELE, sem descer nos ingredientes", async () => {
    const r = await receitaDoMolho();
    await produzir(r.id); // molho a 10,40/kg

    const pizza = await prisma.product.create({
      data: {
        storeId,
        categoryId: (await prisma.category.create({
          data: { storeId, name: "Pizzas", slug: `p-${Date.now()}`, kind: "PIZZA" },
        })).id,
        name: "Margherita", slug: `m-${Date.now()}`, description: "", basePrice: 50,
      },
    });
    const fichaDaPizza = await prisma.productComposition.create({
      data: {
        storeId, productId: pizza.id, version: 1,
        items: { create: [{ inventoryItemId: molhoId, quantity: 0.2, unitId: unitKg }] },
      },
    });

    const { total, linhas } = await CustoDoPreparado.custoDaFicha(storeId, fichaDaPizza.id);

    /*
     * Compõe pelos níveis sem recursão: o custo do molho já embute o tomate e
     * a merma. Somar os ingredientes do molho aqui contaria duas vezes, pelo
     * mesmo motivo que o pedido não desce até eles.
     */
    expect(Number(total)).toBeCloseTo(2.08, 2); // 0,2 × 10,40
    expect(linhas).toHaveLength(1);
    expect(linhas[0].nome).toBe("Molho");
  });
});

describe("eficiência da corrida", () => {
  it("12 · produzir o esperado é 100%", async () => {
    const r = await receitaDoMolho();
    const corrida = await produzir(r.id, 4, 4);

    const e = await CustoDoPreparado.eficienciaDaCorrida(storeId, corrida.id);
    expect(e.eficiencia).toBeCloseTo(100, 4);
    expect(e.preparado).toBe("Molho");
    expect(e.rendimentoDaReceita).toBe(4);
  });

  it("13 · render menos encarece o produto, e a eficiência mostra isso", async () => {
    const r = await receitaDoMolho();
    const corrida = await produzir(r.id, 4, 3.6);

    const e = await CustoDoPreparado.eficienciaDaCorrida(storeId, corrida.id);
    expect(e.eficiencia).toBeCloseTo(90, 4);
    expect(Number(e.custoUnitario)).toBeGreaterThan(10.4);
  });

  it("14 · panela dupla não vira 200% de eficiência", async () => {
    const r = await receitaDoMolho();
    const corrida = await produzir(r.id, 8, 8);

    /*
     * O denominador é o PLANEJADO, não o rendimento da receita. Comparar 8 kg
     * produzidos com os 4 kg que a receita rende daria 200% numa corrida
     * perfeitamente normal.
     */
    const e = await CustoDoPreparado.eficienciaDaCorrida(storeId, corrida.id);
    expect(e.eficiencia).toBeCloseTo(100, 4);
    expect(e.rendimentoDaReceita).toBe(4);
    expect(e.planejado).toBe(8);
  });
});

describe("rentabilidade por produto", () => {
  async function categoria() {
    return (
      await prisma.category.create({
        data: {
          storeId,
          name: "Cardápio",
          slug: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind: "SIMPLE",
        },
      })
    ).id;
  }

  /** Produto de cardápio ligado ao tomate, que custa R$ 8/kg. */
  async function produtoLigado(nome: string, categoriaId: string, preco: number) {
    return prisma.product.create({
      data: {
        storeId,
        categoryId: categoriaId,
        name: nome,
        slug: `${nome.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`,
        description: "",
        basePrice: preco,
        inventoryItemId: tomateId,
      },
    });
  }

  /**
   * Um pedido concluído de três linhas, com UM consumo de R$ 20 atribuído a ele.
   *
   * 2,5 kg de tomate a R$ 8. As linhas somam R$ 100 — 30, 30 e 40 —, que é o
   * que torna o rateio verificável.
   */
  async function pedidoDeTresLinhas(
    linhas: Array<{ produtoId: string | null; nome: string; preco: number }>,
  ) {
    const pedido = await prisma.order.create({
      data: {
        storeId,
        number: 1,
        customerName: "C",
        customerPhone: "1",
        paymentMethod: "PIX",
        subtotal: 100,
        total: 100,
        status: "COMPLETED",
        items: {
          create: linhas.map((l) => ({
            productId: l.produtoId,
            productNameSnapshot: l.nome,
            unitPrice: l.preco,
            quantity: 1,
          })),
        },
      },
    });

    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#ORDER#${pedido.id}#CONSUMPTION#${tomateId}`,
      itemId: tomateId,
      type: "CONSUMPTION",
      quantity: -2.5,
      unitId: unitKg,
      reference: pedido.id,
      referenceType: "ORDER",
      permitirSaldoNegativo: true,
    } as any);

    return pedido;
  }

  it("15 · o custo do pedido é contado UMA vez, não uma por linha", async () => {
    /*
     * Antes, `calculateOrderCost` era chamado DENTRO do laço de itens: um
     * pedido de três linhas somava R$ 20 três vezes, R$ 60 no total, e a
     * margem saía negativa sem nada estar errado na cozinha.
     *
     * Os três produtos estão VIVOS e vinculados ao tomate, então o pedido apura
     * por inteiro e o rateio interno da rentabilidade continua valendo.
     */
    const cat = await categoria();
    const a = await produtoLigado("A", cat, 30);
    const b = await produtoLigado("B", cat, 30);
    const c = await produtoLigado("C", cat, 40);

    await pedidoDeTresLinhas([
      { produtoId: a.id, nome: "A", preco: 30 },
      { produtoId: b.id, nome: "B", preco: 30 },
      { produtoId: c.id, nome: "C", preco: 40 },
    ]);

    const rentabilidade = await InventoryCostService.getProductProfitability(storeId, 30);
    const somaDosCustos = rentabilidade.reduce((s, p) => s + Number(p.totalCost), 0);

    expect(somaDosCustos).toBeCloseTo(20, 2);
    expect(somaDosCustos).not.toBeCloseTo(60, 2);

    // E o rateio segue o valor de venda: 30/30/40 sobre 100.
    const porNome = Object.fromEntries(
      rentabilidade.map((p) => [p.productName, Number(p.totalCost)]),
    );
    expect(porNome["A"]).toBeCloseTo(6, 2);
    expect(porNome["C"]).toBeCloseTo(8, 2);
  });

  it("16 · com produtos APAGADOS, não há atribuição arbitrária", async () => {
    /*
     * A TRAVA DO PRODUTO ÓRFÃO, no relatório por produto.
     *
     * Apagar o produto do cardápio é exclusão de verdade: `productId` vira nulo
     * e a ficha técnica cai em cascata. Com TRÊS linhas nesse estado e um único
     * consumo, não há como saber qual delas gastou — e escolher por preço,
     * quantidade ou posição seria inventar a resposta.
     *
     * O rateio do cenário 15 NÃO se aplica aqui. Lá os três produtos existem e
     * declaram vínculo com o estoque; aqui essa declaração foi apagada, e o que
     * sobra é uma prova de que ALGUÉM gastou, sem dizer quem. Nenhuma linha é
     * reconhecida, e o ranking fica vazio: é melhor perder cobertura do que
     * fabricar margem.
     *
     * A recuperação de UMA órfã, que é o caso em que a prova basta, está em
     * `cmv-da-venda.test.ts`.
     */
    const cat = await categoria();
    const a = await produtoLigado("A", cat, 30);
    const b = await produtoLigado("B", cat, 30);
    const c = await produtoLigado("C", cat, 40);

    const pedido = await pedidoDeTresLinhas([
      { produtoId: a.id, nome: "A", preco: 30 },
      { produtoId: b.id, nome: "B", preco: 30 },
      { produtoId: c.id, nome: "C", preco: 40 },
    ]);

    for (const p of [a, b, c]) {
      await prisma.product.delete({ where: { id: p.id } });
    }

    // A cascata levou os dois sinais de vínculo de cada linha.
    const itens = await prisma.orderItem.findMany({ where: { orderId: pedido.id } });
    expect(itens).toHaveLength(3);
    for (const item of itens) {
      expect(item.productId).toBeNull();
      expect(item.compositionVersionId).toBeNull();
    }

    const rentabilidade = await InventoryCostService.getProductProfitability(storeId, 30);
    expect(rentabilidade).toHaveLength(0);

    /*
     * Mas o CMV do pedido continua registrando o que de fato saiu do estoque.
     * A trava tira a receita da margem; ela não apaga o custo do relatório.
     */
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const relatorio = await InventoryCostService.getCostReport(storeId, ontem, amanha);
    expect(Number(relatorio.summary.totalCost)).toBeCloseTo(20, 2);
  });
});
