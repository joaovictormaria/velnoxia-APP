import { describe, it, expect } from "vitest";
import {
  produtoTemVinculoDeEstoque,
  produtoExigeVinculo,
  produtoEstaIrregular,
} from "@/lib/regra-de-estoque";

/*
 * A regra sem banco nenhum.
 *
 * Estes testes provam a DECISÃO. Que a decisão seja de fato consultada em
 * todos os caminhos de criação e edição é outra prova, e mora em
 * `src/server/inventory/__tests__/guarda-de-receita.test.ts` — uma regra certa
 * que ninguém chama não protege nada.
 */

const MERCADORIA = { isActive: true, controlaEstoque: true };
const SEM_VINCULO = { temFichaComIngrediente: false, inventoryItemId: null };
const COM_FICHA = { temFichaComIngrediente: true, inventoryItemId: null };
const COM_ITEM = { temFichaComIngrediente: false, inventoryItemId: "item_1" };

describe("produtoTemVinculoDeEstoque", () => {
  it("aceita ficha técnica com ingrediente", () => {
    expect(produtoTemVinculoDeEstoque(COM_FICHA)).toBe(true);
  });

  it("aceita vínculo direto com item de estoque", () => {
    // A lata de refrigerante. Nunca terá receita, e não deve precisar de uma.
    expect(produtoTemVinculoDeEstoque(COM_ITEM)).toBe(true);
  });

  it("aceita os dois ao mesmo tempo", () => {
    expect(
      produtoTemVinculoDeEstoque({
        temFichaComIngrediente: true,
        inventoryItemId: "item_1",
      }),
    ).toBe(true);
  });

  it("recusa quando não há nem ficha nem vínculo", () => {
    expect(produtoTemVinculoDeEstoque(SEM_VINCULO)).toBe(false);
  });

  /*
   * D3, e o caso que mais engana. Uma ficha existe no banco, a tela mostra
   * "tem receita", e o motor de estoque não desce nada porque ela não tem
   * linha nenhuma — cai no vínculo direto, que também não existe.
   */
  it("ficha ATIVA porém VAZIA não satisfaz", () => {
    expect(
      produtoTemVinculoDeEstoque({
        temFichaComIngrediente: false,
        inventoryItemId: null,
      }),
    ).toBe(false);
  });
});

describe("produtoExigeVinculo", () => {
  it("com o controle desligado, não exige nada de ninguém", () => {
    expect(produtoExigeVinculo(false, MERCADORIA)).toBe(false);
  });

  it("com o controle ligado, exige de produto ativo que participa", () => {
    expect(produtoExigeVinculo(true, MERCADORIA)).toBe(true);
  });

  it("não exige de produto inativo", () => {
    // Não é vendido, então não fura estoque. A cobrança volta ao reativar.
    expect(
      produtoExigeVinculo(true, { isActive: false, controlaEstoque: true }),
    ).toBe(false);
  });

  it("não exige de produto marcado como fora do controle", () => {
    // Taxa de entrega, couvert, serviço: linha do cardápio, não mercadoria.
    expect(
      produtoExigeVinculo(true, { isActive: true, controlaEstoque: false }),
    ).toBe(false);
  });
});

describe("produtoEstaIrregular", () => {
  it("estoque desligado preserva o comportamento de hoje", () => {
    // A garantia de que nenhuma loja que não pediu estoque sente diferença.
    expect(produtoEstaIrregular(false, MERCADORIA, SEM_VINCULO)).toBe(false);
  });

  it("estoque ligado e produto sem nenhuma origem: irregular", () => {
    expect(produtoEstaIrregular(true, MERCADORIA, SEM_VINCULO)).toBe(true);
  });

  it("estoque ligado e produto com ficha: regular", () => {
    expect(produtoEstaIrregular(true, MERCADORIA, COM_FICHA)).toBe(false);
  });

  it("estoque ligado e produto com item vinculado: regular", () => {
    expect(produtoEstaIrregular(true, MERCADORIA, COM_ITEM)).toBe(false);
  });

  it("estoque ligado, produto fora do controle e sem origem: regular", () => {
    expect(
      produtoEstaIrregular(
        true,
        { isActive: true, controlaEstoque: false },
        SEM_VINCULO,
      ),
    ).toBe(false);
  });

  it("estoque ligado, produto inativo e sem origem: regular", () => {
    expect(
      produtoEstaIrregular(
        true,
        { isActive: false, controlaEstoque: true },
        SEM_VINCULO,
      ),
    ).toBe(false);
  });
});
