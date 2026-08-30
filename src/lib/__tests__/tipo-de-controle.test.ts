import { describe, it, expect } from "vitest";
import {
  motivoDeConfiguracaoInvalida,
  tipoDeControleExigido,
  precisaEscolherTipo,
  MOTIVOS,
  type ConfiguracaoDeEstoque,
} from "@/lib/regra-de-estoque";

/*
 * A REGRA DO TIPO DE CONTROLE, sem banco nenhum.
 *
 * Estes testes provam a DECISÃO. Que a decisão seja de fato consultada em todos
 * os caminhos — salvar produto, ativar produto, criar receita, ativar versão,
 * apagar receita — é outra prova, e mora em
 * `src/server/inventory/__tests__/configuracao-de-estoque.test.ts`. Uma regra
 * certa que ninguém chama não protege nada.
 */

const NADA: ConfiguracaoDeEstoque = {
  temFichaComIngrediente: false,
  inventoryItemId: null,
  itemVinculadoTipo: null,
};
const cfg = (p: Partial<ConfiguracaoDeEstoque>): ConfiguracaoDeEstoque => ({
  ...NADA,
  ...p,
});

const COM_FICHA = cfg({ temFichaComIngrediente: true });
const COM_REVENDA = cfg({ inventoryItemId: "i1", itemVinculadoTipo: "RESALE" });
const COM_PREPARADO = cfg({ inventoryItemId: "i1", itemVinculadoTipo: "PREPARED" });

describe("NAO_CONTROLA", () => {
  it("aceita produto sem estoque e sem receita", () => {
    expect(motivoDeConfiguracaoInvalida("NAO_CONTROLA", NADA)).toBeNull();
  });

  /*
   * A recusa é deliberada, e a alternativa era pior: aceitar em silêncio um
   * produto marcado "não controlar" que ainda carrega ficha ou vínculo deixaria
   * no banco dois dados que se contradizem, e a próxima pessoa a ler não teria
   * como saber qual vale.
   */
  it("recusa quando ainda existe receita", () => {
    expect(motivoDeConfiguracaoInvalida("NAO_CONTROLA", COM_FICHA)).toBe(
      "NAO_CONTROLA_COM_ORIGEM",
    );
  });

  it("recusa quando ainda existe item vinculado", () => {
    expect(motivoDeConfiguracaoInvalida("NAO_CONTROLA", COM_REVENDA)).toBe(
      "NAO_CONTROLA_COM_ORIGEM",
    );
  });

  /*
   * A EMBALAGEM NÃO ENTRA NESTA CONTA, e é o que o João pediu explicitamente:
   * não controlar é não descer o PRODUTO. A sacola sai da prateleira do mesmo
   * jeito, e ela mora em `ProductPackaging` — fora dos dois campos que esta
   * regra examina. Este teste existe para que ninguém "conserte" a regra
   * incluindo embalagem aqui.
   */
  it("não conhece embalagem: ela não é campo desta regra", () => {
    expect(Object.keys(NADA).sort()).toEqual([
      "inventoryItemId",
      "itemVinculadoTipo",
      "temFichaComIngrediente",
    ]);
  });
});

describe("REVENDA", () => {
  it("exige item de estoque", () => {
    expect(motivoDeConfiguracaoInvalida("REVENDA", NADA)).toBe(
      "REVENDA_SEM_ITEM",
    );
  });

  it("aceita item de revenda", () => {
    expect(motivoDeConfiguracaoInvalida("REVENDA", COM_REVENDA)).toBeNull();
  });

  /*
   * Vender farinha a quilo é legítimo, ainda que raro. O código já defendia
   * isso antes desta fase ("NÃO FILTRA POR TIPO", em
   * `adminListarItensParaVinculo`), e restringir agora tiraria do lojista uma
   * decisão que é dele.
   */
  it("aceita ingrediente: vender farinha a quilo é legítimo", () => {
    expect(
      motivoDeConfiguracaoInvalida(
        "REVENDA",
        cfg({ inventoryItemId: "i1", itemVinculadoTipo: "INGREDIENT" }),
      ),
    ).toBeNull();
  });

  it("recusa embalagem como item vendido", () => {
    expect(
      motivoDeConfiguracaoInvalida(
        "REVENDA",
        cfg({ inventoryItemId: "i1", itemVinculadoTipo: "PACKAGING" }),
      ),
    ).toBe("REVENDA_ITEM_INCOMPATIVEL");
  });

  /*
   * Preparado não é revenda mesmo tendo a mesma mecânica de baixa (uma unidade
   * por venda). Um bolo produzido em lote não foi "comprado pronto", e deixá-lo
   * passar aqui tiraria o sentido da própria pergunta que a tela faz ao dono.
   */
  it("recusa preparado: ele é a segunda forma de PRODUÇÃO", () => {
    expect(motivoDeConfiguracaoInvalida("REVENDA", COM_PREPARADO)).toBe(
      "REVENDA_ITEM_INCOMPATIVEL",
    );
  });

  /*
   * O caso da Coca-Cola. A ficha vence primeiro na ordem das checagens porque
   * é o erro mais grave: ela QUEBRA a baixa, não só polui o cadastro.
   */
  it("recusa receita, mesmo com o item certo escolhido", () => {
    expect(
      motivoDeConfiguracaoInvalida(
        "REVENDA",
        cfg({
          temFichaComIngrediente: true,
          inventoryItemId: "i1",
          itemVinculadoTipo: "RESALE",
        }),
      ),
    ).toBe("REVENDA_COM_FICHA");
  });

  /*
   * Item que a loja da sessão não tem. A guarda traduz "não é meu" para
   * `itemVinculadoTipo: null` antes de chegar aqui — é assim que a tentativa
   * cross-tenant morre sem que esta função precise saber o que é uma loja.
   */
  it("recusa item de outra loja, que chega como tipo nulo", () => {
    expect(
      motivoDeConfiguracaoInvalida(
        "REVENDA",
        cfg({ inventoryItemId: "de_outra_loja", itemVinculadoTipo: null }),
      ),
    ).toBe("REVENDA_ITEM_INCOMPATIVEL");
  });
});

describe("PRODUCAO", () => {
  it("aceita receita própria", () => {
    expect(motivoDeConfiguracaoInvalida("PRODUCAO", COM_FICHA)).toBeNull();
  });

  it("aceita preparado vinculado", () => {
    expect(motivoDeConfiguracaoInvalida("PRODUCAO", COM_PREPARADO)).toBeNull();
  });

  it("recusa sem nenhuma das duas origens", () => {
    expect(motivoDeConfiguracaoInvalida("PRODUCAO", NADA)).toBe(
      "PRODUCAO_SEM_ORIGEM",
    );
  });

  /*
   * O erro que custaria caro em silêncio: com as duas origens, os ingredientes
   * desceriam DUAS vezes — uma na corrida que fez o lote, outra na venda. O
   * estoque de insumo iria a zero sozinho e ninguém saberia por quê.
   */
  it("recusa as duas origens juntas", () => {
    expect(
      motivoDeConfiguracaoInvalida(
        "PRODUCAO",
        cfg({
          temFichaComIngrediente: true,
          inventoryItemId: "i1",
          itemVinculadoTipo: "PREPARED",
        }),
      ),
    ).toBe("PRODUCAO_COM_DUAS_ORIGENS");
  });

  it("recusa vincular item que não é preparado", () => {
    expect(motivoDeConfiguracaoInvalida("PRODUCAO", COM_REVENDA)).toBe(
      "PRODUCAO_ITEM_NAO_E_PREPARADO",
    );
  });

  it("recusa preparado de outra loja, que chega como tipo nulo", () => {
    expect(
      motivoDeConfiguracaoInvalida(
        "PRODUCAO",
        cfg({ inventoryItemId: "de_outra_loja", itemVinculadoTipo: null }),
      ),
    ).toBe("PRODUCAO_ITEM_NAO_E_PREPARADO");
  });
});

describe("tipo nulo — o produto legado", () => {
  /*
   * O teste mais importante deste arquivo. Nulo NÃO é uma configuração
   * inválida: é a ausência de escolha, e a ausência de escolha cai na regra
   * antiga, intacta. Se esta função passasse a recusar nulo, toda loja com
   * produtos anteriores a esta fase pararia de conseguir salvá-los.
   */
  it("nunca é recusado, em nenhuma combinação", () => {
    for (const c of [NADA, COM_FICHA, COM_REVENDA, COM_PREPARADO]) {
      expect(motivoDeConfiguracaoInvalida(null, c)).toBeNull();
    }
  });

  it("aparece como pendente de escolha, com o controle ligado", () => {
    const mercadoria = { isActive: true, controlaEstoque: true };
    expect(precisaEscolherTipo(true, mercadoria, null)).toBe(true);
    expect(precisaEscolherTipo(true, mercadoria, "REVENDA")).toBe(false);
  });

  /*
   * `NAO_CONTROLA` é uma resposta, não uma pendência. Confundir os dois faria
   * o selo "Configuração pendente" nunca sair da tela de quem já respondeu.
   */
  it("NAO_CONTROLA não é pendência: é uma escolha feita", () => {
    expect(
      precisaEscolherTipo(true, { isActive: true, controlaEstoque: true }, "NAO_CONTROLA"),
    ).toBe(false);
  });
});

describe("quando a regra alcança o produto", () => {
  const mercadoria = { isActive: true, controlaEstoque: true };

  it("controle desligado não cobra nada de ninguém", () => {
    expect(tipoDeControleExigido(false, mercadoria)).toBe(false);
    expect(precisaEscolherTipo(false, mercadoria, null)).toBe(false);
  });

  it("produto inativo não é vendido, então não fura estoque", () => {
    expect(
      tipoDeControleExigido(true, { isActive: false, controlaEstoque: true }),
    ).toBe(false);
  });

  /*
   * `controlaEstoque` não morreu com esta fase: é a exceção que o dono já
   * marcou em taxa de entrega, couvert e serviço. Ignorá-la aqui ressuscitaria
   * a cobrança exatamente onde ele a tinha desligado.
   */
  it("a exceção antiga continua valendo: taxa de entrega, couvert", () => {
    expect(
      tipoDeControleExigido(true, { isActive: true, controlaEstoque: false }),
    ).toBe(false);
  });
});

describe("as mensagens", () => {
  /*
   * A recusa vem do servidor e precisa explicar-se sozinha até numa chamada
   * direta à server function, onde não há tela para traduzir um código.
   */
  it("todo motivo tem texto, e o texto diz a saída", () => {
    const motivos = [
      "REVENDA_SEM_ITEM",
      "REVENDA_COM_FICHA",
      "REVENDA_ITEM_INCOMPATIVEL",
      "PRODUCAO_SEM_ORIGEM",
      "PRODUCAO_COM_DUAS_ORIGENS",
      "PRODUCAO_ITEM_NAO_E_PREPARADO",
      "NAO_CONTROLA_COM_ORIGEM",
    ] as const;
    for (const m of motivos) {
      expect(MOTIVOS[m]).toBeTruthy();
      expect(MOTIVOS[m].length).toBeGreaterThan(40);
    }
  });
});
