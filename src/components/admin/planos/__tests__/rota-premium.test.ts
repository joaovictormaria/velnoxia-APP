import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { estadoComercialDaLoja, type LojaParaPlano } from "@/server/billing/plano-da-loja";
import { TODOS_OS_RECURSOS } from "@/lib/planos/catalogo";
import type { Recurso } from "@/lib/planos/tipos";
import {
  rotaBloqueada,
  rotaPremium,
  type ContextoComPlano,
} from "../rota-premium";

/*
 * A PROTEÇÃO DE ROTA DOS MÓDULOS PAGOS.
 *
 * Três coisas se provam aqui:
 *
 *   1. COMPORTAMENTO — o que a guarda decide para cada estado comercial, e que
 *      ela decide o MESMO que o backend (`recursoNoEstado`, fonte única).
 *   2. FLUXO REAL — com lojas criadas no Postgres, pelo mesmo caminho que a
 *      sessão percorre: linha do banco → `estadoComercialDaLoja` → veredito.
 *   3. COBERTURA — quais rotas de fato chamam `rotaPremium`, lendo a fonte.
 *      Uma rota Premium sem guarda é pega aqui.
 *
 * Não há render: o projeto não tem jsdom, e o que decide o bloqueio é uma
 * função pura mais o `beforeLoad`, que também é uma função pura.
 */

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-08-31T12:00:00.000Z");
const futuro = (dias: number) => new Date(AGORA.getTime() + dias * DIA);

const loja = (sobrescreve: Partial<LojaParaPlano>): LojaParaPlano => ({
  status: "TRIAL",
  trialEndsAt: futuro(7),
  paidUntil: null,
  subscriptionStatus: null,
  plan: null,
  ...sobrescreve,
});

/** O contexto que o `beforeLoad` de `/admin` entrega às rotas filhas. */
const contexto = (dadosDaLoja: Partial<LojaParaPlano>): ContextoComPlano => ({
  admin: { store: { plano: estadoComercialDaLoja(loja(dadosDaLoja), AGORA) } },
});

const BASIC = contexto({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "BASIC" });
const PREMIUM = contexto({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "PREMIUM" });
const EM_TESTE = contexto({ status: "TRIAL", trialEndsAt: futuro(7), plan: null });
const TESTE_COM_BASIC = contexto({ status: "TRIAL", trialEndsAt: futuro(7), plan: "BASIC" });
const LEGADA = contexto({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });

describe("BASIC — rota Premium bloqueada, rotas BASIC abertas", () => {
  /* ESTOQUE virou essencial em 31/08/2026; quem bloqueia agora é PRODUCAO. */
  it("produção é bloqueada, estoque não", () => {
    expect(rotaBloqueada(BASIC, "PRODUCAO")).toBe(true);
    expect(rotaBloqueada(BASIC, "ESTOQUE")).toBe(false);
  });

  it("todo recurso exclusivo do Premium bloqueia a rota", () => {
    const avancados: Recurso[] = [
      "PRODUCAO", "RECEITAS", "FINANCEIRO", "FIADO", "MESAS",
      "FUNCIONARIOS", "BENEFICIOS", "MARKETING", "RELATORIOS", "AUDITORIA",
      "DELIVERY_AVANCADO",
    ];
    for (const recurso of avancados) {
      expect(rotaBloqueada(BASIC, recurso), recurso).toBe(true);
    }
  });

  /* O BASIC continua trabalhando: nenhuma rota essencial é bloqueada. */
  it("cardápio, pedidos, balcão, painel, clientes, config e assinatura passam", () => {
    const essenciais: Recurso[] = [
      "CARDAPIO", "PEDIDOS", "BALCAO", "DASHBOARD", "CLIENTES",
      "CONFIGURACOES", "ASSINATURA", ];
    for (const recurso of essenciais) {
      expect(rotaBloqueada(BASIC, recurso), recurso).toBe(false);
    }
  });

  it("a assinatura NUNCA é bloqueada — é por onde se paga", () => {
    for (const ctx of [BASIC, PREMIUM, EM_TESTE, LEGADA]) {
      expect(rotaBloqueada(ctx, "ASSINATURA")).toBe(false);
    }
  });
});

describe("PREMIUM — nenhuma rota bloqueada", () => {
  for (const recurso of TODOS_OS_RECURSOS) {
    it(`${recurso} abre`, () => {
      expect(rotaBloqueada(PREMIUM, recurso)).toBe(false);
    });
  }
});

describe("TRIAL — nenhuma rota bloqueada nos 14 dias", () => {
  for (const recurso of TODOS_OS_RECURSOS) {
    it(`${recurso} abre em teste`, () => {
      expect(rotaBloqueada(EM_TESTE, recurso)).toBe(false);
    });
  }

  it("em teste com BASIC contratado, a rota Premium também abre", () => {
    expect(rotaBloqueada(TESTE_COM_BASIC, "ESTOQUE")).toBe(false);
    expect(TESTE_COM_BASIC.admin!.store.plano.armazenado).toBe("BASIC");
  });
});

describe("LEGADO — permissão transitória da Fase 5", () => {
  it("nenhuma rota é bloqueada", () => {
    for (const recurso of TODOS_OS_RECURSOS) {
      expect(rotaBloqueada(LEGADA, recurso), recurso).toBe(false);
    }
  });

  it("e a loja continua sem classificação", () => {
    expect(LEGADA.admin!.store.plano.legado).toBe(true);
    expect(LEGADA.admin!.store.plano.efetivo).toBeNull();
  });
});

describe("sem sessão — quem desvia é o /admin, não esta guarda", () => {
  it("contexto sem admin não bloqueia", () => {
    expect(rotaBloqueada({ admin: null }, "ESTOQUE")).toBe(false);
  });
});

describe("rotaPremium entrega beforeLoad e component juntos", () => {
  const Falso = () => null;
  const protegida = rotaPremium("ESTOQUE", Falso);

  it("as duas metades vêm de uma chamada só", () => {
    expect(protegida.beforeLoad).toBeInstanceOf(Function);
    expect(protegida.component).toBeInstanceOf(Function);
  });

  it("beforeLoad nomeia o recurso bloqueado para o BASIC", () => {
    expect(protegida.beforeLoad({ context: BASIC })).toEqual({ recursoBloqueado: null });
    const paga = rotaPremium("PRODUCAO", Falso);
    expect(paga.beforeLoad({ context: BASIC })).toEqual({ recursoBloqueado: "PRODUCAO" });
  });

  it("beforeLoad devolve null para quem tem acesso", () => {
    for (const ctx of [PREMIUM, EM_TESTE, LEGADA]) {
      expect(protegida.beforeLoad({ context: ctx })).toEqual({ recursoBloqueado: null });
    }
  });

  it("serve qualquer módulo sem infraestrutura nova", () => {
    for (const recurso of ["FINANCEIRO", "MESAS", "FIADO"] as Recurso[]) {
      const outra = rotaPremium(recurso, Falso);
      expect(outra.beforeLoad({ context: BASIC })).toEqual({ recursoBloqueado: recurso });
      expect(outra.beforeLoad({ context: PREMIUM })).toEqual({ recursoBloqueado: null });
    }
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  COBERTURA DAS ROTAS — a fonte, lida
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("cobertura: quais rotas do painel têm guarda", () => {
  const raiz = resolve(__dirname, "../../../../routes/admin");
  const fonte = (arquivo: string) => readFileSync(resolve(raiz, arquivo), "utf8");

  /** Rotas Premium JÁ protegidas — o escopo da Fase 6. */
  const PROTEGIDAS: Array<[string, Recurso]> = [["auditoria/index.tsx", "AUDITORIA"]];

  for (const [arquivo, recurso] of PROTEGIDAS) {
    it(`${arquivo} exige ${recurso}`, () => {
      const codigo = fonte(arquivo);
      expect(codigo).toContain(`rotaPremium("${recurso}"`);
      // A guarda substitui a definição crua: não pode sobrar um `component:`
      // solto que renderize a tela paga sem passar por ela.
      expect(codigo).not.toMatch(/createFileRoute\([^)]*\)\(\{\s*component:/);
    });
  }

  /** Rotas do BASIC — não podem ganhar guarda. */
  const SEM_GUARDA = [
    /*
     * ESTOQUE virou essencial em 31/08/2026, e a rota inteira abriu: cinco das
     * sete abas são do BASIC. As duas pagas — Preparados (PRODUCAO) e Receitas
     * (RECEITAS) — passaram a ser protegidas ABA A ABA, dentro da página. O
     * teste dessa proteção está logo abaixo.
     */
    "estoque/index.tsx",
    "index.tsx",
    "assinatura.tsx",
    "pedidos/index.tsx",
    "balcao/index.tsx",
    "cardapio/index.tsx",
    "cardapio/novo.tsx",
    "cardapio/$productId.tsx",
    "cardapio/categorias.tsx",
    "clientes/index.tsx",
    "configuracoes/index.tsx",
  ];

  for (const arquivo of SEM_GUARDA) {
    it(`${arquivo} continua aberta ao BASIC`, () => {
      expect(fonte(arquivo)).not.toContain("rotaPremium(");
    });
  }

  /*
   * Rotas Premium AINDA sem guarda, por decisão de escopo: cada módulo tem sua
   * própria fase. A lista é explícita para que "ainda não protegida" seja um
   * fato registrado, e não um esquecimento — quando a fase de cada uma chegar,
   * ela sai daqui e entra em PROTEGIDAS.
   */
  const PENDENTES: Array<[string, Recurso]> = [
    ["mesas/index.tsx", "MESAS"],
    ["funcionarios/index.tsx", "FUNCIONARIOS"],
    ["funcionarios/planos.tsx", "BENEFICIOS"],
    ["entregadores/index.tsx", "DELIVERY_AVANCADO"],
    ["promocoes/index.tsx", "MARKETING"],
    ["cupons/index.tsx", "MARKETING"],
    ["avaliacoes/index.tsx", "MARKETING"],
    ["relatorios/index.tsx", "RELATORIOS"],
    ["relatorios/receita.tsx", "FINANCEIRO"],
    ["relatorios/dashboard-kpi.tsx", "FINANCEIRO"],
    ["relatorios/historico.tsx", "FINANCEIRO"],
    ["relatorios/perdas.tsx", "FINANCEIRO"],
    ["relatorios/produtos.tsx", "RELATORIOS"],
    ["relatorios/funcionarios.tsx", "RELATORIOS"],
    ["relatorios/recebimentos.tsx", "FIADO"],
  ];

  it("as rotas Premium pendentes estão todas mapeadas e existem", () => {
    for (const [arquivo] of PENDENTES) {
      expect(() => fonte(arquivo), arquivo).not.toThrow();
    }
    expect(PENDENTES).toHaveLength(15);
  });

  it("nenhuma rota compara plano diretamente", () => {
    for (const [arquivo] of [...PROTEGIDAS, ...PENDENTES]) {
      const codigo = fonte(arquivo);
      expect(codigo, arquivo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
    }
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  FLUXO REAL — lojas do Postgres
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("com o banco — a rota decidida a partir da loja real", () => {
  async function limpar() {
    await prisma.store.deleteMany({});
  }
  beforeEach(limpar);
  afterAll(limpar);

  async function contextoDaLojaReal(dados: {
    plan?: "BASIC" | "PREMIUM" | null;
    status?: "TRIAL" | "ACTIVE";
    trialEndsAt?: Date | null;
    paidUntil?: Date | null;
  }): Promise<ContextoComPlano> {
    const criada = await prisma.store.create({
      data: {
        slug: `rota-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "Loja de teste",
        status: dados.status ?? "ACTIVE",
        trialEndsAt: dados.trialEndsAt ?? null,
        paidUntil: dados.paidUntil ?? null,
        plan: dados.plan ?? null,
      },
      // O MESMO recorte de `getCurrentAdmin`.
      select: {
        status: true,
        trialEndsAt: true,
        paidUntil: true,
        subscriptionStatus: true,
        plan: true,
      },
    });
    return { admin: { store: { plano: estadoComercialDaLoja(criada, AGORA) } } };
  }

  it("BASIC do banco → estoque aberto, produção bloqueada", async () => {
    const ctx = await contextoDaLojaReal({ plan: "BASIC", paidUntil: futuro(20) });
    expect(rotaBloqueada(ctx, "ESTOQUE")).toBe(false);
    expect(rotaBloqueada(ctx, "PRODUCAO")).toBe(true);
    expect(rotaBloqueada(ctx, "DASHBOARD")).toBe(false);
    expect(rotaBloqueada(ctx, "PEDIDOS")).toBe(false);
    expect(rotaBloqueada(ctx, "BALCAO")).toBe(false);
  });

  it("PREMIUM do banco → /admin/estoque aberta", async () => {
    const ctx = await contextoDaLojaReal({ plan: "PREMIUM", paidUntil: futuro(20) });
    expect(rotaBloqueada(ctx, "ESTOQUE")).toBe(false);
  });

  it("loja nova em teste → /admin/estoque aberta pelos 14 dias", async () => {
    const ctx = await contextoDaLojaReal({ status: "TRIAL", trialEndsAt: futuro(14), plan: null });
    expect(ctx.admin!.store.plano.emTrial).toBe(true);
    expect(rotaBloqueada(ctx, "ESTOQUE")).toBe(false);
  });

  it("legada do banco → aberta, e continua sem plano", async () => {
    const ctx = await contextoDaLojaReal({ plan: null, trialEndsAt: null });
    expect(rotaBloqueada(ctx, "ESTOQUE")).toBe(false);
    expect(ctx.admin!.store.plano.armazenado).toBeNull();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  A TELA DE ESTOQUE — porta aberta, duas abas trancadas
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Desde 31/08/2026 ESTOQUE é essencial e a rota não tem mais `rotaPremium`.
 * O risco que nasce daí é o oposto do anterior: abrir a porta e entregar
 * Preparados e Receitas de brinde. Estas asserções leem a fonte da página e
 * cobram que a proteção tenha DESCIDO, e não sumido.
 */
describe("estoque: a proteção desceu da rota para a aba", () => {
  const pagina = readFileSync(
    resolve(__dirname, "../../../../routes/admin/estoque/index.tsx"),
    "utf8",
  );

  const semComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("a rota não é mais paga", () => {
    expect(semComentarios(pagina)).not.toContain("rotaPremium(");
  });

  it("cada aba declara o recurso a que pertence", () => {
    const abas = [...pagina.matchAll(/id: "(\w+)".*?recurso: "([A-Z_]+)"/g)].map(
      (m) => [m[1], m[2]],
    );
    expect(Object.fromEntries(abas)).toEqual({
      dashboard: "ESTOQUE",
      items: "ESTOQUE",
      movements: "ESTOQUE",
      preparados: "PRODUCAO",
      compositions: "RECEITAS",
      audit: "ESTOQUE",
      charts: "ESTOQUE",
    });
  });

  it("as duas abas pagas não renderizam quando o recurso está bloqueado", () => {
    const codigo = semComentarios(pagina);
    expect(codigo).toContain('!recursoBloqueadoDaAba && activeTab === "preparados"');
    expect(codigo).toContain('!recursoBloqueadoDaAba && activeTab === "compositions"');
    expect(codigo).toContain("TelaDeRecursoPremium");
  });

  /*
   * A pergunta é a MESMA função da guarda de rota. Uma comparação de plano
   * escrita à mão aqui dentro seria uma segunda regra, e ela divergiria.
   */
  it("a página não inventa regra de plano", () => {
    const codigo = semComentarios(pagina);
    expect(codigo).toContain("rotaBloqueada(");
    expect(codigo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
    expect(codigo).not.toContain("RECURSOS_DO_PLANO");
  });

  /*
   * O BASIC não pode começar a visita com uma recusa no console: a lista de
   * produtos da aba de Receitas só é buscada por quem tem RECEITAS.
   */
  it("a busca da aba de Receitas é condicionada ao recurso", () => {
    expect(pagina).toContain('rotaBloqueada({ admin }, "RECEITAS")');
    expect(semComentarios(pagina)).toMatch(/if \(!temReceitas\) return;/);
  });
});
