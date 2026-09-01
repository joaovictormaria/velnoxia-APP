import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * UMA ASSINATURA POR LOJA.
 *
 * O estrago que estes testes existem para impedir não é "cobrar duas vezes" —
 * é pior que isso. `aplicarAssinatura` grava `stripeSubscriptionId` sem
 * condição, então uma segunda assinatura SOBRESCREVE o ponteiro da primeira: a
 * antiga continua cobrando no Stripe e o sistema esquece que ela existe.
 * Ninguém descobre pelo painel; descobre pela fatura do cliente.
 *
 * ─── NENHUMA COBRANÇA REAL ─────────────────────────────────────────────────
 *
 * O cliente do Stripe é substituído por um falso, com a fábrica declarada
 * antes do import do módulo. Nenhuma chave é usada, nenhuma sessão de checkout
 * é aberta e nenhuma assinatura de ninguém é tocada. As lojas são criadas no
 * banco DESCARTÁVEL de teste.
 */

/** O que o Stripe vai responder ao `subscriptions.retrieve` de cada caso. */
const resposta = vi.hoisted(() => ({
  fn: vi.fn(async (_id: string) => ({ status: "active" }) as { status: string }),
}));

vi.mock("../stripe", () => ({
  stripe: () => ({ subscriptions: { retrieve: resposta.fn } }),
  cobrancaConfigurada: () => true,
  segredoDoWebhook: () => "whsec_de_teste",
}));

const { prisma } = await import("@/server/db/client");
const { estadoDaAssinaturaNoStripe } = await import("../subscription-service");

const DIA = 24 * 60 * 60 * 1000;

async function limpar() {
  await prisma.store.deleteMany({});
}

async function loja(stripeSubscriptionId: string | null) {
  const criada = await prisma.store.create({
    data: {
      slug: `dup-${Math.random().toString(36).slice(2, 9)}`,
      name: "Loja da assinatura",
      status: "ACTIVE",
      paidUntil: new Date(Date.now() + 30 * DIA),
      stripeSubscriptionId,
      stripeCustomerId: stripeSubscriptionId ? "cus_teste" : null,
    },
    select: { id: true },
  });
  return criada.id;
}

beforeEach(async () => {
  resposta.fn.mockReset();
  resposta.fn.mockResolvedValue({ status: "active" });
  await limpar();
});
afterAll(limpar);

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  1·2·5·6 · QUEM PODE ABRIR UM CHECKOUT NOVO
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("o estado da assinatura, segundo o Stripe", () => {
  it("1·2 · loja que nunca assinou: SEM_ASSINATURA, e o Stripe nem é consultado", async () => {
    const id = await loja(null);
    expect(await estadoDaAssinaturaNoStripe(id)).toBe("SEM_ASSINATURA");
    // Sem id gravado não há o que perguntar — e uma consulta a mais seria uma
    // chamada de rede em todo checkout de loja nova.
    expect(resposta.fn).not.toHaveBeenCalled();
  });

  it("3·4 · assinatura ativa: VIVA", async () => {
    const id = await loja("sub_viva");
    resposta.fn.mockResolvedValue({ status: "active" });
    expect(await estadoDaAssinaturaNoStripe(id)).toBe("VIVA");
    expect(resposta.fn).toHaveBeenCalledWith("sub_viva");
  });

  for (const status of ["trialing", "past_due"]) {
    it(`${status} também conta como VIVA`, async () => {
      const id = await loja("sub_x");
      resposta.fn.mockResolvedValue({ status });
      expect(await estadoDaAssinaturaNoStripe(id)).toBe("VIVA");
    });
  }

  /*
   * 5 · QUEM CANCELOU PODE VOLTAR. Recusar um ex-cliente seria fechar a porta
   * do próprio pagamento.
   */
  for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired"]) {
    it(`5 · ${status}: ENCERRADA — pode contratar de novo`, async () => {
      const id = await loja("sub_morta");
      resposta.fn.mockResolvedValue({ status });
      expect(await estadoDaAssinaturaNoStripe(id)).toBe("ENCERRADA");
    });
  }

  /*
   * 6 · A CÓPIA DO BANCO ENVELHECE. Uma assinatura apagada no Stripe, cujo
   * webhook se perdeu, continuaria gravada aqui — e prenderia a loja fora do
   * próprio pagamento se o banco fosse a única fonte.
   */
  it("6 · assinatura que não existe mais no Stripe: ENCERRADA", async () => {
    const id = await loja("sub_apagada");
    resposta.fn.mockRejectedValue(
      Object.assign(new Error("No such subscription"), { code: "resource_missing" }),
    );
    expect(await estadoDaAssinaturaNoStripe(id)).toBe("ENCERRADA");
  });

  /*
   * O CASO QUE NÃO PODE VIRAR "PODE CONTRATAR" POR OMISSÃO. Diante de uma
   * falha de rede, recusar custa uma tentativa; permitir custaria uma cobrança
   * dupla no cartão do cliente.
   */
  it("Stripe fora do ar: INDETERMINADO, e não ENCERRADA", async () => {
    const id = await loja("sub_qualquer");
    resposta.fn.mockRejectedValue(Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" }));
    expect(await estadoDaAssinaturaNoStripe(id)).toBe("INDETERMINADO");
  });

  it("erro sem código nenhum também é INDETERMINADO", async () => {
    const id = await loja("sub_qualquer");
    resposta.fn.mockRejectedValue(new Error("algo inesperado"));
    expect(await estadoDaAssinaturaNoStripe(id)).toBe("INDETERMINADO");
  });

  it("uma loja não enxerga a assinatura da outra", async () => {
    const comAssinatura = await loja("sub_da_vizinha");
    const semAssinatura = await loja(null);
    resposta.fn.mockResolvedValue({ status: "active" });

    expect(await estadoDaAssinaturaNoStripe(comAssinatura)).toBe("VIVA");
    expect(await estadoDaAssinaturaNoStripe(semAssinatura)).toBe("SEM_ASSINATURA");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  3·4·7·8 · A DECISÃO DA SERVER FUNCTION — a fonte, lida
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A função exige sessão de dono e navegação; o que se prova aqui é que a
 * guarda existe, vem ANTES do checkout, e recusa com uma frase de produto.
 */
describe("3·4·7·8 · a guarda na server function", () => {
  const porta = readFileSync(
    resolve(__dirname, "../../functions/billing.fn.ts"),
    "utf8",
  );

  const semComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  const bloco = porta.slice(
    porta.indexOf("export const iniciarAssinaturaFn"),
    porta.indexOf("export const abrirPortalFn"),
  );

  it("4 · a guarda existe, e não depende da tela", () => {
    expect(bloco).toContain("estadoDaAssinaturaNoStripe(admin.storeId)");
  });

  /*
   * A ORDEM É A GUARDA. Conferir depois de abrir a sessão de checkout não
   * impediria nada: a sessão já existiria, e concluí-la criaria a segunda
   * assinatura.
   */
  it("3 · a conferência vem ANTES de criar o checkout", () => {
    const codigo = semComentarios(bloco);
    expect(codigo.indexOf("estadoDaAssinaturaNoStripe")).toBeGreaterThan(-1);
    expect(codigo.indexOf("estadoDaAssinaturaNoStripe")).toBeLessThan(
      codigo.indexOf("criarCheckout("),
    );
  });

  it("3 · assinatura VIVA recusa, e aponta o Portal", () => {
    expect(bloco).toContain('assinatura === "VIVA"');
    expect(bloco).toContain("Sua loja já tem uma assinatura ativa.");
    expect(bloco).toContain("Gerenciar assinatura");
  });

  it("INDETERMINADO recusa, em vez de deixar passar", () => {
    expect(bloco).toContain('assinatura === "INDETERMINADO"');
    expect(bloco).toContain("Não conseguimos confirmar sua assinatura agora.");
  });

  /*
   * 5 · O que NÃO pode aparecer: uma recusa para quem encerrou. Só os dois
   * estados acima recusam; `SEM_ASSINATURA` e `ENCERRADA` seguem em frente.
   */
  it("5 · quem encerrou ou nunca assinou não é recusado", () => {
    const codigo = semComentarios(bloco);
    expect(codigo).not.toContain('assinatura === "ENCERRADA"');
    expect(codigo).not.toContain('assinatura === "SEM_ASSINATURA"');
    expect(codigo).not.toMatch(/assinatura\s*!==\s*"SEM_ASSINATURA"/);
  });

  /*
   * 7·8 · A MENSAGEM É DE PRODUTO. O erro do Stripe traz id de cliente, id de
   * assinatura e às vezes trecho da requisição — ele vai para o log do
   * servidor, nunca para a resposta.
   */
  it("7·8 · nenhuma informação interna do Stripe chega ao cliente", () => {
    const respostas = [...bloco.matchAll(/error:\s*([\s\S]*?),?\n\s*\}/g)].map((m) => m[1]);
    expect(respostas.length).toBeGreaterThan(2);
    for (const r of respostas) {
      expect(r, r.slice(0, 60)).not.toMatch(/erro|error\.|\.message|String\(/);
    }
    expect(semComentarios(bloco)).not.toMatch(/sub_|cus_|price_|sk_/);
    expect(bloco).toContain("console.error(");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  9·10·11 · A BARRA DO CELULAR CONCORDA COM O CARD
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("9·10·11 · celular e desktop dizem a mesma coisa", () => {
  const tela = readFileSync(
    resolve(__dirname, "../../../components/admin/planos/EscolhaDePlano.tsx"),
    "utf8",
  );

  it("9 · a barra sabe quando o plano selecionado já é o atual", () => {
    expect(tela).toContain("const selecionadoEhPlanoAtual = plano.armazenado === selecionado;");
    expect(tela).toContain("{selecionadoEhPlanoAtual ? (");
  });

  it("9 · e mostra “Plano atual” em vez do botão", () => {
    const barra = tela.slice(
      tela.indexOf("CELULAR: o CTA sempre ao alcance"),
      tela.lastIndexOf("</section>"),
    );
    expect(barra).toContain("Plano atual");
    expect(barra).toContain("selecionadoEhPlanoAtual");
  });

  it("10 · o outro plano continua com o botão", () => {
    const barra = tela.slice(
      tela.indexOf("CELULAR: o CTA sempre ao alcance"),
      tela.lastIndexOf("</section>"),
    );
    expect(barra).toContain("onClick={() => aoContratar(selecionado)}");
    expect(barra).toContain("Continuar");
  });

  /*
   * 11 · A MESMA PERGUNTA NOS DOIS LUGARES. O card usa `ehPlanoAtual`, que
   * vem de `plano.armazenado === atual`; a barra usa `plano.armazenado ===
   * selecionado`. Se um dia divergirem, é aqui que aparece.
   */
  it("11 · as duas telas derivam do MESMO campo", () => {
    expect(tela).toContain("ehPlanoAtual={plano.armazenado === atual}");
    expect(tela).toContain("plano.armazenado === selecionado");
    // Nenhuma das duas inventa regra a partir do plano EFETIVO.
    expect(tela).not.toContain("plano.efetivo");
  });
});
