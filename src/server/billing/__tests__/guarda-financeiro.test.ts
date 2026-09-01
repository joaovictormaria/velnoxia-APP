import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { garantirRecurso, RecursoIndisponivelError } from "../guarda-de-recurso";
import { RECURSO_DA_ROTA } from "@/lib/planos/navegacao";
import type { CurrentAdmin } from "@/server/auth/session";

/*
 * O ENFORCEMENT DO MÓDULO FINANCEIRO.
 *
 * A regra é a mesma da Fase 5 — nada de novo foi inventado —, então o que este
 * arquivo prova é COBERTURA: quais funções e rotas do financeiro passaram a
 * exigir o recurso, e, tão importante quanto, quais NÃO passaram.
 *
 * O risco desta fase é gatear por engano algo que a venda precisa. Dinheiro
 * aparece no fluxo BASIC o tempo todo — o pedido tem total, o balcão cobra, o
 * checkout escolhe forma de pagamento — e nada disso é ferramenta de gestão
 * financeira. Metade dos testes aqui existe para provar que esse lado ficou
 * intocado.
 */

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-08-31T12:00:00.000Z");
const futuro = (dias: number) => new Date(AGORA.getTime() + dias * DIA);

function admin(dados: Partial<LojaParaPlano>): CurrentAdmin {
  const registro: LojaParaPlano = {
    status: "TRIAL",
    trialEndsAt: futuro(7),
    paidUntil: null,
    subscriptionStatus: null,
    plan: null,
    ...dados,
  };
  return {
    store: { plano: estadoComercialDaLoja(registro, AGORA) },
  } as unknown as CurrentAdmin;
}

const BASIC = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "BASIC" });
const PREMIUM = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "PREMIUM" });
const EM_TESTE = admin({ status: "TRIAL", trialEndsAt: futuro(7), plan: null });
const TESTE_COM_BASIC = admin({ status: "TRIAL", trialEndsAt: futuro(7), plan: "BASIC" });
const LEGADA = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });

describe("BASIC — financeiro recusado", () => {
  it("FINANCEIRO lança o erro de domínio", () => {
    expect(() => garantirRecurso(BASIC, "FINANCEIRO")).toThrow(RecursoIndisponivelError);
  });

  it("a mensagem é a do produto, com o rótulo certo", () => {
    try {
      garantirRecurso(BASIC, "FINANCEIRO");
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const e = erro as RecursoIndisponivelError;
      expect(e.message).toBe("Este recurso está disponível no plano Premium.");
      expect(e.recurso).toBe("FINANCEIRO");
      expect(e.rotulo).toBe("Financeiro");
    }
  });
});

describe("PREMIUM, TRIAL e LEGADO — financeiro liberado", () => {
  it("PREMIUM passa", () => {
    expect(() => garantirRecurso(PREMIUM, "FINANCEIRO")).not.toThrow();
  });

  it("TRIAL passa, inclusive com BASIC contratado", () => {
    expect(() => garantirRecurso(EM_TESTE, "FINANCEIRO")).not.toThrow();
    expect(() => garantirRecurso(TESTE_COM_BASIC, "FINANCEIRO")).not.toThrow();
    expect(TESTE_COM_BASIC.store.plano.armazenado).toBe("BASIC");
  });

  it("LEGADO passa — permissão transitória, sem classificar a loja", () => {
    expect(() => garantirRecurso(LEGADA, "FINANCEIRO")).not.toThrow();
    expect(LEGADA.store.plano.legado).toBe(true);
    expect(LEGADA.store.plano.efetivo).toBeNull();
    expect(LEGADA.store.plano.armazenado).toBeNull();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O BASIC CONTINUA VENDENDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Isso é necessário para vender?" ou "é ferramenta de gestão financeira?".
 * Só a segunda é paga, e este bloco é a prova de que a primeira ficou de fora.
 */
describe("BASIC — o que a venda precisa continua liberado", () => {
  for (const recurso of ["PEDIDOS", "BALCAO", "CARDAPIO", "DELIVERY_BASICO", "CLIENTES", "DASHBOARD"] as const) {
    it(`${recurso} passa no BASIC`, () => {
      expect(() => garantirRecurso(BASIC, recurso)).not.toThrow();
    });
  }
});

describe("cobertura do backend financeiro", () => {
  const raiz = resolve(__dirname, "../../functions");
  const fonte = (a: string) => readFileSync(resolve(raiz, a), "utf8");

  function blocoDa(codigo: string, nome: string): string {
    const i = codigo.indexOf(`export const ${nome} = createServerFn`);
    expect(i, `${nome} não encontrada`).toBeGreaterThan(-1);
    const fim = codigo.indexOf("export const ", i + 10);
    return fim < 0 ? codigo.slice(i) : codigo.slice(i, fim);
  }

  const GUARDADAS: Array<[string, string[]]> = [
    [
      "inventory-costs.fn.ts",
      [
        "getOrderCost",
        "getCostReport",
        "calculateMargin",
        "getProductProfitability",
        "getFinancialKPIs",
        "getPedidosComEstoqueInconsistente",
        "getPerdas",
      ],
    ],
    ["financial-timeline.fn.ts", ["getFinancialTimeline"]],
    ["transaction-history.fn.ts", ["getTransactionHistory"]],
  ];

  for (const [arquivo, funcoes] of GUARDADAS) {
    const codigo = fonte(arquivo);
    for (const nome of funcoes) {
      it(`${arquivo} · ${nome} exige FINANCEIRO`, () => {
        const bloco = blocoDa(codigo, nome);
        expect(bloco).toContain('exigirRecurso("FINANCEIRO")');
        expect(bloco).not.toContain("await requireAdminSession()");
      });
    }
  }

  /*
   * O OUTRO LADO. Estas funções mexem com dinheiro e NÃO podem ser gateadas:
   * ou servem à venda, ou pertencem a um módulo com fase própria.
   */
  const SEM_GUARDA: Array<[string, string[], string]> = [
    ["dashboard.fn.ts", ["getDashboardFn"], "alimenta a barra do painel BASIC inteira"],
    ["orders.fn.ts", ["confirmPaymentFn", "updateOrderStatusFn"], "a venda precisa"],
    ["balcao.fn.ts", ["criarPedidoDeBalcaoFn", "precificarBalcaoFn"], "a venda precisa"],
    ["storefront-checkout.fn.ts", ["submitCheckoutFn"], "a venda precisa"],
  ];

  for (const [arquivo, funcoes, motivo] of SEM_GUARDA) {
    const codigo = fonte(arquivo);
    for (const nome of funcoes) {
      it(`${arquivo} · ${nome} NÃO é gateada — ${motivo}`, () => {
        expect(blocoDa(codigo, nome)).not.toContain("exigirRecurso(");
      });
    }
  }

  /*
   * RECEBIMENTOS É FIADO, E NUNCA FINANCEIRO.
   *
   * As cinco passaram a ser gateadas na fase do Fiado — mas o que esta suíte
   * precisa continuar garantindo é a CLASSIFICAÇÃO: elas não podem ser
   * absorvidas pelo Financeiro só por lidarem com dinheiro. Se um dia os dois
   * módulos ficarem em planos diferentes, é esta asserção que impede o
   * cliente de perder contas a receber por causa de uma etiqueta errada.
   */
  for (const nome of [
    "abrirFiadoFn",
    "receberPagamentoFn",
    "estornarPagamentoFn",
    "getPagamentosEmAbertoFn",
    "getRecebimentosFn",
  ]) {
    it(`recebimentos.fn.ts · ${nome} exige FIADO, e não FINANCEIRO`, () => {
      const bloco = blocoDa(fonte("recebimentos.fn.ts"), nome);
      expect(bloco).toContain('exigirRecurso("FIADO")');
      expect(bloco).not.toContain('exigirRecurso("FINANCEIRO")');
    });
  }

  it("nenhum arquivo do financeiro compara plano diretamente", () => {
    for (const [arquivo] of GUARDADAS) {
      expect(fonte(arquivo)).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
    }
  });

  it("nenhuma guarda específica de financeiro foi criada — só a genérica", () => {
    for (const [arquivo] of GUARDADAS) {
      const codigo = fonte(arquivo);
      expect(codigo).not.toMatch(/exigirFinanceiro|guardaFinanceira|requireFinancial/);
      expect(codigo).toContain('from "@/server/billing/guarda-de-recurso"');
    }
  });
});

describe("cobertura das rotas financeiras", () => {
  const raiz = resolve(__dirname, "../../../routes/admin/relatorios");
  const fonte = (a: string) => readFileSync(resolve(raiz, a), "utf8");

  const PROTEGIDAS = ["receita.tsx", "dashboard-kpi.tsx", "historico.tsx", "perdas.tsx", "produtos.tsx"];

  for (const arquivo of PROTEGIDAS) {
    it(`${arquivo} exige FINANCEIRO`, () => {
      const codigo = fonte(arquivo);
      expect(codigo).toContain('rotaPremium("FINANCEIRO"');
      expect(codigo).not.toMatch(/createFileRoute\([^)]*\)\(\{\s*component:/);
    });
  }

  /* Classificadas por FUNÇÃO, não por pasta: as três abaixo moram no mesmo
     diretório e pertencem a outros módulos, cada um com sua fase. */
  const OUTROS_MODULOS: Array<[string, string]> = [
    ["index.tsx", "RELATORIOS — é só um índice de links, sem dado"],
    ["funcionarios.tsx", "FUNCIONARIOS — consumo da equipe"],
    ["recebimentos.tsx", "FIADO — contas a receber"],
  ];

  for (const [arquivo, motivo] of OUTROS_MODULOS) {
    it(`${arquivo} NÃO vira FINANCEIRO por estar na pasta — ${motivo}`, () => {
      expect(fonte(arquivo)).not.toContain('rotaPremium("FINANCEIRO"');
    });
  }
});

describe("o menu concorda com o backend", () => {
  it("a tela de produtos é FINANCEIRO nos dois lados", () => {
    expect(RECURSO_DA_ROTA["/admin/relatorios/produtos"]).toBe("FINANCEIRO");
    const rota = readFileSync(
      resolve(__dirname, "../../../routes/admin/relatorios/produtos.tsx"),
      "utf8",
    );
    expect(rota).toContain('rotaPremium("FINANCEIRO"');
  });

  it("pagamentos em aberto continua FIADO no menu", () => {
    expect(RECURSO_DA_ROTA["/admin/relatorios/recebimentos"]).toBe("FIADO");
  });

  it("o relatório de equipe não virou financeiro", () => {
    /*
      FUNCIONARIOS, e o que importa aqui continua sendo o mesmo: a tela não
      virou FINANCEIRO por morar sob `/relatorios`. O menu foi alinhado à rota.
    */
    expect(RECURSO_DA_ROTA["/admin/relatorios/funcionarios"]).toBe("FUNCIONARIOS");
  });
});
