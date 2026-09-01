import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { garantirRecurso, RecursoIndisponivelError } from "../guarda-de-recurso";
import { RECURSO_DA_ROTA } from "@/lib/planos/navegacao";
import type { CurrentAdmin } from "@/server/auth/session";

/*
 * O ENFORCEMENT DO DELIVERY AVANÇADO.
 *
 * A linha divisória desta fase é entre ENTREGAR e GERIR QUEM ENTREGA:
 *
 *   básico   → aceitar pedido de entrega, endereço, taxa, frete grátis,
 *              pedido mínimo, tempo estimado, retirada, pedido no quadro
 *   avançado → a FROTA: convidar, ativar, revogar, atribuir e rastrear
 *
 * Metade dos testes existe para provar que a primeira coluna ficou intocada.
 */

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-08-31T12:00:00.000Z");
const futuro = (d: number) => new Date(AGORA.getTime() + d * DIA);

function sessao(dados: Partial<LojaParaPlano>, role = "OWNER"): CurrentAdmin {
  const registro: LojaParaPlano = {
    status: "TRIAL",
    trialEndsAt: futuro(7),
    paidUntil: null,
    subscriptionStatus: null,
    plan: null,
    ...dados,
  };
  return {
    role,
    store: { plano: estadoComercialDaLoja(registro, AGORA) },
  } as unknown as CurrentAdmin;
}

const PAGO = { status: "ACTIVE" as const, trialEndsAt: null, paidUntil: futuro(20) };
const BASIC = sessao({ ...PAGO, plan: "BASIC" });
const PREMIUM = sessao({ ...PAGO, plan: "PREMIUM" });
const EM_TESTE = sessao({ status: "TRIAL", trialEndsAt: futuro(7), plan: null });
const TESTE_COM_BASIC = sessao({ status: "TRIAL", trialEndsAt: futuro(7), plan: "BASIC" });
const LEGADA = sessao({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });

/* Um entregador de loja BASIC: PAPEL courier, PLANO sem o módulo. */
const ENTREGADOR_BASIC = sessao({ ...PAGO, plan: "BASIC" }, "COURIER");
const ENTREGADOR_PREMIUM = sessao({ ...PAGO, plan: "PREMIUM" }, "COURIER");

describe("BASIC — a frota é recusada", () => {
  it("lança o erro de domínio, com o rótulo do módulo", () => {
    try {
      garantirRecurso(BASIC, "DELIVERY_AVANCADO");
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const e = erro as RecursoIndisponivelError;
      expect(e).toBeInstanceOf(RecursoIndisponivelError);
      expect(e.recurso).toBe("DELIVERY_AVANCADO");
      expect(e.rotulo).toBe("Entregadores e rastreamento");
      expect(e.message).toBe("Este recurso está disponível no plano Premium.");
    }
  });

  for (const operacao of [
    "convidar entregador",
    "listar entregadores",
    "ativar / desativar",
    "revogar convite",
    "atribuir entrega",
    "rastrear posição",
  ]) {
    it(`${operacao} → bloqueado`, () => {
      expect(() => garantirRecurso(BASIC, "DELIVERY_AVANCADO")).toThrow(RecursoIndisponivelError);
    });
  }
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O DELIVERY BÁSICO CONTINUA
 * ═══════════════════════════════════════════════════════════════════════════
 */
/*
 * ⚠️ A ENTREGA SAIU DO BASIC — 01/09/2026.
 *
 * Este bloco provava o oposto até essa data: o BASIC entregava e só não
 * gerenciava frota. A decisão comercial mudou, e as DUAS chaves passaram a ser
 * do Premium — mas continuam sendo duas, o que é o que permitiu mover uma sem
 * a outra.
 *
 * O enforcement da entrega em si mora em
 * `server/delivery/__tests__/entrega-por-plano.test.ts`.
 */
describe("BASIC — entregar deixou de ser liberado", () => {
  it("nem DELIVERY_BASICO nem DELIVERY_AVANCADO passam", () => {
    expect(() => garantirRecurso(BASIC, "DELIVERY_BASICO")).toThrow();
    expect(() => garantirRecurso(BASIC, "DELIVERY_AVANCADO")).toThrow();
  });

  for (const recurso of ["PEDIDOS", "BALCAO", "CARDAPIO", "CLIENTES", "CONFIGURACOES"] as const) {
    it(`${recurso} passa`, () => {
      expect(() => garantirRecurso(BASIC, recurso)).not.toThrow();
    });
  }

  /*
   * Taxa, frete grátis, pedido mínimo e tempo estimado vivem em
   * `StoreSettings` e são configuração da loja — não módulo. Nenhum deles
   * aparece no catálogo de recursos, e é assim que devem continuar.
   */
  it("taxa, frete grátis e pedido mínimo não são recursos", () => {
    const catalogo = readFileSync(
      resolve(__dirname, "../../../lib/planos/catalogo.ts"),
      "utf8",
    );
    for (const campo of ["deliveryFee", "freeDeliveryMinOrder", "minOrderValue", "acceptsPickup"]) {
      expect(catalogo).not.toContain(campo);
    }
  });
});

describe("PREMIUM, TRIAL e LEGADO", () => {
  it("PREMIUM passa", () => {
    expect(() => garantirRecurso(PREMIUM, "DELIVERY_AVANCADO")).not.toThrow();
  });

  it("TRIAL passa, inclusive com BASIC contratado", () => {
    expect(() => garantirRecurso(EM_TESTE, "DELIVERY_AVANCADO")).not.toThrow();
    expect(() => garantirRecurso(TESTE_COM_BASIC, "DELIVERY_AVANCADO")).not.toThrow();
    expect(TESTE_COM_BASIC.store.plano.armazenado).toBe("BASIC");
  });

  it("LEGADO passa, e segue sem classificação", () => {
    expect(() => garantirRecurso(LEGADA, "DELIVERY_AVANCADO")).not.toThrow();
    expect(LEGADA.store.plano.legado).toBe(true);
    expect(LEGADA.store.plano.armazenado).toBeNull();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAPEL ≠ PLANO
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("o papel COURIER continua separado do plano", () => {
  it("o rastreamento olha o PLANO da loja, não o papel", () => {
    expect(ENTREGADOR_BASIC.role).toBe("COURIER");
    expect(ENTREGADOR_PREMIUM.role).toBe("COURIER");
    expect(() => garantirRecurso(ENTREGADOR_BASIC, "DELIVERY_AVANCADO")).toThrow();
    expect(() => garantirRecurso(ENTREGADOR_PREMIUM, "DELIVERY_AVANCADO")).not.toThrow();
  });

  /*
   * `garantirRecurso` e não `exigirRecurso` nas funções do entregador: a
   * segunda passa por `requireAdminSession`, que RECUSA o papel COURIER — usá-la
   * ali trancaria o entregador por papel antes de o plano ser consultado.
   */
  it("as funções do entregador usam garantirRecurso, nunca exigirRecurso", () => {
    const codigo = readFileSync(
      resolve(__dirname, "../../functions/courier-deliveries.fn.ts"),
      "utf8",
    );
    expect(codigo).toContain('garantirRecurso(courier, "DELIVERY_AVANCADO")');
    expect(codigo).not.toContain("exigirRecurso(");
    expect(codigo).toContain("requireCourierSession()");
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

  const GESTAO_DA_FROTA = [
    "listCourierInvitesFn",
    "createCourierInviteFn",
    "revokeCourierInviteFn",
    "listCouriersFn",
    "deleteCourierFn",
    "setCourierActiveFn",
  ];

  for (const nome of GESTAO_DA_FROTA) {
    it(`courier-invites.fn.ts · ${nome} exige DELIVERY_AVANCADO`, () => {
      const bloco = blocoDa(fonte("courier-invites.fn.ts"), nome);
      expect(bloco).toContain('exigirRecurso("DELIVERY_AVANCADO")');
      expect(bloco).not.toContain("requireAdminSession()");
    });
  }

  for (const nome of ["dispatchOrderFn", "setOrderAwaitingCourierFn"]) {
    it(`orders.fn.ts · ${nome} exige DELIVERY_AVANCADO`, () => {
      const bloco = blocoDa(fonte("orders.fn.ts"), nome);
      expect(bloco).toContain('exigirRecurso("DELIVERY_AVANCADO")');
    });
  }

  /* O resto do quadro é BASIC e não pode ganhar guarda. */
  for (const nome of [
    "listKanbanOrdersFn",
    "updateOrderStatusFn",
    "confirmPaymentFn",
    "getOrderFn",
    "updateOrderNotesFn",
  ]) {
    it(`orders.fn.ts · ${nome} continua BASIC`, () => {
      expect(blocoDa(fonte("orders.fn.ts"), nome)).not.toContain("Recurso(");
    });
  }

  it("criar pedido de entrega não ganhou dependência de frota", () => {
    for (const arquivo of ["storefront-checkout.fn.ts", "balcao.fn.ts"]) {
      expect(fonte(arquivo), arquivo).not.toContain("DELIVERY_AVANCADO");
    }
  });

  /*
   * O ENTREGADOR TERMINA O QUE COMEÇOU.
   *
   * Listar e concluir a própria entrega NÃO foram gateadas, e é decisão: numa
   * loja que caia de Premium para Basic, gateá-las deixaria pedidos parados na
   * rua, com o entregador sem como dar baixa. Rastrear é o recurso vendido;
   * entregar o que já foi atribuído é terminar trabalho combinado.
   */
  for (const nome of ["listMyDeliveriesFn", "markDeliveryDoneFn", "getCurrentCourierFn"]) {
    it(`courier-deliveries.fn.ts · ${nome} NÃO é gateada — o entregador termina o que começou`, () => {
      expect(blocoDa(fonte("courier-deliveries.fn.ts"), nome)).not.toContain("garantirRecurso(");
    });
  }

  for (const nome of ["reportCourierLocationFn", "stopSharingLocationFn"]) {
    it(`courier-deliveries.fn.ts · ${nome} exige DELIVERY_AVANCADO`, () => {
      expect(blocoDa(fonte("courier-deliveries.fn.ts"), nome)).toContain(
        'garantirRecurso(courier, "DELIVERY_AVANCADO")',
      );
    });
  }

  /*
   * O acompanhamento público NÃO foi gateado: o link do pedido é do fluxo
   * básico, e o pedido existe no BASIC. A parte avançada — a distância até o
   * entregador — já se recusa sozinha: `distanciaDoEntregador` responde
   * "indisponível" quando não há entregador ou o pedido não saiu, e uma loja
   * sem frota nunca chega a nenhum dos dois.
   */
  it("o acompanhamento público continua aberto", () => {
    const codigo = fonte("order-tracking.fn.ts");
    expect(codigo).not.toContain("exigirRecurso(");
    expect(codigo).not.toContain("garantirRecurso(");
  });

  it("nenhuma guarda específica de delivery foi criada", () => {
    for (const arquivo of ["courier-invites.fn.ts", "courier-deliveries.fn.ts"]) {
      const codigo = fonte(arquivo);
      expect(codigo).not.toMatch(/exigirDelivery|guardaEntregador|requireDelivery/);
      expect(codigo).toContain('from "@/server/billing/guarda-de-recurso"');
      expect(codigo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
    }
  });
});

describe("rota e menu", () => {
  it("a rota de entregadores exige DELIVERY_AVANCADO", () => {
    const rota = readFileSync(
      resolve(__dirname, "../../../routes/admin/entregadores/index.tsx"),
      "utf8",
    );
    expect(rota).toContain('rotaPremium("DELIVERY_AVANCADO"');
    expect(rota).not.toMatch(/createFileRoute\([^)]*\)\(\{\s*component:/);
  });

  it("o menu já classificava assim — sem divergência a corrigir", () => {
    expect(RECURSO_DA_ROTA["/admin/entregadores"]).toBe("DELIVERY_AVANCADO");
  });

  /* A área do entregador é do PAPEL, e não passa pelo menu do painel. */
  it("as rotas do entregador não estão no mapa do painel", () => {
    expect(RECURSO_DA_ROTA["/entregador"]).toBeUndefined();
  });
});
