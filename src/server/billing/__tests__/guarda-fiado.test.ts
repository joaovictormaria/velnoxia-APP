import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { garantirRecurso, RecursoIndisponivelError } from "../guarda-de-recurso";
import { recursoNoEstado } from "@/lib/planos/resolucao";
import { RECURSO_DA_ROTA } from "@/lib/planos/navegacao";
import type { CurrentAdmin } from "@/server/auth/session";

/*
 * O ENFORCEMENT DO FIADO.
 *
 * O risco desta fase é confundir DINHEIRO com GESTÃO DE DINHEIRO. Todo pedido
 * tem forma de pagamento, o balcão cobra, o checkout escolhe Pix ou cartão — e
 * nada disso é fiado. Fiado é aceitar SEM receber e cobrar depois.
 *
 * Metade dos testes aqui existe para provar que a venda ficou intocada.
 */

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-08-31T12:00:00.000Z");
const futuro = (d: number) => new Date(AGORA.getTime() + d * DIA);

function admin(dados: Partial<LojaParaPlano>): CurrentAdmin {
  const registro: LojaParaPlano = {
    status: "TRIAL",
    trialEndsAt: futuro(7),
    paidUntil: null,
    subscriptionStatus: null,
    plan: null,
    ...dados,
  };
  return { store: { plano: estadoComercialDaLoja(registro, AGORA) } } as unknown as CurrentAdmin;
}

const BASIC = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "BASIC" });
const PREMIUM = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "PREMIUM" });
const EM_TESTE = admin({ status: "TRIAL", trialEndsAt: futuro(7), plan: null });
const TESTE_COM_BASIC = admin({ status: "TRIAL", trialEndsAt: futuro(7), plan: "BASIC" });
const LEGADA = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });

describe("BASIC — fiado recusado", () => {
  it("lança o erro de domínio, com o rótulo do módulo", () => {
    try {
      garantirRecurso(BASIC, "FIADO");
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const e = erro as RecursoIndisponivelError;
      expect(e).toBeInstanceOf(RecursoIndisponivelError);
      expect(e.message).toBe("Este recurso está disponível no plano Premium.");
      expect(e.recurso).toBe("FIADO");
      expect(e.rotulo).toBe("Fiado e contas a receber");
    }
  });

  /* Abrir, listar, receber, receber em parte e estornar — todas a mesma porta. */
  for (const operacao of [
    "abrir conta em aberto",
    "listar pagamentos em aberto",
    "receber pagamento",
    "receber parcialmente",
    "estornar recebimento",
  ]) {
    it(`${operacao} → bloqueado`, () => {
      expect(() => garantirRecurso(BASIC, "FIADO")).toThrow(RecursoIndisponivelError);
    });
  }

  it("a rota de pagamentos em aberto fica bloqueada", () => {
    expect(RECURSO_DA_ROTA["/admin/relatorios/recebimentos"]).toBe("FIADO");
    expect(recursoNoEstado(BASIC.store.plano, "FIADO")).toBe("BLOQUEADO");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O BASIC CONTINUA VENDENDO
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("BASIC — a venda inteira segue liberada", () => {
  for (const recurso of [
    "PEDIDOS",
    "BALCAO",
    "CARDAPIO",
    "DELIVERY_BASICO",
    "CLIENTES",
    "DASHBOARD",
  ] as const) {
    it(`${recurso} passa`, () => {
      expect(() => garantirRecurso(BASIC, recurso)).not.toThrow();
    });
  }

  /*
   * As formas de pagamento NÃO passam pelo entitlement: elas são configuração
   * da loja (`acceptedPaymentMethods`), não módulo. Pix, cartão e dinheiro
   * continuam sendo escolha do lojista em qualquer plano — o que o FIADO
   * governa é aceitar SEM receber.
   */
  it("Pix, cartão e dinheiro não dependem de recurso nenhum", () => {
    const catalogo = readFileSync(
      resolve(__dirname, "../../../lib/planos/catalogo.ts"),
      "utf8",
    );
    for (const forma of ["PIX", "CREDIT_CARD", "DEBIT_CARD", "CASH"]) {
      expect(catalogo).not.toContain(forma);
    }
  });
});

describe("PREMIUM, TRIAL e LEGADO — fiado liberado", () => {
  it("PREMIUM passa", () => {
    expect(() => garantirRecurso(PREMIUM, "FIADO")).not.toThrow();
  });

  it("TRIAL passa, inclusive com BASIC contratado", () => {
    expect(() => garantirRecurso(EM_TESTE, "FIADO")).not.toThrow();
    expect(() => garantirRecurso(TESTE_COM_BASIC, "FIADO")).not.toThrow();
    expect(TESTE_COM_BASIC.store.plano.armazenado).toBe("BASIC");
  });

  it("LEGADO passa, e segue sem classificação", () => {
    expect(() => garantirRecurso(LEGADA, "FIADO")).not.toThrow();
    expect(LEGADA.store.plano.legado).toBe(true);
    expect(LEGADA.store.plano.armazenado).toBeNull();
  });
});

describe("cobertura do backend", () => {
  const raiz = resolve(__dirname, "../../functions");
  const fonte = (a: string) => readFileSync(resolve(raiz, a), "utf8");

  function blocoDa(codigo: string, nome: string): string {
    const i = codigo.indexOf(`export const ${nome} = createServerFn`);
    expect(i, `${nome} não encontrada`).toBeGreaterThan(-1);
    const fim = codigo.indexOf("export const ", i + 10);
    return fim < 0 ? codigo.slice(i) : codigo.slice(i, fim);
  }

  const DE_FIADO = [
    "abrirFiadoFn",
    "receberPagamentoFn",
    "estornarPagamentoFn",
    "getPagamentosEmAbertoFn",
    "getRecebimentosFn",
  ];

  for (const nome of DE_FIADO) {
    it(`recebimentos.fn.ts · ${nome} exige FIADO`, () => {
      const bloco = blocoDa(fonte("recebimentos.fn.ts"), nome);
      expect(bloco).toContain('exigirRecurso("FIADO")');
      expect(bloco).not.toContain("await requireAdminSession()");
    });
  }

  /*
   * ═══ "PAGAR DEPOIS" — A RECUSA NA ORIGEM ════════════════════════════════
   *
   * `criarPedidoDeBalcaoFn` continua ABERTA: vender no balcão é BASIC. O que é
   * pago é o campo `fiado`, e a recusa vem ANTES de o pedido nascer — depois,
   * o pedido já existiria com estoque reservado e a dívida recusada.
   */
  it("o balcão continua aberto, e a caixinha 'pagar depois' não", () => {
    const bloco = blocoDa(fonte("balcao.fn.ts"), "criarPedidoDeBalcaoFn");
    expect(bloco).not.toContain('exigirRecurso("FIADO")');
    expect(bloco).toContain('if (data.fiado) garantirRecurso(admin, "FIADO");');

    // A recusa vem antes de criar o pedido.
    const iGuarda = bloco.indexOf('garantirRecurso(admin, "FIADO")');
    const iPedido = bloco.indexOf("createOrderFromCheckout");
    expect(iGuarda).toBeGreaterThan(-1);
    expect(iGuarda).toBeLessThan(iPedido);
  });

  it("precificar no balcão não foi gateado", () => {
    expect(blocoDa(fonte("balcao.fn.ts"), "precificarBalcaoFn")).not.toContain("Recurso(");
  });

  /*
    A venda pura segue sem guarda — asserção POR FUNÇÃO.

    `orders.fn.ts` mistura venda com frota: o despacho de entregador é pago
    desde a fase do Delivery. Proibir a palavra no arquivo inteiro reprovaria
    aquela fase; o que precisa continuar livre são as funções da venda.
  */
  it("pedidos e checkout continuam sem guarda de recurso", () => {
    expect(fonte("storefront-checkout.fn.ts")).not.toContain("Recurso(");
    for (const nome of [
      "listKanbanOrdersFn",
      "updateOrderStatusFn",
      "confirmPaymentFn",
      "getOrderFn",
      "updateOrderNotesFn",
    ]) {
      expect(blocoDa(fonte("orders.fn.ts"), nome), nome).not.toContain("Recurso(");
    }
  });

  it("nenhuma guarda específica de fiado foi criada", () => {
    const codigo = fonte("recebimentos.fn.ts");
    expect(codigo).not.toMatch(/exigirFiado|guardaFiado|requireFiado/);
    expect(codigo).toContain('from "@/server/billing/guarda-de-recurso"');
    expect(codigo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
  });
});

describe("dashboard — dados BASIC preservados, fatia de fiado omitida", () => {
  const codigo = readFileSync(
    resolve(__dirname, "../../functions/dashboard.fn.ts"),
    "utf8",
  );

  it("o painel inteiro NÃO é gateado", () => {
    expect(codigo).not.toContain('exigirRecurso("FIADO")');
    expect(codigo).toContain("requireAdminSession()");
  });

  it("só os dois campos de fiado saem da resposta", () => {
    expect(codigo).toContain("pagamentosEmAberto");
    expect(codigo).toContain("valorEmAberto");
    expect(codigo).toContain('recursoNoEstado(admin.store.plano, "FIADO")');
  });

  /*
   * OMITIDOS, e não zerados. Um zero afirmaria "você não tem nada a receber" —
   * afirmação sobre o negócio, não sobre o plano. Ausente, a barra não desenha
   * o cartão.
   */
  it("os campos são omitidos, não zerados", () => {
    expect(codigo).toMatch(/const \{ pagamentosEmAberto: _q, valorEmAberto: _v, \.\.\.operacao \}/);
    expect(codigo).not.toMatch(/pagamentosEmAberto:\s*0/);
    expect(codigo).not.toMatch(/valorEmAberto:\s*0/);
  });
});

describe("rota e interface", () => {
  it("a rota de recebimentos exige FIADO, e não FINANCEIRO", () => {
    const rota = readFileSync(
      resolve(__dirname, "../../../routes/admin/relatorios/recebimentos.tsx"),
      "utf8",
    );
    expect(rota).toContain('rotaPremium("FIADO"');
    expect(rota).not.toContain('rotaPremium("FINANCEIRO"');
    expect(rota).not.toMatch(/createFileRoute\([^)]*\)\(\{\s*component:/);
  });

  it("o indicador do quadro de pedidos não consulta sem o recurso", () => {
    const pedidos = readFileSync(
      resolve(__dirname, "../../../routes/admin/pedidos/index.tsx"),
      "utf8",
    );
    expect(pedidos).toContain("enabled: temFiado");
    expect(pedidos).toContain('recursoNoEstado(admin.store.plano, "FIADO")');
    expect(pedidos).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
  });

  it("a caixinha do balcão só aparece com o recurso", () => {
    const tela = readFileSync(
      resolve(__dirname, "../../../components/admin/balcao/FinalizarPedido.tsx"),
      "utf8",
    );
    expect(tela).toContain("permiteFiado = true");
    expect(tela).toContain("{permiteFiado && (");
    // O padrão `true` mantém o comportamento de antes quando a prop não vem.
    expect(tela).toContain("permiteFiado?: boolean;");
  });
});
