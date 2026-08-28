import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { InventoryCostService } from "@/server/services/inventory-cost-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { ProducaoService } from "@/server/services/producao-service";
import { transitionOrderStatus } from "@/server/services/order-service";

/*
 * O QUE ENTRA NO CUSTO DA MERCADORIA VENDIDA.
 *
 * O defeito mais caro do relatório antigo: `getCostReport` varria TODO movimento
 * de consumo do período e agrupava por `reference` — e o sistema é de dois
 * níveis.
 *
 * Produzir molho consome tomate. Vender pizza consome molho, e o custo do molho
 * JÁ EMBUTE o tomate. Somar os dois cobra o mesmo dinheiro duas vezes, e ainda
 * fazia cada corrida de produção virar uma linha de "pedido", porque numa
 * produção o `reference` é o id da corrida.
 *
 * A correção é ESTRUTURAL: o relatório passou a partir dos pedidos válidos e a
 * buscar os movimentos por `pedido.id`. Os filtros `referenceType` e
 * `reversedBy` são defesas adicionais sobre isso — os cenários 10 e 11 existem
 * só para trancá-las.
 *
 * O segundo assunto aqui é a AUSÊNCIA de custo. Produto sem vínculo de estoque
 * chegava como custo zero e a tela anunciava margem de 100%: ausência de dado
 * virava lucro. Agora vira classificação.
 */

let storeId = "";
let unitKg = "";
let categoriaId = "";
let tomateId = "";
let molhoId = "";
let numero = 1;

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  await limparBanco();
  numero = 1;

  storeId = (await prisma.store.create({
    data: { slug: `cmv-${Date.now()}`, name: "Cozinha" },
  })).id;
  unitKg = (await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  })).id;
  categoriaId = (await prisma.category.create({
    data: { storeId, name: "Pizzas", slug: `pz-${Date.now()}`, kind: "SIMPLE" },
  })).id;

  tomateId = (await prisma.inventoryItem.create({
    data: {
      storeId, name: "Tomate", itemType: "INGREDIENT",
      baseUnitId: unitKg, quantityOnHand: 100, cost: 8,
    },
  })).id;
  molhoId = (await prisma.inventoryItem.create({
    data: {
      storeId, name: "Molho", itemType: "PREPARED",
      baseUnitId: unitKg, quantityOnHand: 0, cost: null,
    },
  })).id;

  // 5,2 kg de tomate rendem 4 kg de molho.
  await prisma.productComposition.create({
    data: {
      storeId, inventoryItemId: molhoId, version: 1,
      yieldQuantity: 4, yieldUnitId: unitKg,
      items: { create: [{ inventoryItemId: tomateId, quantity: 5.2, unitId: unitKg }] },
    },
  });
});
afterAll(limparBanco);

async function produzirMolho(quantidade = 4) {
  const receita = await prisma.productComposition.findFirstOrThrow({
    where: { inventoryItemId: molhoId, isActive: true },
  });
  return ProducaoService.produzir(storeId, {
    compositionId: receita.id,
    plannedQuantity: quantidade,
    producedQuantity: quantidade,
    runToken: `p-${Date.now()}-${Math.random()}`,
  } as any);
}

async function produto(nome: string, inventoryItemId?: string) {
  return prisma.product.create({
    data: {
      storeId, categoryId: categoriaId, name: nome,
      slug: `${nome.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`,
      description: "", basePrice: 50,
      ...(inventoryItemId ? { inventoryItemId } : {}),
    },
  });
}

async function pedidoConcluido(linhas: Array<{ produtoId: string | null; preco: number }>) {
  const total = linhas.reduce((s, l) => s + l.preco, 0);
  const p = await prisma.order.create({
    data: {
      storeId, number: numero++, customerName: "C", customerPhone: "11999999999",
      paymentMethod: "PIX", subtotal: total, total,
      items: {
        create: linhas.map((l) => ({
          productId: l.produtoId,
          productNameSnapshot: "Item",
          unitPrice: l.preco,
          quantity: 1,
        })),
      },
    },
  });
  await OrderInventoryHandler.onOrderReceived(p.id);
  await transitionOrderStatus(storeId, p.id, "PREPARING", { authorType: "SYSTEM" } as any);
  await OrderInventoryHandler.syncOrderStatus(p.id, "PREPARING");
  await transitionOrderStatus(storeId, p.id, "COMPLETED", { authorType: "SYSTEM" } as any);
  return p;
}

const kpis = () => InventoryCostService.getFinancialKPIs(storeId, 90);

describe("a produção não entra no CMV da venda", () => {
  it("01 · o consumo de produção existe, mas é de outro tipo de referência", async () => {
    await produzirMolho(4);

    const daProducao = await prisma.inventoryMovement.findMany({
      where: { storeId, type: "CONSUMPTION", itemId: tomateId },
    });
    expect(daProducao.length).toBeGreaterThan(0);
    expect(daProducao[0].referenceType).toBe("PRODUCTION_RUN");
  });

  it("02 · produzir sem vender não gera CMV nenhum", async () => {
    /*
     * Produzir é mover estoque de um nível para outro, não vender. Antes esta
     * corrida aparecia no relatório como um "pedido" com custo — e o
     * `totalOrders` subia, distorcendo o custo médio por pedido.
     */
    await produzirMolho(4);

    const k = await kpis();
    expect(k.totalCost).toBe(0);
    expect(k.totalOrders).toBe(0);
  });

  it("03 · vender o preparado cobra o molho UMA vez, não molho + tomate", async () => {
    /*
     * A DUPLA CONTAGEM QUE ESTE TESTE IMPEDE.
     *
     * 5,2 kg de tomate a R$ 8 = R$ 41,60 para render 4 kg de molho, ou seja
     * R$ 10,40/kg. A pizza leva 0,2 kg de molho: custo R$ 2,08.
     *
     * Sem o filtro `referenceType`, o CMV somaria também os R$ 41,60 do tomate
     * — o mesmo dinheiro cobrado duas vezes, uma como ingrediente e outra
     * dentro do preparado feito com ele.
     */
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);

    // A pizza consome 1 unidade do molho (vínculo direto, sem ficha).
    await pedidoConcluido([{ produtoId: pizza.id, preco: 50 }]);

    const k = await kpis();
    expect(k.totalSalesValue).toBeCloseTo(50, 4);
    // Uma unidade de molho a R$ 10,40. Longe dos R$ 41,60 do tomate.
    expect(k.totalCost).toBeCloseTo(10.4, 2);
    expect(k.totalCost).toBeLessThan(41.6);
  });
});

describe("venda com custo apurado", () => {
  it("04 · PREPARING → COMPLETED gera receita e CMV", async () => {
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);
    await pedidoConcluido([{ produtoId: pizza.id, preco: 50 }]);

    const k = await kpis();
    expect(k.totalSalesValue).toBeCloseTo(50, 4);
    expect(k.totalCost).toBeGreaterThan(0);
    expect(k.pedidosApurados).toBe(1);
    expect(k.cobertura).toBeCloseTo(100, 4);
    expect(k.margemApurada).not.toBeNull();
  });
});

describe("ausência de custo não é lucro", () => {
  it("05 · produto sem vínculo NÃO produz margem de 100%", async () => {
    /*
     * O DEFEITO ORIGINAL. Sem vínculo não há consumo, o custo chegava como
     * zero, e a tela anunciava lucro integral sobre uma venda que ninguém
     * mediu. Agora o pedido é classificado como SEM_VINCULO e fica fora da
     * margem — a cobertura cai a zero e a margem não existe.
     */
    const refrigerante = await produto("Refrigerante");
    await pedidoConcluido([{ produtoId: refrigerante.id, preco: 50 }]);

    const k = await kpis();
    expect(k.totalSalesValue).toBeCloseTo(50, 4);
    expect(k.pedidosSemVinculo).toBe(1);
    expect(k.pedidosApurados).toBe(0);
    expect(k.cobertura).toBe(0);
    expect(k.margemApurada).toBeNull();
    expect(k.profitMargin).not.toBe(100);
  });

  it("06 · produto sem vínculo não aparece no ranking de rentabilidade", async () => {
    // Aparecer ali com 100% o colocaria em primeiro lugar por não ter sido medido.
    const refrigerante = await produto("Refrigerante");
    await pedidoConcluido([{ produtoId: refrigerante.id, preco: 50 }]);

    const ranking = await InventoryCostService.getProductProfitability(storeId, 90);
    expect(ranking).toHaveLength(0);
  });

  it("07 · vinculado mas com custo desconhecido é SEM_CUSTO", async () => {
    /*
     * O molho existe e é consumido, mas nunca teve custo cadastrado: o
     * `costAtTime` do consumo nasce nulo. Isso não é custo zero — é custo que
     * não se sabe, e dizer zero devolveria a margem de 100% pela porta dos
     * fundos.
     */
    await prisma.inventoryItem.update({
      where: { id: molhoId },
      data: { quantityOnHand: 10, cost: null },
    });
    const pizza = await produto("Pizza", molhoId);
    await pedidoConcluido([{ produtoId: pizza.id, preco: 50 }]);

    const k = await kpis();
    expect(k.pedidosSemCusto).toBe(1);
    expect(k.pedidosApurados).toBe(0);
    expect(k.margemApurada).toBeNull();
  });

  it("08 · pedido MISTO apura a linha medida e deixa a outra de fora", async () => {
    /*
     * A REGRA, NO NÍVEL DA LINHA.
     *
     * Uma pizza vinculada ao estoque e um refrigerante que não desce até ele.
     * A pizza FOI medida: seu custo é real e sua receita entra na margem. O
     * refrigerante fica de fora, e a cobertura registra o tamanho do que ficou.
     *
     * Descartar o pedido inteiro — como a versão anterior fazia — jogaria fora
     * custo apurado por causa de uma linha de R$ 40.
     */
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);
    const refrigerante = await produto("Refrigerante");

    await pedidoConcluido([
      { produtoId: pizza.id, preco: 50 },
      { produtoId: refrigerante.id, preco: 40 },
    ]);

    const k = await kpis();
    expect(k.totalSalesValue).toBeCloseTo(90, 4);
    expect(k.pedidosParciais).toBe(1);
    expect(k.receitaApurada).toBeCloseTo(50, 4);
    expect(k.custoApurado).toBeGreaterThan(0);
    expect(k.margemApurada).not.toBeNull();
    expect(k.cobertura).toBeCloseTo(55.5556, 3); // 50 de 90
  });

  it("09 · cobertura mistura apurado e não apurado sem contaminar a margem", async () => {
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);
    const refrigerante = await produto("Refrigerante");

    await pedidoConcluido([{ produtoId: pizza.id, preco: 50 }]);   // apurado
    await pedidoConcluido([{ produtoId: refrigerante.id, preco: 150 }]); // sem vínculo

    const k = await kpis();
    expect(k.totalSalesValue).toBeCloseTo(200, 4);
    expect(k.receitaApurada).toBeCloseTo(50, 4);
    expect(k.cobertura).toBeCloseTo(25, 4); // 50 de 200

    /*
     * A margem é medida SOBRE OS 50, não sobre os 200. Diluir o lucro conhecido
     * pela receita inteira faria o número piorar sozinho conforme o cadastro
     * ficasse incompleto, sem que nada mudasse no negócio.
     */
    const margemEsperada = ((50 - k.custoApurado) / 50) * 100;
    expect(k.margemApurada).toBeCloseTo(margemEsperada, 4);
  });
});

describe("as defesas redundantes do filtro de CMV", () => {
  /*
   * O QUE ESTES DOIS TESTES SÃO, E O QUE NÃO SÃO.
   *
   * A correção que acabou com a dupla contagem foi ESTRUTURAL: o relatório
   * parte dos pedidos válidos e busca os movimentos por `pedido.id`. Um
   * movimento de produção tem `reference = runId`, que nunca é id de pedido —
   * então ele some sozinho, sem precisar de filtro nenhum.
   *
   * `referenceType` e `reversedBy` são cinto e suspensório sobre isso. Os dois
   * cenários abaixo montam à mão estados que o sistema não produz sozinho, só
   * para que ninguém remova as duas cláusulas achando que são decorativas — e
   * para que um refator futuro que afrouxe o recorte por pedido não passe
   * despercebido.
   */

  it("10 · movimento de PRODUÇÃO carimbado com id de pedido não entra no CMV", async () => {
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);
    const p = await pedidoConcluido([{ produtoId: pizza.id, preco: 50 }]);

    const custoAntes = (await kpis()).totalCost;

    // Uma corrida de produção cujo `reference` colide com o pedido.
    await prisma.inventoryMovement.create({
      data: {
        storeId, itemId: tomateId, unitId: unitKg,
        idempotencyKey: `${storeId}#COLISAO#${p.id}`,
        type: "CONSUMPTION", quantity: -5.2, costAtTime: 8,
        reference: p.id, referenceType: "PRODUCTION_RUN",
      },
    });

    expect((await kpis()).totalCost).toBeCloseTo(custoAntes, 4);
  });

  it("11 · consumo revertido em pedido concluído não entra no CMV", async () => {
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);
    const p = await pedidoConcluido([{ produtoId: pizza.id, preco: 50 }]);

    expect((await kpis()).totalCost).toBeGreaterThan(0);

    const consumo = await prisma.inventoryMovement.findFirstOrThrow({
      where: { storeId, type: "CONSUMPTION", reference: p.id, referenceType: "ORDER" },
    });
    await prisma.inventoryMovement.create({
      data: {
        storeId, itemId: consumo.itemId, unitId: consumo.unitId,
        idempotencyKey: `${storeId}#REVERSAL#${consumo.id}`,
        type: "REVERSAL", quantity: Number(consumo.quantity) * -1,
        originalMovementId: consumo.id,
        reference: p.id, referenceType: "ORDER",
      },
    });

    expect((await kpis()).totalCost).toBe(0);
  });
});

describe("pedido misto: apuração parcial por linha", () => {
  /*
   * A REGRA QUE ESTES CENÁRIOS TRANCAM.
   *
   * Um pedido com uma linha medida e outra não NÃO é descartado. A linha medida
   * entra na margem; a outra fica de fora, e a cobertura diz o tamanho do que
   * ficou de fora.
   *
   * Descartar o pedido inteiro por causa de um refrigerante sem vínculo jogaria
   * fora custo real e afundaria a cobertura sem motivo.
   */

  it("12 · linha APURADA + linha SEM_VINCULO: o pedido não é descartado", async () => {
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);
    const refrigerante = await produto("Refrigerante");

    await pedidoConcluido([
      { produtoId: pizza.id, preco: 100 },
      { produtoId: refrigerante.id, preco: 20 },
    ]);

    const k = await kpis();
    expect(k.totalSalesValue).toBeCloseTo(120, 4);
    expect(k.receitaApurada).toBeCloseTo(100, 4); // só a pizza
    expect(k.pedidosParciais).toBe(1);
    expect(k.pedidosApurados).toBe(0);

    // O custo da pizza está lá — o pedido NÃO foi jogado fora.
    expect(k.custoApurado).toBeGreaterThan(0);
    expect(k.margemApurada).not.toBeNull();
    // Cobertura sobre a mercadoria: 100 de 120.
    expect(k.cobertura).toBeCloseTo(83.3333, 3);
  });

  it("13 · linha APURADA + linha SEM_CUSTO", async () => {
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);

    // Um segundo preparado, vinculado mas sem custo cadastrado.
    const trufa = await prisma.inventoryItem.create({
      data: {
        storeId, name: "Trufa", itemType: "PREPARED",
        baseUnitId: unitKg, quantityOnHand: 10, cost: null,
      },
    });
    const especial = await produto("Especial", trufa.id);

    await pedidoConcluido([
      { produtoId: pizza.id, preco: 100 },
      { produtoId: especial.id, preco: 60 },
    ]);

    const k = await kpis();
    expect(k.pedidosParciais).toBe(1);
    expect(k.receitaApurada).toBeCloseTo(100, 4);
    // A trufa não tem custo conhecido: não entra no CMV nem na receita apurada.
    expect(k.custoApurado).toBeCloseTo(10.4, 2);
  });

  it("14 · insumo COMPARTILHADO entre linha apurada e não apurada entra inteiro", async () => {
    /*
     * O CASO IMPOSSÍVEL DE DIVIDIR.
     *
     * Os dois produtos consomem molho. O razão gravou UM movimento, com as
     * quantidades já somadas — não há como saber quanto era de cada linha.
     * O molho entra INTEIRO contra a receita da linha apurada: o CMV fica maior
     * e a margem menor, que é o lado seguro do erro.
     */
    await produzirMolho(4);
    const trufa = await prisma.inventoryItem.create({
      data: {
        storeId, name: "Trufa", itemType: "PREPARED",
        baseUnitId: unitKg, quantityOnHand: 10, cost: null,
      },
    });

    // Uma pizza só de molho; outra de molho + trufa (sem custo), por ficha.
    const simples = await produto("Simples", molhoId);
    const dupla = await prisma.product.create({
      data: {
        storeId, categoryId: categoriaId, name: "Dupla",
        slug: `dupla-${Math.random().toString(36).slice(2, 7)}`,
        description: "", basePrice: 80,
      },
    });
    await prisma.productComposition.create({
      data: {
        storeId, productId: dupla.id, version: 1,
        items: {
          create: [
            { inventoryItemId: molhoId, quantity: 1, unitId: unitKg },
            { inventoryItemId: trufa.id, quantity: 1, unitId: unitKg },
          ],
        },
      },
    });

    await pedidoConcluido([
      { produtoId: simples.id, preco: 100 },
      { produtoId: dupla.id, preco: 80 },
    ]);

    const k = await kpis();
    expect(k.pedidosParciais).toBe(1);
    expect(k.receitaApurada).toBeCloseTo(100, 4);

    /*
     * Duas unidades de molho a R$ 10,40 saíram: uma para cada linha. O CMV
     * apurado tem de trazer as DUAS — R$ 20,80 — e não metade.
     */
    expect(k.custoApurado).toBeCloseTo(20.8, 2);
  });

  it("15 · não há rateio: o custo não é dividido por preço nem por linha", async () => {
    await produzirMolho(4);
    const trufa = await prisma.inventoryItem.create({
      data: {
        storeId, name: "Trufa", itemType: "PREPARED",
        baseUnitId: unitKg, quantityOnHand: 10, cost: null,
      },
    });
    const simples = await produto("Simples", molhoId);
    const dupla = await prisma.product.create({
      data: {
        storeId, categoryId: categoriaId, name: "Dupla",
        slug: `dupla-${Math.random().toString(36).slice(2, 7)}`,
        description: "", basePrice: 80,
      },
    });
    await prisma.productComposition.create({
      data: {
        storeId, productId: dupla.id, version: 1,
        items: {
          create: [
            { inventoryItemId: molhoId, quantity: 1, unitId: unitKg },
            { inventoryItemId: trufa.id, quantity: 1, unitId: unitKg },
          ],
        },
      },
    });

    await pedidoConcluido([
      { produtoId: simples.id, preco: 100 },
      { produtoId: dupla.id, preco: 80 },
    ]);

    const k = await kpis();
    const custoTotalDoMolho = 20.8;

    // Se houvesse rateio por preço seria ~11,56; por linha, 10,40.
    expect(k.custoApurado).not.toBeCloseTo(custoTotalDoMolho * (100 / 180), 2);
    expect(k.custoApurado).not.toBeCloseTo(custoTotalDoMolho / 2, 2);
    expect(k.custoApurado).toBeCloseTo(custoTotalDoMolho, 2);
  });

  it("16 · a apuração parcial fica visível no resultado", async () => {
    /*
     * Não basta calcular certo: a tela precisa poder dizer que o número cobre
     * parte da venda. `cobertura` e `pedidosParciais` existem para isso.
     */
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);
    const refrigerante = await produto("Refrigerante");

    await pedidoConcluido([
      { produtoId: pizza.id, preco: 100 },
      { produtoId: refrigerante.id, preco: 20 },
    ]);

    const k = await kpis();
    expect(k.cobertura).toBeGreaterThan(0);
    expect(k.cobertura).toBeLessThan(100);
    expect(k.pedidosParciais).toBe(1);
    expect(k.receitaApurada).toBeLessThan(k.totalSalesValue);
  });

  it("17 · pedido totalmente apurado continua com cobertura de 100%", async () => {
    // Não-regressão: a apuração parcial não pode contaminar o caso simples.
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);
    await pedidoConcluido([{ produtoId: pizza.id, preco: 100 }]);

    const k = await kpis();
    expect(k.pedidosApurados).toBe(1);
    expect(k.pedidosParciais).toBe(0);
    expect(k.cobertura).toBeCloseTo(100, 4);
  });
});

describe("produto apagado depois da venda", () => {
  /*
   * A EXCLUSÃO É DE VERDADE, E DESTRÓI OS DOIS SINAIS DE VÍNCULO.
   *
   * `prisma.product.delete()` — que é o que o botão do cardápio chama — leva
   * `OrderItem.productId` a nulo e apaga a ficha técnica em cascata, deixando
   * `compositionVersionId` nulo junto. Sem tratamento, toda venda passada
   * daquele produto sairia da margem, e a cobertura erodiria sozinha a cada
   * item removido do cardápio.
   *
   * Estes cenários apagam produto de verdade, para exercitar a cascata do banco
   * em vez de simulá-la.
   */

  it("18 · venda de produto apagado continua apurada", async () => {
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);
    const p = await pedidoConcluido([{ produtoId: pizza.id, preco: 50 }]);

    const antes = await kpis();
    expect(antes.pedidosApurados).toBe(1);

    await prisma.product.delete({ where: { id: pizza.id } });

    // A cascata realmente aconteceu?
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: p.id } });
    expect(item.productId).toBeNull();
    expect(item.compositionVersionId).toBeNull();

    const depois = await kpis();
    expect(depois.pedidosApurados).toBe(1);
    expect(depois.receitaApurada).toBeCloseTo(50, 4);
    expect(depois.custoApurado).toBeCloseTo(antes.custoApurado, 4);
    expect(depois.cobertura).toBeCloseTo(100, 4);
  });

  it("19 · produto apagado SEM consumo não é reconhecido", async () => {
    // Nunca desceu ao estoque: apagar não cria custo que não existia.
    const refrigerante = await produto("Refrigerante");
    await pedidoConcluido([{ produtoId: refrigerante.id, preco: 50 }]);
    await prisma.product.delete({ where: { id: refrigerante.id } });

    const k = await kpis();
    expect(k.pedidosSemVinculo).toBe(1);
    expect(k.receitaApurada).toBe(0);
    expect(k.margemApurada).toBeNull();
  });

  it("20 · DUAS linhas órfãs no mesmo pedido: nenhuma é reconhecida", async () => {
    /*
     * A TRAVA, contra o banco. Dois produtos apagados no mesmo pedido, um que
     * consumia molho e outro que nunca teve vínculo. Depois da exclusão as duas
     * linhas ficam idênticas, e não há como saber qual gastou.
     *
     * Reconhecer as duas inflaria a margem; escolher uma exigiria eleger por
     * preço, quantidade ou posição. O pedido perde a cobertura, e é esse o
     * preço aceito.
     */
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);
    const refrigerante = await produto("Refrigerante");

    await pedidoConcluido([
      { produtoId: pizza.id, preco: 50 },
      { produtoId: refrigerante.id, preco: 30 },
    ]);

    await prisma.product.delete({ where: { id: pizza.id } });
    await prisma.product.delete({ where: { id: refrigerante.id } });

    const k = await kpis();
    expect(k.totalSalesValue).toBeCloseTo(80, 4);
    expect(k.receitaApurada).toBe(0);
    expect(k.pedidosApurados).toBe(0);
    expect(k.margemApurada).toBeNull();
    // O CMV continua registrando o que de fato saiu do estoque.
    expect(k.totalCost).toBeGreaterThan(0);
  });

  it("21 · uma órfã ao lado de um produto vivo sem vínculo", async () => {
    /*
     * A linha do produto vivo não é órfã: o cadastro está lá e diz que ela
     * nunca desceu ao estoque. Continua havendo UMA órfã, então ela é
     * reconhecida.
     */
    await produzirMolho(4);
    const pizza = await produto("Pizza", molhoId);
    const refrigerante = await produto("Refrigerante");

    await pedidoConcluido([
      { produtoId: pizza.id, preco: 50 },
      { produtoId: refrigerante.id, preco: 30 },
    ]);
    await prisma.product.delete({ where: { id: pizza.id } });

    const k = await kpis();
    expect(k.receitaApurada).toBeCloseTo(50, 4);
    expect(k.pedidosParciais).toBe(1);
  });
});
