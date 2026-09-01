import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * O QUE A PESSOA VÊ DEPOIS DE FAZER O PEDIDO.
 *
 * O botão principal era "Acompanhar pelo WhatsApp", e o acompanhamento de
 * verdade vinha como um link pequeno dentro de uma moldura. Os dois disputavam
 * a mesma tela, e o que ganhava destaque era o que NÃO responde à pergunta:
 * quem acabou de pedir quer saber em que etapa o pedido está, e a conversa só
 * dá essa resposta se alguém da loja responder.
 *
 * O projeto não tem jsdom, então isto lê a fonte. O que se prova é a troca —
 * e, principalmente, que ela não deixou restos.
 */

const tela = readFileSync(resolve(__dirname, "../CheckoutForm.tsx"), "utf8");

const semComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("a confirmação do pedido", () => {
  it("o botão principal leva ao andamento", () => {
    expect(tela).toContain('to="/$storeSlug/acompanhar/$token"');
    expect(tela).toContain("Ver o andamento");
    expect(tela).toContain(
      "params={{ storeSlug: storeInfo.slug, token: placed.trackingToken }}",
    );
  });

  /*
   * O WhatsApp saiu INTEIRO deste modal — botão, link montado e ícone. Um
   * import órfão ou um `href` calculado e nunca usado seria o rastro de uma
   * remoção pela metade.
   */
  it("não sobrou nada do WhatsApp na confirmação", () => {
    const codigo = semComentarios(tela);
    expect(codigo).not.toContain("Acompanhar pelo WhatsApp");
    expect(codigo).not.toContain("WhatsAppIcon");
    expect(codigo).not.toContain("whatsappHref");
  });

  /*
   * A moldura ficou como EXPLICAÇÃO e o botão virou a AÇÃO. Antes as duas
   * levavam ao mesmo lugar, em dois tamanhos — o link pequeno era ruído.
   */
  it("o aviso de guardar o link continua, sem repetir o destino", () => {
    expect(tela).toContain("Acompanhe seu pedido");
    expect(tela).toContain("Guarde este link");
    // Um destino só para o acompanhamento.
    const destinos = semComentarios(tela).match(/acompanhar\/\$token/g) ?? [];
    expect(destinos).toHaveLength(1);
  });

  /*
   * SEM TOKEN NÃO HÁ BOTÃO. `trackingToken` é gerado em toda criação de
   * pedido, mas o tipo admite nulo por causa de linhas antigas — e um botão
   * apontando para um token vazio levaria a uma página de erro.
   */
  it("o botão depende do token existir", () => {
    expect(tela).toContain("{placed.trackingToken && (");
  });

  /*
   * A vitrine é branca-label: a cor primária vem da loja. Um `text-white`
   * fixo some em cima de uma cor clara, e é por isso que os outros botões
   * primários dela usam a variável.
   */
  it("o botão usa a cor da loja, não um branco fixo", () => {
    const botao = tela.slice(tela.indexOf('to="/$storeSlug/acompanhar/$token"'));
    expect(botao).toContain("bg-tomato");
    expect(botao).toContain("text-[color:var(--on-primary)]");
  });
});
