import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { garantirRecurso, RecursoIndisponivelError } from "../guarda-de-recurso";
import { RECURSO_DA_ROTA } from "@/lib/planos/navegacao";
import type { CurrentAdmin } from "@/server/auth/session";

/*
 * A PASTA `/admin/relatorios` NÃO É UM MÓDULO.
 *
 * Oito telas moram nela e pertencem a QUATRO recursos diferentes. Este arquivo
 * é sobretudo um teste de CLASSIFICAÇÃO: ele congela quem é quem, para que
 * ninguém "simplifique" gateando o diretório inteiro em RELATORIOS.
 *
 * Por que isso importa: hoje os quatro recursos caem no mesmo plano, e uma
 * classificação errada não teria sintoma. No dia em que um deles for vendido
 * separado, o cliente perderia contas a receber por causa de uma etiqueta.
 */

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-08-31T12:00:00.000Z");
const futuro = (d: number) => new Date(AGORA.getTime() + d * DIA);

function sessao(dados: Partial<LojaParaPlano>): CurrentAdmin {
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

const PAGO = { status: "ACTIVE" as const, trialEndsAt: null, paidUntil: futuro(20) };
const BASIC = sessao({ ...PAGO, plan: "BASIC" });
const PREMIUM = sessao({ ...PAGO, plan: "PREMIUM" });
const EM_TESTE = sessao({ status: "TRIAL", trialEndsAt: futuro(7), plan: null });
const TESTE_COM_BASIC = sessao({ status: "TRIAL", trialEndsAt: futuro(7), plan: "BASIC" });
const LEGADA = sessao({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });

/**
 * A CLASSIFICAÇÃO DE CADA TELA DA PASTA — o contrato desta fase.
 *
 * `rota` é o caminho; `recurso` é o que ela entrega, não onde ela mora.
 */
const TELAS: Array<[arquivo: string, rota: string, recurso: string, conteudo: string]> = [
  ["index.tsx", "/admin/relatorios", "RELATORIOS", "índice das demais telas"],
  ["receita.tsx", "/admin/relatorios/receita", "FINANCEIRO", "faturamento e linha do tempo"],
  ["dashboard-kpi.tsx", "/admin/relatorios/dashboard-kpi", "FINANCEIRO", "KPIs financeiros"],
  ["historico.tsx", "/admin/relatorios/historico", "FINANCEIRO", "histórico de transações"],
  ["perdas.tsx", "/admin/relatorios/perdas", "FINANCEIRO", "perdas em dinheiro"],
  ["produtos.tsx", "/admin/relatorios/produtos", "FINANCEIRO", "margem e rentabilidade"],
  ["funcionarios.tsx", "/admin/relatorios/funcionarios", "FUNCIONARIOS", "consumo da equipe"],
  ["recebimentos.tsx", "/admin/relatorios/recebimentos", "FIADO", "contas a receber"],
];

const raizDasRotas = resolve(__dirname, "../../../routes/admin/relatorios");
const rota = (a: string) => readFileSync(resolve(raizDasRotas, a), "utf8");

describe("classificação — cada tela pelo que entrega, não pela pasta", () => {
  for (const [arquivo, caminho, recurso, conteudo] of TELAS) {
    it(`${arquivo} (${conteudo}) → ${recurso}`, () => {
      const codigo = rota(arquivo);
      expect(codigo, `${arquivo} deve exigir ${recurso}`).toContain(
        `rotaPremium("${recurso}"`,
      );
      // E nenhuma definição crua sobrando por fora da guarda.
      expect(codigo).not.toMatch(/createFileRoute\([^)]*\)\(\{\s*component:/);
      // Menu e rota concordam.
      expect(RECURSO_DA_ROTA[caminho], `${caminho} no mapa`).toBe(recurso);
    });
  }

  /*
   * NENHUMA TELA FICOU DE FORA. Se alguém criar um relatório novo sem
   * classificá-lo, este teste cai — e é a única barreira contra uma tela paga
   * nascer aberta.
   */
  it("todas as telas da pasta estão classificadas", () => {
    const arquivos = readdirSync(raizDasRotas).filter((f) => f.endsWith(".tsx"));
    expect(arquivos.sort()).toEqual(TELAS.map(([a]) => a).sort());
  });

  /*
   * O ERRO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR: gatear o diretório inteiro em
   * RELATORIOS porque as telas moram nele.
   */
  it("só o índice é RELATORIOS puro — as outras sete não", () => {
    const puras = TELAS.filter(([, , r]) => r === "RELATORIOS");
    expect(puras).toHaveLength(1);
    expect(puras[0][0]).toBe("index.tsx");

    for (const [arquivo, , recurso] of TELAS) {
      if (recurso === "RELATORIOS") continue;
      expect(rota(arquivo), `${arquivo} não pode virar RELATORIOS`).not.toContain(
        'rotaPremium("RELATORIOS"',
      );
    }
  });

  it("fiado, financeiro e funcionários não foram reclassificados", () => {
    expect(RECURSO_DA_ROTA["/admin/relatorios/recebimentos"]).toBe("FIADO");
    expect(RECURSO_DA_ROTA["/admin/relatorios/funcionarios"]).toBe("FUNCIONARIOS");
    expect(RECURSO_DA_ROTA["/admin/relatorios/produtos"]).toBe("FINANCEIRO");
  });

  /* Uma tela só pode ter UMA guarda — nada de proteção dupla. */
  it("nenhuma tela tem duas guardas", () => {
    for (const [arquivo] of TELAS) {
      expect(rota(arquivo).split("rotaPremium(").length - 1, arquivo).toBe(1);
    }
  });
});

describe("BASIC — nenhum relatório abre", () => {
  const recursos = [...new Set(TELAS.map(([, , r]) => r))] as Array<
    "RELATORIOS" | "FINANCEIRO" | "FUNCIONARIOS" | "FIADO"
  >;

  for (const recurso of recursos) {
    it(`${recurso} → bloqueado`, () => {
      expect(() => garantirRecurso(BASIC, recurso)).toThrow(RecursoIndisponivelError);
    });
  }

  it("o erro traz o rótulo do módulo certo, não um genérico", () => {
    const rotulos: Record<string, string> = {
      RELATORIOS: "Relatórios avançados",
      FINANCEIRO: "Financeiro",
      FUNCIONARIOS: "Funcionários",
      FIADO: "Fiado e contas a receber",
    };
    for (const recurso of recursos) {
      try {
        garantirRecurso(BASIC, recurso);
        expect.unreachable("deveria ter lançado");
      } catch (erro) {
        expect((erro as RecursoIndisponivelError).rotulo).toBe(rotulos[recurso]);
      }
    }
  });
});

describe("PREMIUM, TRIAL e LEGADO — todos abrem", () => {
  const recursos = ["RELATORIOS", "FINANCEIRO", "FUNCIONARIOS", "FIADO"] as const;

  for (const recurso of recursos) {
    it(`${recurso}: PREMIUM e TRIAL passam`, () => {
      expect(() => garantirRecurso(PREMIUM, recurso)).not.toThrow();
      expect(() => garantirRecurso(EM_TESTE, recurso)).not.toThrow();
      expect(() => garantirRecurso(TESTE_COM_BASIC, recurso)).not.toThrow();
    });
    it(`${recurso}: LEGADO passa temporariamente`, () => {
      expect(() => garantirRecurso(LEGADA, recurso)).not.toThrow();
    });
  }

  it("o teste não reescreve o plano; a legada segue sem classificação", () => {
    expect(TESTE_COM_BASIC.store.plano.armazenado).toBe("BASIC");
    expect(LEGADA.store.plano.legado).toBe(true);
    expect(LEGADA.store.plano.armazenado).toBeNull();
  });
});

describe("cobertura do backend de relatórios", () => {
  const fn = (a: string) =>
    readFileSync(resolve(__dirname, "../../functions", a), "utf8");

  function blocoDa(codigo: string, nome: string): string {
    const i = codigo.indexOf(`export const ${nome} = createServerFn`);
    expect(i, `${nome} não encontrada`).toBeGreaterThan(-1);
    const fim = codigo.indexOf("export const ", i + 10);
    return fim < 0 ? codigo.slice(i) : codigo.slice(i, fim);
  }

  /*
   * `report.fn.ts` é o arquivo mais misturado do projeto: oito funções em três
   * recursos. Esta tabela é o contrato dele.
   */
  const REPORT_FN: Array<[string, string]> = [
    ["adminGetLowStockAlerts2", "ESTOQUE"],
    ["adminGetMovementHistory", "ESTOQUE"],
    ["adminGetCostAnalysis", "ESTOQUE"],
    ["adminGetMovementStats", "ESTOQUE"],
    ["adminGetInventoryValueReport", "ESTOQUE"],
    ["adminGetOrderFulfillmentStats", "RELATORIOS"],
    ["adminGetCompositionUsageReport", "RECEITAS"],
  ];

  for (const [nome, recurso] of REPORT_FN) {
    it(`report.fn.ts · ${nome} exige ${recurso}`, () => {
      const bloco = blocoDa(fn("report.fn.ts"), nome);
      expect(bloco).toContain(`exigirRecurso("${recurso}")`);
      expect(bloco).not.toContain("await requireAdminSession()");
    });
  }

  /*
   * A ÚNICA de `report.fn.ts` que continua aberta, e por decisão da Fase 5: o
   * `ProductForm` a alcança pelo `CompositionBuilder`, e gateá-la quebraria o
   * cadastro de produto BASIC.
   */
  it("adminGetStockReport segue sem guarda — caminho do cadastro BASIC", () => {
    expect(blocoDa(fn("report.fn.ts"), "adminGetStockReport")).not.toContain(
      "exigirRecurso(",
    );
  });

  it("nenhuma guarda específica de relatórios foi criada", () => {
    const codigo = fn("report.fn.ts");
    expect(codigo).not.toMatch(/exigirRelatorios|guardaRelatorio|requireReports/);
    expect(codigo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O DASHBOARD NÃO É A PÁGINA DE RELATÓRIOS
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("dashboard — intocado por esta fase", () => {
  const dashboard = readFileSync(
    resolve(__dirname, "../../functions/dashboard.fn.ts"),
    "utf8",
  );

  it("getDashboardFn não virou RELATORIOS", () => {
    expect(dashboard).not.toContain("RELATORIOS");
    expect(dashboard).not.toContain("exigirRecurso(");
    expect(dashboard).toContain("requireAdminSession()");
  });

  it("a única fatia omitida continua sendo a do fiado", () => {
    expect(dashboard).toContain('recursoNoEstado(admin.store.plano, "FIADO")');
    expect(dashboard).toMatch(/pagamentosEmAberto: _q, valorEmAberto: _v/);
    // Nada é fingido como zero.
    expect(dashboard).not.toMatch(/pagamentosEmAberto:\s*0/);
  });

  it("a rota do painel continua aberta ao BASIC", () => {
    const painel = readFileSync(
      resolve(__dirname, "../../../routes/admin/index.tsx"),
      "utf8",
    );
    expect(painel).not.toContain("rotaPremium(");
    expect(RECURSO_DA_ROTA["/admin"]).toBe("DASHBOARD");
  });
});

describe("BASIC — regressão", () => {
  for (const recurso of [
    "DASHBOARD",
    "PEDIDOS",
    "BALCAO",
    "CARDAPIO",
    "CLIENTES",
    "CONFIGURACOES",
    "ASSINATURA",
    "DELIVERY_BASICO",
  ] as const) {
    it(`${recurso} continua liberado`, () => {
      expect(() => garantirRecurso(BASIC, recurso)).not.toThrow();
    });
  }

  it("a venda não ganhou guarda de relatório", () => {
    for (const arquivo of ["orders.fn.ts", "balcao.fn.ts", "storefront-checkout.fn.ts"]) {
      const codigo = readFileSync(
        resolve(__dirname, "../../functions", arquivo),
        "utf8",
      );
      expect(codigo, arquivo).not.toContain('"RELATORIOS"');
    }
  });
});
