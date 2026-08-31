import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { getDashboardData, getOrdersByStatus } from "@/server/services/dashboard-service";
import { RecebimentosService } from "@/server/services/recebimentos-service";
import { transitionOrderStatus } from "@/server/services/order-service";

/*
 * O PAINEL É OPERACIONAL, NÃO FINANCEIRO.
 *
 * A pergunta que ele responde é "como está o restaurante agora", e o número que
 * mais importa é quantos pedidos entraram hoje. Esse número vinha do resumo
 * financeiro, que seguia a regra de venda RECONHECIDA — COMPLETED. Às 11h, com
 * vinte pedidos na casa e três entregues, o painel dizia três.
 *
 * Aqui se tranca a separação: a contagem operacional conta o que entrou. O
 * resumo financeiro não vive mais nesta função — o painel não mostra dinheiro,
 * então parou também de calculá-lo e de enviá-lo.
 */

let storeId = "";
let categoriaId = "";
let unitId = "";
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
    data: { slug: `dash-${Date.now()}`, name: "Cozinha" },
  })).id;
  unitId = (await prisma.inventoryUnit.create({
    data: { code: "un", name: "Unidade", system: "COUNT", isBuiltIn: true },
  })).id;
  categoriaId = (await prisma.category.create({
    data: { storeId, name: "Doces", slug: `dc-${Date.now()}`, kind: "SIMPLE" },
  })).id;
});
afterAll(limparBanco);

async function pedido(status: string, opcoes: { pago?: boolean; horasAtras?: number } = {}) {
  return prisma.order.create({
    data: {
      storeId,
      number: numero++,
      status: status as any,
      paymentStatus: opcoes.pago ? "PAID" : "PENDING",
      customerName: "Cliente",
      customerPhone: "11999999999",
      paymentMethod: "PIX",
      subtotal: 50,
      total: 50,
      createdAt: new Date(Date.now() - (opcoes.horasAtras ?? 0) * 3600_000),
      items: {
        create: [{ productNameSnapshot: "Bolo", unitPrice: 50, quantity: 1 }],
      },
    },
  });
}

/** Item de estoque com saldo e, opcionalmente, produto de cardápio ligado. */
async function itemComProduto(opcoes: {
  saldo: number;
  reservado?: number;
  minimo?: number | null;
  comProduto?: boolean;
}) {
  const item = await prisma.inventoryItem.create({
    data: {
      storeId,
      name: `Item ${Math.random().toString(36).slice(2, 7)}`,
      itemType: "PREPARED",
      baseUnitId: unitId,
      quantityOnHand: opcoes.saldo,
      quantityReserved: opcoes.reservado ?? 0,
      minimumThreshold: opcoes.minimo ?? null,
    },
  });
  if (opcoes.comProduto !== false) {
    await prisma.product.create({
      data: {
        storeId,
        categoryId: categoriaId,
        name: "Produto",
        slug: `p-${Math.random().toString(36).slice(2, 8)}`,
        description: "",
        basePrice: 30,
        inventoryItemId: item.id,
      },
    });
  }
  return item;
}

const painel = () => getDashboardData(storeId);

describe("pedidos hoje — a contagem operacional", () => {
  it("01 · conta TODOS os que entraram, não só os concluídos", async () => {
    /*
     * A REGRESSÃO QUE ESTE TESTE IMPEDE. Três concluídos e dois em andamento
     * são cinco pedidos na casa hoje. Um painel que mostrasse dois faria o dono
     * achar que o movimento caiu.
     */
    await pedido("COMPLETED");
    await pedido("COMPLETED");
    await pedido("COMPLETED");
    await pedido("PREPARING");
    await pedido("RECEIVED");

    const d = await painel();
    expect(d.operacao.pedidosHoje).toBe(5);
    expect(d.operacao.pedidosHoje).not.toBe(3);
  });

  it("02 · cancelado NÃO entra na contagem", async () => {
    // Entrou e saiu: contá-lo faria o movimento parecer maior que o real.
    await pedido("RECEIVED");
    await pedido("CANCELLED");

    expect((await painel()).operacao.pedidosHoje).toBe(1);
  });

  it("03 · pedido de ontem não conta como de hoje", async () => {
    await pedido("RECEIVED");
    await pedido("COMPLETED", { horasAtras: 30 });

    expect((await painel()).operacao.pedidosHoje).toBe(1);
  });

  it("04 · o total sai do mesmo groupBy dos status", async () => {
    // Nenhuma consulta extra: se divergirem, alguém somou por outro caminho.
    await pedido("RECEIVED");
    await pedido("PREPARING");
    await pedido("COMPLETED");

    const s = await getOrdersByStatus(storeId);
    expect(s.total).toBe(3);
    expect(s.received + s.preparing + s.completed).toBe(s.total);
  });

  it("05 · em preparo é só PREPARING", async () => {
    await pedido("PREPARING");
    await pedido("PREPARING");
    await pedido("RECEIVED");

    expect((await painel()).operacao.emPreparo).toBe(2);
  });
});

describe("aguardando recebimento", () => {
  it("06 · exige PAID E RECEIVED, e tempo parado", async () => {
    await pedido("RECEIVED", { pago: true, horasAtras: 2 });
    await pedido("RECEIVED", { pago: false, horasAtras: 2 }); // não pago
    await pedido("PREPARING", { pago: true, horasAtras: 2 }); // já andou

    const d = await painel();
    expect(d.operacao.aguardandoRecebimento).toBe(1);
    expect(d.operacao.minutosAguardando).toBe(15);
  });

  it("07 · pedido pago ONTEM e esquecido continua aparecendo", async () => {
    // O recorte do Kanban é diário; este alerta não segue esse corte.
    await pedido("RECEIVED", { pago: true, horasAtras: 30 });

    expect((await painel()).operacao.aguardandoRecebimento).toBe(1);
  });
});

describe("produtos esgotados", () => {
  it("08 · conta o produto cujo item ficou sem saldo", async () => {
    await itemComProduto({ saldo: 0 });
    await itemComProduto({ saldo: 10 });

    expect((await painel()).operacao.produtosEsgotados).toBe(1);
  });

  it("09 · a reserva conta: separado não está à venda", async () => {
    // Mesma regra da vitrine — disponivel = onHand - reserved.
    await itemComProduto({ saldo: 5, reservado: 5 });

    expect((await painel()).operacao.produtosEsgotados).toBe(1);
  });

  it("10 · item SEM produto de cardápio não conta", async () => {
    // Insumo acabado é problema de estoque, não produto esgotado na vitrine.
    await itemComProduto({ saldo: 0, comProduto: false });

    expect((await painel()).operacao.produtosEsgotados).toBe(0);
  });

  it("11 · produto sem vínculo de estoque nunca esgota", async () => {
    // Ausência de vínculo é "não controlo", não "acabou".
    await prisma.product.create({
      data: {
        storeId, categoryId: categoriaId, name: "Refrigerante",
        slug: `r-${Date.now()}`, description: "", basePrice: 8,
      },
    });

    expect((await painel()).operacao.produtosEsgotados).toBe(0);
  });
});

describe("estoque baixo", () => {
  it("12 · conta quem está abaixo do mínimo", async () => {
    await itemComProduto({ saldo: 2, minimo: 5, comProduto: false });
    await itemComProduto({ saldo: 9, minimo: 5, comProduto: false });

    expect((await painel()).operacao.estoqueBaixo).toBe(1);
  });

  it("13 · item SEM limite definido fica de fora, mesmo NEGATIVO", async () => {
    /*
     * Comparar contra zero transformaria todo insumo nunca configurado num
     * alarme permanente — e um alarme que sempre toca ensina a ignorá-lo.
     *
     * O SALDO NEGATIVO é o caso que prova a regra. Com saldo zero o item ficaria
     * de fora por acaso — `Number(null)` é 0, e `0 < 0` é falso; só abaixo de
     * zero a comparação passa a valer, e aí o filtro do banco é a única coisa
     * que segura o alarme. Saldo negativo não é hipótese: a perda por
     * cancelamento grava com `permitirSaldoNegativo`.
     */
    await itemComProduto({ saldo: -3, minimo: null, comProduto: false });
    await itemComProduto({ saldo: 0, minimo: null, comProduto: false });

    expect((await painel()).operacao.estoqueBaixo).toBe(0);
  });

  /*
   * A REGRA VIROU `<=`. Este teste fixava o contrário — era o comportamento de
   * `onHand < minimumThreshold`, uma das oito regras que `statusDoEstoque`
   * substituiu. Estar exatamente no mínimo já é o momento de repor.
   */
  it("14 · exatamente no limite JÁ é baixo", async () => {
    await itemComProduto({ saldo: 5, minimo: 5, comProduto: false });

    expect((await painel()).operacao.estoqueBaixo).toBe(1);
  });

  it("14.1 · um pouco acima do limite não é baixo", async () => {
    await itemComProduto({ saldo: 5.5, minimo: 5, comProduto: false });

    expect((await painel()).operacao.estoqueBaixo).toBe(0);
  });
});

describe("pedidos recentes", () => {
  it("15 · traz os mais novos primeiro, com o que a tela mostra", async () => {
    await pedido("COMPLETED", { horasAtras: 3 });
    await pedido("PREPARING", { horasAtras: 1 });
    const ultimo = await pedido("RECEIVED");

    const d = await painel();
    expect(d.pedidosRecentes[0].id).toBe(ultimo.id);
    expect(d.pedidosRecentes[0].numero).toBe(ultimo.number);
    expect(d.pedidosRecentes[0].itens).toBe(1);
    expect(d.pedidosRecentes[0].cliente).toBe("Cliente");
  });

  it("16 · NENHUM valor em dinheiro atravessa", async () => {
    /*
     * A regra do painel, verificada na estrutura e não na intenção: a tela fica
     * aberta com o cliente do outro lado do balcão.
     */
    await pedido("RECEIVED");

    const linha = (await painel()).pedidosRecentes[0] as Record<string, unknown>;
    for (const proibido of ["total", "subtotal", "unitPrice", "valor", "preco"]) {
      expect(linha).not.toHaveProperty(proibido);
    }
  });

  it("17 · respeita o limite de 5", async () => {
    for (let i = 0; i < 8; i++) await pedido("RECEIVED");

    expect((await painel()).pedidosRecentes).toHaveLength(5);
  });

  it("18 · cancelado não aparece na lista", async () => {
    await pedido("CANCELLED");
    await pedido("RECEIVED");

    const d = await painel();
    expect(d.pedidosRecentes).toHaveLength(1);
    expect(d.pedidosRecentes[0].status).toBe("RECEIVED");
  });

  it("19 · pedido de OUTRA loja não vaza", async () => {
    const outra = await prisma.store.create({
      data: { slug: `outra-${Date.now()}`, name: "Outra" },
    });
    await prisma.order.create({
      data: {
        storeId: outra.id, number: 999, status: "RECEIVED",
        customerName: "De fora", customerPhone: "11988888888",
        paymentMethod: "PIX", subtotal: 10, total: 10,
      },
    });
    await pedido("RECEIVED");

    const d = await painel();
    expect(d.pedidosRecentes).toHaveLength(1);
    expect(d.pedidosRecentes[0].cliente).toBe("Cliente");
  });
});

describe("aberto agora", () => {
  it("20 · sem horário cadastrado, o painel diz fechado", async () => {
    // Ausência de dado não vira promessa de atendimento.
    expect((await painel()).operacao.abertoAgora).toBe(false);
  });
});

// ============================================================
describe("fiado nao conta como pedido operacional", () => {
  /*
   * A REGRA: um pedido com pagamento em aberto já foi feito e já saiu do
   * estoque. O que falta nele é dinheiro, não trabalho — contá-lo na barra de
   * operação anuncia uma fila que a cozinha não tem.
   *
   * É a mesma regra do Kanban, aplicada à outra tela que mostra pedidos.
   *
   * O AUTOR é fixo: quem abriu a conta não muda nada aqui, e o que se mede é
   * a classificação do pedido nos indicadores.
   */
  const AUTOR = { id: "adm-1", name: "Maria do Balcão", email: "maria@loja.com" };

  it("21 · pedido OPEN sai de Pedidos hoje e de Recebidos", async () => {
    const normal = await pedido("RECEIVED");
    const fiado = await pedido("RECEIVED");

    const antes = await painel();
    expect(antes.operacao.pedidosHoje).toBe(2);
    expect(antes.byStatus.received).toBe(2);

    await RecebimentosService.abrirFiado(storeId, fiado.id, AUTOR);

    const depois = await painel();
    expect(depois.operacao.pedidosHoje).toBe(1); // só o normal
    expect(depois.byStatus.received).toBe(1);

    // O pedido continua no banco, inteiro — só mudou de classificação.
    const noBanco = await prisma.order.findFirstOrThrow({ where: { id: fiado.id } });
    expect(noBanco.paymentStatus).toBe("OPEN");
    expect(noBanco.status).toBe("RECEIVED");
    expect(normal.id).toBeTruthy();
  });

  it("22 · pedido OPEN em preparo não conta em Em preparo", async () => {
    const p = await pedido("PREPARING");
    await RecebimentosService.abrirFiado(storeId, p.id, AUTOR);

    const d = await painel();
    expect(d.byStatus.preparing).toBe(0);
    expect(d.operacao.emPreparo).toBe(0);
    expect(d.operacao.pedidosHoje).toBe(0);
  });

  it("23 · pedido OPEN não aparece em Pedidos recentes", async () => {
    const normal = await pedido("RECEIVED");
    const fiado = await pedido("RECEIVED");
    await RecebimentosService.abrirFiado(storeId, fiado.id, AUTOR);

    const d = await painel();
    const ids = d.pedidosRecentes.map((r: any) => r.id);
    expect(ids).toContain(normal.id);
    expect(ids).not.toContain(fiado.id);
  });

  it("24 · o card mostra o saldo REAL, não o total do pedido", async () => {
    /*
     * O valor sai de `pagamentosEmAberto`, a mesma função da tela de
     * recebimentos: total − refund − pagamentos não estornados. Um pagamento
     * parcial precisa reduzir o card, e não só a tela.
     */
    const p = await pedido("RECEIVED");
    await RecebimentosService.abrirFiado(storeId, p.id, AUTOR);

    let d = await painel();
    expect(d.operacao.pagamentosEmAberto).toBe(1);
    expect(d.operacao.valorEmAberto).toBeCloseTo(50, 2);

    await RecebimentosService.receberPagamento(
      storeId, p.id, { amount: 10, method: "CASH" }, AUTOR,
    );

    d = await painel();
    expect(d.operacao.pagamentosEmAberto).toBe(1); // continua uma conta
    expect(d.operacao.valorEmAberto).toBeCloseTo(40, 2); // com saldo menor
  });

  it("25 · ao quitar, some do card e volta aos indicadores", async () => {
    const p = await pedido("PREPARING");
    await RecebimentosService.abrirFiado(storeId, p.id, AUTOR);

    let d = await painel();
    expect(d.operacao.pagamentosEmAberto).toBe(1);
    expect(d.operacao.pedidosHoje).toBe(0);

    await RecebimentosService.receberPagamento(
      storeId, p.id, { amount: 50, method: "PIX" }, AUTOR,
    );

    d = await painel();
    expect(d.operacao.pagamentosEmAberto).toBe(0);
    expect(d.operacao.valorEmAberto).toBe(0);
    // Quitado, volta a ser um pedido como qualquer outro.
    expect(d.operacao.pedidosHoje).toBe(1);
    expect(d.byStatus.completed).toBe(1);
    expect(d.pedidosRecentes.map((r: any) => r.id)).toContain(p.id);
  });

  it("26 · pedido normal continua contando, sem mudança nenhuma", async () => {
    const p = await pedido("RECEIVED");

    const d = await painel();
    expect(d.operacao.pedidosHoje).toBe(1);
    expect(d.byStatus.received).toBe(1);
    expect(d.operacao.pagamentosEmAberto).toBe(0);
    expect(d.operacao.valorEmAberto).toBe(0);
    expect(d.pedidosRecentes.map((r: any) => r.id)).toContain(p.id);
  });
});
