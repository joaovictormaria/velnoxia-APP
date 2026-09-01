import { describe, expect, it } from "vitest";
import { conferirAcesso, DIAS_DE_TOLERANCIA, type EstadoDaConta } from "../access";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";

/*
 * O PLANO LIDO DA LOJA — E A PROVA DE QUE O ACESSO NÃO MUDOU.
 *
 * Duas coisas se provam aqui, e a segunda é tão importante quanto a primeira:
 *
 *   1. `estadoComercialDaLoja` deriva `emTrial` de `conferirAcesso`, e não de
 *      uma segunda comparação de datas.
 *   2. `conferirAcesso` continua devolvendo EXATAMENTE os mesmos vereditos que
 *      devolvia antes de existir plano nenhum. A coluna nova não entra em
 *      nenhuma decisão de acesso.
 *
 * Sem banco: as duas funções são puras e recebem o recorte da loja pronto.
 */

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-08-31T12:00:00.000Z");
const futuro = (dias: number) => new Date(AGORA.getTime() + dias * DIA);
const passado = (dias: number) => new Date(AGORA.getTime() - dias * DIA);

/** Uma loja, com o recorte que as duas funções pedem. */
const loja = (sobrescreve: Partial<LojaParaPlano> = {}): LojaParaPlano => ({
  status: "TRIAL",
  trialEndsAt: futuro(7),
  paidUntil: null,
  subscriptionStatus: null,
  plan: null,
  ...sobrescreve,
});

describe("emTrial vem de conferirAcesso, não de um segundo calendário", () => {
  it("teste dentro dos 14 dias → em teste, e plano efetivo PREMIUM", () => {
    const estado = estadoComercialDaLoja(loja({ trialEndsAt: futuro(7) }), AGORA);
    expect(estado.emTrial).toBe(true);
    expect(estado.efetivo).toBe("PREMIUM");
  });

  it("teste vencido → fora do teste, sem comparar data aqui", () => {
    const estado = estadoComercialDaLoja(loja({ trialEndsAt: passado(1) }), AGORA);
    expect(estado.emTrial).toBe(false);
    // Legada: nada contratado e teste acabado.
    expect(estado.efetivo).toBeNull();
    expect(estado.legado).toBe(true);
  });

  /*
   * Loja PAGA não está "em teste", mesmo que a data antiga do teste ainda seja
   * futura — `conferirAcesso` responde `pago`, e é ele que manda. Fosse
   * `trialEndsAt` relido aqui, esta loja seria classificada como em teste e
   * ganharia Premium de graça.
   */
  it("loja paga não é loja em teste, mesmo com trialEndsAt futuro", () => {
    const estado = estadoComercialDaLoja(
      loja({ status: "ACTIVE", trialEndsAt: futuro(5), paidUntil: futuro(20), plan: "BASIC" }),
      AGORA,
    );
    expect(estado.emTrial).toBe(false);
    expect(estado.efetivo).toBe("BASIC");
  });

  it("loja suspensa não é loja em teste", () => {
    const estado = estadoComercialDaLoja(
      loja({ status: "SUSPENDED", trialEndsAt: futuro(5) }),
      AGORA,
    );
    expect(estado.emTrial).toBe(false);
  });
});

describe("o plano contratado, lido da coluna", () => {
  it("BASIC contratado, fora do teste → BASIC", () => {
    const estado = estadoComercialDaLoja(
      loja({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(10), plan: "BASIC" }),
      AGORA,
    );
    expect(estado.armazenado).toBe("BASIC");
    expect(estado.efetivo).toBe("BASIC");
  });

  it("PREMIUM contratado, fora do teste → PREMIUM", () => {
    const estado = estadoComercialDaLoja(
      loja({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(10), plan: "PREMIUM" }),
      AGORA,
    );
    expect(estado.efetivo).toBe("PREMIUM");
  });

  it("BASIC contratado AINDA em teste → PREMIUM, sem reescrever o contratado", () => {
    const estado = estadoComercialDaLoja(
      loja({ trialEndsAt: futuro(3), plan: "BASIC" }),
      AGORA,
    );
    expect(estado.emTrial).toBe(true);
    expect(estado.efetivo).toBe("PREMIUM");
    expect(estado.armazenado).toBe("BASIC");
  });

  /* A loja recém-criada: `plan = null` e TRIAL. É o caso comum. */
  it("loja nova — sem plano, em teste → PREMIUM por 14 dias", () => {
    const estado = estadoComercialDaLoja(loja({ trialEndsAt: futuro(14), plan: null }), AGORA);
    expect(estado.armazenado).toBeNull();
    expect(estado.efetivo).toBe("PREMIUM");
    expect(estado.legado).toBe(false);
  });

  /* A loja liberada na mão, sem plano: continua liberada e continua sem
     classificação comercial. Nenhuma das duas coisas foi decidida aqui. */
  it("loja liberada na mão e sem plano → INDEFINIDA, e segue liberada", () => {
    const conta = loja({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });
    expect(conferirAcesso(conta, AGORA)).toEqual({ liberado: true, motivo: "liberada-na-mao" });
    const estado = estadoComercialDaLoja(conta, AGORA);
    expect(estado.efetivo).toBeNull();
    expect(estado.legado).toBe(true);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O ACESSO NÃO MUDOU — a trava desta fase
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `conferirAcesso` não foi tocado, e estes testes existem para que continue
 * assim. Se alguém um dia fizer o plano influenciar o acesso, é aqui que o
 * projeto reclama.
 */
describe("conferirAcesso continua idêntico, com plano ou sem", () => {
  const casos: Array<[string, EstadoDaConta, ReturnType<typeof conferirAcesso>]> = [
    [
      "teste válido",
      { status: "TRIAL", trialEndsAt: futuro(5), paidUntil: null, subscriptionStatus: null },
      { liberado: true, motivo: "trial" },
    ],
    [
      "teste vencido",
      { status: "TRIAL", trialEndsAt: passado(1), paidUntil: null, subscriptionStatus: null },
      { liberado: false, motivo: "trial-vencido" },
    ],
    [
      "pago",
      { status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(10), subscriptionStatus: "active" },
      { liberado: true, motivo: "pago" },
    ],
    [
      "tolerância do cartão",
      {
        status: "ACTIVE",
        trialEndsAt: null,
        paidUntil: passado(1),
        subscriptionStatus: "past_due",
      },
      { liberado: true, motivo: "tolerancia" },
    ],
    [
      "assinatura vencida",
      {
        status: "ACTIVE",
        trialEndsAt: null,
        paidUntil: passado(DIAS_DE_TOLERANCIA + 1),
        subscriptionStatus: "past_due",
      },
      { liberado: false, motivo: "assinatura-vencida" },
    ],
    [
      "suspensa",
      { status: "SUSPENDED", trialEndsAt: futuro(5), paidUntil: futuro(5), subscriptionStatus: "active" },
      { liberado: false, motivo: "suspensa" },
    ],
    [
      "liberada na mão",
      { status: "ACTIVE", trialEndsAt: null, paidUntil: null, subscriptionStatus: null },
      { liberado: true, motivo: "liberada-na-mao" },
    ],
  ];

  for (const [nome, conta, esperado] of casos) {
    it(`${nome} → ${esperado.motivo}, sem plano nenhum`, () => {
      expect(conferirAcesso(conta, AGORA)).toEqual(esperado);
    });

    /* O mesmo veredito com cada valor possível de plano. A coluna nova não
       participa de nenhuma decisão de acesso, e isto prova os três casos. */
    for (const plan of ["BASIC", "PREMIUM", null] as const) {
      it(`${nome} → ${esperado.motivo}, com plan = ${plan}`, () => {
        expect(conferirAcesso({ ...conta, plan } as EstadoDaConta, AGORA)).toEqual(esperado);
      });
    }
  }
});
