import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { createOrderFromCheckout, type CheckoutInput, transitionOrderStatus } from "@/server/services/order-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { listKanbanOrders } from "@/server/repositories/order-repository";
import {
  RecebimentosService,
  saldoDoPedido,
  diasEmAberto,
} from "@/server/services/recebimentos-service";

/*
 * VENDA A PRAZO — o fiado do cliente da casa.
 *
 * O QUE ESTES TESTES EXISTEM PARA IMPEDIR, acima de tudo: que receber dinheiro
 * mexa em estoque. `confirmPaymentFn` empurra o status do pedido, e PREPARING
 * é onde a reserva vira consumo — receber um fiado por aquele caminho gravaria
 * baixa de estoque dias depois de a comida ter saído da prateleira.
 *
 * Por isso os testes 04 e 05 contam movimentos ANTES e DEPOIS do recebimento e
 * exigem que os números sejam idênticos. É a asserção mais importante do
 * arquivo.
 *
 * A segunda é a data: a venda de um dia pago em outro continua sendo venda do
 * primeiro. Nenhuma data histórica do pedido pode se mover.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";
let slugDaLoja = "";

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
  return { id: loja.id, slug };
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

  const loja = await criarLoja("fiado");
  storeId = loja.id;
  slugDaLoja = loja.slug;
});
afterAll(limparBanco);

const AUTOR = { id: "adm-1", name: "Maria do Balcão", email: "maria@loja.com" };

/** O dia local no formato que o Kanban espera — nunca o dia UTC. */
function hojeLocal() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mes + "-" + dia;
}

async function insumo(nome: string, saldo: number, custo: number) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: nome, baseUnitId: "unit_un", itemType: "INGREDIENT" } as any,
    { quantidade: saldo, precoDaEmbalagem: custo },
  );
}

async function produto(nome: string, preco: number, inventoryItemId?: string, loja = storeId) {
  const categoria = await prisma.category.create({
    data: {
      storeId: loja,
      name: "Lanches",
      slug: `l-${Math.random().toString(36).slice(2, 8)}`,
      kind: "SIMPLE",
    },
  });
  return prisma.product.create({
    data: {
      storeId: loja,
      categoryId: categoria.id,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`,
      description: nome,
      basePrice: preco,
      ...(inventoryItemId ? { inventoryItemId } : {}),
    },
  });
}

async function comprar(slug: string, quantidade = 1, slugLoja = slugDaLoja, loja = storeId,
  paymentMethod: "CASH" | "PAYROLL" = "CASH") {
  const r = await createOrderFromCheckout(loja, {
    storeSlug: slugLoja,
    items: [{ productSlug: slug, quantity: quantidade, extraIds: [] }],
    customerName: "João",
    customerPhone: "11999999999",
    type: "PICKUP",
    paymentMethod,
  } as CheckoutInput);
  if (!r.ok) throw new Error(r.error);
  return r.orderId;
}

const pedidoCom = (id: string) =>
  prisma.order.findFirstOrThrow({
    where: { id },
    select: {
      total: true, refund: true, paymentStatus: true, status: true, createdAt: true,
      openedAt: true, openedByName: true,
      payments: { select: { amount: true, reversedAt: true } },
    },
  });

const movimentosDe = (orderId: string) =>
  prisma.inventoryMovement.count({ where: { reference: orderId } });

const consumosDe = (orderId: string) =>
  prisma.inventoryMovement.count({
    where: { reference: orderId, type: "CONSUMPTION" },
  });

/**
 * Espelha o que `abrirFiadoFn` faz: marca o fiado e, se o pedido ainda estiver
 * em RECEIVED, coloca na fila pelo MESMO caminho do botão do quadro.
 *
 * ⚠️ LIMITE DESTE ESPELHO: a server function não é chamada aqui — ela exige
 * sessão, e o projeto não tem infraestrutura para simulá-la. Se alguém mudar a
 * composição lá e não aqui, estes testes não pegam. O que eles trancam são as
 * duas metades e a ordem entre elas.
 */
/** Todos os ids que o quadro mostra, somando todas as colunas. */
async function idsNoKanban() {
  const board: any = await listKanbanOrders(storeId, { date: hojeLocal() });
  return board.columns.flatMap((c: any) => c.orders.map((o: any) => o.id));
}

/** A soma dos contadores de todas as colunas. */
async function totalNoKanban() {
  const board: any = await listKanbanOrders(storeId, { date: hojeLocal() });
  return board.columns.reduce((soma: number, c: any) => soma + c.total, 0);
}

async function pagamentoOutroDia(orderId: string) {
  const r = await RecebimentosService.abrirFiado(storeId, orderId, AUTOR);
  if (!r.ok) return r;
  if (r.dados.statusAtual === "RECEIVED") {
    await transitionOrderStatus(storeId, orderId, "PREPARING", {
      authorType: "ADMIN",
      authorName: AUTOR.name,
      note: "Aceito com pagamento em aberto",
    } as any);
    // O sync de estoque é disparado sem espera pelo `transitionOrderStatus`.
    // Garanto-o aqui; a idempotência da chave cuida da segunda passagem.
    await OrderInventoryHandler.onOrderPreparing(orderId);
  }
  return r;
}

// ============================================================
describe("abrir o fiado", () => {
  it("01 · o pedido passa a OPEN e registra quem abriu", async () => {
    const p = await produto("X-Salada", 31.6);
    const id = await comprar(p.slug);

    const r = await RecebimentosService.abrirFiado(storeId, id, AUTOR, { note: "cliente da casa" });
    expect(r.ok).toBe(true);

    const pedido = await pedidoCom(id);
    expect(pedido.paymentStatus).toBe("OPEN");
    expect(pedido.openedByName).toBe("Maria do Balcão");
    expect(pedido.openedAt).not.toBeNull();
    expect(saldoDoPedido(pedido).toNumber()).toBeCloseTo(31.6, 2);
  });

  it("02 · concluir o pedido NÃO quita um fiado", async () => {
    /*
     * A REGRA QUE MAIS FÁCIL SE PERDE. O sistema marca PAID sozinho ao
     * concluir; sem a exceção, a dívida sumiria do relatório no instante em
     * que a comida saísse da cozinha.
     */
    const p = await produto("X-Salada", 31.6);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    await transitionOrderStatus(storeId, id, "PREPARING", { authorType: "SYSTEM" });
    await transitionOrderStatus(storeId, id, "COMPLETED", { authorType: "SYSTEM" });

    const pedido = await pedidoCom(id);
    expect(pedido.status).toBe("COMPLETED");
    expect(pedido.paymentStatus).toBe("OPEN"); // e NÃO "PAID"
  });

  it("03 · pedido já pago não vira fiado", async () => {
    const p = await produto("X-Salada", 31.6);
    const id = await comprar(p.slug);
    await prisma.order.update({ where: { id }, data: { paymentStatus: "PAID" } });

    const r = await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    expect(r.ok).toBe(false);
  });
});

// ============================================================
describe("o estoque não muda por causa do pagamento", () => {
  it("04 · a venda a prazo baixa estoque exatamente como a venda normal", async () => {
    const item = await insumo("Pão", 100, 2);
    const p = await produto("X-Salada", 31.6, item.id);

    const aPrazo = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, aPrazo, AUTOR);
    await OrderInventoryHandler.onOrderPreparing(aPrazo);

    const aVista = await comprar(p.slug);
    await OrderInventoryHandler.onOrderPreparing(aVista);

    const consumoPrazo = await prisma.inventoryMovement.findFirstOrThrow({
      where: { reference: aPrazo, type: "CONSUMPTION" },
    });
    const consumoVista = await prisma.inventoryMovement.findFirstOrThrow({
      where: { reference: aVista, type: "CONSUMPTION" },
    });
    expect(Number(consumoPrazo.quantity)).toBe(Number(consumoVista.quantity));
    expect(Number(consumoPrazo.costAtTime)).toBe(Number(consumoVista.costAtTime));
  });

  it("05 · receber o pagamento NÃO cria, apaga ou altera movimento nenhum", async () => {
    const item = await insumo("Pão", 100, 2);
    const p = await produto("X-Salada", 31.6, item.id);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await OrderInventoryHandler.onOrderPreparing(id);

    const antes = await movimentosDe(id);
    const saldoDoInsumoAntes = (
      await prisma.inventoryItem.findFirstOrThrow({ where: { id: item.id } })
    ).quantityOnHand;

    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 31.6, method: "PIX" }, AUTOR,
    );
    expect(r.ok).toBe(true);

    expect(await movimentosDe(id)).toBe(antes);
    const depois = await prisma.inventoryItem.findFirstOrThrow({ where: { id: item.id } });
    expect(Number(depois.quantityOnHand)).toBe(Number(saldoDoInsumoAntes));
  });

  it("06 · estornar o pagamento também não toca estoque", async () => {
    const item = await insumo("Pão", 100, 2);
    const p = await produto("X-Salada", 31.6, item.id);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await OrderInventoryHandler.onOrderPreparing(id);
    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 31.6, method: "PIX" }, AUTOR,
    );
    if (!r.ok) throw new Error(r.erro);

    const antes = await movimentosDe(id);
    await RecebimentosService.estornarPagamento(storeId, r.dados.pagamentoId, "erro de caixa", AUTOR);
    expect(await movimentosDe(id)).toBe(antes);
  });
});

// ============================================================
describe("o dinheiro", () => {
  it("07 · pagamento total quita e fecha a conta", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX" }, AUTOR,
    );
    if (!r.ok) throw new Error(r.erro);
    expect(r.dados.quitado).toBe(true);
    expect(r.dados.saldo).toBeCloseTo(0, 2);
    expect((await pedidoCom(id)).paymentStatus).toBe("PAID");
  });

  it("08 · pagamento parcial mantém OPEN e mostra o saldo", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 40, method: "CASH" }, AUTOR,
    );
    if (!r.ok) throw new Error(r.erro);
    expect(r.dados.quitado).toBe(false);
    expect(r.dados.saldo).toBeCloseTo(60, 2);
    expect((await pedidoCom(id)).paymentStatus).toBe("OPEN");
  });

  it("09 · três pagamentos somam e o último quita", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    await RecebimentosService.receberPagamento(storeId, id, { amount: 30, method: "CASH" }, AUTOR);
    await RecebimentosService.receberPagamento(storeId, id, { amount: 30, method: "PIX" }, AUTOR);
    const ultimo = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 40, method: "DEBIT_CARD" }, AUTOR,
    );
    if (!ultimo.ok) throw new Error(ultimo.erro);

    expect(ultimo.dados.quitado).toBe(true);
    expect((await pedidoCom(id)).paymentStatus).toBe("PAID");
    expect(await prisma.orderPayment.count({ where: { orderId: id } })).toBe(3);
  });

  it("10 · pagamento acima do saldo é recusado", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100.01, method: "PIX" }, AUTOR,
    );
    expect(r.ok).toBe(false);
    expect(await prisma.orderPayment.count({ where: { orderId: id } })).toBe(0);
  });

  it("11 · valor zero ou negativo é recusado", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    expect((await RecebimentosService.receberPagamento(storeId, id, { amount: 0, method: "PIX" }, AUTOR)).ok).toBe(false);
    expect((await RecebimentosService.receberPagamento(storeId, id, { amount: -5, method: "PIX" }, AUTOR)).ok).toBe(false);
    expect(await prisma.orderPayment.count({ where: { orderId: id } })).toBe(0);
  });

  it("12 · quem recebeu fica registrado", async () => {
    const p = await produto("X", 50);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await RecebimentosService.receberPagamento(storeId, id, { amount: 50, method: "PIX" }, AUTOR);

    const pg = await prisma.orderPayment.findFirstOrThrow({ where: { orderId: id } });
    expect(pg.receivedByName).toBe("Maria do Balcão");
    expect(pg.receivedById).toBe("adm-1");
    expect(pg.method).toBe("PIX");
  });
});

// ============================================================
describe("concorrência", () => {
  it("13 · dois recebimentos simultâneos do total: só um passa", async () => {
    /*
     * O CENÁRIO REAL: dois funcionários no caixa clicam em "Receber" quase
     * juntos. Sem a trava, os dois leem saldo R$ 100, os dois aprovam, e o
     * pedido recebe R$ 200 por uma venda de R$ 100.
     */
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    const [a, b] = await Promise.all([
      RecebimentosService.receberPagamento(storeId, id, { amount: 100, method: "PIX" }, AUTOR),
      RecebimentosService.receberPagamento(storeId, id, { amount: 100, method: "CASH" }, AUTOR),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const vivos = await prisma.orderPayment.count({
      where: { orderId: id, reversedAt: null },
    });
    expect(vivos).toBe(1);
    expect(saldoDoPedido(await pedidoCom(id)).toNumber()).toBeCloseTo(0, 2);
  });

  it("14 · quatro cliques simultâneos não passam de um pagamento", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    const rs = await Promise.all(
      Array.from({ length: 4 }, () =>
        RecebimentosService.receberPagamento(storeId, id, { amount: 100, method: "PIX" }, AUTOR),
      ),
    );
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.orderPayment.count({ where: { orderId: id, reversedAt: null } })).toBe(1);
  });
});

// ============================================================
describe("estorno", () => {
  it("15 · estornar devolve o saldo e o pedido volta a OPEN", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX" }, AUTOR,
    );
    if (!r.ok) throw new Error(r.erro);
    expect((await pedidoCom(id)).paymentStatus).toBe("PAID");

    const e = await RecebimentosService.estornarPagamento(
      storeId, r.dados.pagamentoId, "cliente pediu de volta", AUTOR,
    );
    expect(e.ok).toBe(true);

    const pedido = await pedidoCom(id);
    expect(pedido.paymentStatus).toBe("OPEN");
    expect(saldoDoPedido(pedido).toNumber()).toBeCloseTo(100, 2);
  });

  it("16 · o estorno NÃO apaga a linha — o rastro fica", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX" }, AUTOR,
    );
    if (!r.ok) throw new Error(r.erro);
    await RecebimentosService.estornarPagamento(storeId, r.dados.pagamentoId, "erro", AUTOR);

    const pg = await prisma.orderPayment.findFirstOrThrow({ where: { id: r.dados.pagamentoId } });
    expect(pg.reversedAt).not.toBeNull();
    expect(pg.reversalReason).toBe("erro");
    expect(Number(pg.amount)).toBeCloseTo(100, 2); // o valor original continua legível
  });

  it("17 · estornar duas vezes é recusado", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX" }, AUTOR,
    );
    if (!r.ok) throw new Error(r.erro);

    await RecebimentosService.estornarPagamento(storeId, r.dados.pagamentoId, "x", AUTOR);
    const segundo = await RecebimentosService.estornarPagamento(
      storeId, r.dados.pagamentoId, "y", AUTOR,
    );
    expect(segundo.ok).toBe(false);
  });
});

// ============================================================
describe("multi-tenancy", () => {
  it("18 · uma loja não abre fiado em pedido de outra", async () => {
    const outra = await criarLoja("outra");
    const p = await produto("X", 50);
    const id = await comprar(p.slug);

    const r = await RecebimentosService.abrirFiado(outra.id, id, AUTOR);
    expect(r.ok).toBe(false);
    expect((await pedidoCom(id)).paymentStatus).not.toBe("OPEN");
  });

  it("19 · uma loja não recebe pagamento de pedido de outra", async () => {
    const outra = await criarLoja("outra");
    const p = await produto("X", 50);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    const r = await RecebimentosService.receberPagamento(
      outra.id, id, { amount: 50, method: "PIX" }, AUTOR,
    );
    expect(r.ok).toBe(false);
    expect(await prisma.orderPayment.count({ where: { orderId: id } })).toBe(0);
  });

  it("20 · a lista de pendências não vaza entre lojas", async () => {
    const outra = await criarLoja("outra");
    const p = await produto("X", 50);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    expect((await RecebimentosService.pagamentosEmAberto(storeId)).quantidade).toBe(1);
    expect((await RecebimentosService.pagamentosEmAberto(outra.id)).quantidade).toBe(0);
  });
});

// ============================================================
describe("as datas — venda de um dia, dinheiro de outro", () => {
  it("21 · a venda NÃO se move quando o pagamento chega depois", async () => {
    /*
     * A REGRA CENTRAL DA FEATURE. Consumo em 28/08, dinheiro em 31/08: a venda
     * continua sendo de 28/08. Nenhuma data histórica do pedido pode mudar.
     */
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    const antes = await pedidoCom(id);
    const trêsDiasDepois = new Date(Date.now() + 3 * 86_400_000);

    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX", paidAt: trêsDiasDepois }, AUTOR,
    );

    const depois = await pedidoCom(id);
    expect(depois.createdAt.getTime()).toBe(antes.createdAt.getTime());

    const pg = await prisma.orderPayment.findFirstOrThrow({ where: { orderId: id } });
    expect(pg.paidAt.getTime()).toBe(trêsDiasDepois.getTime());
    expect(pg.paidAt.getTime()).toBeGreaterThan(depois.createdAt.getTime());
  });

  it("22 · o recebimento entra no período do DINHEIRO, não no da venda", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);

    const daquiATresDias = new Date(Date.now() + 3 * 86_400_000);
    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX", paidAt: daquiATresDias }, AUTOR,
    );

    // Janela de hoje: a venda está aqui, o dinheiro não.
    const hoje = await RecebimentosService.recebimentosNoPeriodo(
      storeId, new Date(Date.now() - 86_400_000), new Date(),
    );
    expect(hoje.total).toBe(0);

    // Janela que alcança o pagamento: o dinheiro aparece.
    const depois = await RecebimentosService.recebimentosNoPeriodo(
      storeId, new Date(Date.now() - 86_400_000), new Date(Date.now() + 4 * 86_400_000),
    );
    expect(depois.total).toBeCloseTo(100, 2);
    expect(depois.linhas[0].dataDaVenda.getTime()).toBeLessThan(
      depois.linhas[0].recebidoEm.getTime(),
    );
  });

  it("23 · dias em aberto contam viradas de dia em America/Sao_Paulo", async () => {
    /*
     * 23h de um dia para 8h do seguinte são NOVE HORAS e UM dia em aberto. A
     * diferença bruta em milissegundos arredondaria para zero e a conta
     * apareceria como "hoje" no dia seguinte.
     */
    const noite = new Date("2026-08-28T02:30:00.000Z"); // 27/08 23:30 em SP
    const manha = new Date("2026-08-28T11:00:00.000Z"); // 28/08 08:00 em SP
    expect(diasEmAberto(noite, manha)).toBe(1);

    const mesmoDia = new Date("2026-08-28T14:00:00.000Z"); // 28/08 11:00 em SP
    expect(diasEmAberto(manha, mesmoDia)).toBe(0);

    const tresDias = new Date("2026-08-31T11:00:00.000Z");
    expect(diasEmAberto(manha, tresDias)).toBe(3);
  });

  it("24 · estornado sai da série de recebimentos", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX" }, AUTOR,
    );
    if (!r.ok) throw new Error(r.erro);

    const janela = { i: new Date(Date.now() - 86_400_000), f: new Date(Date.now() + 86_400_000) };
    expect((await RecebimentosService.recebimentosNoPeriodo(storeId, janela.i, janela.f)).total)
      .toBeCloseTo(100, 2);

    await RecebimentosService.estornarPagamento(storeId, r.dados.pagamentoId, "x", AUTOR);
    expect((await RecebimentosService.recebimentosNoPeriodo(storeId, janela.i, janela.f)).total)
      .toBe(0);
  });
});

// ============================================================
describe("o que não pode ter quebrado", () => {
  it("25 · PAYROLL continua entregue e não pago", async () => {
    /*
     * O método é gravado direto, e não pelo checkout: aquele caminho exige um
     * funcionário com plano de benefício ativo, e essa trava não é o que este
     * teste mede. O que se mede é a exceção do auto-PAID ao concluir — que
     * agora tem duas saídas, PAYROLL e OPEN, e as duas precisam continuar
     * valendo.
     */
    const p = await produto("X", 20);
    const id = await comprar(p.slug);
    await prisma.order.update({ where: { id }, data: { paymentMethod: "PAYROLL" } });

    await transitionOrderStatus(storeId, id, "PREPARING", { authorType: "SYSTEM" });
    await transitionOrderStatus(storeId, id, "COMPLETED", { authorType: "SYSTEM" });

    const pedido = await pedidoCom(id);
    expect(pedido.status).toBe("COMPLETED");
    expect(pedido.paymentStatus).toBe("PENDING"); // a regra antiga, intacta
  });

  it("26 · venda normal continua virando PAID ao concluir", async () => {
    const p = await produto("X", 20);
    const id = await comprar(p.slug);

    await transitionOrderStatus(storeId, id, "PREPARING", { authorType: "SYSTEM" });
    await transitionOrderStatus(storeId, id, "COMPLETED", { authorType: "SYSTEM" });

    expect((await pedidoCom(id)).paymentStatus).toBe("PAID");
  });

  it("27 · pedido cancelado não recebe pagamento", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await transitionOrderStatus(storeId, id, "CANCELLED", { authorType: "SYSTEM" });

    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX" }, AUTOR,
    );
    expect(r.ok).toBe(false);
  });

  it("28 · a auditoria registra abertura, recebimento e estorno", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX" }, AUTOR,
    );
    if (!r.ok) throw new Error(r.erro);
    await RecebimentosService.estornarPagamento(storeId, r.dados.pagamentoId, "x", AUTOR);

    const acoes = (await prisma.auditLog.findMany({ where: { storeId }, select: { action: true } }))
      .map((a) => a.action);
    expect(acoes).toContain("ABRIR_FIADO");
    expect(acoes).toContain("RECEBER_PAGAMENTO");
    expect(acoes).toContain("ESTORNAR_PAGAMENTO");
  });

  it("29 · a lista de pendências traz cliente, saldo e dias", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR, { note: "paga sexta" });
    await RecebimentosService.receberPagamento(storeId, id, { amount: 40, method: "CASH" }, AUTOR);

    const lista = await RecebimentosService.pagamentosEmAberto(storeId);
    expect(lista.quantidade).toBe(1);
    expect(lista.total).toBeCloseTo(60, 2);
    const l = lista.linhas[0];
    expect(l.cliente).toBe("João");
    expect(l.valorOriginal).toBeCloseTo(100, 2);
    expect(l.valorPago).toBeCloseTo(40, 2);
    expect(l.saldo).toBeCloseTo(60, 2);
    expect(l.abertoPor).toBe("Maria do Balcão");
    expect(l.observacao).toBe("paga sexta");
  });

  it("30 · a conta quitada sai da lista, mas o histórico fica", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await RecebimentosService.receberPagamento(storeId, id, { amount: 100, method: "PIX" }, AUTOR);

    expect((await RecebimentosService.pagamentosEmAberto(storeId)).quantidade).toBe(0);
    expect(await prisma.orderPayment.count({ where: { orderId: id } })).toBe(1);
  });
});

// ============================================================
describe("marcar fiado nao mexe na operacao", () => {
  /*
   * A REGRA DEFINITIVA: "esse cliente paga depois" não decide se o pedido entra
   * na fila.
   *
   * Uma versão anterior avançava RECEIVED → PREPARING junto com a marcação. Foi
   * retirada porque PREPARING é onde a reserva vira consumo: o botão de
   * pagamento passava a tirar comida da prateleira, e recusar o pedido depois
   * disso gerava PERDA em vez de apenas devolver a reserva.
   *
   * Estes testes trancam a separação nos dois sentidos — marcar fiado não move
   * o pedido, e colocar na fila continua consumindo estoque normalmente.
   */

  it("31 · RECEIVED + Pagamento outro dia → OPEN, PREPARING, consumo UMA vez", async () => {
    /*
     * O TESTE CENTRAL. "Pagamento outro dia" é aceitar + enfileirar + deixar a
     * cobrança em aberto. O estoque sai porque o pedido entrou na fila, pelo
     * mesmo caminho do botão do quadro — e sai UMA vez.
     */
    const item = await insumo("Pao", 100, 2);
    const p = await produto("X", 34.5, item.id);
    const id = await comprar(p.slug);
    expect((await pedidoCom(id)).status).toBe("RECEIVED");

    await pagamentoOutroDia(id);

    const pedido = await pedidoCom(id);
    expect(pedido.paymentStatus).toBe("OPEN");
    expect(pedido.status).toBe("PREPARING");
    expect(await consumosDe(id)).toBe(1);

    const consumo = await prisma.inventoryMovement.findFirstOrThrow({
      where: { reference: id, type: "CONSUMPTION" },
    });
    expect(Math.abs(Number(consumo.quantity))).toBe(1);
    expect(Number(consumo.costAtTime)).toBeCloseTo(2, 4);
  });

  it("31b · o fiado some de TODAS as colunas, e dos contadores", async () => {
    /*
     * A REGRA DEFINITIVA. `OPEN` é invisível no quadro, qualquer que seja o
     * status operacional. O contador entra na asserção junto com a lista: um
     * cabeçalho dizendo "Em preparo (1)" sem card é a mesma mentira, só que
     * mais difícil de ver.
     */
    const p = await produto("X", 34.5);
    const id = await comprar(p.slug);

    expect(await idsNoKanban()).toContain(id); // antes: visível
    const totalAntes = await totalNoKanban();

    await pagamentoOutroDia(id);

    expect(await idsNoKanban()).not.toContain(id); // depois: em nenhuma coluna
    expect(await totalNoKanban()).toBe(totalAntes - 1);
    expect((await pedidoCom(id)).status).toBe("PREPARING"); // mas anda na operação
  });

  it("31c · duplo clique não duplica pagamento, transição nem consumo", async () => {
    const item = await insumo("Pao", 100, 2);
    const p = await produto("X", 34.5, item.id);
    const id = await comprar(p.slug);

    await pagamentoOutroDia(id);
    await pagamentoOutroDia(id); // o segundo clique
    await pagamentoOutroDia(id); // e um retry

    const pedido = await pedidoCom(id);
    expect(pedido.paymentStatus).toBe("OPEN");
    expect(pedido.status).toBe("PREPARING");
    expect(await consumosDe(id)).toBe(1);
    expect(Number((await prisma.inventoryItem.findFirstOrThrow({ where: { id: item.id } })).quantityOnHand)).toBe(99);
  });

  it("32 · já em PREPARING: continua PREPARING e não consome de novo", async () => {
    const item = await insumo("Pao", 100, 2);
    const p = await produto("X", 27.6, item.id);
    const id = await comprar(p.slug);
    await transitionOrderStatus(storeId, id, "PREPARING", { authorType: "SYSTEM" });
    await OrderInventoryHandler.onOrderPreparing(id);
    expect(await consumosDe(id)).toBe(1);

    await pagamentoOutroDia(id);

    const pedido = await pedidoCom(id);
    expect(pedido.paymentStatus).toBe("OPEN");
    expect(pedido.status).toBe("PREPARING");
    expect(await consumosDe(id)).toBe(1); // e não 2
  });

  it("33 · OUT_FOR_DELIVERY + fiado NÃO empurra o status", async () => {
    const p = await produto("X", 27.6);
    const id = await comprar(p.slug);
    // Status posto direto: montar uma entrega real exigiria entregador, e o que
    // se mede aqui é a guarda do `statusAtual === "RECEIVED"`.
    await prisma.order.update({ where: { id }, data: { status: "OUT_FOR_DELIVERY" } });

    await pagamentoOutroDia(id);

    const pedido = await pedidoCom(id);
    expect(pedido.paymentStatus).toBe("OPEN");
    expect(pedido.status).toBe("OUT_FOR_DELIVERY");
  });

  it("36 · quitar finaliza o pedido e NÃO mexe em estoque", async () => {
    const item = await insumo("Pao", 100, 2);
    const p = await produto("X", 27.6, item.id);
    const id = await comprar(p.slug);
    await pagamentoOutroDia(id);

    const statusAntes = (await pedidoCom(id)).status;
    const movsAntes = await movimentosDe(id);
    const saldoAntes = (
      await prisma.inventoryItem.findFirstOrThrow({ where: { id: item.id } })
    ).quantityOnHand;

    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 27.6, method: "PIX" }, AUTOR,
    );

    const depois = await pedidoCom(id);
    // A quitação FECHA o pedido — regra nova. O estoque, abaixo, não se move.
    expect(statusAntes).toBe("PREPARING");
    expect(depois.status).toBe("COMPLETED");
    expect(depois.paymentStatus).toBe("PAID");
    expect(await movimentosDe(id)).toBe(movsAntes);
    expect(
      Number(
        (await prisma.inventoryItem.findFirstOrThrow({ where: { id: item.id } })).quantityOnHand,
      ),
    ).toBe(Number(saldoAntes));
  });

  it("37 · a venda continua com o valor e a data originais", async () => {
    const p = await produto("X", 27.6);
    const id = await comprar(p.slug);
    const antes = await pedidoCom(id);

    await pagamentoOutroDia(id);
    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 27.6, method: "PIX" }, AUTOR,
    );

    const depois = await pedidoCom(id);
    expect(depois.createdAt.getTime()).toBe(antes.createdAt.getTime());
    expect(Number(depois.total)).toBe(Number(antes.total));
  });
});

// ============================================================
describe("o quadro nao mostra fiado finalizado", () => {
  it("38 · COMPLETED + OPEN sai de Finalizados, no card E no contador", async () => {
    /*
     * O Kanban é o fluxo OPERACIONAL. Um fiado já entregue não tem mais nada a
     * ser feito ali — o que falta é cobrança, e cobrança tem tela própria.
     *
     * O contador entra na asserção junto com a lista: filtrar só uma das duas
     * faria o cabeçalho prometer um card que não existe.
     */
    const p = await produto("X", 27.6);

    const fiado = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, fiado, AUTOR);
    await transitionOrderStatus(storeId, fiado, "PREPARING", { authorType: "SYSTEM" });
    await transitionOrderStatus(storeId, fiado, "COMPLETED", { authorType: "SYSTEM" });

    const pago = await comprar(p.slug);
    await transitionOrderStatus(storeId, pago, "PREPARING", { authorType: "SYSTEM" });
    await transitionOrderStatus(storeId, pago, "COMPLETED", { authorType: "SYSTEM" });

    // O fiado continua COMPLETED e OPEN no banco: some da TELA, não do dado.
    const noBanco = await pedidoCom(fiado);
    expect(noBanco.status).toBe("COMPLETED");
    expect(noBanco.paymentStatus).toBe("OPEN");

    const board: any = await listKanbanOrders(storeId, { date: hojeLocal() });
    const finalizados = board.columns.find((c: any) => c.status === "COMPLETED");
    const ids = finalizados.orders.map((o: any) => o.id);

    expect(ids).toContain(pago);
    expect(ids).not.toContain(fiado);
    expect(finalizados.total).toBe(1);
  });

  it("39 · RECEIVED + OPEN e PREPARING + OPEN somem os dois", async () => {
    const p = await produto("X", 27.6);
    const id = await comprar(p.slug);

    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    expect(await idsNoKanban()).not.toContain(id); // RECEIVED + OPEN

    await transitionOrderStatus(storeId, id, "PREPARING", { authorType: "SYSTEM" });
    expect(await idsNoKanban()).not.toContain(id); // PREPARING + OPEN
  });
});

// ============================================================
describe("cancelar um fiado estorna o dinheiro", () => {
  /*
   * O CANCELAMENTO FECHA A CONTA DOS DOIS LADOS.
   *
   * Antes, cancelar um fiado deixava a cobrança de pé — o pedido sumia da
   * operação e continuava na lista de quem deve, para sempre. E se já havia
   * recebimento, o dinheiro continuava somando na série de recebimentos
   * enquanto o `refund` do pedido dizia que tinha voltado: o mesmo valor
   * aparecia dos dois lados.
   *
   * O ESTOQUE NÃO MUDA AQUI. Quem trata o material do pedido cancelado é o
   * OrderInventoryHandler, pelo caminho de sempre: reserva revertida, consumo
   * virando PERDA. Estes testes só provam que o dinheiro foi tratado e que o
   * estoque continuou seguindo a regra que já existia.
   */

  const janela = () => ({
    i: new Date(Date.now() - 86_400_000),
    f: new Date(Date.now() + 86_400_000),
  });

  it("40 · cancelado sem pagamento: some da lista de dívidas", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    expect((await RecebimentosService.pagamentosEmAberto(storeId)).quantidade).toBe(1);

    await transitionOrderStatus(storeId, id, "CANCELLED", { authorType: "ADMIN" });

    const lista = await RecebimentosService.pagamentosEmAberto(storeId);
    expect(lista.quantidade).toBe(0);
    expect(lista.total).toBe(0);
    // Não havia dinheiro: não há o que estornar.
    expect(await prisma.orderPayment.count({ where: { orderId: id } })).toBe(0);
  });

  it("41 · cancelado com pagamento parcial: linha preservada e estornada", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 40, method: "CASH" }, AUTOR,
    );

    const { i, f } = janela();
    expect((await RecebimentosService.recebimentosNoPeriodo(storeId, i, f)).total)
      .toBeCloseTo(40, 2);

    await transitionOrderStatus(storeId, id, "CANCELLED", { authorType: "ADMIN" });

    // A LINHA CONTINUA NO BANCO — só deixou de valer.
    const pg = await prisma.orderPayment.findFirstOrThrow({ where: { orderId: id } });
    expect(Number(pg.amount)).toBeCloseTo(40, 2);
    expect(pg.reversedAt).not.toBeNull();
    expect(pg.reversalReason).toBe("Pedido cancelado");

    // E some das duas contas.
    expect((await RecebimentosService.pagamentosEmAberto(storeId)).quantidade).toBe(0);
    expect((await RecebimentosService.recebimentosNoPeriodo(storeId, i, f)).total).toBe(0);
  });

  it("42 · cancelado já quitado: o dinheiro deixa de contar como recebido", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX" }, AUTOR,
    );
    expect((await pedidoCom(id)).paymentStatus).toBe("PAID");

    await transitionOrderStatus(storeId, id, "CANCELLED", { authorType: "ADMIN" });

    const pg = await prisma.orderPayment.findFirstOrThrow({ where: { orderId: id } });
    expect(Number(pg.amount)).toBeCloseTo(100, 2); // o valor original continua legível
    expect(pg.reversedAt).not.toBeNull();

    const { i, f } = janela();
    expect((await RecebimentosService.recebimentosNoPeriodo(storeId, i, f)).total).toBe(0);
  });

  it("43 · quem cancelou fica registrado no estorno", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX" }, AUTOR,
    );

    await transitionOrderStatus(storeId, id, "CANCELLED", {
      authorType: "ADMIN",
      authorId: "adm-9",
      authorName: "Carlos",
    } as any);

    const pg = await prisma.orderPayment.findFirstOrThrow({ where: { orderId: id } });
    expect(pg.reversedById).toBe("adm-9");
  });

  it("44 · cancelar duas vezes não estorna duas vezes", async () => {
    /*
     * A guarda de `transitionOrderStatus` (`if (order.status === status) return
     * ok`) impede a segunda passagem. E mesmo se ela chegasse, o `where` do
     * updateMany exige `reversedAt: null` — não encontraria nada.
     */
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    const r = await RecebimentosService.receberPagamento(
      storeId, id, { amount: 100, method: "PIX" }, AUTOR,
    );
    if (!r.ok) throw new Error(r.erro);

    await transitionOrderStatus(storeId, id, "CANCELLED", { authorType: "ADMIN" });
    const primeiro = (
      await prisma.orderPayment.findFirstOrThrow({ where: { id: r.dados.pagamentoId } })
    ).reversedAt;

    await transitionOrderStatus(storeId, id, "CANCELLED", { authorType: "ADMIN" });
    const segundo = (
      await prisma.orderPayment.findFirstOrThrow({ where: { id: r.dados.pagamentoId } })
    ).reversedAt;

    expect(segundo?.getTime()).toBe(primeiro?.getTime()); // a marca não foi reescrita
    expect(await prisma.orderPayment.count({ where: { orderId: id } })).toBe(1);
  });

  it("45 · o estoque do cancelamento segue a regra de sempre", async () => {
    /*
     * O material consumido vira PERDA — comportamento que já existia e que o
     * estorno de dinheiro não pode ter mudado.
     */
    const item = await insumo("Pao", 100, 2);
    const p = await produto("X", 100, item.id);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await transitionOrderStatus(storeId, id, "PREPARING", { authorType: "SYSTEM" });
    await OrderInventoryHandler.onOrderPreparing(id);
    expect(await consumosDe(id)).toBe(1);

    await transitionOrderStatus(storeId, id, "CANCELLED", { authorType: "ADMIN" });
    await OrderInventoryHandler.onOrderCancelled(id);

    // O consumo foi estornado e virou perda — exatamente como antes do fiado.
    const perdas = await prisma.inventoryMovement.count({
      where: { reference: id, type: "LOSS" },
    });
    expect(perdas).toBe(1);
  });

  it("46 · transição normal NÃO estorna pagamento nenhum", async () => {
    /*
     * O `updateMany` fica no array da transação de toda transição. Só o
     * cancelamento casa com alguma linha; as outras precisam ser no-op.
     */
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 40, method: "CASH" }, AUTOR,
    );

    await transitionOrderStatus(storeId, id, "PREPARING", { authorType: "SYSTEM" });
    await transitionOrderStatus(storeId, id, "COMPLETED", { authorType: "SYSTEM" });

    const pg = await prisma.orderPayment.findFirstOrThrow({ where: { orderId: id } });
    expect(pg.reversedAt).toBeNull(); // o dinheiro continua valendo
    expect(saldoDoPedido(await pedidoCom(id)).toNumber()).toBeCloseTo(60, 2);
  });
});

// ============================================================
describe("o fiado reaparece em Finalizados ao ser quitado", () => {
  it("47 · COMPLETED + OPEN some; ao quitar, volta a Finalizados", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await transitionOrderStatus(storeId, id, "PREPARING", { authorType: "SYSTEM" });
    await transitionOrderStatus(storeId, id, "COMPLETED", { authorType: "SYSTEM" });

    const escondido: any = await listKanbanOrders(storeId, { date: hojeLocal() });
    const finalizados1 = escondido.columns.find((c: any) => c.status === "COMPLETED");
    expect(finalizados1.orders.map((o: any) => o.id)).not.toContain(id);
    expect(finalizados1.total).toBe(0);

    // Recebimento parcial: continua escondido.
    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 40, method: "CASH" }, AUTOR,
    );
    const parcial: any = await listKanbanOrders(storeId, { date: hojeLocal() });
    expect(
      parcial.columns.find((c: any) => c.status === "COMPLETED").orders.map((o: any) => o.id),
    ).not.toContain(id);

    // Quitado: `Order.status` não muda, mas o filtro deixa de escondê-lo.
    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 60, method: "PIX" }, AUTOR,
    );
    const pedido = await pedidoCom(id);
    expect(pedido.paymentStatus).toBe("PAID");
    expect(pedido.status).toBe("COMPLETED"); // intacto: o pagamento não moveu a operação

    const visivel: any = await listKanbanOrders(storeId, { date: hojeLocal() });
    const finalizados2 = visivel.columns.find((c: any) => c.status === "COMPLETED");
    expect(finalizados2.orders.map((o: any) => o.id)).toContain(id);
    expect(finalizados2.total).toBe(1);

    // E sai da cobrança.
    expect((await RecebimentosService.pagamentosEmAberto(storeId)).quantidade).toBe(0);
  });

  it("48 · OUT_FOR_DELIVERY + OPEN também some", async () => {
    const p = await produto("X", 100);
    const id = await comprar(p.slug);
    await RecebimentosService.abrirFiado(storeId, id, AUTOR);
    await prisma.order.update({ where: { id }, data: { status: "OUT_FOR_DELIVERY" } });

    const board: any = await listKanbanOrders(storeId, { date: hojeLocal() });
    const rua = board.columns.find((c: any) => c.status === "OUT_FOR_DELIVERY");
    expect(rua.orders.map((o: any) => o.id)).not.toContain(id);
    expect(rua.total).toBe(0);
    // Mas continua na cobrança.
    expect((await RecebimentosService.pagamentosEmAberto(storeId)).quantidade).toBe(1);
  });

  it("49 · parcial NÃO finaliza; total finaliza e devolve ao quadro", async () => {
    const item = await insumo("Pao", 100, 2);
    const p = await produto("X", 100, item.id);
    const id = await comprar(p.slug);

    await pagamentoOutroDia(id);
    const saldoDoInsumo = Number(
      (await prisma.inventoryItem.findFirstOrThrow({ where: { id: item.id } })).quantityOnHand,
    );
    expect(saldoDoInsumo).toBe(99); // consumiu uma vez ao aceitar

    // PARCIAL: nada muda de estado nem de estoque.
    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 40, method: "CASH" }, AUTOR,
    );
    let pedido = await pedidoCom(id);
    expect(pedido.paymentStatus).toBe("OPEN");
    expect(pedido.status).toBe("PREPARING"); // NÃO virou COMPLETED
    expect(await idsNoKanban()).not.toContain(id);
    expect(await consumosDe(id)).toBe(1);

    // TOTAL: quita, finaliza e reaparece.
    await RecebimentosService.receberPagamento(
      storeId, id, { amount: 60, method: "PIX" }, AUTOR,
    );
    pedido = await pedidoCom(id);
    expect(pedido.paymentStatus).toBe("PAID");
    expect(pedido.status).toBe("COMPLETED");
    expect(await idsNoKanban()).toContain(id);

    // E o estoque não se moveu em nenhum dos dois recebimentos.
    expect(await consumosDe(id)).toBe(1);
    expect(
      Number(
        (await prisma.inventoryItem.findFirstOrThrow({ where: { id: item.id } })).quantityOnHand,
      ),
    ).toBe(99);
    expect((await RecebimentosService.pagamentosEmAberto(storeId)).quantidade).toBe(0);
  });
});
