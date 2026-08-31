import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import {
  createOrderFromCheckout,
  precificarItens,
  type CheckoutInput,
} from "@/server/services/order-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { RecebimentosService } from "@/server/services/recebimentos-service";
import { listKanbanOrders } from "@/server/repositories/order-repository";
import { montarCardapioDoBalcao } from "@/server/services/cardapio-do-balcao";
import { aceitarComPagamentoEmAberto } from "@/server/services/aceitar-fiado";

/*
 * O BALCÃO — pedido presencial.
 *
 * O QUE ESTES TESTES EXISTEM PARA IMPEDIR: que o balcão vire um segundo
 * sistema. Cada asserção aqui compara o resultado com a INFRAESTRUTURA QUE JÁ
 * EXISTIA — o mesmo Kanban, o mesmo razão de estoque, a mesma lista de
 * pagamentos em aberto. Se alguém trocar a criação do pedido por um caminho
 * próprio, o pedido deixa de aparecer nessas estruturas e estes testes caem.
 *
 * ⚠️ LIMITE: as server functions não são chamadas aqui — elas exigem sessão, e
 * o projeto não tem infraestrutura para simulá-la. O que se exercita são as
 * funções que elas chamam, que é onde mora todo o comportamento.
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

async function criarLoja(prefixo: string) {
  const slug = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const loja = await prisma.store.create({ data: { slug, name: "Lanche" } });
  await prisma.storeSettings.create({
    data: { storeId: loja.id, whatsappNumber: "11999999999" },
  });
  return loja.id;
}

beforeEach(async () => {
  await limparBanco();
  const sql = readFileSync(
    resolve(__dirname, `../../../../prisma/migrations/${SEED_UNIDADES}/migration.sql`),
    "utf8",
  )
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);
  storeId = await criarLoja("balcao");
});
afterAll(limparBanco);

const AUTOR = { id: "adm-1", name: "Maria do Balcão", email: "maria@loja.com" };

function hojeLocal() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

async function criarCategoria(nome: string, loja = storeId) {
  return prisma.category.create({
    data: {
      storeId: loja,
      name: nome,
      slug: `${nome.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "SIMPLE",
    },
  });
}

async function criarProduto(
  nome: string,
  preco: number,
  categoriaId: string,
  loja = storeId,
  extra: Record<string, unknown> = {},
) {
  return prisma.product.create({
    data: {
      storeId: loja,
      categoryId: categoriaId,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`,
      description: nome,
      basePrice: preco,
      ...extra,
    },
  });
}

/**
 * O pedido do balcão, do jeito que `criarPedidoDeBalcaoFn` o monta: retirada,
 * `source: "ADMIN"` e o resto igual a qualquer venda.
 */
function pedidoDeBalcao(input: Partial<CheckoutInput> & Pick<CheckoutInput, "items">) {
  return createOrderFromCheckout(storeId, {
    customerName: "Cliente do Balcão",
    customerPhone: "",
    type: "PICKUP",
    paymentMethod: "CASH",
    source: "ADMIN",
    ...input,
  } as CheckoutInput);
}

// ---------------------------------------------------------------- cardápio

describe("balcão · cardápio", () => {
  it("01 · lista os produtos ativos da loja, agrupados pelas categorias existentes", async () => {
    const bebidas = await criarCategoria("Bebidas");
    const lanches = await criarCategoria("Lanches");
    await criarProduto("Coca-Cola", 6, bebidas.id);
    await criarProduto("X-Burger", 22, lanches.id);

    const cardapio = await montarCardapioDoBalcao(storeId);

    expect(cardapio.produtos.map((p) => p.name).sort()).toEqual(["Coca-Cola", "X-Burger"]);
    expect(cardapio.categorias.map((c) => c.name).sort()).toEqual(["Bebidas", "Lanches"]);
    // Cada produto sabe de que categoria é — é o que a aba filtra.
    const coca = cardapio.produtos.find((p) => p.name === "Coca-Cola")!;
    expect(coca.categoryId).toBe(bebidas.id);
    expect(coca.categoryName).toBe("Bebidas");
    expect(coca.basePrice).toBe(6);
  });

  it("02 · ISOLAMENTO: produto de outra loja não aparece", async () => {
    const minha = await criarCategoria("Lanches");
    await criarProduto("X-Burger", 22, minha.id);

    const outraLoja = await criarLoja("vizinha");
    const dela = await criarCategoria("Lanches", outraLoja);
    await criarProduto("X-Salada da Vizinha", 25, dela.id, outraLoja);

    const cardapio = await montarCardapioDoBalcao(storeId);
    expect(cardapio.produtos.map((p) => p.name)).toEqual(["X-Burger"]);
    expect(cardapio.categorias).toHaveLength(1);

    // E o inverso também: o balcão da vizinha não vê o meu.
    const daVizinha = await montarCardapioDoBalcao(outraLoja);
    expect(daVizinha.produtos.map((p) => p.name)).toEqual(["X-Salada da Vizinha"]);
  });

  it("03 · produto desativado não é oferecido", async () => {
    const c = await criarCategoria("Lanches");
    await criarProduto("Ativo", 10, c.id);
    await criarProduto("Fora do cardápio", 10, c.id, storeId, { isActive: false });

    const cardapio = await montarCardapioDoBalcao(storeId);
    expect(cardapio.produtos.map((p) => p.name)).toEqual(["Ativo"]);
  });

  it("04 · a busca por nome encontra o produto — e só ele", async () => {
    const c = await criarCategoria("Lanches");
    await criarProduto("X-Burger", 22, c.id);
    await criarProduto("Batata Frita", 12, c.id);

    const { produtos } = await montarCardapioDoBalcao(storeId);
    const achar = (termo: string) =>
      produtos.filter(
        (p) =>
          p.name.toLowerCase().includes(termo.toLowerCase()) ||
          p.categoryName.toLowerCase().includes(termo.toLowerCase()),
      );

    expect(achar("burg").map((p) => p.name)).toEqual(["X-Burger"]);
    expect(achar("batata").map((p) => p.name)).toEqual(["Batata Frita"]);
    expect(achar("pizza")).toHaveLength(0);
  });

  it("05 · os adicionais vêm com o alcance, e só os da loja", async () => {
    const c = await criarCategoria("Lanches");
    const produto = await criarProduto("X-Burger", 22, c.id);
    const extra = await prisma.extra.create({
      data: { storeId, name: "Bacon", price: 4, isActive: true },
    });
    await prisma.extraScope.create({
      data: { extraId: extra.id, productId: produto.id },
    });

    const outraLoja = await criarLoja("vizinha");
    const outroExtra = await prisma.extra.create({
      data: { storeId: outraLoja, name: "Cheddar da Vizinha", price: 5, isActive: true },
    });
    const catDela = await criarCategoria("Lanches", outraLoja);
    await prisma.extraScope.create({
      data: { extraId: outroExtra.id, categoryId: catDela.id },
    });

    const cardapio = await montarCardapioDoBalcao(storeId);
    expect(cardapio.extras.map((e) => e.name)).toEqual(["Bacon"]);
    expect(cardapio.extras[0].productIds).toEqual([produto.id]);
    expect(cardapio.extras[0].price).toBe(4);
  });

  it("06 · as perguntas da categoria vêm ANTES das do produto, como no servidor", async () => {
    const c = await criarCategoria("Açaí");
    const produto = await criarProduto("Açaí 500ml", 20, c.id);
    await prisma.optionGroup.create({
      data: {
        categoryId: c.id,
        name: "Tamanho do copo",
        minChoices: 1,
        maxChoices: 1,
        sortOrder: 0,
        options: { create: [{ name: "500ml", price: 0, sortOrder: 0 }] },
      },
    });
    await prisma.optionGroup.create({
      data: {
        productId: produto.id,
        name: "Complementos",
        minChoices: 0,
        maxChoices: 2,
        freeChoices: 1,
        sortOrder: 0,
        options: { create: [{ name: "Leite condensado", price: 3, sortOrder: 0 }] },
      },
    });

    const { produtos } = await montarCardapioDoBalcao(storeId);
    expect(produtos[0].optionGroups.map((g) => g.name)).toEqual([
      "Tamanho do copo",
      "Complementos",
    ]);
    expect(produtos[0].optionGroups[1].freeChoices).toBe(1);
    expect(produtos[0].optionGroups[1].options[0].price).toBe(3);
  });

  it("07 · as formas de pagamento são as que a loja aceita, sem PAYROLL", async () => {
    const cardapio = await montarCardapioDoBalcao(storeId);
    expect(cardapio.formasDePagamento.sort()).toEqual([
      "CASH",
      "CREDIT_CARD",
      "DEBIT_CARD",
      "PIX",
    ]);

    await prisma.storeSettings.update({
      where: { storeId },
      data: { acceptedPaymentMethods: ["CASH", "PAYROLL"] },
    });
    const depois = await montarCardapioDoBalcao(storeId);
    expect(depois.formasDePagamento).toEqual(["CASH"]);
  });
});

// ------------------------------------------------------------------ pedido

describe("balcão · pedido", () => {
  it("10 · o pedido nasce pelo fluxo existente, com os itens e o total certos", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);
    const coca = await criarProduto("Coca-Cola", 6, c.id);

    const r = await pedidoDeBalcao({
      items: [
        { productSlug: burger.slug, quantity: 1, extraIds: [] },
        { productSlug: coca.slug, quantity: 2, extraIds: [] },
      ],
      customerName: "Joana",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const pedido = await prisma.order.findFirstOrThrow({
      where: { id: r.orderId },
      include: { items: true, statusHistory: true },
    });

    expect(Number(pedido.total)).toBe(32);
    expect(pedido.items).toHaveLength(2);
    expect(
      pedido.items.map((i) => [i.productNameSnapshot, i.quantity, Number(i.unitPrice)]).sort(),
    ).toEqual([
      ["Coca-Cola", 2, 6],
      ["X-Burger", 1, 20],
    ]);
    // O status inicial é o de qualquer pedido novo — nenhum status inventado.
    expect(pedido.status).toBe("RECEIVED");
    expect(pedido.paymentStatus).toBe("PENDING");
    // O único campo que distingue o balcão, e ele já existia no schema.
    expect(pedido.source).toBe("ADMIN");
    expect(pedido.type).toBe("PICKUP");
    expect(Number(pedido.deliveryFee)).toBe(0);
    expect(pedido.statusHistory[0].authorType).toBe("ADMIN");
  });

  it("11 · o total do carrinho é o mesmo que o pedido cobra", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);
    const extra = await prisma.extra.create({
      data: { storeId, name: "Bacon", price: 4, isActive: true },
    });
    await prisma.extraScope.create({ data: { extraId: extra.id, productId: burger.id } });

    const items = [{ productSlug: burger.slug, quantity: 2, extraIds: [extra.id] }];

    // A prévia que a tela mostra...
    const previa = await precificarItens(storeId, items);
    expect(previa.ok).toBe(true);
    if (!previa.ok) return;
    expect(Number(previa.subtotal)).toBe(48);

    // ...e o que o pedido de fato cobra.
    const r = await pedidoDeBalcao({ items });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Number(r.total)).toBe(48);
  });

  it("12 · adicional escolhido entra no item, com nome e preço copiados", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);
    const bacon = await prisma.extra.create({
      data: { storeId, name: "Bacon", price: 4, isActive: true },
    });
    const cheddar = await prisma.extra.create({
      data: { storeId, name: "Cheddar", price: 3, isActive: true },
    });
    await prisma.extraScope.createMany({
      data: [
        { extraId: bacon.id, productId: burger.id },
        { extraId: cheddar.id, categoryId: c.id },
      ],
    });

    const r = await pedidoDeBalcao({
      items: [{ productSlug: burger.slug, quantity: 1, extraIds: [bacon.id, cheddar.id] }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: r.orderId },
      include: { extras: true },
    });
    expect(item.extras.map((e) => e.nameSnapshot).sort()).toEqual(["Bacon", "Cheddar"]);
    expect(Number(r.total)).toBe(27);
  });

  it("13 · SEM telefone o pedido é criado e NÃO vira ficha de cliente", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);

    const r = await pedidoDeBalcao({
      items: [{ productSlug: burger.slug, quantity: 1, extraIds: [] }],
      customerName: "Sem Telefone",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const pedido = await prisma.order.findFirstOrThrow({ where: { id: r.orderId } });
    expect(pedido.customerName).toBe("Sem Telefone");
    expect(pedido.customerId).toBeNull();
    expect(await prisma.customer.count({ where: { storeId } })).toBe(0);
  });

  it("13b · dois anônimos NÃO se fundem numa ficha só", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);
    const item = [{ productSlug: burger.slug, quantity: 1, extraIds: [] }];

    const a = await pedidoDeBalcao({ items: item, customerName: "Primeiro" });
    const b = await pedidoDeBalcao({ items: item, customerName: "Segundo" });
    expect(a.ok && b.ok).toBe(true);

    const pedidos = await prisma.order.findMany({
      where: { storeId },
      orderBy: { number: "asc" },
      select: { customerName: true },
    });
    expect(pedidos.map((p) => p.customerName)).toEqual(["Primeiro", "Segundo"]);
    expect(await prisma.customer.count({ where: { storeId } })).toBe(0);
  });

  it("14 · COM telefone, reaproveita a ficha que a vitrine já criou", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);
    const existente = await prisma.customer.create({
      data: { storeId, phone: "11988887777", name: "Ana" },
    });

    const r = await pedidoDeBalcao({
      items: [{ productSlug: burger.slug, quantity: 1, extraIds: [] }],
      customerName: "Ana",
      customerPhone: "(11) 98888-7777",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const pedido = await prisma.order.findFirstOrThrow({ where: { id: r.orderId } });
    expect(pedido.customerId).toBe(existente.id);
    expect(await prisma.customer.count({ where: { storeId } })).toBe(1);
  });

  it("15 · forma de pagamento que a loja não aceita é recusada", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);
    await prisma.storeSettings.update({
      where: { storeId },
      data: { acceptedPaymentMethods: ["CASH"] },
    });

    const r = await pedidoDeBalcao({
      items: [{ productSlug: burger.slug, quantity: 1, extraIds: [] }],
      paymentMethod: "PIX",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/pagamento/i);
  });

  it("16 · o interruptor de retirada da VITRINE não fecha o balcão", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);
    await prisma.storeSettings.update({
      where: { storeId },
      data: { acceptsPickup: false, minOrderValue: 50 },
    });

    const items = [{ productSlug: burger.slug, quantity: 1, extraIds: [] }];

    // A vitrine é recusada...
    const daVitrine = await createOrderFromCheckout(storeId, {
      items,
      customerName: "Cliente",
      customerPhone: "11999999999",
      type: "PICKUP",
      paymentMethod: "CASH",
    } as CheckoutInput);
    expect(daVitrine.ok).toBe(false);

    // ...e o balcão, não.
    const doBalcao = await pedidoDeBalcao({ items });
    expect(doBalcao.ok).toBe(true);
  });
});

// -------------------------------------------------------- produção/estoque

describe("balcão · produção e estoque", () => {
  it("20 · o pedido aparece no MESMO quadro dos outros", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);

    const r = await pedidoDeBalcao({
      items: [{ productSlug: burger.slug, quantity: 1, extraIds: [] }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const board: any = await listKanbanOrders(storeId, { date: hojeLocal() });
    const ids = board.columns.flatMap((col: any) => col.orders.map((o: any) => o.id));
    expect(ids).toContain(r.orderId);
  });

  it("21 · a reserva de estoque acontece na criação, pelo caminho de sempre", async () => {
    const item = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Pão", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
      { quantidade: 10, precoDaEmbalagem: 1 },
    );
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id, storeId, {
      inventoryItemId: item.id,
    });

    const r = await pedidoDeBalcao({
      items: [{ productSlug: burger.slug, quantity: 3, extraIds: [] }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const movimentos = await prisma.inventoryMovement.count({
      where: { reference: r.orderId },
    });
    expect(movimentos).toBeGreaterThan(0);

    // E o consumo entra em PREPARING, como em qualquer venda.
    const antes = await prisma.inventoryMovement.count({
      where: { reference: r.orderId, type: "CONSUMPTION" },
    });
    expect(antes).toBe(0);
    await OrderInventoryHandler.syncOrderStatus(r.orderId, "PREPARING");
    const depois = await prisma.inventoryMovement.count({
      where: { reference: r.orderId, type: "CONSUMPTION" },
    });
    expect(depois).toBeGreaterThan(0);
  });

  /*
   * ESTOQUE NÃO AUTORIZA NEM RECUSA VENDA — é a regra que a vitrine já segue,
   * documentada em `reserva-no-checkout.test.ts`: faltando saldo, a venda passa
   * e o pedido fica MARCADO para o salão resolver. O balcão não pode ser mais
   * severo que o caixa da loja: recusar aqui mandaria o atendente vender por
   * fora do sistema, e aí a falta some do relatório junto com a venda.
   */
  it("22 · falta de estoque NÃO recusa a venda, e marca o pedido — igual à vitrine", async () => {
    const item = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Pão", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
      { quantidade: 1, precoDaEmbalagem: 1 },
    );
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id, storeId, {
      inventoryItemId: item.id,
    });

    const r = await pedidoDeBalcao({
      items: [{ productSlug: burger.slug, quantity: 5, extraIds: [] }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const pedido = await prisma.order.findFirstOrThrow({ where: { id: r.orderId } });
    expect(pedido.inventoryInconsistentAt).not.toBeNull();
    // A reserva inteira fica de pé: é o número negativo que diz quanto falta.
    const saldo = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(Number(saldo.quantityReserved)).toBe(5);
    expect(Number(saldo.quantityOnHand)).toBe(1);
  });
});

// ------------------------------------------------------------------- fiado

describe("balcão · fiado (TESTE CRÍTICO)", () => {
  async function pedidoFiadoDeBalcao(slug: string, quantidade = 1) {
    const r = await pedidoDeBalcao({
      items: [{ productSlug: slug, quantity: quantidade, extraIds: [] }],
      customerName: "Seu Zé",
    });
    if (!r.ok) throw new Error(r.error);
    // É EXATAMENTE a composição que `abrirFiadoFn` chama — a mesma função.
    const f = await aceitarComPagamentoEmAberto(storeId, r.orderId, AUTOR, {
      note: "Pedido de balcão com pagamento em aberto",
    });
    return { orderId: r.orderId, total: r.total, fiado: f };
  }

  it("30 · 'pagar depois' põe o pedido na ABA DE FIADOS que já existe", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);

    const { orderId, fiado } = await pedidoFiadoDeBalcao(burger.slug, 2);
    expect(fiado.ok).toBe(true);

    // A MESMA consulta que alimenta a tela de pagamentos em aberto.
    const emAberto = await RecebimentosService.pagamentosEmAberto(storeId);
    expect(emAberto.quantidade).toBe(1);
    expect(emAberto.total).toBe(40);
    const linha = emAberto.linhas[0];
    expect(linha.orderId).toBe(orderId);
    expect(linha.cliente).toBe("Seu Zé");
    expect(linha.saldo).toBe(40);
    expect(linha.abertoPor).toBe("Maria do Balcão");
    // A forma combinada na venda viaja junto — é o que a cobrança mostra.
    expect(linha.formaDePagamento).toBe("CASH");
  });

  it("31 · o pedido é gravado como OPEN, que é o que significa 'fiado'", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);

    const { orderId } = await pedidoFiadoDeBalcao(burger.slug);
    const pedido = await prisma.order.findFirstOrThrow({ where: { id: orderId } });
    expect(pedido.paymentStatus).toBe("OPEN");
    expect(pedido.openedByName).toBe("Maria do Balcão");
    expect(pedido.openedAt).not.toBeNull();
    // Nenhuma tabela nova: a dívida é o próprio pedido.
    expect(await prisma.orderPayment.count({ where: { storeId } })).toBe(0);
  });

  it("32 · FIADO NÃO PRENDE A PRODUÇÃO: o pedido vai para PREPARING", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);

    const { orderId } = await pedidoFiadoDeBalcao(burger.slug);
    const pedido = await prisma.order.findFirstOrThrow({ where: { id: orderId } });
    expect(pedido.status).toBe("PREPARING");

    const historico = await prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
    });
    expect(historico.map((h) => h.status)).toEqual(["RECEIVED", "PREPARING"]);
  });

  it("33 · o fiado do balcão baixa estoque como qualquer venda, UMA vez", async () => {
    const item = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Pão", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
      { quantidade: 20, precoDaEmbalagem: 1 },
    );
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id, storeId, {
      inventoryItemId: item.id,
    });

    const { orderId } = await pedidoFiadoDeBalcao(burger.slug, 2);
    await OrderInventoryHandler.syncOrderStatus(orderId, "PREPARING");

    const consumos = await prisma.inventoryMovement.count({
      where: { reference: orderId, type: "CONSUMPTION" },
    });
    expect(consumos).toBe(1);
  });

  it("34 · receber o fiado pelo caminho existente quita e conclui o pedido", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);

    const { orderId } = await pedidoFiadoDeBalcao(burger.slug);
    const r = await RecebimentosService.receberPagamento(
      storeId,
      orderId,
      { amount: 20, method: "CASH" },
      AUTOR,
    );
    expect(r.ok).toBe(true);

    const pedido = await prisma.order.findFirstOrThrow({ where: { id: orderId } });
    expect(pedido.paymentStatus).toBe("PAID");
    expect(pedido.status).toBe("COMPLETED");
    expect((await RecebimentosService.pagamentosEmAberto(storeId)).quantidade).toBe(0);
  });

  it("35 · pedido de balcão SEM fiado não entra na lista de cobrança", async () => {
    const c = await criarCategoria("Lanches");
    const burger = await criarProduto("X-Burger", 20, c.id);

    const r = await pedidoDeBalcao({
      items: [{ productSlug: burger.slug, quantity: 1, extraIds: [] }],
    });
    expect(r.ok).toBe(true);
    expect((await RecebimentosService.pagamentosEmAberto(storeId)).quantidade).toBe(0);
  });
});
