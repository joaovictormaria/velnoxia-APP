import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { garantirRecurso, RecursoIndisponivelError } from "../guarda-de-recurso";
import { recursoNoEstado } from "@/lib/planos/resolucao";
import { RECURSO_DA_ROTA } from "@/lib/planos/navegacao";
import { getStoreBySlug } from "@/server/repositories/store-repository";
import type { CurrentAdmin } from "@/server/auth/session";

/*
 * O ENFORCEMENT DE FUNCIONÁRIOS E BENEFÍCIOS.
 *
 * São DOIS módulos, e a separação é deliberada: ter a equipe cadastrada não
 * implica ter programa de benefício. Hoje os dois caem no mesmo plano, mas
 * fundi-los agora tiraria a liberdade de vendê-los separados depois.
 *
 * O ponto delicado desta fase é o CHECKOUT: ele é público, é BASIC, e aceita
 * dois campos que pertencem ao benefício. A função continua aberta; os campos
 * é que fecham.
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

const OS_DOIS = ["FUNCIONARIOS", "BENEFICIOS"] as const;

describe("BASIC — os dois módulos recusados", () => {
  const rotulos: Record<string, string> = {
    FUNCIONARIOS: "Funcionários",
    BENEFICIOS: "Planos de benefício",
  };

  for (const recurso of OS_DOIS) {
    it(`${recurso} lança o erro de domínio`, () => {
      try {
        garantirRecurso(BASIC, recurso);
        expect.unreachable("deveria ter lançado");
      } catch (erro) {
        const e = erro as RecursoIndisponivelError;
        expect(e).toBeInstanceOf(RecursoIndisponivelError);
        expect(e.recurso).toBe(recurso);
        expect(e.rotulo).toBe(rotulos[recurso]);
        expect(e.message).toBe("Este recurso está disponível no plano Premium.");
      }
    });
  }

  for (const operacao of [
    "listar funcionários",
    "criar funcionário",
    "editar funcionário",
    "ativar / desativar",
    "relatório de consumo",
  ]) {
    it(`${operacao} → bloqueado`, () => {
      expect(() => garantirRecurso(BASIC, "FUNCIONARIOS")).toThrow(RecursoIndisponivelError);
    });
  }

  for (const operacao of ["criar plano", "editar plano", "consultar plano", "aplicar benefício"]) {
    it(`${operacao} → bloqueado`, () => {
      expect(() => garantirRecurso(BASIC, "BENEFICIOS")).toThrow(RecursoIndisponivelError);
    });
  }
});

describe("BASIC — vender continua liberado", () => {
  for (const recurso of [
    "PEDIDOS",
    "BALCAO",
    "CARDAPIO",
    "CLIENTES",
    "DELIVERY_BASICO",
    "DASHBOARD",
  ] as const) {
    it(`${recurso} passa`, () => {
      expect(() => garantirRecurso(BASIC, recurso)).not.toThrow();
    });
  }

  /*
   * Pix, cartão e dinheiro são configuração da loja, não módulo. Só PAYROLL
   * depende do benefício — e é a única forma que nunca esteve em
   * `acceptedPaymentMethods`.
   */
  it("as formas de pagamento comuns não são recursos", () => {
    const catalogo = readFileSync(
      resolve(__dirname, "../../../lib/planos/catalogo.ts"),
      "utf8",
    );
    for (const forma of ["PIX", "CREDIT_CARD", "DEBIT_CARD", "CASH", "PAYROLL"]) {
      expect(catalogo).not.toContain(forma);
    }
  });
});

describe("PREMIUM, TRIAL e LEGADO", () => {
  for (const recurso of OS_DOIS) {
    it(`${recurso}: PREMIUM passa`, () => {
      expect(() => garantirRecurso(PREMIUM, recurso)).not.toThrow();
    });
    it(`${recurso}: TRIAL passa, inclusive com BASIC contratado`, () => {
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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O BENEFÍCIO NO CHECKOUT PÚBLICO
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("com o banco — o checkout decide pelo plano da loja", () => {
  async function limpar() {
    await prisma.store.deleteMany({});
  }
  beforeEach(limpar);
  afterAll(limpar);

  async function criarLoja(slug: string, plan: "BASIC" | "PREMIUM" | null) {
    await prisma.store.create({
      data: {
        slug,
        name: `Loja ${slug}`,
        status: "ACTIVE",
        paidUntil: futuro(20),
        plan,
      },
    });
  }

  /** A mesma decisão que `submitCheckoutFn` toma sobre os campos pagos. */
  async function beneficioLiberadoPara(slug: string): Promise<boolean> {
    const store = await getStoreBySlug(slug);
    if (!store) return false;
    return recursoNoEstado(estadoComercialDaLoja(store), "BENEFICIOS") !== "BLOQUEADO";
  }

  it("loja BASIC → benefício recusado no checkout", async () => {
    await criarLoja("basica", "BASIC");
    expect(await beneficioLiberadoPara("basica")).toBe(false);
  });

  it("loja PREMIUM → benefício liberado", async () => {
    await criarLoja("premium", "PREMIUM");
    expect(await beneficioLiberadoPara("premium")).toBe(true);
  });

  it("loja legada → liberado, transitoriamente", async () => {
    await prisma.store.create({
      data: { slug: "legada", name: "Legada", status: "ACTIVE", plan: null },
    });
    expect(await beneficioLiberadoPara("legada")).toBe(true);
  });

  /* Trocar o slug leva a outra loja, com o plano dela. Não há bypass. */
  it("o storeSlug escolhe a loja, não o plano", async () => {
    await criarLoja("basica", "BASIC");
    await criarLoja("premium", "PREMIUM");
    expect(await beneficioLiberadoPara("basica")).toBe(false);
    expect(await beneficioLiberadoPara("premium")).toBe(true);
    expect(await beneficioLiberadoPara("inexistente")).toBe(false);
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

  const POR_RECURSO: Array<[string, string[]]> = [
    [
      "FUNCIONARIOS",
      [
        "listEmployeesFn",
        "consumoDeFuncionariosFn",
        "saveEmployeeFn",
        "setEmployeeActiveFn",
        "deleteEmployeeFn",
      ],
    ],
    ["BENEFICIOS", ["listBenefitPlansFn", "saveBenefitPlanFn", "deleteBenefitPlanFn"]],
  ];

  for (const [recurso, funcoes] of POR_RECURSO) {
    for (const nome of funcoes) {
      it(`employees.fn.ts · ${nome} exige ${recurso}`, () => {
        const bloco = blocoDa(fonte("employees.fn.ts"), nome);
        expect(bloco).toContain(`exigirRecurso("${recurso}")`);
        expect(bloco).not.toContain("requireAdminSession()");
      });
    }
  }

  /*
   * OS DOIS MÓDULOS FICARAM SEPARADOS. Se alguém fundi-los, este teste cai —
   * e com ele a possibilidade de vendê-los em planos diferentes depois.
   */
  it("funcionário e benefício não foram fundidos num recurso só", () => {
    const codigo = fonte("employees.fn.ts");
    expect(codigo).toContain('exigirRecurso("FUNCIONARIOS")');
    expect(codigo).toContain('exigirRecurso("BENEFICIOS")');
    expect(blocoDa(codigo, "saveEmployeeFn")).not.toContain('"BENEFICIOS"');
    expect(blocoDa(codigo, "saveBenefitPlanFn")).not.toContain('"FUNCIONARIOS"');
  });

  /*
   * As duas funções públicas de benefício: decidem pela loja, e a recusa NÃO
   * revela o plano — numa loja sem o módulo simplesmente não há benefício.
   */
  it("employee-benefit.fn: as duas públicas decidem pela loja", () => {
    const codigo = fonte("employee-benefit.fn.ts");
    expect(
      codigo.split('recursoNoEstado(estadoComercialDaLoja(store), "BENEFICIOS")').length - 1,
    ).toBe(2);

    const imports = [...codigo.matchAll(/^import .*$/gm)].map((m) => m[0]).join("\n");
    expect(imports).not.toContain("requireAdminSession");
    expect(codigo).not.toContain("exigirRecurso(");
    expect(codigo).not.toContain("disponível no plano");
  });

  /*
   * ═══ O CHECKOUT: FUNÇÃO ABERTA, CAMPOS FECHADOS ══════════════════════════
   */
  it("submitCheckoutFn continua pública; employeePin e PAYROLL não", () => {
    const codigo = fonte("storefront-checkout.fn.ts");
    expect(codigo).not.toContain("exigirRecurso(");
    expect(codigo).toContain("const pediuBeneficio =");
    expect(codigo).toContain("data.employeePin");
    expect(codigo).toContain('data.paymentMethod === "PAYROLL"');
    expect(codigo).toContain('"BENEFICIOS"');

    // A recusa vem ANTES de criar o pedido.
    const iGuarda = codigo.indexOf("pediuBeneficio &&");
    const iPedido = codigo.indexOf("createOrderFromCheckout(store.id");
    expect(iGuarda).toBeGreaterThan(-1);
    expect(iGuarda).toBeLessThan(iPedido);
  });

  it("o pedido comum não passa pela guarda", () => {
    const codigo = fonte("storefront-checkout.fn.ts");
    /* A condição é sobre os DOIS campos, e não sobre o pedido em si. */
    expect(codigo).toMatch(/pediuBeneficio\s*&&/);
    expect(codigo).not.toMatch(/if \(\s*recursoNoEstado[^)]*\)\s*===\s*"BLOQUEADO"\s*\)\s*\{\s*return[^}]*loja não está/);
  });

  /*
   * O SERVIÇO NÃO CONHECE PLANO. É o que mantém a regra comercial fora do
   * motor de pedidos — e o que permitiu gatear só os campos.
   */
  it("order-service continua sem saber o que é plano", () => {
    const servico = readFileSync(
      resolve(__dirname, "../../services/order-service.ts"),
      "utf8",
    );
    expect(servico).not.toContain("exigirRecurso(");
    expect(servico).not.toContain("garantirRecurso(");
    expect(servico).not.toContain("BENEFICIOS");
    expect(servico).not.toContain("FUNCIONARIOS");
  });

  it("balcão e quadro não conhecem os dois módulos", () => {
    for (const arquivo of ["balcao.fn.ts", "orders.fn.ts"]) {
      const codigo = fonte(arquivo);
      expect(codigo, arquivo).not.toContain('"BENEFICIOS"');
      expect(codigo, arquivo).not.toContain('"FUNCIONARIOS"');
    }
  });

  it("nenhuma guarda específica foi criada", () => {
    for (const arquivo of ["employees.fn.ts", "employee-benefit.fn.ts"]) {
      const codigo = fonte(arquivo);
      expect(codigo).not.toMatch(/exigirFuncionarios|guardaBeneficio|requireEmployee/);
      expect(codigo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
    }
  });
});

describe("rotas e menu", () => {
  const rota = (a: string) =>
    readFileSync(resolve(__dirname, "../../../routes/admin", a), "utf8");

  const PROTEGIDAS: Array<[string, string]> = [
    ["funcionarios/index.tsx", "FUNCIONARIOS"],
    ["funcionarios/planos.tsx", "BENEFICIOS"],
    ["relatorios/funcionarios.tsx", "FUNCIONARIOS"],
  ];

  for (const [arquivo, recurso] of PROTEGIDAS) {
    it(`${arquivo} exige ${recurso}`, () => {
      const codigo = rota(arquivo);
      expect(codigo).toContain(`rotaPremium("${recurso}"`);
      expect(codigo).not.toMatch(/createFileRoute\([^)]*\)\(\{\s*component:/);
    });
  }

  it("o relatório de equipe NÃO virou financeiro por estar na pasta", () => {
    expect(rota("relatorios/funcionarios.tsx")).not.toContain('rotaPremium("FINANCEIRO"');
    expect(RECURSO_DA_ROTA["/admin/relatorios/funcionarios"]).toBe("FUNCIONARIOS");
  });

  it("sidebar, rota e backend usam os mesmos recursos", () => {
    expect(RECURSO_DA_ROTA["/admin/funcionarios"]).toBe("FUNCIONARIOS");
    expect(RECURSO_DA_ROTA["/admin/funcionarios/planos"]).toBe("BENEFICIOS");
  });
});
