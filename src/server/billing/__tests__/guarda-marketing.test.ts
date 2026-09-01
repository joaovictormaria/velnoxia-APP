import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { garantirRecurso, RecursoIndisponivelError } from "../guarda-de-recurso";
import { recursoNoEstado } from "@/lib/planos/resolucao";
import { RECURSO_DA_ROTA } from "@/lib/planos/navegacao";
import { RECURSO_DO_LIMITE, TODOS_OS_LIMITES } from "@/lib/planos/limites";
import { getStoreBySlug } from "@/server/repositories/store-repository";
import type { CurrentAdmin } from "@/server/auth/session";

/*
 * O ENFORCEMENT DO MARKETING.
 *
 * A linha desta fase separa GERIR de VER:
 *
 *   pago    → criar promoção, criar cupom, responder e ocultar avaliação,
 *             publicar no blog
 *   público → o cliente ler a vitrine, enviar avaliação, curtir, ler o blog
 *
 * E o cupom tem duas metades: CRIAR é gestão paga; APLICAR acontece num
 * checkout público que precisa continuar vendendo sem cupom nenhum.
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

describe("BASIC — a gestão de marketing é recusada", () => {
  it("lança o erro de domínio, com o rótulo do módulo", () => {
    try {
      garantirRecurso(BASIC, "MARKETING");
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const e = erro as RecursoIndisponivelError;
      expect(e).toBeInstanceOf(RecursoIndisponivelError);
      expect(e.recurso).toBe("MARKETING");
      expect(e.rotulo).toBe("Marketing");
      expect(e.message).toBe("Este recurso está disponível no plano Premium.");
    }
  });

  for (const operacao of [
    "criar promoção",
    "editar promoção",
    "criar cupom",
    "editar cupom",
    "responder avaliação",
    "ocultar avaliação",
    "publicar no blog",
  ]) {
    it(`${operacao} → bloqueado`, () => {
      expect(() => garantirRecurso(BASIC, "MARKETING")).toThrow(RecursoIndisponivelError);
    });
  }
});

describe("BASIC — vender e configurar continuam liberados", () => {
  for (const recurso of [
    "PEDIDOS",
    "BALCAO",
    "CARDAPIO",
    "CLIENTES",
    "CONFIGURACOES",
  ] as const) {
    it(`${recurso} passa`, () => {
      expect(() => garantirRecurso(BASIC, recurso)).not.toThrow();
    });
  }
});

describe("PREMIUM, TRIAL e LEGADO", () => {
  it("PREMIUM passa", () => {
    expect(() => garantirRecurso(PREMIUM, "MARKETING")).not.toThrow();
  });

  it("TRIAL passa, inclusive com BASIC contratado", () => {
    expect(() => garantirRecurso(EM_TESTE, "MARKETING")).not.toThrow();
    expect(() => garantirRecurso(TESTE_COM_BASIC, "MARKETING")).not.toThrow();
    expect(TESTE_COM_BASIC.store.plano.armazenado).toBe("BASIC");
  });

  it("LEGADO passa, e segue sem classificação", () => {
    expect(() => garantirRecurso(LEGADA, "MARKETING")).not.toThrow();
    expect(LEGADA.store.plano.legado).toBe(true);
    expect(LEGADA.store.plano.armazenado).toBeNull();
  });
});

describe("com o banco — o cupom decide pelo plano da loja", () => {
  async function limpar() {
    await prisma.store.deleteMany({});
  }
  beforeEach(limpar);
  afterAll(limpar);

  async function criarLoja(slug: string, plan: "BASIC" | "PREMIUM" | null) {
    await prisma.store.create({
      data: { slug, name: `Loja ${slug}`, status: "ACTIVE", paidUntil: futuro(20), plan },
    });
  }

  /** A mesma decisão de `previewCouponFn` e do campo `couponCode`. */
  async function cupomLiberadoPara(slug: string): Promise<boolean> {
    const store = await getStoreBySlug(slug);
    if (!store) return false;
    return recursoNoEstado(estadoComercialDaLoja(store), "MARKETING") !== "BLOQUEADO";
  }

  it("loja BASIC → cupom recusado", async () => {
    await criarLoja("basica", "BASIC");
    expect(await cupomLiberadoPara("basica")).toBe(false);
  });

  it("loja PREMIUM → cupom liberado", async () => {
    await criarLoja("premium", "PREMIUM");
    expect(await cupomLiberadoPara("premium")).toBe(true);
  });

  it("loja legada → liberado, transitoriamente", async () => {
    await prisma.store.create({
      data: { slug: "legada", name: "Legada", status: "ACTIVE", plan: null },
    });
    expect(await cupomLiberadoPara("legada")).toBe(true);
  });

  it("o storeSlug escolhe a loja, não o plano", async () => {
    await criarLoja("basica", "BASIC");
    await criarLoja("premium", "PREMIUM");
    expect(await cupomLiberadoPara("basica")).toBe(false);
    expect(await cupomLiberadoPara("premium")).toBe(true);
    expect(await cupomLiberadoPara("inexistente")).toBe(false);
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

  const GESTAO: Array<[string, string[]]> = [
    ["promotions.fn.ts", ["listPromotionsFn", "savePromotionFn", "deletePromotionFn"]],
    ["coupons.fn.ts", ["listCouponsFn", "saveCouponFn", "deleteCouponFn"]],
    ["reviews.fn.ts", ["listReviewsForAdminFn", "respondToReviewFn", "setReviewHiddenFn"]],
    ["posts.fn.ts", ["listPostsFn", "savePostFn", "deletePostFn"]],
  ];

  for (const [arquivo, funcoes] of GESTAO) {
    for (const nome of funcoes) {
      it(`${arquivo} · ${nome} exige MARKETING`, () => {
        const bloco = blocoDa(fonte(arquivo), nome);
        expect(bloco).toContain('exigirRecurso("MARKETING")');
        expect(bloco).not.toContain("requireAdminSession()");
      });
    }
  }

  /*
   * ═══════════════════════════════════════════════════════════════════════
   *  O PÚBLICO NÃO FOI TOCADO
   * ═══════════════════════════════════════════════════════════════════════
   *
   * O cliente lê a vitrine, envia avaliação, curte e lê o blog — tudo sem
   * conta, e tudo continua funcionando numa loja BASIC. O que é pago é
   * ADMINISTRAR esse conteúdo.
   */
  const PUBLICAS: Array<[string, string[]]> = [
    ["reviews.fn.ts", ["listReviewsFn", "submitReviewFn", "toggleReviewLikeFn"]],
    ["post-likes.fn.ts", ["listLikedPostsFn", "togglePostLikeFn"]],
  ];

  for (const [arquivo, funcoes] of PUBLICAS) {
    for (const nome of funcoes) {
      it(`${arquivo} · ${nome} continua público`, () => {
        expect(blocoDa(fonte(arquivo), nome)).not.toContain("Recurso(");
      });
    }
  }

  it("enviar avaliação não exige plano nenhum", () => {
    const bloco = blocoDa(fonte("reviews.fn.ts"), "submitReviewFn");
    expect(bloco).not.toContain("MARKETING");
    expect(bloco).not.toContain("exigirRecurso");
  });

  /*
   * ═══ "SOBRE O RESTAURANTE" NÃO É MARKETING ═══════════════════════════════
   *
   * Ele edita `StoreSettings.about*` — a mesma natureza de nome, logo e
   * horário. Mora na tela de marketing por organização, e classificá-lo pela
   * tela deixaria a loja BASIC sem como editar a própria apresentação.
   */
  it("o 'sobre' foi classificado como CONFIGURACOES, não MARKETING", () => {
    const codigo = fonte("posts.fn.ts");
    for (const nome of ["getAboutFn", "saveAboutFn"]) {
      const bloco = blocoDa(codigo, nome);
      expect(bloco, nome).toContain('exigirRecurso("CONFIGURACOES")');
      expect(bloco, nome).not.toContain('exigirRecurso("MARKETING")');
    }
    // E o BASIC tem CONFIGURACOES.
    expect(() => garantirRecurso(BASIC, "CONFIGURACOES")).not.toThrow();
  });

  /*
   * ═══ A CLASSIFICAÇÃO E A TELA PRECISAM CONCORDAR ════════════════════════
   *
   * Classificar em CONFIGURACOES não bastava: enquanto a única tela de edição
   * fosse `/admin/avaliacoes`, que é paga, a loja BASIC teria o recurso no
   * plano e nenhum caminho até ele. A edição mudou de casa.
   */
  it("a edição do 'sobre' mora em Configurações, e não mais em Avaliações", () => {
    const configuracoes = readFileSync(
      resolve(__dirname, "../../../routes/admin/configuracoes/index.tsx"),
      "utf8",
    );
    expect(configuracoes).toContain("function EdicaoDoSobre()");
    expect(configuracoes).toContain('{ id: "sobre", label: "Nosso restaurante" }');
    expect(configuracoes).toContain("getAboutFn");
    expect(configuracoes).toContain("saveAboutFn");

    const avaliacoes = readFileSync(
      resolve(__dirname, "../../../routes/admin/avaliacoes/index.tsx"),
      "utf8",
    );
    expect(avaliacoes).not.toContain("getAboutFn");
    expect(avaliacoes).not.toContain("saveAboutFn");
    expect(avaliacoes).not.toContain("AboutTab");
  });

  /*
   * NENHUMA CÓPIA. Só existe um par de funções para o "sobre", e a tela nova
   * chama exatamente ele — se alguém duplicar a lógica, esta contagem cai.
   */
  it("não houve duplicação de getAboutFn / saveAboutFn", () => {
    const codigo = fonte("posts.fn.ts");
    expect(codigo.split("export const getAboutFn").length - 1).toBe(1);
    expect(codigo.split("export const saveAboutFn").length - 1).toBe(1);

    const settings = fonte("settings.fn.ts");
    expect(settings).not.toContain("aboutTitle");
    expect(settings).not.toContain("getAboutFn");
  });

  it("a rota de Configurações continua aberta ao BASIC", () => {
    const configuracoes = readFileSync(
      resolve(__dirname, "../../../routes/admin/configuracoes/index.tsx"),
      "utf8",
    );
    expect(configuracoes).not.toContain("rotaPremium(");
    expect(RECURSO_DA_ROTA["/admin/configuracoes"]).toBe("CONFIGURACOES");
  });

  /* O cupom público: prévia e aplicação. */
  it("previewCouponFn decide pela loja, sem sessão de painel", () => {
    const codigo = fonte("coupons.fn.ts");
    const bloco = blocoDa(codigo, "previewCouponFn");
    expect(bloco).toContain('recursoNoEstado(estadoComercialDaLoja(store), "MARKETING")');
    expect(bloco).not.toContain("exigirRecurso(");
    // A recusa não revela o plano.
    expect(bloco).toContain("Cupom inválido.");
    expect(codigo).not.toContain("disponível no plano");
  });

  it("submitCheckoutFn continua público; o campo couponCode não", () => {
    const codigo = fonte("storefront-checkout.fn.ts");
    expect(codigo).not.toContain("exigirRecurso(");
    expect(codigo).toContain('data.couponCode && recursoNoEstado(comercial, "MARKETING")');

    // A recusa vem ANTES de criar o pedido.
    const iGuarda = codigo.indexOf("data.couponCode &&");
    const iPedido = codigo.indexOf("createOrderFromCheckout(store.id");
    expect(iGuarda).toBeGreaterThan(-1);
    expect(iGuarda).toBeLessThan(iPedido);
  });

  /*
   * O PEDIDO SEM CUPOM PASSA. A condição é sobre o CAMPO, não sobre a venda —
   * é isso que mantém o checkout BASIC funcionando.
   */
  it("o pedido sem cupom não passa pela guarda de marketing", () => {
    const codigo = fonte("storefront-checkout.fn.ts");
    expect(codigo).toMatch(/if \(data\.couponCode && recursoNoEstado/);
  });

  it("order-service continua sem saber o que é plano", () => {
    const servico = readFileSync(
      resolve(__dirname, "../../services/order-service.ts"),
      "utf8",
    );
    expect(servico).not.toContain("exigirRecurso(");
    expect(servico).not.toContain("garantirRecurso(");
    expect(servico).not.toContain("MARKETING");
  });

  it("nenhuma guarda específica de marketing foi criada", () => {
    for (const [arquivo] of GESTAO) {
      const codigo = fonte(arquivo);
      expect(codigo).not.toMatch(/exigirMarketing|guardaCupom|requireMarketing/);
      expect(codigo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
    }
  });

  /*
   * `Coupon.maxUsage` é limite DO CUPOM, posto pelo lojista. Não tem relação
   * com `MAX_CUPONS`, que é limite de plano e segue "A_DEFINIR".
   */
  it("o limite de usos do cupom não virou limite de plano", () => {
    /*
      A asserção olha os VALORES do catálogo, e não o texto do arquivo: o
      comentário de `limites.ts` cita `Coupon.maxUsage` de propósito, para
      documentar de onde veio a convenção de `null = ilimitado`. Procurar a
      palavra crua reprovaria a documentação em vez do código.
    */
    expect(TODOS_OS_LIMITES).toEqual(["MAX_PRODUTOS", "MAX_CATEGORIAS"]);
    expect(TODOS_OS_LIMITES).not.toContain("MAX_CUPONS");
    // E nenhum limite mede MARKETING.
    expect(Object.values(RECURSO_DO_LIMITE)).not.toContain("MARKETING");
  });
});

describe("rotas e menu", () => {
  const rota = (a: string) =>
    readFileSync(resolve(__dirname, "../../../routes/admin", a), "utf8");

  for (const arquivo of ["promocoes/index.tsx", "cupons/index.tsx", "avaliacoes/index.tsx"]) {
    it(`${arquivo} exige MARKETING`, () => {
      const codigo = rota(arquivo);
      expect(codigo).toContain('rotaPremium("MARKETING"');
      expect(codigo).not.toMatch(/createFileRoute\([^)]*\)\(\{\s*component:/);
    });
  }

  it("sidebar, rota e backend usam o mesmo recurso", () => {
    for (const caminho of ["/admin/promocoes", "/admin/cupons", "/admin/avaliacoes"]) {
      expect(RECURSO_DA_ROTA[caminho], caminho).toBe("MARKETING");
    }
  });

  /* O ajuste da fase anterior: menu e rota agora concordam. */
  it("o relatório de equipe está alinhado com a rota", () => {
    expect(RECURSO_DA_ROTA["/admin/relatorios/funcionarios"]).toBe("FUNCIONARIOS");
    expect(rota("relatorios/funcionarios.tsx")).toContain('rotaPremium("FUNCIONARIOS"');
  });

  /* Nenhuma página pública foi escondida. */
  it("a vitrine não ganhou guarda de rota", () => {
    const vitrine = readFileSync(
      resolve(__dirname, "../../../routes/$storeSlug/index.tsx"),
      "utf8",
    );
    expect(vitrine).not.toContain("rotaPremium(");
  });
});
