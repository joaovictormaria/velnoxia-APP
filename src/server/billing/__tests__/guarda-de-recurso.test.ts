import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import {
  exigirRecurso,
  garantirRecurso,
  RecursoIndisponivelError,
} from "../guarda-de-recurso";
import type { CurrentAdmin } from "@/server/auth/session";
import type { Recurso } from "@/lib/planos/tipos";
import { TODOS_OS_RECURSOS } from "@/lib/planos/catalogo";

/*
 * A GUARDA DE RECURSO — o primeiro ponto do projeto que RECUSA de verdade.
 *
 * Duas coisas se provam aqui, e as duas são necessárias:
 *
 *   1. COMPORTAMENTO — o que a guarda faz com cada um dos quatro estados
 *      comerciais. É a regra, exercitada direto, sem cookie e sem HTTP.
 *
 *   2. COBERTURA — quais server functions de fato passam por ela. Esconder o
 *      botão não é segurança: se alguém acrescentar uma escrita de estoque sem
 *      a guarda, ou gatear por engano uma função do cadastro de produto BASIC,
 *      é a segunda metade deste arquivo que reclama. O projeto já usa leitura
 *      de fonte para contratos assim em `fn-so-com-server-functions.test.ts`.
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

/** Um `CurrentAdmin` com o estado comercial que o caso pede. */
function admin(dadosDaLoja: Partial<LojaParaPlano>): CurrentAdmin {
  const registro = loja(dadosDaLoja);
  return {
    id: "admin-1",
    name: "Dona",
    email: "dona@loja.com",
    role: "OWNER",
    storeId: "loja-1",
    store: {
      plano: estadoComercialDaLoja(registro, AGORA),
    },
  } as unknown as CurrentAdmin;
}

const BASIC = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "BASIC" });
const PREMIUM = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "PREMIUM" });
const EM_TESTE = admin({ status: "TRIAL", trialEndsAt: futuro(7), plan: null });
const TESTE_COM_BASIC = admin({ status: "TRIAL", trialEndsAt: futuro(7), plan: "BASIC" });
const LEGADA = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });

describe("BASIC — os módulos pagos são recusados", () => {
  /*
   * ESTOQUE saiu daqui em 31/08/2026: virou essencial, e o BASIC passa. Quem
   * segura a linha agora é PRODUCAO — o módulo que convive com o estoque na
   * mesma tela e continua sendo do Premium.
   */
  it("produção lança RecursoIndisponivelError", () => {
    expect(() => garantirRecurso(BASIC, "PRODUCAO")).toThrow(RecursoIndisponivelError);
  });

  it("estoque NÃO é mais recusado no BASIC", () => {
    expect(() => garantirRecurso(BASIC, "ESTOQUE")).not.toThrow();
  });

  it("a mensagem é a do produto, não um erro técnico", () => {
    try {
      garantirRecurso(BASIC, "PRODUCAO");
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(RecursoIndisponivelError);
      const e = erro as RecursoIndisponivelError;
      expect(e.message).toBe("Este recurso está disponível no plano Premium.");
      expect(e.recurso).toBe("PRODUCAO");
      expect(e.rotulo).toBe("Produção");
      // Nada de Prisma, SQL ou stack interna vazando para a tela.
      expect(e.message).not.toMatch(/prisma|sql|invalid|undefined/i);
    }
  });

  it("todo recurso exclusivo do Premium é recusado", () => {
    const avancados: Recurso[] = [
      "PRODUCAO", "RECEITAS", "FINANCEIRO", "FIADO", "MESAS",
      "FUNCIONARIOS", "BENEFICIOS", "MARKETING", "RELATORIOS", "AUDITORIA",
      "DELIVERY_AVANCADO",
    ];
    for (const recurso of avancados) {
      expect(() => garantirRecurso(BASIC, recurso)).toThrow(RecursoIndisponivelError);
    }
  });

  /* O BASIC continua vendendo: nenhum recurso essencial é recusado. */
  it("os essenciais passam — cardápio, pedidos, balcão, painel, delivery", () => {
    const essenciais: Recurso[] = [
      "CARDAPIO", "PEDIDOS", "BALCAO", "DASHBOARD", "CLIENTES",
      "CONFIGURACOES", "ASSINATURA", ];
    for (const recurso of essenciais) {
      expect(() => garantirRecurso(BASIC, recurso)).not.toThrow();
    }
  });
});

describe("PREMIUM — nada é recusado", () => {
  for (const recurso of TODOS_OS_RECURSOS) {
    it(`${recurso} passa`, () => {
      expect(() => garantirRecurso(PREMIUM, recurso)).not.toThrow();
    });
  }
});

describe("TRIAL — nada é recusado durante os 14 dias", () => {
  it("loja em teste sem plano usa estoque", () => {
    expect(() => garantirRecurso(EM_TESTE, "ESTOQUE")).not.toThrow();
  });

  it("loja em teste com BASIC contratado também usa estoque", () => {
    expect(() => garantirRecurso(TESTE_COM_BASIC, "ESTOQUE")).not.toThrow();
    // E o contratado não foi reescrito.
    expect(TESTE_COM_BASIC.store.plano.armazenado).toBe("BASIC");
  });

  for (const recurso of TODOS_OS_RECURSOS) {
    it(`${recurso} passa em teste`, () => {
      expect(() => garantirRecurso(EM_TESTE, recurso)).not.toThrow();
    });
  }
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LEGADO — permissão TRANSITÓRIA, a remover na Fase 12
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("LEGADO — passa por ora, e continua sem classificação", () => {
  it("o veredito é INDEFINIDO, não PERMITIDO", () => {
    expect(LEGADA.store.plano.legado).toBe(true);
    expect(LEGADA.store.plano.efetivo).toBeNull();
  });

  it("mesmo assim a chamada não é recusada — o acesso existente é preservado", () => {
    expect(() => garantirRecurso(LEGADA, "ESTOQUE")).not.toThrow();
    for (const recurso of TODOS_OS_RECURSOS) {
      expect(() => garantirRecurso(LEGADA, recurso)).not.toThrow();
    }
  });

  /*
   * A TRAVA CONTRA "legada virou Premium". Passar pela guarda não classifica a
   * loja: `Store.plan` continua nulo e o estado comercial continua legado.
   * Se um dia alguém gravar plano aqui para "resolver" o caso, este teste cai.
   */
  it("passar pela guarda NÃO grava plano nem muda o estado", () => {
    const antes = { ...LEGADA.store.plano };
    garantirRecurso(LEGADA, "ESTOQUE");
    expect(LEGADA.store.plano).toEqual(antes);
    expect(LEGADA.store.plano.armazenado).toBeNull();
    expect(LEGADA.store.plano.efetivo).not.toBe("PREMIUM");
    expect(LEGADA.store.plano.efetivo).not.toBe("BASIC");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  COBERTURA — quais server functions passam pela guarda
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("cobertura das server functions de estoque", () => {
  const raiz = resolve(__dirname, "../../functions");
  const fonte = (arquivo: string) => readFileSync(resolve(raiz, arquivo), "utf8");

  /** O corpo de uma server function, do `export const` até o próximo. */
  function blocoDa(codigo: string, nome: string): string {
    const i = codigo.indexOf(`export const ${nome} = createServerFn`);
    expect(i, `${nome} não encontrada`).toBeGreaterThan(-1);
    const fim = codigo.indexOf("export const ", i + 10);
    return fim < 0 ? codigo.slice(i) : codigo.slice(i, fim);
  }

  const GUARDADAS: Array<[string, string[]]> = [
    [
      "inventory.fn.ts",
      [
        "adminCreateInventoryItem",
        "adminUpdateInventoryItem",
        "adminRecordMovement",
        "adminReverseMovement",
        "getStoreInventory",
        "getItemDetails",
        "adminGetInventoryValue",
        "adminGetLowStockAlerts",
      ],
    ],
    [
      "report.fn.ts",
      [
        "adminGetLowStockAlerts2",
        "adminGetMovementHistory",
        "adminGetCostAnalysis",
        "adminGetMovementStats",
        "adminGetInventoryValueReport",
      ],
    ],
  ];

  for (const [arquivo, funcoes] of GUARDADAS) {
    const codigo = fonte(arquivo);
    for (const nome of funcoes) {
      it(`${arquivo} · ${nome} exige ESTOQUE`, () => {
        const bloco = blocoDa(codigo, nome);
        expect(bloco).toContain('exigirRecurso("ESTOQUE")');
        // E não ficou uma sessão sem guarda no mesmo bloco.
        expect(bloco).not.toContain("await requireAdminSession()");
      });
    }
  }

  /*
   * O OUTRO LADO DO CONTRATO, e ele é tão importante quanto o primeiro.
   *
   * Estas funções são alcançáveis pelo cadastro de produto BASIC — o
   * `ProductForm` chama as quatro primeiras no mount, e monta o
   * `CompositionBuilder`, que chama as três últimas. Gateá-las quebraria uma
   * tela BASIC. Ficam de fora por decisão, e este teste impede que entrem por
   * distração.
   */
  const SEM_GUARDA: Array<[string, string[]]> = [
    [
      "inventory.fn.ts",
      [
        "adminListarItensParaVinculo",
        "adminListarUnidades",
        "adminListarConversoesDeUnidade",
        // O fluxo de venda: reserva e consumo do pedido.
        "systemReserveForOrder",
        "systemConsumeForOrder",
      ],
    ],
    ["report.fn.ts", ["adminGetStockReport"]],
  ];

  for (const [arquivo, funcoes] of SEM_GUARDA) {
    const codigo = fonte(arquivo);
    for (const nome of funcoes) {
      it(`${arquivo} · ${nome} NÃO é gateada — caminho BASIC`, () => {
        expect(blocoDa(codigo, nome)).not.toContain("exigirRecurso(");
      });
    }
  }

  /*
   * O fluxo de venda não passa por server function nenhuma: pedido toca
   * estoque pelo serviço, em `order-service.ts → OrderInventoryHandler`.
   * Se alguém puser a guarda ali, o BASIC para de vender.
   */
  /*
    A ASSERÇÃO É POR FUNÇÃO, E NÃO POR ARQUIVO — e isso foi corrigido depois.
    A versão antiga proibia `exigirRecurso(` no arquivo inteiro, o que passou a
    reprovar `orders.fn.ts` quando o despacho de entregador virou pago. O
    arquivo mistura venda com frota; o que precisa continuar livre são as
    funções da VENDA, nominalmente.
  */
  it("o fluxo de venda não ganhou guarda de recurso", () => {
    const DA_VENDA: Array<[string, string[]]> = [
      ["orders.fn.ts", ["listKanbanOrdersFn", "updateOrderStatusFn", "confirmPaymentFn", "getOrderFn"]],
      ["balcao.fn.ts", ["precificarBalcaoFn", "getBalcaoMenuFn"]],
      ["products.fn.ts", ["listProductsFn", "getProductFn"]],
      ["storefront-checkout.fn.ts", ["submitCheckoutFn"]],
    ];
    for (const [arquivo, funcoes] of DA_VENDA) {
      const codigo = readFileSync(resolve(__dirname, "../../functions", arquivo), "utf8");
      for (const nome of funcoes) {
        expect(blocoDa(codigo, nome), `${arquivo} · ${nome}`).not.toContain("Recurso(");
      }
    }

    /* Os SERVIÇOS continuam limpos por inteiro: nenhum deles conhece plano. */
    for (const servico of [
      "order-service.ts",
      "order-inventory-handler.ts",
      "order-status-sync.ts",
    ]) {
      const codigo = readFileSync(resolve(__dirname, "../../services", servico), "utf8");
      expect(codigo, servico).not.toContain("exigirRecurso(");
      expect(codigo, servico).not.toContain("garantirRecurso(");
    }
  });

  /*
   * `adminGetOrderFulfillmentStats` NÃO é estoque — é estatística de PEDIDO, e
   * foi classificada em RELATORIOS na fase dos relatórios. O que esta suíte
   * precisa continuar garantindo é que ela não seja absorvida por ESTOQUE só
   * por morar em `report.fn.ts` ao lado dos relatórios de estoque.
   */
  it("report.fn.ts · adminGetOrderFulfillmentStats não é ESTOQUE", () => {
    const bloco = blocoDa(fonte("report.fn.ts"), "adminGetOrderFulfillmentStats");
    expect(bloco).not.toContain('exigirRecurso("ESTOQUE")');
    expect(bloco).toContain('exigirRecurso("RELATORIOS")');
  });

  /* Nenhuma comparação direta de plano entrou no projeto. */
  it("não existe `plano === \"PREMIUM\"` espalhado", () => {
    for (const [arquivo] of GUARDADAS) {
      const codigo = fonte(arquivo);
      expect(codigo).not.toMatch(/plan(o)?\s*===\s*["']PREMIUM["']/);
      expect(codigo).not.toMatch(/plan(o)?\s*===\s*["']BASIC["']/);
    }
  });
});

describe("exigirRecurso — a porta completa", () => {
  it("é assíncrona e devolve a sessão", () => {
    // Sem cookie não há sessão; o que importa aqui é que ela recusa ANTES de
    // olhar o plano — a ordem `requireAdminSession` → `garantirRecurso`.
    expect(exigirRecurso).toBeInstanceOf(Function);
    expect(exigirRecurso("ESTOQUE")).rejects.toBeTruthy();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ESTOQUE NO BASIC — a fronteira com produção e receitas
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A pergunta é feita direto à guarda do backend, sem passar por tela nenhuma:
 * é o que uma chamada crua à server function encontraria.
 *
 * O risco desta mudança nunca foi o estoque: era ESTOQUE arrastar PRODUCAO e
 * RECEITAS junto, porque as três convivem na mesma tela e mexem nas mesmas
 * tabelas. Estas asserções são a linha que separa as duas coisas.
 */
describe("BASIC — estoque sim, produção e receitas não", () => {
  it("ESTOQUE é permitido", () => {
    expect(() => garantirRecurso(BASIC, "ESTOQUE")).not.toThrow();
  });

  it("PRODUCAO é bloqueado", () => {
    expect(() => garantirRecurso(BASIC, "PRODUCAO")).toThrow(RecursoIndisponivelError);
  });

  it("RECEITAS é bloqueado", () => {
    expect(() => garantirRecurso(BASIC, "RECEITAS")).toThrow(RecursoIndisponivelError);
  });

  /*
   * Ter estoque não pode abrir NADA por vizinhança. Custo e margem seguem em
   * FINANCEIRO, e os relatórios avançados em RELATORIOS.
   */
  it("e nenhum vizinho entrou de carona", () => {
    for (const recurso of ["FINANCEIRO", "RELATORIOS", "AUDITORIA"] as const) {
      expect(() => garantirRecurso(BASIC, recurso), recurso).toThrow(RecursoIndisponivelError);
    }
  });

  it("PREMIUM, TRIAL e LEGADO passam nos três", () => {
    for (const sessao of [PREMIUM, EM_TESTE, TESTE_COM_BASIC, LEGADA]) {
      for (const recurso of ["ESTOQUE", "PRODUCAO", "RECEITAS"] as const) {
        expect(() => garantirRecurso(sessao, recurso)).not.toThrow();
      }
    }
  });
});
