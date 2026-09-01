import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoComercialDaLoja, type LojaParaPlano } from "@/server/billing/plano-da-loja";
import {
  DESCRICAO_DO_RECURSO,
  ROTULO_DO_RECURSO,
  TODOS_OS_RECURSOS,
} from "@/lib/planos/catalogo";
import { RECURSO_DA_ROTA, recursoDaRota } from "@/lib/planos/navegacao";
import type { EstadoComercial } from "@/lib/planos/resolucao";
import { bloqueioDaRotaNoPlano } from "../cadeado-do-menu";

/*
 * O CADEADO DA BARRA LATERAL.
 *
 * O que se prova aqui é que o menu NÃO tem opinião própria sobre planos: ele
 * pergunta ao mapa de navegação qual recurso a tela pertence, e à regra central
 * se o plano o inclui. A decisão é a mesma da guarda de rota e da server
 * function — três consumidores, uma regra.
 */

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-08-31T12:00:00.000Z");
const futuro = (dias: number) => new Date(AGORA.getTime() + dias * DIA);

const plano = (sobrescreve: Partial<LojaParaPlano>): EstadoComercial =>
  estadoComercialDaLoja(
    {
      status: "TRIAL",
      trialEndsAt: futuro(7),
      paidUntil: null,
      subscriptionStatus: null,
      plan: null,
      ...sobrescreve,
    },
    AGORA,
  );

const BASIC = plano({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "BASIC" });
const PREMIUM = plano({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "PREMIUM" });
const EM_TESTE = plano({ status: "TRIAL", trialEndsAt: futuro(7), plan: null });
const TESTE_COM_BASIC = plano({ status: "TRIAL", trialEndsAt: futuro(7), plan: "BASIC" });
const LEGADA = plano({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });

describe("BASIC — cadeado nas rotas pagas, nada nas essenciais", () => {
  const esperado: Array<[string, string]> = [
    ["/admin/mesas", "MESAS"],
    ["/admin/entregadores", "DELIVERY_AVANCADO"],
    ["/admin/funcionarios", "FUNCIONARIOS"],
    ["/admin/funcionarios/planos", "BENEFICIOS"],
    ["/admin/promocoes", "MARKETING"],
    ["/admin/cupons", "MARKETING"],
    ["/admin/avaliacoes", "MARKETING"],
    ["/admin/relatorios", "RELATORIOS"],
    /*
      FINANCEIRO, e não RELATORIOS: a tela mostra margem e rentabilidade, e a
      Fase 8 alinhou o menu ao que o servidor passou a exigir. Para o BASIC o
      cadeado é o mesmo — o que muda é o nome do módulo no convite.
    */
    ["/admin/relatorios/produtos", "FINANCEIRO"],
    /* FUNCIONARIOS: a tela entrega o consumo da equipe, e a rota exige isso. */
    ["/admin/relatorios/funcionarios", "FUNCIONARIOS"],
    ["/admin/relatorios/recebimentos", "FIADO"],
  ];

  for (const [rota, recurso] of esperado) {
    it(`${rota} acende o cadeado de ${recurso}`, () => {
      expect(bloqueioDaRotaNoPlano(BASIC, rota)).toBe(recurso);
    });
  }

  const abertas = [
    "/admin",
    "/admin/balcao",
    "/admin/pedidos",
    "/admin/cardapio",
    "/admin/cardapio/categorias",
    "/admin/cardapio/extras",
    "/admin/clientes",
    "/admin/assinatura",
    "/admin/configuracoes",
    // Desde 31/08/2026: o estoque é do plano básico, e o menu não o tranca.
    "/admin/estoque",
  ];

  for (const rota of abertas) {
    it(`${rota} continua sem cadeado`, () => {
      expect(bloqueioDaRotaNoPlano(BASIC, rota)).toBeNull();
    });
  }

  it("a assinatura NUNCA é trancada — é por onde se paga", () => {
    for (const p of [BASIC, PREMIUM, EM_TESTE, LEGADA]) {
      expect(bloqueioDaRotaNoPlano(p, "/admin/assinatura")).toBeNull();
    }
  });
});

describe("PREMIUM e TRIAL — menu inteiro sem cadeado", () => {
  for (const rota of Object.keys(RECURSO_DA_ROTA)) {
    it(`${rota} aberta no PREMIUM`, () => {
      expect(bloqueioDaRotaNoPlano(PREMIUM, rota)).toBeNull();
    });
    it(`${rota} aberta em TESTE`, () => {
      expect(bloqueioDaRotaNoPlano(EM_TESTE, rota)).toBeNull();
    });
  }

  it("em teste com BASIC contratado, também não há cadeado", () => {
    expect(bloqueioDaRotaNoPlano(TESTE_COM_BASIC, "/admin/estoque")).toBeNull();
    expect(TESTE_COM_BASIC.armazenado).toBe("BASIC");
  });
});

describe("LEGADO — permissão transitória, sem cadeado", () => {
  for (const rota of Object.keys(RECURSO_DA_ROTA)) {
    it(`${rota} aberta na loja legada`, () => {
      expect(bloqueioDaRotaNoPlano(LEGADA, rota)).toBeNull();
    });
  }

  it("e a loja continua sem classificação", () => {
    expect(LEGADA.legado).toBe(true);
    expect(LEGADA.efetivo).toBeNull();
  });
});

describe("sem plano conhecido — desenha como antes desta fase", () => {
  it("nada é trancado quando o plano não veio", () => {
    expect(bloqueioDaRotaNoPlano(null, "/admin/estoque")).toBeNull();
    expect(bloqueioDaRotaNoPlano(undefined, "/admin/estoque")).toBeNull();
  });

  it("rota não mapeada não é rota paga", () => {
    expect(recursoDaRota("/admin/rota-que-nao-existe")).toBeNull();
    expect(bloqueioDaRotaNoPlano(BASIC, "/admin/rota-que-nao-existe")).toBeNull();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  A BARRA NÃO TEM MATRIZ PRÓPRIA — lido da fonte
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("cobertura: a barra lateral consome a fonte central", () => {
  const sidebar = readFileSync(
    resolve(__dirname, "../../layout/AdminSidebar.tsx"),
    "utf8",
  );

  it("não existe lista de rotas pagas dentro da barra", () => {
    expect(sidebar).not.toMatch(/PREMIUM_ROUTES|ROTAS_PREMIUM|RECURSOS_PAGOS/);
  });

  it("não existe comparação direta de plano na barra", () => {
    expect(sidebar).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
  });

  it("a barra pergunta ao cadeado central", () => {
    expect(sidebar).toContain("useCadeado()");
    expect(sidebar).toContain("ProvedorDeCadeado");
  });

  /*
   * TODO item de menu precisa estar mapeado. Um item sem recurso seria uma
   * tela que ninguém classificou — e, por não ser classificada, apareceria
   * aberta para o BASIC sem que ninguém tivesse decidido isso.
   */
  it("todo item do menu tem recurso no mapa de navegação", () => {
    const rotas = [...sidebar.matchAll(/to:\s*"(\/admin[^"]*)"/g)].map((m) => m[1]);
    expect(rotas.length).toBeGreaterThan(10);
    for (const rota of new Set(rotas)) {
      expect(recursoDaRota(rota), `${rota} não está em RECURSO_DA_ROTA`).not.toBeNull();
    }
  });

  /*
   * O menu e a guarda de rota têm de concordar. Se a barra disser que
   * `/admin/estoque` é ESTOQUE e a rota exigir outro recurso, o cliente veria
   * um cadeado que não corresponde ao que a tela recusa.
   */
  it("o mapa do menu concorda com a guarda da rota", () => {
    const rotaDaAuditoria = readFileSync(
      resolve(__dirname, "../../../../routes/admin/auditoria/index.tsx"),
      "utf8",
    );
    const exigido = rotaDaAuditoria.match(/rotaPremium\("([A-Z_]+)"/)?.[1];
    expect(exigido).toBe(RECURSO_DA_ROTA["/admin/auditoria"]);
  });

  /*
   * O estoque saiu da comparação acima porque deixou de ter guarda de rota:
   * ESTOQUE virou essencial em 31/08/2026 e a página abriu, com as duas abas
   * pagas protegidas por dentro. O menu tem de acompanhar — um cadeado ali
   * prometeria um bloqueio que a tela não faz mais.
   */
  it("o estoque não acende cadeado nenhum no BASIC", () => {
    expect(RECURSO_DA_ROTA["/admin/estoque"]).toBe("ESTOQUE");
    expect(bloqueioDaRotaNoPlano(BASIC, "/admin/estoque")).toBeNull();
  });
});

describe("textos do bloqueio", () => {
  it("todo recurso tem rótulo e descrição escritos", () => {
    expect(Object.keys(DESCRICAO_DO_RECURSO).sort()).toEqual([...TODOS_OS_RECURSOS].sort());
    for (const recurso of TODOS_OS_RECURSOS) {
      expect(ROTULO_DO_RECURSO[recurso].trim().length).toBeGreaterThan(0);
      // Descrição que só repete o nome não explica o que se compra.
      const descricao = DESCRICAO_DO_RECURSO[recurso];
      expect(descricao.trim().length, recurso).toBeGreaterThan(20);
      expect(descricao).not.toBe(ROTULO_DO_RECURSO[recurso]);
    }
  });

  it("o convite leva à assinatura, que já existe", () => {
    const tela = readFileSync(resolve(__dirname, "../rota-premium.tsx"), "utf8");
    expect(tela).toContain('to="/admin/assinatura"');

    /*
      Nenhum checkout novo foi inventado: a asserção olha os IMPORTS, e não o
      texto do arquivo — os comentários mencionam o Stripe justamente para
      dizer que ele não é consultado aqui, e checar o texto cru reprovaria a
      documentação em vez do código.
    */
    const imports = [...tela.matchAll(/^import .*$/gm)].map((m) => m[0]).join("\n");
    expect(imports).not.toMatch(/stripe|billing|checkout/i);
  });

  it("o cadeado nunca vai sozinho: sempre acompanhado de texto", () => {
    const sidebar = readFileSync(
      resolve(__dirname, "../../layout/AdminSidebar.tsx"),
      "utf8",
    );
    // Todo bloco com <Lock ...> tem um aria-label explicando o motivo.
    const ocorrencias = sidebar.split("<Lock").length - 1;
    const rotulos = sidebar.split("disponível no plano Premium").length - 1;
    expect(ocorrencias).toBeGreaterThan(0);
    expect(rotulos).toBeGreaterThanOrEqual(ocorrencias);
    expect(sidebar).toContain('aria-hidden="true"');
  });
});
