import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { ESSENCIAIS, EXCLUSIVOS_DO_PREMIUM } from "@/lib/planos/catalogo";
import { getPublicStoreSettings } from "@/server/repositories/store-settings-repository";
import type { LojaParaPlano } from "@/server/billing/plano-da-loja";
import { entregaLiberada, entregaLiberadaNoPlano } from "../guarda-de-entrega";

/*
 * A ENTREGA VIROU PREMIUM — 01/09/2026.
 *
 * `DELIVERY_BASICO` era essencial e não bloqueava nada: existia só para o
 * catálogo comercial poder dizer "o Basic entrega". Ao subir para o Premium,
 * mover a chave sozinha faria a página de preços dizer que o Basic não entrega
 * enquanto ele continuava entregando — o mesmo defeito que esta arquitetura
 * existe para impedir, só que invertido.
 *
 * Por isso a chave veio acompanhada de duas guardas, e são elas que este
 * arquivo cobra:
 *
 *   `criarPedido`  recusa o pedido de entrega. É a segurança.
 *   a vitrine      deixa de oferecer a opção. É a cortesia.
 *
 * ⚠️ O QUE **NÃO** MUDOU: `DELIVERY_AVANCADO` continua sendo outra chave —
 * entregador, despacho e rastreio —, e o BALCÃO e a RETIRADA seguem
 * essenciais. Uma loja Basic vende; ela só não entrega.
 */

const DIA = 24 * 60 * 60 * 1000;
const futuro = (d: number) => new Date(Date.now() + d * DIA);

const loja = (dados: Partial<LojaParaPlano>): LojaParaPlano =>
  ({
    status: "ACTIVE",
    trialEndsAt: null,
    paidUntil: futuro(20),
    subscriptionStatus: null,
    plan: null,
    ...dados,
  }) as LojaParaPlano;

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  A MATRIZ
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("a entrega saiu dos essenciais", () => {
  it("DELIVERY_BASICO é exclusivo do Premium", () => {
    expect(EXCLUSIVOS_DO_PREMIUM).toContain("DELIVERY_BASICO");
    expect(ESSENCIAIS).not.toContain("DELIVERY_BASICO");
  });

  /*
   * O QUE O BASIC CONTINUA TENDO. Vender não depende de entregar: retirada e
   * balcão seguem essenciais, e o cardápio, os pedidos e o estoque também.
   * Uma mudança que levasse esses junto teria transformado o plano básico em
   * nada.
   */
  it("o Basic continua vendendo — só não entrega", () => {
    for (const recurso of ["CARDAPIO", "PEDIDOS", "BALCAO", "CLIENTES", "ESTOQUE"] as const) {
      expect(ESSENCIAIS, recurso).toContain(recurso);
    }
  });

  it("DELIVERY_AVANCADO continua sendo outra chave", () => {
    expect(EXCLUSIVOS_DO_PREMIUM).toContain("DELIVERY_AVANCADO");
    // Duas chaves distintas, e não uma fundida: entregar e gerenciar frota
    // seguem separáveis se a decisão comercial mudar de novo.
    expect(EXCLUSIVOS_DO_PREMIUM.filter((r) => r.startsWith("DELIVERY_"))).toHaveLength(2);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  A DECISÃO, ESTADO A ESTADO
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("quem pode entregar", () => {
  it("BASIC não pode", () => {
    expect(entregaLiberadaNoPlano(loja({ plan: "BASIC" }))).toBe(false);
  });

  it("PREMIUM pode", () => {
    expect(entregaLiberadaNoPlano(loja({ plan: "PREMIUM" }))).toBe(true);
  });

  /*
   * O TESTE DE 14 DIAS ENTREGA, inclusive com BASIC contratado: `efetivo` é
   * PREMIUM enquanto ele corre. Quem assinar o Basic perde a entrega no dia
   * seguinte ao fim do teste, e é o comportamento certo — o teste mostra o
   * produto inteiro.
   */
  it("TRIAL pode, mesmo com BASIC gravado", () => {
    for (const plan of [null, "BASIC"] as const) {
      expect(
        entregaLiberadaNoPlano(
          loja({ status: "TRIAL", trialEndsAt: futuro(7), paidUntil: null, plan }),
        ),
        `plan=${plan}`,
      ).toBe(true);
    }
  });

  it("teste VENCIDO com BASIC contratado perde a entrega", () => {
    expect(
      entregaLiberadaNoPlano(
        loja({ status: "TRIAL", trialEndsAt: new Date(Date.now() - DIA), paidUntil: null, plan: "BASIC" }),
      ),
    ).toBe(false);
  });

  /* A loja legada passa, pela permissão transitória de sempre. */
  it("LEGADO continua entregando", () => {
    expect(entregaLiberadaNoPlano(loja({ paidUntil: null, plan: null }))).toBe(true);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  COM O BANCO — a vitrine e a loja inexistente
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("com o banco", () => {
  async function limpar() {
    await prisma.store.deleteMany({});
  }
  beforeEach(limpar);
  afterAll(limpar);

  async function criar(plan: "BASIC" | "PREMIUM" | null, acceptsDelivery = true) {
    const s = await prisma.store.create({
      data: {
        slug: `entrega-${Math.random().toString(36).slice(2, 9)}`,
        name: "Loja da entrega",
        status: "ACTIVE",
        paidUntil: futuro(20),
        plan,
        settings: {
          create: { storeName: "Loja da entrega", whatsappNumber: "11999999999", acceptsDelivery },
        },
      },
      select: { id: true },
    });
    return s.id;
  }

  it("BASIC: a vitrine deixa de oferecer entrega", async () => {
    const id = await criar("BASIC");
    const publico = await getPublicStoreSettings(id);
    expect(publico.acceptsDelivery).toBe(false);
    // E a retirada continua de pé: a loja não sai do ar, ela muda de modalidade.
    expect(publico.acceptsPickup).toBe(true);
  });

  it("PREMIUM: a vitrine oferece normalmente", async () => {
    const id = await criar("PREMIUM");
    expect((await getPublicStoreSettings(id)).acceptsDelivery).toBe(true);
  });

  /*
   * O INTERRUPTOR DA LOJA CONTINUA MANDANDO. "Não estamos entregando agora" e
   * "seu plano não inclui entrega" são dois nãos diferentes, e o primeiro não
   * foi substituído pelo segundo — um Premium que desligou continua desligado.
   */
  it("PREMIUM com o interruptor desligado continua sem oferecer", async () => {
    const id = await criar("PREMIUM", false);
    expect((await getPublicStoreSettings(id)).acceptsDelivery).toBe(false);
  });

  it("a loja legada continua oferecendo", async () => {
    const s = await prisma.store.create({
      data: {
        slug: `entrega-legada-${Math.random().toString(36).slice(2, 7)}`,
        name: "Legada",
        status: "ACTIVE",
        paidUntil: null,
        plan: null,
        settings: { create: { storeName: "Legada", whatsappNumber: "11999999999" } },
      },
      select: { id: true },
    });
    expect((await getPublicStoreSettings(s.id)).acceptsDelivery).toBe(true);
  });

  it("BASIC e PREMIUM lidos do banco decidem igual à função pura", async () => {
    expect(await entregaLiberada(await criar("BASIC"))).toBe(false);
    expect(await entregaLiberada(await criar("PREMIUM"))).toBe(true);
  });

  /*
   * Sem loja não há plano. Deixar passar por não achar transformaria um id
   * errado em permissão.
   */
  it("loja inexistente não entrega", async () => {
    expect(await entregaLiberada("cmnaoexiste0000000000000")).toBe(false);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CONTRATO DO CÓDIGO — a fonte, lida
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("contrato das duas guardas", () => {
  const raiz = resolve(__dirname, "../..");
  const fonte = (caminho: string) => readFileSync(resolve(raiz, caminho), "utf8");

  const semComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  const pedido = fonte("services/order-service.ts");
  const vitrine = fonte("repositories/store-settings-repository.ts");

  it("o pedido de entrega passa pela guarda", () => {
    expect(semComentarios(pedido)).toContain('input.type === "DELIVERY" && !(await entregaLiberada(storeId))');
  });

  /*
   * ⚠️ A GUARDA VALE INCLUSIVE NO BALCÃO, e é a diferença entre um
   * interruptor e um contrato. Os interruptores de entrega/retirada não valem
   * para quem atende com o cliente na frente — mas "entregar só desta vez"
   * não existe num plano que não inclui entrega. Se esta asserção quebrar,
   * alguém pôs a guarda dentro do `if (!noBalcao)` e abriu a porta de volta.
   */
  it("e ela NÃO está dentro da exceção do balcão", () => {
    const codigo = semComentarios(pedido);
    const guarda = codigo.indexOf("entregaLiberada(storeId)");
    const excecao = codigo.indexOf("if (!noBalcao) {");
    expect(guarda).toBeGreaterThan(-1);
    expect(excecao).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(excecao);
  });

  it("a recusa diz o que resolve", () => {
    expect(pedido).toContain("Seu plano não inclui pedidos de entrega.");
    // E não se confunde com o interruptor, que continua com a frase dele.
    expect(pedido).toContain("A loja não está aceitando entregas no momento.");
  });

  it("a vitrine cruza as duas perguntas, sem consulta a mais", () => {
    expect(vitrine).toContain("acceptsDelivery: settings.acceptsDelivery && entregaNoPlano");
    // O plano entra no `select` que já buscava o businessType.
    expect(vitrine).toContain("select: { businessType: true, ...CAMPOS_DO_PLANO }");
    expect(semComentarios(vitrine).match(/prisma\.store\.findUnique/g) ?? []).toHaveLength(1);
  });

  it("nenhuma das duas compara plano na mão", () => {
    for (const [nome, codigo] of [
      ["order-service.ts", pedido],
      ["store-settings-repository.ts", vitrine],
      ["guarda-de-entrega.ts", fonte("delivery/guarda-de-entrega.ts")],
    ] as const) {
      expect(semComentarios(codigo), nome).not.toMatch(
        /plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/,
      );
    }
  });
});
