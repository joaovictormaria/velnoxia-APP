import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { garantirRecurso, RecursoIndisponivelError } from "../guarda-de-recurso";
import type { CurrentAdmin } from "@/server/auth/session";

/*
 * O ENFORCEMENT DE PRODUÇÃO E RECEITAS.
 *
 * A regra não mudou desde a Fase 5 — o que este arquivo prova é a divisão de
 * águas desta fase, que foi a mais delicada até aqui:
 *
 *   · a aba Preparados e a maior parte das fichas técnicas ficaram protegidas;
 *   · quatro funções de composição NÃO ficaram, porque o cadastro de produto
 *     BASIC as alcança — e quebrá-lo foi proibido desde a Fase 5.
 *
 * O segundo grupo tem tanto teste quanto o primeiro: é ele que impede alguém
 * de "completar" a fase por distração e derrubar o formulário de produto.
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
  return { store: { plano: estadoComercialDaLoja(registro, AGORA) } } as unknown as CurrentAdmin;
}

const BASIC = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "BASIC" });
const PREMIUM = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan: "PREMIUM" });
const EM_TESTE = admin({ status: "TRIAL", trialEndsAt: futuro(7), plan: null });
const TESTE_COM_BASIC = admin({ status: "TRIAL", trialEndsAt: futuro(7), plan: "BASIC" });
const LEGADA = admin({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });

const DO_MODULO = ["PRODUCAO", "RECEITAS"] as const;

describe("BASIC — produção e receitas recusadas", () => {
  for (const recurso of DO_MODULO) {
    it(`${recurso} lança o erro de domínio`, () => {
      expect(() => garantirRecurso(BASIC, recurso)).toThrow(RecursoIndisponivelError);
    });
  }

  it("a mensagem é a do produto, com o rótulo de cada módulo", () => {
    const rotulos: Record<string, string> = {
      PRODUCAO: "Produção",
      RECEITAS: "Fichas técnicas",
    };
    for (const recurso of DO_MODULO) {
      try {
        garantirRecurso(BASIC, recurso);
        expect.unreachable("deveria ter lançado");
      } catch (erro) {
        const e = erro as RecursoIndisponivelError;
        expect(e.message).toBe("Este recurso está disponível no plano Premium.");
        expect(e.recurso).toBe(recurso);
        expect(e.rotulo).toBe(rotulos[recurso]);
      }
    }
  });
});

describe("PREMIUM, TRIAL e LEGADO — liberados", () => {
  for (const recurso of DO_MODULO) {
    it(`${recurso} passa no PREMIUM`, () => {
      expect(() => garantirRecurso(PREMIUM, recurso)).not.toThrow();
    });
    it(`${recurso} passa em TESTE`, () => {
      expect(() => garantirRecurso(EM_TESTE, recurso)).not.toThrow();
      expect(() => garantirRecurso(TESTE_COM_BASIC, recurso)).not.toThrow();
    });
    it(`${recurso} passa na loja legada`, () => {
      expect(() => garantirRecurso(LEGADA, recurso)).not.toThrow();
    });
  }

  it("o teste não reescreve o plano contratado", () => {
    expect(TESTE_COM_BASIC.store.plano.armazenado).toBe("BASIC");
  });

  it("a loja legada segue sem classificação", () => {
    expect(LEGADA.store.plano.legado).toBe(true);
    expect(LEGADA.store.plano.efetivo).toBeNull();
    expect(LEGADA.store.plano.armazenado).toBeNull();
  });
});

describe("BASIC — a venda e o cadastro continuam", () => {
  for (const recurso of ["CARDAPIO", "PEDIDOS", "BALCAO", "DELIVERY_BASICO", "DASHBOARD"] as const) {
    it(`${recurso} passa no BASIC`, () => {
      expect(() => garantirRecurso(BASIC, recurso)).not.toThrow();
    });
  }
});

describe("cobertura do backend de produção e receitas", () => {
  const raiz = resolve(__dirname, "../../functions");
  const fonte = (a: string) => readFileSync(resolve(raiz, a), "utf8");

  function blocoDa(codigo: string, nome: string): string {
    const i = codigo.indexOf(`export const ${nome} = createServerFn`);
    expect(i, `${nome} não encontrada`).toBeGreaterThan(-1);
    const fim = codigo.indexOf("export const ", i + 10);
    return fim < 0 ? codigo.slice(i) : codigo.slice(i, fim);
  }

  /* A aba Preparados inteira: só existe dentro de /admin/estoque. */
  const PRODUCAO = [
    "adminListarPreparados",
    "adminOpcoesDePreparado",
    "adminCriarPreparado",
    "adminAtualizarReceitaDePreparado",
    "adminProduzir",
    "adminHistoricoDeProducao",
    "adminReverterProducao",
  ];

  for (const nome of PRODUCAO) {
    it(`preparado.fn.ts · ${nome} exige PRODUCAO`, () => {
      const bloco = blocoDa(fonte("preparado.fn.ts"), nome);
      expect(bloco).toContain('exigirRecurso("PRODUCAO")');
      expect(bloco).not.toContain("await requireAdminSession()");
    });
  }

  /* Fichas técnicas alcançáveis só pela tela de estoque, ou sem consumidor. */
  const RECEITAS = [
    "adminActivateVersion",
    "adminDeleteComposition",
    "adminDeleteCompositionVersion",
    "adminGetComposition",
    "adminCalculateCompositionCost",
    "adminGetAllCompositions",
    "adminGetAllProducts",
  ];

  for (const nome of RECEITAS) {
    it(`composition.fn.ts · ${nome} exige RECEITAS`, () => {
      const bloco = blocoDa(fonte("composition.fn.ts"), nome);
      expect(bloco).toContain('exigirRecurso("RECEITAS")');
      expect(bloco).not.toContain("await requireAdminSession()");
    });
  }

  /*
   * ═══════════════════════════════════════════════════════════════════════
   *  O OUTRO LADO — as quatro que NÃO podem ser gateadas
   * ═══════════════════════════════════════════════════════════════════════
   *
   * O `ProductForm` — cadastro BASIC — alcança as quatro:
   *
   *   getActiveComposition      chamado em TODA edição de produto, só para o
   *                             selo "✓ Receita cadastrada"
   *   adminGetProductVersions   \
   *   adminCreateComposition     > via `CompositionBuilder`, montado dentro do
   *   adminUpdateComposition    /  formulário quando o tipo é PRODUÇÃO
   *
   * Gateá-las deixaria uma loja BASIC com produto de produção cadastrado e
   * sem como montar a ficha — e um produto de produção sem ficha é recusado
   * na venda pela guarda de receita. O cadastro pararia de funcionar.
   */
  const SEM_GUARDA = [
    ["getActiveComposition", "toda edição de produto BASIC a chama"],
    ["adminGetProductVersions", "CompositionBuilder dentro do ProductForm"],
    ["adminCreateComposition", "CompositionBuilder dentro do ProductForm"],
    ["adminUpdateComposition", "CompositionBuilder dentro do ProductForm"],
  ];

  for (const [nome, motivo] of SEM_GUARDA) {
    it(`composition.fn.ts · ${nome} NÃO é gateada — ${motivo}`, () => {
      expect(blocoDa(fonte("composition.fn.ts"), nome)).not.toContain("exigirRecurso(");
    });
  }

  /* Embalagem segue fora, como decidido na Fase 5. */
  for (const nome of [
    "listarEmbalagensDoProduto",
    "listarItensDeEmbalagem",
    "salvarEmbalagemDoProduto",
    "removerEmbalagemDoProduto",
  ]) {
    it(`embalagem.fn.ts · ${nome} segue sem guarda — ProductForm a chama`, () => {
      expect(blocoDa(fonte("embalagem.fn.ts"), nome)).not.toContain("exigirRecurso(");
    });
  }

  /*
    A venda não pode ganhar guarda de produção nem de receita.

    Asserção POR FUNÇÃO: `orders.fn.ts` e `balcao.fn.ts` ganharam guardas
    legítimas em fases posteriores — despacho de entregador e "pagar depois".
    O que esta suíte garante é que PRODUCAO e RECEITAS não entraram na venda.
  */
  it("o fluxo de venda continua sem guarda de produção ou receita", () => {
    /*
      A asserção olha a CHAMADA da guarda, e não a string solta: `products.fn`
      contém "PRODUCAO" legitimamente, como valor de `tipoDeControle` no Zod —
      é o tipo do produto, não o recurso do plano. Procurar a palavra crua
      confundiria os dois.
    */
    /*
      `products.fn.ts` SAIU DESTA LISTA em 31/08/2026, e por um motivo que é o
      oposto de um relaxamento: quando ESTOQUE desceu para o BASIC, o campo
      `tipoDeControle: PRODUCAO` do cadastro passou a exigir PRODUCAO
      explicitamente. Sem essa guarda, mover o estoque teria aberto a produção
      junto. O teste dela está em `produto-basic-sem-estoque.test.ts`.

      Cadastrar produto não é vender: as três funções abaixo continuam sendo
      o fluxo de venda, e nenhuma delas pode cobrar produção ou receita.
    */
    for (const arquivo of ["orders.fn.ts", "balcao.fn.ts", "storefront-checkout.fn.ts"]) {
      const codigo = fonte(arquivo);
      for (const recurso of ["PRODUCAO", "RECEITAS"]) {
        expect(codigo, `${arquivo} · exigirRecurso`).not.toContain(`exigirRecurso("${recurso}")`);
        expect(codigo, `${arquivo} · garantirRecurso`).not.toContain(`garantirRecurso(admin, "${recurso}")`);
      }
    }
    /* Os serviços não conhecem plano nenhum, e é por inteiro. */
    for (const servico of ["order-service.ts", "order-inventory-handler.ts", "order-status-sync.ts"]) {
      const codigo = readFileSync(resolve(__dirname, "../../services", servico), "utf8");
      expect(codigo, servico).not.toContain("exigirRecurso(");
      expect(codigo, servico).not.toContain("garantirRecurso(");
    }
  });

  it("nenhuma guarda específica de produção ou receita foi criada", () => {
    for (const arquivo of ["preparado.fn.ts", "composition.fn.ts"]) {
      const codigo = fonte(arquivo);
      expect(codigo).not.toMatch(/guardaProducao|guardaReceita|exigirProducao|exigirReceita/);
      expect(codigo).toContain('from "@/server/billing/guarda-de-recurso"');
      expect(codigo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
    }
  });

  /*
   * SEM GUARDA DUPLA. A produção baixa ingrediente pelo SERVIÇO de estoque,
   * não pela server function — então nada ganha ESTOQUE além do que a Fase 5
   * já protegeu, e um `adminProduzir` não dispara duas checagens.
   */
  it("produção não recebeu uma segunda guarda de ESTOQUE", () => {
    const codigo = fonte("preparado.fn.ts");
    expect(codigo).not.toContain('exigirRecurso("ESTOQUE")');
    const producao = blocoDa(codigo, "adminProduzir");
    expect(producao.split("exigirRecurso(").length - 1).toBe(1);
  });
});
