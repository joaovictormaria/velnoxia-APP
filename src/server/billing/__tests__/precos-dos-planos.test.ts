import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { PRECO_MENSAL, precoEscrito } from "@/lib/plano";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { aplicarAssinatura } from "../subscription-service";
import {
  planoDaAssinatura,
  planoDoPreco,
  planosComPrecoProprio,
  planoVendavel,
  precoDoPlano,
  PrecoNaoConfiguradoError,
  priceIdDaAssinatura,
  VARIAVEL_DO_PLANO,
} from "../precos-dos-planos";

/*
 * PRICE DO STRIPE ⇄ PLANO.
 *
 * O teste que mais importa aqui é o do Price DESCONHECIDO. Um chute nessa
 * tradução não daria erro visível: daria uma loja pagante rebaixada em
 * silêncio, descoberta semanas depois por reclamação.
 */

const BASIC = "price_teste_basic_0001";
const PREMIUM = "price_teste_premium_0002";
const LEGADO = "price_teste_legado_unico";
const OUTRO = "price_de_outro_produto";

const ORIGINAL = { ...process.env };

function ambiente(vars: Record<string, string | undefined>) {
  for (const nome of [
    "STRIPE_PRICE_ID",
    VARIAVEL_DO_PLANO.BASIC,
    VARIAVEL_DO_PLANO.PREMIUM,
  ]) {
    delete process.env[nome];
  }
  for (const [nome, valor] of Object.entries(vars)) {
    if (valor !== undefined) process.env[nome] = valor;
  }
}

const AMBOS = {
  [VARIAVEL_DO_PLANO.BASIC]: BASIC,
  [VARIAVEL_DO_PLANO.PREMIUM]: PREMIUM,
};

beforeEach(() => ambiente(AMBOS));
afterEach(() => {
  process.env = { ...ORIGINAL };
});

/** Uma assinatura do Stripe com um item, como as reais. */
function assinatura(priceId: string | null): Stripe.Subscription {
  return {
    id: "sub_teste",
    items: { data: priceId ? [{ price: { id: priceId } }] : [] },
  } as unknown as Stripe.Subscription;
}

describe("1·2 · o Price traduz para o plano certo", () => {
  it("Price do BASIC → BASIC", () => {
    expect(planoDoPreco(BASIC)).toBe("BASIC");
    expect(planoDaAssinatura(assinatura(BASIC))).toBe("BASIC");
  });

  it("Price do PREMIUM → PREMIUM", () => {
    expect(planoDoPreco(PREMIUM)).toBe("PREMIUM");
    expect(planoDaAssinatura(assinatura(PREMIUM))).toBe("PREMIUM");
  });

  it("a ida também: cada plano cobra o Price dele", () => {
    expect(precoDoPlano("BASIC")).toBe(BASIC);
    expect(precoDoPlano("PREMIUM")).toBe(PREMIUM);
  });

  it("o Price sai do item da assinatura, como o Stripe manda", () => {
    expect(priceIdDaAssinatura(assinatura(PREMIUM))).toBe(PREMIUM);
    expect(priceIdDaAssinatura(assinatura(null))).toBeNull();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  3 · PRICE DESCONHECIDO — o teste que protege quem paga
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("3 · Price desconhecido não classifica nada", () => {
  it("um Price de outro produto não vira BASIC nem PREMIUM", () => {
    expect(planoDoPreco(OUTRO)).toBeNull();
    expect(planoDaAssinatura(assinatura(OUTRO))).toBeNull();
  });

  it("assinatura sem item não classifica", () => {
    expect(planoDaAssinatura(assinatura(null))).toBeNull();
    expect(planoDoPreco(null)).toBeNull();
    expect(planoDoPreco(undefined)).toBeNull();
    expect(planoDoPreco("   ")).toBeNull();
  });

  /*
   * O CASO DO DEPLOY ESQUECIDO. Sem as variáveis, TODO Price é desconhecido —
   * e nenhum deles vira BASIC. Se a ausência de configuração rebaixasse, um
   * envio ao ar sem as variáveis derrubaria o Premium de todo mundo.
   */
  it("sem variável nenhuma, nada é classificado — e nada vira BASIC", () => {
    ambiente({});
    for (const price of [BASIC, PREMIUM, LEGADO, OUTRO]) {
      expect(planoDoPreco(price), price).toBeNull();
    }
  });

  it("configurar só um plano não faz o outro Price cair nele", () => {
    ambiente({ [VARIAVEL_DO_PLANO.PREMIUM]: PREMIUM });
    expect(planoDoPreco(PREMIUM)).toBe("PREMIUM");
    expect(planoDoPreco(BASIC)).toBeNull();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O PRICE ANTIGO DE R$ 300 — nem cobra, nem classifica
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Desde que os dois Prices reais existem (31/08/2026), o Premium é o de
 * R$ 360. O antigo segue vivo no Stripe cobrando quem já assina, e o código
 * não o conhece por nenhum dos dois lados.
 */
describe("o Price único antigo", () => {
  it("NÃO é reserva para cobrar o Premium", () => {
    ambiente({ STRIPE_PRICE_ID: LEGADO });
    expect(planoVendavel("PREMIUM")).toBe(false);
    expect(() => precoDoPlano("PREMIUM")).toThrow(PrecoNaoConfiguradoError);
  });

  it("NÃO é reserva para cobrar o BASIC", () => {
    ambiente({ STRIPE_PRICE_ID: LEGADO });
    expect(planoVendavel("BASIC")).toBe(false);
    expect(() => precoDoPlano("BASIC")).toThrow(PrecoNaoConfiguradoError);
  });

  /*
   * O comportamento DEFINIDO, e não uma omissão: chega ao webhook como Price
   * desconhecido, e `Store.plan` fica como está. Classificá-lo como Premium
   * promoveria toda loja que já assina, na próxima renovação, sem ninguém ter
   * decidido — a classificação de loja legada, que é outra fase.
   */
  it("NÃO traduz para plano nenhum, mesmo com os dois planos configurados", () => {
    ambiente({ ...AMBOS, STRIPE_PRICE_ID: LEGADO });
    expect(planoDoPreco(LEGADO)).toBeNull();
    expect(planoDaAssinatura(assinatura(LEGADO))).toBeNull();
  });

  it("configurar os dois planos não muda o que o Price antigo cobra", () => {
    ambiente({ ...AMBOS, STRIPE_PRICE_ID: LEGADO });
    expect(precoDoPlano("PREMIUM")).toBe(PREMIUM);
    expect(precoDoPlano("PREMIUM")).not.toBe(LEGADO);
  });
});

describe("7 · a configuração central", () => {
  it("nomeia as duas variáveis, e só elas", () => {
    expect(VARIAVEL_DO_PLANO).toEqual({
      BASIC: "STRIPE_PRICE_ID_BASIC",
      PREMIUM: "STRIPE_PRICE_ID_PREMIUM",
    });
  });

  it("sabe dizer o que ainda falta configurar", () => {
    ambiente({});
    expect(planosComPrecoProprio()).toEqual({ BASIC: false, PREMIUM: false });

    ambiente(AMBOS);
    expect(planosComPrecoProprio()).toEqual({ BASIC: true, PREMIUM: true });
  });

  it("o erro de preço ausente não vaza Price nem chave", () => {
    ambiente({});
    try {
      precoDoPlano("BASIC");
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const e = erro as PrecoNaoConfiguradoError;
      expect(e).toBeInstanceOf(PrecoNaoConfiguradoError);
      expect(e.plano).toBe("BASIC");
      expect(e.message).toBe("O plano Básico ainda não tem preço configurado.");
      expect(e.message).not.toMatch(/price_|sk_|STRIPE_/);
    }
  });

  it("as duas variáveis estão documentadas no .env de exemplo", () => {
    const exemplo = readFileSync(
      resolve(__dirname, "../../../../.env.example"),
      "utf8",
    );
    expect(exemplo).toContain("STRIPE_PRICE_ID_BASIC=");
    expect(exemplo).toContain("STRIPE_PRICE_ID_PREMIUM=");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  OS PRICES REAIS — o ambiente de verdade, sem valor cravado no teste
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este bloco NÃO monta ambiente: usa o que o `.env.test` carregou, que é o
 * mesmo conteúdo do `.env.test.example` versionado. É o que transforma "a
 * função traduz" em "a configuração desta instalação traduz" — o erro que
 * nenhum teste de função pega é a variável errada no arquivo.
 */
describe("a configuração real desta instalação", () => {
  const REAIS = { ...ORIGINAL };

  beforeEach(() => {
    process.env = { ...REAIS };
  });

  it("as duas variáveis estão preenchidas e são diferentes entre si", () => {
    const basic = REAIS[VARIAVEL_DO_PLANO.BASIC];
    const premium = REAIS[VARIAVEL_DO_PLANO.PREMIUM];

    expect(basic, "STRIPE_PRICE_ID_BASIC vazia").toBeTruthy();
    expect(premium, "STRIPE_PRICE_ID_PREMIUM vazia").toBeTruthy();
    expect(basic).not.toBe(premium);
    expect(basic).toMatch(/^price_/);
    expect(premium).toMatch(/^price_/);
  });

  it("o Price configurado de cada plano volta como aquele plano", () => {
    expect(planoDoPreco(REAIS[VARIAVEL_DO_PLANO.BASIC])).toBe("BASIC");
    expect(planoDoPreco(REAIS[VARIAVEL_DO_PLANO.PREMIUM])).toBe("PREMIUM");
  });

  it("os dois planos são vendáveis, cada um com o Price dele", () => {
    expect(planoVendavel("BASIC")).toBe(true);
    expect(planoVendavel("PREMIUM")).toBe(true);
    expect(precoDoPlano("BASIC")).toBe(REAIS[VARIAVEL_DO_PLANO.BASIC]);
    expect(precoDoPlano("PREMIUM")).toBe(REAIS[VARIAVEL_DO_PLANO.PREMIUM]);
  });

  /*
   * O ERRO QUE MAIS DOERIA: apontar uma das variáveis para o Price antigo de
   * R$ 300 e vender BASIC ou Premium por ele.
   */
  it("nenhum dos dois aponta para o Price antigo", () => {
    const antigo = REAIS.STRIPE_PRICE_ID;
    if (!antigo) return;
    expect(precoDoPlano("BASIC")).not.toBe(antigo);
    expect(precoDoPlano("PREMIUM")).not.toBe(antigo);
    expect(planoDoPreco(antigo)).toBeNull();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  4·5 · O TRIAL NÃO MUDOU
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("4·5 · o trial continua vindo do estado, não do Stripe", () => {
  const DIA = 24 * 60 * 60 * 1000;
  const futuro = (d: number) => new Date(Date.now() + d * DIA);

  const emTeste = (plan: "BASIC" | "PREMIUM" | null) =>
    estadoComercialDaLoja({
      status: "TRIAL",
      trialEndsAt: futuro(7),
      paidUntil: null,
      subscriptionStatus: null,
      plan,
    } as LojaParaPlano);

  it("loja em teste é PREMIUM efetivo, com a coluna vazia", () => {
    const estado = emTeste(null);
    expect(estado.emTrial).toBe(true);
    expect(estado.efetivo).toBe("PREMIUM");
    // O que está GRAVADO segue nulo — o Premium do teste é calculado.
    expect(estado.armazenado).toBeNull();
  });

  it("o Premium do teste não vem de Price nenhum", () => {
    ambiente({});
    const estado = emTeste(null);
    expect(estado.efetivo).toBe("PREMIUM");
  });

  it("uma loja em teste com BASIC contratado continua BASIC na coluna", () => {
    const estado = emTeste("BASIC");
    expect(estado.efetivo).toBe("PREMIUM");
    expect(estado.armazenado).toBe("BASIC");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  8·9 · CONTRATO DO CÓDIGO
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("8·9 · nenhum Price espalhado, e o webhook usa a fonte central", () => {
  const raiz = resolve(__dirname, "../../..");
  const fonte = (caminho: string) => readFileSync(resolve(raiz, caminho), "utf8");

  /** Ver a mesma nota em `limites-do-plano.test.ts`: comentários citam o que o
   *  código NÃO faz, e uma asserção sobre o texto cru reprovaria a explicação. */
  const semComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  const assinaturas = fonte("server/billing/subscription-service.ts");
  const webhook = fonte("routes/api/stripe-webhook.ts");
  const stripeCfg = fonte("server/billing/stripe.ts");
  const central = fonte("server/billing/precos-dos-planos.ts");

  it("nenhum Price ID literal no código", () => {
    for (const [nome, codigo] of [
      ["subscription-service.ts", assinaturas],
      ["stripe-webhook.ts", webhook],
      ["stripe.ts", stripeCfg],
      ["precos-dos-planos.ts", central],
      ["functions/billing.fn.ts", fonte("server/functions/billing.fn.ts")],
    ] as const) {
      expect(semComentarios(codigo), nome).not.toMatch(/["']price_[A-Za-z0-9]+["']/);
    }
  });

  /*
   * SÓ A FONTE CENTRAL LÊ AS VARIÁVEIS. Uma segunda leitura em outro arquivo
   * seria uma segunda tradução, e as duas divergiriam no primeiro deploy.
   */
  it("só `precos-dos-planos.ts` lê as variáveis de Price", () => {
    expect(central).toContain("STRIPE_PRICE_ID_BASIC");
    expect(central).toContain("STRIPE_PRICE_ID_PREMIUM");

    for (const [nome, codigo] of [
      ["subscription-service.ts", assinaturas],
      ["stripe-webhook.ts", webhook],
      ["stripe.ts", stripeCfg],
    ] as const) {
      expect(semComentarios(codigo), nome).not.toContain("STRIPE_PRICE_ID");
    }
  });

  it("a escrita de Store.plan usa a resolução central, e acontece uma vez só", () => {
    expect(assinaturas).toContain("planoDaAssinatura(sub)");
    expect(assinaturas).toContain("plan: plano ?? undefined");
    // Uma única escrita da coluna no projeto inteiro.
    expect(semComentarios(assinaturas).match(/plan:\s/g) ?? []).toHaveLength(1);
  });

  /*
   * `?? undefined`, e nunca `?? null` nem `?? "BASIC"`. `undefined` faz o
   * Prisma não tocar na coluna; `null` a apagaria, e um literal rebaixaria ou
   * promoveria a loja por causa de configuração ausente.
   */
  it("Price desconhecido não apaga nem rebaixa a coluna", () => {
    const codigo = semComentarios(assinaturas);
    expect(codigo).not.toMatch(/plan:\s*(null|["'](BASIC|PREMIUM)["'])/);
    expect(codigo).not.toMatch(/plano\s*\?\?\s*["'](BASIC|PREMIUM)["']/);
  });

  it("o checkout aceita o plano e traduz pela fonte central", () => {
    expect(assinaturas).toContain("precoDoPlano(plano)");
    expect(assinaturas).toMatch(/criarCheckout\(\s*\n?\s*storeId: string,\s*\n?\s*plano: Plano/);
  });

  /*
   * A asserção mira a ESCRITA, e não o nome do campo: `resumoDaAssinatura` lê
   * `trialEndsAt` num `select` para a tela mostrar quando o teste acaba, e
   * ler nunca foi o problema. O que não pode existir é o billing MEXENDO no
   * teste — nem no calendário dele, nem gravando PREMIUM por causa dele.
   */
  it("o trial não é escrito por lugar nenhum do billing", () => {
    const gravacao = assinaturas.slice(
      assinaturas.indexOf("export async function aplicarAssinatura"),
      assinaturas.indexOf("export async function aplicarCheckout"),
    );
    expect(gravacao).toContain("prisma.store.update");
    expect(semComentarios(gravacao)).not.toContain("trialEndsAt");
    expect(semComentarios(gravacao)).not.toMatch(/status:\s*["']TRIAL["']/);

    for (const [nome, codigo] of [
      ["subscription-service.ts", assinaturas],
      ["stripe-webhook.ts", webhook],
    ] as const) {
      expect(semComentarios(codigo), nome).not.toMatch(/plan:\s*["']PREMIUM["']/);
    }
  });

  /*
   * O QUE A TELA ESCREVE E O QUE O CHECKOUT COBRA TÊM DE COMBINAR. Os três
   * botões de "Assinar" chamam `precoEscrito()` sem argumento, e
   * `criarCheckout` sem plano cobra PREMIUM — os dois padrões precisam ser o
   * mesmo, senão o botão anuncia um valor e a fatura traz outro.
   */
  it("10 · a tela mostra R$ 267 e R$ 360, e nunca R$ 300", () => {
    expect(PRECO_MENSAL.BASIC).toBe(267);
    expect(PRECO_MENSAL.PREMIUM).toBe(360);
    expect(Object.values(PRECO_MENSAL)).not.toContain(300);

    /*
     * O espaço entre "R$" e o número é NBSP (U+00A0) no `toLocaleString`
     * pt-BR — comparar com um espaço comum falha com as duas strings
     * parecendo idênticas na tela. Normalizar é mais honesto que cravar o
     * caractere invisível no teste.
     */
    const semNbsp = (s: string) => s.replace(/ /g, " ");
    expect(semNbsp(precoEscrito("BASIC"))).toBe("R$ 267,00");
    expect(semNbsp(precoEscrito("PREMIUM"))).toBe("R$ 360,00");
    // O padrão do botão é o Premium, igual ao padrão do checkout.
    expect(precoEscrito()).toBe(precoEscrito("PREMIUM"));

    expect(semComentarios(assinaturas)).toMatch(/plano: Plano = "PREMIUM"/);
  });

  /*
   * `assinatura.tsx` saiu desta lista: o preço mudou de lugar, não de fonte.
   * A página passou a compor `EscolhaDePlano`, e é o componente que escreve o
   * valor — sempre por `precoEscrito`. A asserção acompanha o preço.
   */
  it("nenhuma tela do painel escreve o preço na mão", () => {
    for (const arquivo of [
      "components/admin/planos/EscolhaDePlano.tsx",
      "routes/admin/route.tsx",
      "components/admin/layout/ContagemDoTeste.tsx",
    ]) {
      const codigo = semComentarios(fonte(arquivo));
      expect(codigo, arquivo).toContain("precoEscrito(");
      expect(codigo, arquivo).not.toMatch(/R\$\s?(300|267|360)/);
    }

    /*
     * E a página que hospeda a escolha não escreve valor nenhum.
     *
     * A busca é por valor em REAIS, e não pelo número solto: `neutral-300` e
     * `neutral-200` são classes do Tailwind, e procurar "300" cru reprovaria
     * uma borda cinza.
     */
    expect(semComentarios(fonte("routes/admin/assinatura.tsx"))).not.toMatch(/R\$\s?\d/);
  });

  it("o webhook não ganhou tradução própria de Price", () => {
    const codigo = semComentarios(webhook);
    expect(codigo).not.toContain("planoDoPreco");
    expect(codigo).not.toContain("items.data");
    // Ele continua só encaminhando para o serviço, como antes desta fase.
    expect(codigo).toContain("aplicarAssinatura");
    expect(codigo).toContain("aplicarCheckout");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  8 · COM O BANCO — o que o webhook grava em Store.plan
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `aplicarAssinatura` é o ponto por onde os três caminhos do webhook passam
 * (checkout, customer.subscription.* e invoice.*). Ela só fala com o Prisma —
 * nenhuma chamada ao Stripe — então dá para exercitá-la de verdade.
 */
describe("8 · com o banco — a gravação do plano", () => {
  async function limpar() {
    await prisma.store.deleteMany({});
  }

  beforeEach(async () => {
    ambiente(AMBOS);
    await limpar();
  });
  afterAll(limpar);

  async function loja(plan: "BASIC" | "PREMIUM" | null = null) {
    const criada = await prisma.store.create({
      data: {
        slug: `stripe-${Math.random().toString(36).slice(2, 9)}`,
        name: "Loja do webhook",
        status: "TRIAL",
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        plan,
      },
      select: { id: true },
    });
    return criada.id;
  }

  /** Uma assinatura viva do Stripe, como as que chegam no webhook. */
  function evento(storeId: string, priceId: string): Stripe.Subscription {
    return {
      id: `sub_${Math.random().toString(36).slice(2, 9)}`,
      status: "active",
      customer: "cus_teste",
      cancel_at_period_end: false,
      metadata: { storeId },
      items: {
        data: [
          {
            price: { id: priceId },
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          },
        ],
      },
    } as unknown as Stripe.Subscription;
  }

  const planoGravado = async (id: string) =>
    (await prisma.store.findUniqueOrThrow({ where: { id }, select: { plan: true } })).plan;

  it("Price do BASIC grava BASIC", async () => {
    const id = await loja();
    await aplicarAssinatura(evento(id, BASIC));
    expect(await planoGravado(id)).toBe("BASIC");
  });

  it("Price do PREMIUM grava PREMIUM", async () => {
    const id = await loja();
    await aplicarAssinatura(evento(id, PREMIUM));
    expect(await planoGravado(id)).toBe("PREMIUM");
  });

  it("trocar de plano regrava a coluna", async () => {
    const id = await loja();
    await aplicarAssinatura(evento(id, BASIC));
    expect(await planoGravado(id)).toBe("BASIC");

    await aplicarAssinatura(evento(id, PREMIUM));
    expect(await planoGravado(id)).toBe("PREMIUM");
  });

  /*
   * O PRICE ANTIGO DE R$ 300 CHEGANDO NO WEBHOOK. É o caso real de quem já
   * assina: a loja continua paga, continua ACTIVE, e o plano dela NÃO é
   * inventado.
   */
  it("Price antigo não classifica, e não tira nada da loja", async () => {
    const id = await loja(null);
    await aplicarAssinatura(evento(id, LEGADO));

    const depois = await prisma.store.findUniqueOrThrow({
      where: { id },
      select: { plan: true, status: true, paidUntil: true, subscriptionStatus: true },
    });

    expect(depois.plan).toBeNull();
    expect(depois.status).toBe("ACTIVE");
    expect(depois.subscriptionStatus).toBe("active");
    expect(depois.paidUntil).not.toBeNull();
  });

  it("Price desconhecido não rebaixa quem já tem plano", async () => {
    const id = await loja("PREMIUM");
    await aplicarAssinatura(evento(id, OUTRO));
    expect(await planoGravado(id)).toBe("PREMIUM");
  });

  it("Price desconhecido não promove quem tem BASIC", async () => {
    const id = await loja("BASIC");
    await aplicarAssinatura(evento(id, OUTRO));
    expect(await planoGravado(id)).toBe("BASIC");
  });

  /*
   * CANCELAR NÃO APAGA O PLANO. O acesso é cortado pela data, que é outra
   * coluna; o que a loja contratou continua registrado.
   */
  it("assinatura cancelada mantém o plano contratado", async () => {
    const id = await loja();
    await aplicarAssinatura(evento(id, PREMIUM));

    const cancelada = {
      ...evento(id, PREMIUM),
      status: "canceled",
      cancel_at_period_end: true,
    } as unknown as Stripe.Subscription;
    await aplicarAssinatura(cancelada);

    const depois = await prisma.store.findUniqueOrThrow({
      where: { id },
      select: { plan: true, subscriptionStatus: true, cancelAtPeriodEnd: true },
    });
    expect(depois.plan).toBe("PREMIUM");
    expect(depois.subscriptionStatus).toBe("canceled");
    expect(depois.cancelAtPeriodEnd).toBe(true);
  });

  /*
   * 5 · O TRIAL NÃO ESCREVE PLANO. A loja nasce em teste com a coluna vazia,
   * e ela só é preenchida quando um pagamento com Price conhecido chega.
   */
  it("uma loja em teste, sem assinatura, continua com a coluna vazia", async () => {
    const id = await loja(null);
    const antes = await prisma.store.findUniqueOrThrow({
      where: { id },
      select: { plan: true, status: true },
    });
    expect(antes.plan).toBeNull();
    expect(antes.status).toBe("TRIAL");

    const estado = estadoComercialDaLoja(
      (await prisma.store.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          trialEndsAt: true,
          paidUntil: true,
          subscriptionStatus: true,
          plan: true,
        },
      })) as LojaParaPlano,
    );
    expect(estado.efetivo).toBe("PREMIUM");
    expect(estado.armazenado).toBeNull();
  });
});
