import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { entregaLiberadaNoPlano } from "@/server/delivery/guarda-de-entrega";

/*
 * A ENTREGA NA TELA DE CONFIGURAÇÕES.
 *
 * `DELIVERY_BASICO` subiu para o Premium em 01/09/2026, e a entrega passou a
 * ser recusada em dois lugares: no pedido (`order-service`) e na vitrine
 * (`store-settings-repository`). Faltava o terceiro: o painel continuava
 * oferecendo taxa, frete grátis, prazo e o interruptor "aceita entrega" para
 * uma loja que não pode entregar — e gravava tudo.
 *
 * A parte pura é testada de verdade. O resto lê a fonte: server function do
 * TanStack precisa de AsyncLocalStorage e não é chamável do vitest, e o
 * projeto não tem jsdom.
 */

const fn = readFileSync(
  resolve(__dirname, "../settings.fn.ts"),
  "utf8",
);
const tela = readFileSync(
  resolve(__dirname, "../../../routes/admin/configuracoes/index.tsx"),
  "utf8",
);

const semComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** O estado comercial de uma loja, na forma que a guarda espera. */
const loja = (plan: "BASIC" | "PREMIUM" | null) => ({
  plan,
  status: "ACTIVE",
  trialEndsAt: null,
  paidUntil: null,
  subscriptionStatus: null,
});

describe("quem pode entregar", () => {
  it("o BASIC não pode", () => {
    expect(entregaLiberadaNoPlano(loja("BASIC") as any)).toBe(false);
  });

  it("o PREMIUM pode", () => {
    expect(entregaLiberadaNoPlano(loja("PREMIUM") as any)).toBe(true);
  });

  /*
   * A LOJA LEGADA PASSA. `plan = null` é a loja de antes da matriz comercial,
   * e a permissão transitória vale aqui igual à rota, ao menu e ao pedido —
   * as quatro têm que responder a mesma coisa, senão a loja é bloqueada num
   * lugar e liberada no outro.
   */
  it("a legada, sem plano, continua passando", () => {
    expect(entregaLiberadaNoPlano(loja(null) as any)).toBe(true);
  });
});

describe("o que o servidor faz com os campos de entrega", () => {
  /*
   * O CADEADO DA TELA É CORTESIA. Um POST direto continuava gravando taxa,
   * prazo e `acceptsDelivery: true` numa loja BASIC — este é o teste de que a
   * recusa desceu para o servidor.
   */
  it("pergunta ao plano antes de gravar", () => {
    const codigo = semComentarios(fn);
    expect(codigo).toContain("const podeEntregar = await entregaLiberada(storeId);");
    expect(codigo).toContain("for (const campo of CAMPOS_DE_ENTREGA) delete dados[campo];");
    // E grava o payload filtrado, nunca o original.
    expect(codigo).toContain("updateStoreSettings(storeId, dados)");
    expect(codigo).not.toContain("updateStoreSettings(storeId, data)");
  });

  /*
   * OS CINCO CAMPOS, e só eles. "Pedido mínimo" NÃO entra: vale para retirada
   * também, e tirá-lo da loja BASIC seria cobrar por algo que ela já tinha.
   */
  it("descarta exatamente os campos que só existem por causa da entrega", () => {
    const bloco = fn.slice(
      fn.indexOf("const CAMPOS_DE_ENTREGA"),
      fn.indexOf("] as const;", fn.indexOf("const CAMPOS_DE_ENTREGA")),
    );
    for (const campo of [
      "acceptsDelivery",
      "deliveryFee",
      "freeDeliveryMinOrder",
      "estimatedDeliveryMinMin",
      "estimatedDeliveryMinMax",
    ]) {
      expect(bloco, campo).toContain(campo);
    }
    expect(bloco).not.toContain("minOrderValue");
    expect(bloco).not.toContain("estimatedPickup");
  });

  /*
   * DESCARTE, E NÃO ERRO — e é a diferença entre uma loja BASIC conseguir ou
   * não salvar o horário de funcionamento. O formulário manda o rascunho
   * inteiro num POST só; recusar a requisição por causa de um campo que ela
   * nem pode editar travaria a tela toda.
   */
  it("não recusa a requisição inteira por causa deles", () => {
    const codigo = semComentarios(fn);
    /*
     * O RAMO DO BLOQUEIO SÓ DESCARTA. Isolado, ele não pode conter `throw` nem
     * `ok: false` — se contivesse, a loja BASIC não conseguiria salvar horário
     * de funcionamento por causa de um campo que ela nem pode editar.
     */
    const inicio = codigo.indexOf("if (!podeEntregar) {");
    expect(inicio, "o ramo do bloqueio sumiu").toBeGreaterThan(-1);
    const ramo = codigo.slice(inicio, codigo.indexOf("}", inicio));
    expect(ramo).not.toContain("throw");
    expect(ramo).not.toContain("ok: false");
  });

  /*
   * O VALOR GUARDADO NÃO É ZERADO. Uma loja que caiu de Premium para BASIC
   * mantém a taxa e o prazo que configurou; se reassinar, encontra tudo como
   * deixou. Zerar seria destruir configuração por causa de uma cobrança.
   */
  it("não zera o que já estava gravado", () => {
    const codigo = semComentarios(fn);
    expect(codigo).not.toMatch(/acceptsDelivery:\s*false/);
    expect(codigo).not.toMatch(/deliveryFee:\s*0/);
  });

  /*
   * A CHECAGEM DE "ENTREGA OU RETIRADA" TEM QUE OLHAR O PLANO. Sem isso, uma
   * loja BASIC com "aceita entrega" ligado lá atrás passaria pela validação
   * sem aceitar nada de fato — e ficaria com uma vitrine sem nenhuma forma de
   * comprar.
   */
  it("exige retirada quando a entrega não é do plano", () => {
    const codigo = semComentarios(fn);
    expect(codigo).toContain(
      "if (!(podeEntregar && data.acceptsDelivery) && !data.acceptsPickup) {",
    );
    expect(fn).toContain("Seu plano não inclui entrega");
  });

  /*
   * E a faixa de tempo de ENTREGA não pode barrar quem não entrega: os campos
   * ficam desabilitados na tela, e um par inconsistente herdado do passado
   * travaria o salvamento de tudo o mais.
   */
  it("não valida a faixa de entrega de quem não pode entregar", () => {
    // `\s+` e não `\n`: o arquivo é CRLF, e um `\n` cru nunca casaria.
    expect(semComentarios(fn)).toMatch(
      /podeEntregar\s+&&\s+data\.estimatedDeliveryMinMax < data\.estimatedDeliveryMinMin/,
    );
  });
});

describe("o cadeado na tela", () => {
  /*
   * O CADEADO DESCE PARA O BLOCO, e não fica na aba. Retirada, pedido mínimo
   * e formas de pagamento são do BASIC — trancar a aba inteira tiraria da
   * loja configurações que ela tem direito de mexer.
   */
  it("tranca só o bloco de entrega, não a aba", () => {
    expect(tela).toContain('active={tab === "entrega"}');
    expect(tela).toContain("const entregaTrancada");
    expect(tela).toContain('label="Aceita retirada"');
    // A retirada nunca é desabilitada pelo plano.
    const retirada = tela.slice(tela.indexOf('label="Aceita retirada"'));
    expect(retirada.slice(0, 200)).not.toContain("disabled={entregaTrancada}");
  });

  it("pergunta ao mesmo lugar que o resto do painel", () => {
    const codigo = semComentarios(tela);
    expect(codigo).toContain('recursoNoEstado(admin.store.plano, "DELIVERY_BASICO")');
    // Nenhuma regra própria de plano digitada na tela.
    expect(codigo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
  });

  /*
   * O BLOQUEADO NÃO SOME. Mesma escolha do menu, das abas do estoque e dos
   * cards de relatório: escondê-lo faria a loja nunca descobrir que a entrega
   * existe — e é ela que dá motivo para assinar.
   */
  it("mostra o bloco com cadeado e convite, em vez de escondê-lo", () => {
    expect(tela).toContain("<Lock");
    expect(tela).toContain("Conhecer o Premium");
    expect(tela).toContain('to="/admin/assinatura"');
  });

  it("os campos de entrega ficam desabilitados", () => {
    for (const trecho of [
      'label="Taxa de entrega (R$)"',
      'label="Entrega: mínimo (min)"',
      'label="Entrega: máximo (min)"',
    ]) {
      const depois = tela.slice(tela.indexOf(trecho), tela.indexOf(trecho) + 320);
      expect(depois, trecho).toContain("disabled={entregaTrancada}");
    }
  });

  /*
   * E o interruptor não pode aparecer LIGADO numa loja que não entrega: o
   * valor gravado pode ser `true`, herdado de quando ela era Premium.
   */
  it("o interruptor aparece desligado quando o plano não permite", () => {
    expect(tela).toContain("checked={draft.acceptsDelivery && !entregaTrancada}");
  });
});
