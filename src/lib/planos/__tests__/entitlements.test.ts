import { describe, expect, it } from "vitest";
import {
  ESSENCIAIS,
  EXCLUSIVOS_DO_PREMIUM,
  RECURSOS_DO_PLANO,
  ROTULO_DO_PLANO,
  ROTULO_DO_RECURSO,
  TODOS_OS_RECURSOS,
} from "../catalogo";
import {
  exigePremium,
  planoEfetivo,
  recursosLiberados,
  temRecurso,
} from "../entitlements";
import type { EstadoDoPlano, Plano, Recurso } from "../tipos";

/*
 * O CONTRATO DOS PLANOS, EXERCITADO SOZINHO.
 *
 * `entitlements.ts` é puro de propósito — sem Prisma, sem React, sem relógio —
 * e é por isso que estes testes rodam no ambiente `node` que a suíte já usa,
 * sem jsdom, sem banco e sem nenhuma dependência nova.
 *
 * O que se prova aqui é a REGRA COMERCIAL, e não a fiação: na Fase 1 nenhuma
 * rota, server function ou tela consulta este módulo ainda. A fiação tem os
 * testes dela nas fases seguintes.
 */

/** Um estado de plano, para o caso pedir. */
const estado = (plano: Plano, emTrial = false): EstadoDoPlano => ({ plano, emTrial });

describe("a matriz — quem tem o quê", () => {
  it("BASIC tem exatamente os oito essenciais", () => {
    expect([...RECURSOS_DO_PLANO.BASIC].sort()).toEqual([...ESSENCIAIS].sort());
    /*
      Nove em 31/08/2026, quando ESTOQUE desceu para o plano básico; oito de
      novo em 01/09, quando DELIVERY_BASICO subiu para o Premium. O número é
      cravado de propósito: mover uma chave de plano tem de passar por aqui.
    */
    expect(RECURSOS_DO_PLANO.BASIC.size).toBe(8);
  });

  it("PREMIUM tem os vinte — essenciais mais exclusivos", () => {
    expect(RECURSOS_DO_PLANO.PREMIUM.size).toBe(20);
    expect(RECURSOS_DO_PLANO.PREMIUM.size).toBe(
      ESSENCIAIS.length + EXCLUSIVOS_DO_PREMIUM.length,
    );
  });

  /*
   * O INVARIANTE QUE SUSTENTA O ARQUIVO INTEIRO.
   *
   * Com duas listas escritas à mão, acrescentar algo ao BASIC e esquecer o
   * PREMIUM produziria um cliente que paga mais e recebe menos. `PREMIUM` é a
   * união calculada, e este teste é o que garante que continue sendo.
   */
  it("PREMIUM contém TUDO do BASIC — o superconjunto é estrutural", () => {
    for (const recurso of RECURSOS_DO_PLANO.BASIC) {
      expect(RECURSOS_DO_PLANO.PREMIUM.has(recurso)).toBe(true);
    }
  });

  it("nenhum recurso é essencial e exclusivo ao mesmo tempo", () => {
    for (const recurso of EXCLUSIVOS_DO_PREMIUM) {
      expect(ESSENCIAIS).not.toContain(recurso);
    }
  });

  it("nenhum recurso ficou órfão: todos estão na lista e todos têm rótulo", () => {
    expect(TODOS_OS_RECURSOS).toHaveLength(20);
    expect(new Set(TODOS_OS_RECURSOS).size).toBe(20); // sem repetido
    expect(Object.keys(ROTULO_DO_RECURSO).sort()).toEqual([...TODOS_OS_RECURSOS].sort());
    for (const recurso of TODOS_OS_RECURSOS) {
      expect(ROTULO_DO_RECURSO[recurso].trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(ROTULO_DO_PLANO).sort()).toEqual(["BASIC", "PREMIUM"]);
  });
});

describe("BASIC — o que entra e o que não entra", () => {
  const essenciais: Recurso[] = [
    "CARDAPIO",
    "PEDIDOS",
    "BALCAO",
    "DASHBOARD",
    "CLIENTES",
    "CONFIGURACOES",
    "ASSINATURA",
  ];

  for (const recurso of essenciais) {
    it(`BASIC + ${recurso} = permitido`, () => {
      expect(temRecurso(estado("BASIC"), recurso)).toBe(true);
    });
  }

  const avancados: Recurso[] = [
    "PRODUCAO",
    "RECEITAS",
    "FINANCEIRO",
    "FIADO",
    "MESAS",
    "FUNCIONARIOS",
    "BENEFICIOS",
    "MARKETING",
    "RELATORIOS",
    "AUDITORIA",
    "DELIVERY_AVANCADO",
  ];

  for (const recurso of avancados) {
    it(`BASIC + ${recurso} = bloqueado`, () => {
      expect(temRecurso(estado("BASIC"), recurso)).toBe(false);
    });
  }

  /*
   * A LOJA BASIC NÃO ENTREGA MAIS — decisão de 01/09/2026.
   *
   * Até essa data ela entregava e só não gerenciava frota. As duas chaves
   * continuam separadas, e é por isso que a mudança coube numa linha: o
   * catálogo consegue dizer "entrega" e "gerencia frota" como coisas
   * distintas, e um dia pode voltar a separá-las entre os planos.
   *
   * O que o BASIC perdeu foi RECEBER pedido de entrega. Vender continua:
   * retirada e balcão seguem essenciais.
   */
  it("BASIC não entrega nem gerencia entregadores", () => {
    expect(temRecurso(estado("BASIC"), "DELIVERY_BASICO")).toBe(false);
    expect(temRecurso(estado("BASIC"), "DELIVERY_AVANCADO")).toBe(false);
    // E continua vendendo pelos dois caminhos que sobraram.
    expect(temRecurso(estado("BASIC"), "PEDIDOS")).toBe(true);
    expect(temRecurso(estado("BASIC"), "BALCAO")).toBe(true);
  });

  /*
   * Um plano que não incluísse a tela de assinatura trancaria o cliente do
   * lado de fora do próprio pagamento.
   */
  it("ASSINATURA nunca é bloqueada — é por onde se paga", () => {
    expect(temRecurso(estado("BASIC"), "ASSINATURA")).toBe(true);
    expect(temRecurso(estado("PREMIUM"), "ASSINATURA")).toBe(true);
    expect(temRecurso(estado("BASIC", true), "ASSINATURA")).toBe(true);
    expect(exigePremium("ASSINATURA")).toBe(false);
  });
});

describe("PREMIUM — tudo liberado", () => {
  for (const recurso of TODOS_OS_RECURSOS) {
    it(`PREMIUM + ${recurso} = permitido`, () => {
      expect(temRecurso(estado("PREMIUM"), recurso)).toBe(true);
    });
  }
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  A REGRA DEFINITIVA: TRIAL = PREMIUM, POR 14 DIAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * É o bloco mais importante do arquivo. Se algum dia alguém criar um "conjunto
 * de recursos do trial", é aqui que o projeto reclama.
 */
describe("TRIAL = PREMIUM enquanto o teste corre", () => {
  it("o plano efetivo em teste é PREMIUM, venha de onde vier", () => {
    expect(planoEfetivo(estado("BASIC", true))).toBe("PREMIUM");
    expect(planoEfetivo(estado("PREMIUM", true))).toBe("PREMIUM");
  });

  /*
   * O CASO QUE MOTIVA A REGRA: a loja em teste ainda não escolheu plano
   * nenhum, e no banco ela vai constar com o padrão. Mesmo assim vê tudo.
   */
  for (const recurso of TODOS_OS_RECURSOS) {
    it(`TRIAL + ${recurso} = permitido, mesmo com plano BASIC no cadastro`, () => {
      expect(temRecurso(estado("BASIC", true), recurso)).toBe(true);
    });
  }

  it("o conjunto do trial é IGUAL ao do Premium — não é uma cópia parecida", () => {
    expect([...recursosLiberados(estado("BASIC", true))].sort()).toEqual(
      [...recursosLiberados(estado("PREMIUM"))].sort(),
    );
  });

  it("não existe recurso que só o trial tenha", () => {
    const doTrial = recursosLiberados(estado("BASIC", true));
    const doPremium = recursosLiberados(estado("PREMIUM"));
    for (const recurso of doTrial) {
      expect(doPremium.has(recurso)).toBe(true);
    }
    expect(doTrial.size).toBe(doPremium.size);
  });

  /* A lista nominal da Fase 8, escrita à mão de propósito: ela falha se algum
     desses módulos sair do Premium sem que a decisão comercial mude. */
  it("a lista da Fase 8 passa inteira em trial", () => {
    const exigidos: Recurso[] = [
      "PRODUCAO",
      "FINANCEIRO",
      "FIADO",
      "DELIVERY_AVANCADO",
      "MESAS",
      "FUNCIONARIOS",
      "MARKETING",
      "RELATORIOS",
    ];
    for (const recurso of exigidos) {
      expect(temRecurso(estado("BASIC", true), recurso)).toBe(true);
    }
  });
});

describe("o fim do teste devolve o plano contratado", () => {
  /*
   * NADA É ESCOLHIDO AUTOMATICAMENTE. Foi decisão comercial explícita: ao sair
   * do teste vale a assinatura que a loja fizer, e este módulo só lê o que já
   * está decidido em outro lugar.
   */
  it("BASIC em teste vira BASIC quando o teste acaba", () => {
    expect(planoEfetivo(estado("BASIC", true))).toBe("PREMIUM");
    expect(planoEfetivo(estado("BASIC", false))).toBe("BASIC");
  });

  it("PREMIUM em teste continua PREMIUM quando o teste acaba", () => {
    expect(planoEfetivo(estado("PREMIUM", true))).toBe("PREMIUM");
    expect(planoEfetivo(estado("PREMIUM", false))).toBe("PREMIUM");
  });

  it("o teste não rebaixa ninguém: sair do trial nunca tira recurso de um Premium", () => {
    const dentro = recursosLiberados(estado("PREMIUM", true));
    const fora = recursosLiberados(estado("PREMIUM", false));
    expect([...dentro].sort()).toEqual([...fora].sort());
  });

  it("um BASIC perde os avançados ao fim do teste — e mantém os essenciais", () => {
    expect(temRecurso(estado("BASIC", true), "PRODUCAO")).toBe(true);
    expect(temRecurso(estado("BASIC", false), "PRODUCAO")).toBe(false);
    expect(temRecurso(estado("BASIC", false), "CARDAPIO")).toBe(true);
    // ESTOQUE é essencial: o fim do teste não o tira.
    expect(temRecurso(estado("BASIC", false), "ESTOQUE")).toBe(true);
  });
});

describe("exigePremium — o que ganha cadeado na tela", () => {
  it("essencial não ganha cadeado: não há upgrade que o acrescente", () => {
    for (const recurso of ESSENCIAIS) {
      expect(exigePremium(recurso)).toBe(false);
    }
  });

  it("exclusivo ganha cadeado", () => {
    for (const recurso of EXCLUSIVOS_DO_PREMIUM) {
      expect(exigePremium(recurso)).toBe(true);
    }
  });

  /* Pergunta sobre o catálogo, não sobre uma loja: o mesmo recurso é premium
     para todo mundo, inclusive para quem já o tem liberado. */
  it("não depende de quem está perguntando", () => {
    expect(exigePremium("PRODUCAO")).toBe(true);
    // E o que desceu para o BASIC deixou de ganhar cadeado, para todo mundo.
    expect(exigePremium("ESTOQUE")).toBe(false);
  });
});

describe("recursosLiberados devolve cópia, não a matriz", () => {
  /*
   * Sem a cópia, um consumidor distraído que fizesse `.delete()` no resultado
   * mutilaria a matriz do processo inteiro — e a próxima loja atendida por
   * aquele servidor perderia o recurso, sem nada no banco explicando por quê.
   */
  it("mexer no resultado não contamina o catálogo", () => {
    const liberados = recursosLiberados(estado("PREMIUM"));
    liberados.delete("ESTOQUE");
    expect(liberados.has("ESTOQUE")).toBe(false);
    expect(RECURSOS_DO_PLANO.PREMIUM.has("ESTOQUE")).toBe(true);
    expect(temRecurso(estado("PREMIUM"), "ESTOQUE")).toBe(true);
  });
});
