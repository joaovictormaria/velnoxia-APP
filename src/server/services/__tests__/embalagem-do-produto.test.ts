import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { getStarterCatalog } from "@/server/catalog/starter-catalogs";

/*
 * A EMBALAGEM DE PONTA A PONTA, e a loja nova sem cardápio fictício.
 *
 * O que este arquivo prova é que a embalagem NÃO TEM MOTOR PRÓPRIO: ela entra no
 * mesmo acumulador dos insumos, e por isso herda reserva, consumo, custo
 * congelado e reversão sem uma linha de código nova em nenhum desses caminhos.
 * Se algum dia alguém criar um segundo caminho para ela, estes testes continuam
 * passando e os de `motor-por-tipo-de-produto` também — mas o consumo real,
 * medido aqui pelos MOVIMENTOS, deixaria de bater.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";
let categoriaId = "";

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
  storeId = (
    await prisma.store.create({ data: { slug: `emb-${Date.now()}`, name: "Pizzaria" } })
  ).id;
  categoriaId = (
    await prisma.category.create({
      data: { storeId, name: "Pizzas", slug: "pizzas", icon: "🍕", kind: "SIMPLE" },
    })
  ).id;
});
afterAll(limparBanco);

async function item(name: string, itemType: string, quantidade = 100) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name, baseUnitId: "unit_un", itemType } as any,
    { quantidade, precoDaEmbalagem: 20 },
  );
}

async function produto(nome: string, dados: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoriaId,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2)}`,
      description: nome,
      basePrice: 40,
      ...dados,
    },
  });
}

/** Um pedido real, criado pelo mesmo caminho que o checkout usa. */
async function pedidoCom(productId: string, quantity: number) {
  const order = await prisma.order.create({
    data: {
      storeId,
      number: Math.floor(Math.random() * 1000000),
      customerName: "Cliente",
      customerPhone: "11999999999",
      paymentMethod: "PIX",
      subtotal: 40,
      total: 40,
      items: {
        create: [
          { productId, productNameSnapshot: "Item", unitPrice: 40, quantity },
        ],
      },
    },
  });
  await prisma.$transaction((tx) =>
    OrderInventoryHandler.reservarNaCriacao(tx, order.id, storeId),
  );
  return order;
}

const movimentos = (itemId: string, type: string) =>
  prisma.inventoryMovement.findMany({ where: { storeId, itemId, type: type as any } });

const saldo = async (id: string) =>
  Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantityOnHand);

describe("a embalagem no pedido de verdade", () => {
  it("a venda RESERVA a embalagem junto com o produto", async () => {
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

    await pedidoCom(p.id, 3);

    expect(await movimentos(copo.id, "RESERVATION")).toHaveLength(1);
    const item_ = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: copo.id } });
    expect(Number(item_.quantityReserved)).toBe(3);
  });

  it("o preparo CONSOME a embalagem, com custo congelado", async () => {
    const massa = await item("Massa", "INGREDIENT");
    const caixa = await item("Caixa de pizza 35cm", "PACKAGING");
    const p = await produto("Pizza Calabresa", { tipoDeControle: "PRODUCAO" });
    await prisma.productComposition.create({
      data: {
        storeId,
        productId: p.id,
        version: 1,
        isActive: true,
        items: {
          create: [
            { inventoryItemId: massa.id, quantity: 1, unitId: "unit_un", sortOrder: 0 },
          ],
        },
      },
    });
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: caixa.id,
        quantity: 1,
        unitId: "unit_un",
      },
    });

    const order = await pedidoCom(p.id, 2);
    await OrderInventoryHandler.onOrderPreparing(order.id);

    const consumos = await movimentos(caixa.id, "CONSUMPTION");
    expect(consumos).toHaveLength(1);
    expect(Number(consumos[0].quantity)).toBe(-2);
    /*
     * O custo viaja congelado, como em qualquer insumo. É o que faz a caixa
     * entrar no CMV: `InventoryCostService` soma CONSUMPTION por `costAtTime`,
     * e uma caixa sem custo ficaria de fora da conta em silêncio.
     */
    expect(consumos[0].costAtTime).not.toBeNull();
    expect(await saldo(caixa.id)).toBe(98);
  });

  /*
   * A DECISÃO DO JOÃO, medida no saldo e não só na lista: "não controlar" é não
   * descer o PRODUTO. A sacola sai da prateleira do mesmo jeito.
   */
  it("NAO_CONTROLA consome a embalagem e não consome o produto", async () => {
    /*
     * O cenário completo, com TUDO que poderia ser baixado presente ao mesmo
     * tempo: um item vinculado, uma ficha ativa com ingrediente, e uma
     * embalagem. Só a embalagem pode descer.
     *
     * O vínculo e a ficha existem no banco de propósito: eles são exatamente o
     * que o motor usaria se lesse o produto pela dedução antiga em vez da
     * declaração do dono. Se algum dia alguém reintroduzir a dedução, este
     * teste quebra por saldo — que é o lugar certo para quebrar.
     */
    const coca = await item("Coca lata", "RESALE");
    const farinha = await item("Farinha", "INGREDIENT");
    const sacola = await item("Sacola", "PACKAGING");
    const p = await produto("Cortesia", {
      tipoDeControle: "NAO_CONTROLA",
      inventoryItemId: coca.id,
    });
    await prisma.productComposition.create({
      data: {
        storeId,
        productId: p.id,
        version: 1,
        isActive: true,
        items: {
          create: [
            { inventoryItemId: farinha.id, quantity: 1, unitId: "unit_un", sortOrder: 0 },
          ],
        },
      },
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

    const order = await pedidoCom(p.id, 5);
    await OrderInventoryHandler.onOrderPreparing(order.id);

    // 1 · o PRODUTO não desce: nem o item vinculado, nem o ingrediente da ficha
    expect(await saldo(coca.id)).toBe(100);
    expect(await saldo(farinha.id)).toBe(100);
    expect(await movimentos(coca.id, "CONSUMPTION")).toHaveLength(0);
    expect(await movimentos(farinha.id, "CONSUMPTION")).toHaveLength(0);
    expect(await movimentos(coca.id, "RESERVATION")).toHaveLength(0);
    expect(await movimentos(farinha.id, "RESERVATION")).toHaveLength(0);

    // 2 · a EMBALAGEM desce, e é a única
    expect(await saldo(sacola.id)).toBe(95);

    // 3 · o movimento é do tipo certo, na quantidade certa, na unidade certa
    const consumos = await movimentos(sacola.id, "CONSUMPTION");
    expect(consumos).toHaveLength(1);
    expect(consumos[0].type).toBe("CONSUMPTION");
    expect(Number(consumos[0].quantity)).toBe(-5);
    expect(consumos[0].unitId).toBe("unit_un");
    expect(consumos[0].referenceType).toBe("ORDER");
    expect(consumos[0].reference).toBe(order.id);

    /*
     * 4 · o CUSTO congelado é o do item no momento da baixa. Sem ele a
     * embalagem sairia do CMV em silêncio: `InventoryCostService` soma
     * CONSUMPTION por `costAtTime`, e um nulo simplesmente não entra na conta.
     */
    const item_ = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: sacola.id },
    });
    expect(consumos[0].costAtTime).not.toBeNull();
    expect(Number(consumos[0].costAtTime)).toBe(Number(item_.cost));

    // 5 · nenhum outro item do estoque foi tocado por este pedido
    const todos = await prisma.inventoryMovement.findMany({
      where: { storeId, reference: order.id },
      select: { itemId: true },
    });
    expect(new Set(todos.map((m) => m.itemId))).toEqual(new Set([sacola.id]));
  });

  /*
   * O cancelamento depois do preparo vira o par REVERSAL + LOSS: o saldo não
   * sobe (a caixa foi usada de verdade) mas o custo sai do CMV e entra em
   * perdas. A embalagem herda isso sem uma linha nova.
   */
  it("o cancelamento após o preparo transforma a embalagem em perda", async () => {
    const caixa = await item("Caixa", "PACKAGING");
    const p = await produto("Pizza", { tipoDeControle: "NAO_CONTROLA" });
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: caixa.id,
        quantity: 1,
        unitId: "unit_un",
      },
    });

    const order = await pedidoCom(p.id, 2);
    await OrderInventoryHandler.onOrderPreparing(order.id);
    await OrderInventoryHandler.onOrderCancelled(order.id);

    expect(await movimentos(caixa.id, "LOSS")).toHaveLength(1);
    // Soma zero: o REVERSAL devolve, o LOSS tira de novo com o nome certo.
    expect(await saldo(caixa.id)).toBe(98);
  });

  it("quantidade maior que 1 por unidade vendida é respeitada", async () => {
    const guardanapo = await item("Guardanapo", "PACKAGING");
    const p = await produto("Lanche", { tipoDeControle: "NAO_CONTROLA" });
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: guardanapo.id,
        quantity: 2,
        unitId: "unit_un",
      },
    });

    const order = await pedidoCom(p.id, 3);
    await OrderInventoryHandler.onOrderPreparing(order.id);

    expect(await saldo(guardanapo.id)).toBe(94);
  });
});

describe("as travas da tabela de embalagem", () => {
  /*
   * Duas caixas do mesmo tipo são `quantity = 2`, não duas linhas. Sem o unique,
   * a soma do motor dependeria de quantas vezes alguém clicou em adicionar.
   */
  it("não aceita duas linhas do mesmo par produto+item", async () => {
    const caixa = await item("Caixa", "PACKAGING");
    const p = await produto("Pizza");
    const dados = {
      storeId,
      productId: p.id,
      inventoryItemId: caixa.id,
      quantity: 1,
      unitId: "unit_un",
    };
    await prisma.productPackaging.create({ data: dados });
    await expect(prisma.productPackaging.create({ data: dados })).rejects.toThrow();
  });

  /*
   * `Restrict`, e não `SetNull`: apagar uma embalagem em uso é RECUSADO. É o
   * oposto deliberado do que o vínculo direto fazia até esta fase, quando
   * apagar o item removia o vínculo em silêncio e deixava o produto ativo sem
   * origem.
   */
  it("recusa apagar um item que é embalagem de algum produto", async () => {
    const caixa = await item("Caixa", "PACKAGING");
    const p = await produto("Pizza");
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: caixa.id,
        quantity: 1,
        unitId: "unit_un",
      },
    });
    await expect(
      prisma.inventoryItem.delete({ where: { id: caixa.id } }),
    ).rejects.toThrow();
  });

  it("apagar o produto leva a embalagem dele junto", async () => {
    const caixa = await item("Caixa", "PACKAGING");
    const p = await produto("Pizza");
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: caixa.id,
        quantity: 1,
        unitId: "unit_un",
      },
    });

    await prisma.product.delete({ where: { id: p.id } });

    expect(await prisma.productPackaging.count({ where: { storeId } })).toBe(0);
  });
});

describe("o vínculo de estoque agora é Restrict", () => {
  /*
   * O furo que esta fase fecha: apagar o item de estoque APAGAVA o vínculo de
   * todo produto que apontava para ele, sem erro e sem passar por guarda
   * nenhuma. Um produto de REVENDA ativo virava um produto ativo sem origem.
   */
  it("recusa apagar um item vinculado a um produto", async () => {
    const coca = await item("Coca lata", "RESALE");
    await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });
    await expect(
      prisma.inventoryItem.delete({ where: { id: coca.id } }),
    ).rejects.toThrow();
  });
});

describe("a loja nova não vem com cardápio fictício", () => {
  /*
   * O catálogo é esvaziado NO PONTO DE USO: os cardápios de referência
   * continuam no repositório, intactos. Reverter esta decisão é apagar uma
   * função, não reescrever 161 produtos a partir do histórico.
   */
  it("todo ramo entrega categorias e nenhum produto", () => {
    for (const ramo of ["pizzaria", "hamburgueria", "bar", "cafeteria", "japones"]) {
      const c = getStarterCatalog(ramo);
      expect(c.categories.length).toBeGreaterThan(0);
      expect(c.categories.every((cat) => cat.products.length === 0)).toBe(true);
      expect(c.extras).toHaveLength(0);
      expect(c.promotions).toHaveLength(0);
    }
  });

  /*
   * A ESTRUTURA FICA, e cada peça por um motivo: `tagline` e `description` vão
   * para StoreSettings e aparecem na vitrine; os tamanhos são da CATEGORIA, e é
   * o que faz meia a meia casar "Grande" com "Grande" entre dois sabores.
   */
  it("preserva tagline, description e os tamanhos das categorias", () => {
    const c = getStarterCatalog("pizzaria");
    expect(c.tagline).toBeTruthy();
    expect(c.description).toBeTruthy();
    expect(c.categories.some((cat) => (cat.sizes?.length ?? 0) > 0)).toBe(true);
  });

  /*
   * As chaves são o enum `businessType` de dois validadores Zod e de dois
   * seletores. Removê-las quebraria o cadastro e a troca de ramo.
   */
  it("um ramo desconhecido continua caindo no padrão", () => {
    expect(getStarterCatalog("ramo-que-nao-existe").label).toBe(
      getStarterCatalog("pizzaria").label,
    );
  });
});

describe("as unidades da embalagem", () => {
  /*
   * A EMBALAGEM USA A MESMA CONVERSÃO DOS INGREDIENTES, e estes testes existem
   * para que continue assim. Uma segunda fórmula de conversão só para embalagem
   * seria a forma mais silenciosa de errar: as quantidades batem em unidades
   * inteiras e divergem exatamente onde ninguém confere.
   */
  beforeEach(async () => {
    await semear("20260827000000_semear_conversoes_de_unidade");
  });

  it("a conversão cadastrada é aplicada, e o movimento sai na unidade base", async () => {
    /*
     * Detergente para a embalagem retornável, contado em LITROS; a configuração
     * pede 150 ml por pedido. É o caso que separa a embalagem certa da errada:
     * gravar 150 no saldo de um item contado em litros esvaziaria o estoque
     * inteiro numa venda.
     */
    const detergente = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Detergente", baseUnitId: "unit_l", itemType: "PACKAGING" } as any,
      { quantidade: 10, precoDaEmbalagem: 50 },
    );
    const p = await produto("Marmita", { tipoDeControle: "NAO_CONTROLA" });
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: detergente.id,
        quantity: 150,
        unitId: "unit_ml",
      },
    });

    const order = await pedidoCom(p.id, 4);
    await OrderInventoryHandler.onOrderPreparing(order.id);

    const consumos = await movimentos(detergente.id, "CONSUMPTION");
    expect(consumos).toHaveLength(1);
    // 150 ml × 4 = 600 ml = 0,6 L — e o movimento é gravado em LITROS.
    expect(Number(consumos[0].quantity)).toBeCloseTo(-0.6, 4);
    expect(consumos[0].unitId).toBe("unit_l");
    expect(await saldo(detergente.id)).toBeCloseTo(9.4, 4);
  });

  it("mesma unidade não converte nada", async () => {
    const caixa = await item("Caixa", "PACKAGING");
    const p = await produto("Pizza", { tipoDeControle: "NAO_CONTROLA" });
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: caixa.id,
        quantity: 1,
        unitId: "unit_un",
      },
    });

    const order = await pedidoCom(p.id, 7);
    await OrderInventoryHandler.onOrderPreparing(order.id);

    expect(Number((await movimentos(caixa.id, "CONSUMPTION"))[0].quantity)).toBe(-7);
  });

  /*
   * A UNIDADE INCOMPATÍVEL É RECUSADA AO SALVAR, não na venda.
   *
   * `converterParaUnidadeBase` LANÇA quando não acha conversão nem
   * `contentSize`, e ela roda dentro de `insumosDoPedido`, que roda dentro da
   * transação que cria o pedido. Sem esta recusa, uma embalagem gravada em
   * gramas contra um item contado em unidades derrubaria o CHECKOUT do produto —
   * e o dono não teria como ligar uma coisa à outra, porque salvou a embalagem
   * dias antes, sem erro nenhum.
   */
  it("recusa AO SALVAR uma unidade sem caminho até a unidade base", async () => {
    const caixa = await item("Caixa", "PACKAGING");
    await expect(
      salvarUnidadeCrua(caixa.id, "unit_g"),
    ).rejects.toThrow(/converter/i);
  });

  it("a mesma configuração passa quando a unidade é a do item", async () => {
    const caixa = await item("Caixa", "PACKAGING");
    await expect(salvarUnidadeCrua(caixa.id, "unit_un")).resolves.toBeTruthy();
  });
});

/**
 * Chama a mesma validação da server function, sem a casca HTTP.
 *
 * `createServerFn` do TanStack precisa de AsyncLocalStorage e não é chamável do
 * vitest — por isso o corpo da regra é reproduzido aqui contra o mesmo par de
 * funções puras que o handler usa. É o que permite testar a recusa sem simular
 * uma sessão inteira.
 */
async function salvarUnidadeCrua(inventoryItemId: string, unitId: string) {
  const { converterParaUnidadeBase, montarMapaDeConversoes } = await import(
    "@/lib/conversao-de-unidade"
  );
  const item = await prisma.inventoryItem.findUniqueOrThrow({
    where: { id: inventoryItemId },
    select: { baseUnitId: true, contentSize: true, contentUnit: true },
  });
  const conversoes = montarMapaDeConversoes(
    await prisma.inventoryUnitConversion.findMany({
      select: { fromUnitId: true, toUnitId: true, conversionFactor: true },
    }),
  );
  try {
    converterParaUnidadeBase(1, unitId, item, conversoes);
  } catch {
    throw new Error("Não dá para converter esta unidade.");
  }
  return true;
}
