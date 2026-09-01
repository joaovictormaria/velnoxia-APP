import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { garantirRecurso, RecursoIndisponivelError } from "../guarda-de-recurso";
import type { CurrentAdmin } from "@/server/auth/session";

/*
 * O CADASTRO BASIC DE PRODUTO, SEPARADO DO MÓDULO PAGO.
 *
 * `saveProductFn` NÃO pode exigir ESTOQUE — cadastrar produto é o coração do
 * plano básico. Mas dois dos campos que ela aceita são do módulo pago:
 * `tipoDeControle` em PRODUCAO/REVENDA e `inventoryItemId`.
 *
 * O contrato desta fase é essa fronteira: a função aberta, os campos fechados.
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
const LEGADA = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });

/*
 * AS MESMAS DUAS condições que `saveProductFn` avalia, exercitadas aqui. Um
 * teste de fonte logo abaixo garante que a função continue avaliando estas.
 *
 * Eram uma só até 31/08/2026, quando ESTOQUE desceu para o BASIC: a partir
 * dali revenda e vínculo passaram a pedir ESTOQUE (essencial) e só a produção
 * continuou pedindo PRODUCAO (Premium). Separar as duas foi o que impediu que
 * mover o estoque abrisse a produção junto.
 */
function pediuEstoque(dados: { tipoDeControle?: string | null; inventoryItemId?: string | null }) {
  return dados.tipoDeControle === "REVENDA" || Boolean(dados.inventoryItemId);
}

function pediuProducao(dados: { tipoDeControle?: string | null }) {
  return dados.tipoDeControle === "PRODUCAO";
}

describe("qual campo pede qual recurso", () => {
  it("produto comum não pede nada — nem sem tipo, nem com NAO_CONTROLA", () => {
    for (const dados of [{}, { tipoDeControle: null }, { tipoDeControle: "NAO_CONTROLA" }]) {
      expect(pediuEstoque(dados)).toBe(false);
      expect(pediuProducao(dados)).toBe(false);
    }
  });

  it("revenda e vínculo pedem ESTOQUE, e não produção", () => {
    expect(pediuEstoque({ tipoDeControle: "REVENDA" })).toBe(true);
    expect(pediuEstoque({ inventoryItemId: "item-1" })).toBe(true);
    expect(pediuProducao({ tipoDeControle: "REVENDA" })).toBe(false);
  });

  it("produção pede PRODUCAO, e não estoque", () => {
    expect(pediuProducao({ tipoDeControle: "PRODUCAO" })).toBe(true);
    expect(pediuEstoque({ tipoDeControle: "PRODUCAO" })).toBe(false);
  });
});

describe("BASIC", () => {
  it("cria produto comum — nada é exigido", () => {
    expect(pediuEstoque({ tipoDeControle: "NAO_CONTROLA" })).toBe(false);
    expect(pediuProducao({ tipoDeControle: "NAO_CONTROLA" })).toBe(false);
    // E, se nada é exigido, a guarda nem é chamada.
    expect(() => garantirRecurso(BASIC, "CARDAPIO")).not.toThrow();
  });

  it("NÃO cria produto de produção", () => {
    expect(pediuProducao({ tipoDeControle: "PRODUCAO" })).toBe(true);
    expect(() => garantirRecurso(BASIC, "PRODUCAO")).toThrow(RecursoIndisponivelError);
  });

  /*
   * A METADE QUE VIROU DO BASIC. Revenda e vínculo com item de estoque
   * passaram a funcionar no plano básico em 31/08/2026 — é o que dá ao BASIC
   * o controle de quantidade sem lhe dar a ficha técnica.
   */
  it("CRIA produto de revenda e vincula item de estoque", () => {
    expect(pediuEstoque({ tipoDeControle: "REVENDA" })).toBe(true);
    expect(pediuEstoque({ inventoryItemId: "x" })).toBe(true);
    expect(() => garantirRecurso(BASIC, "ESTOQUE")).not.toThrow();
  });

  it("NÃO cria receita nem produção", () => {
    expect(() => garantirRecurso(BASIC, "RECEITAS")).toThrow(RecursoIndisponivelError);
    expect(() => garantirRecurso(BASIC, "PRODUCAO")).toThrow(RecursoIndisponivelError);
  });

  it("continua com cardápio, pedidos, balcão e delivery básico", () => {
    for (const r of ["CARDAPIO", "PEDIDOS", "BALCAO", "CLIENTES"] as const) {
      expect(() => garantirRecurso(BASIC, r)).not.toThrow();
    }
  });
});

describe("PREMIUM, TRIAL e LEGADO criam qualquer produto", () => {
  for (const [nome, sessao] of [
    ["PREMIUM", PREMIUM],
    ["TRIAL", EM_TESTE],
    ["LEGADO", LEGADA],
  ] as const) {
    it(`${nome} passa em ESTOQUE, RECEITAS e PRODUCAO`, () => {
      for (const r of ["ESTOQUE", "RECEITAS", "PRODUCAO"] as const) {
        expect(() => garantirRecurso(sessao, r)).not.toThrow();
      }
    });
  }

  it("a loja legada segue sem classificação", () => {
    expect(LEGADA.store.plano.legado).toBe(true);
    expect(LEGADA.store.plano.armazenado).toBeNull();
  });
});

describe("contrato do código", () => {
  const fn = (a: string) => readFileSync(resolve(__dirname, "../../functions", a), "utf8");

  it("saveProductFn continua ABERTA, com os campos fechados", () => {
    const codigo = fn("products.fn.ts");
    const i = codigo.indexOf("export const saveProductFn");
    const fim = codigo.indexOf("export const ", i + 10);
    const bloco = codigo.slice(i, fim < 0 ? undefined : fim);

    // A função inteira não é gateada — o cadastro é BASIC.
    expect(bloco).not.toContain('exigirRecurso("ESTOQUE")');
    expect(bloco).not.toContain('exigirRecurso("PRODUCAO")');
    // Mas os campos são, cada um pelo recurso a que pertence.
    expect(bloco).toContain('garantirRecurso(admin, "ESTOQUE")');
    expect(bloco).toContain('garantirRecurso(admin, "PRODUCAO")');
    expect(bloco).toContain('tipo === "PRODUCAO"');
    expect(bloco).toContain('tipo === "REVENDA"');
    expect(bloco).toContain("inventoryItemId");
    // Sem comparação direta de plano.
    expect(bloco).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
  });

  it("ligar o controle de estoque exige o recurso; desligar, não", () => {
    const codigo = fn("settings.fn.ts");
    const i = codigo.indexOf("export const salvarControleDeEstoqueFn");
    const bloco = codigo.slice(i);
    expect(bloco).toContain('exigirRecurso("ESTOQUE")');
    // A assimetria: o caminho de desligar continua com a sessão comum.
    expect(bloco).toContain("requireAdminSession()");
  });

  it("a leitura devolve os dois estados separados", () => {
    const codigo = fn("settings.fn.ts");
    expect(codigo).toContain("estoqueDisponivelNoPlano(storeId)");
    expect(codigo).toContain("controleDeEstoqueAtivo(storeId)");
    expect(codigo).toContain("disponivel,");
  });

  it("o plano entra pelo ponto único, e não espalhado", () => {
    const guarda = readFileSync(
      resolve(__dirname, "../../inventory/guarda-de-receita.ts"),
      "utf8",
    );
    expect(guarda).toContain("recursoNoEstado(estadoComercialDaLoja");
    expect(guarda).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
    /*
      `!== "BLOQUEADO"` e nunca `=== "PERMITIDO"`: o segundo desligaria o
      controle da loja legada, cujo veredito é INDEFINIDO.
    */
    expect(guarda).toContain('!== "BLOQUEADO"');
    expect(guarda).not.toContain('=== "PERMITIDO"');
  });

  it("a venda não ganhou dependência de ESTOQUE", () => {
    /*
      A asserção é sobre ESTOQUE, e não sobre guarda nenhuma. O balcão ganhou,
      na fase do Fiado, uma recusa para o campo "pagar depois" — o que ele não
      pode ganhar é dependência do módulo de estoque para vender.
    */
    for (const arquivo of ["orders.fn.ts", "balcao.fn.ts", "storefront-checkout.fn.ts"]) {
      expect(fn(arquivo), arquivo).not.toContain('exigirRecurso("ESTOQUE")');
      expect(fn(arquivo), arquivo).not.toContain('garantirRecurso(admin, "ESTOQUE")');
    }
  });
});
