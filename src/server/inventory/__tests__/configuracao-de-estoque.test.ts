import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import {
  exigirConfiguracaoDeEstoque,
  avaliarCriacaoDeProduto,
  recusaFichaTecnica,
  produtosSemTipoDeControle,
  ErroDeConfiguracaoDeEstoque,
  ErroDeVinculoDeEstoque,
} from "@/server/inventory/guarda-de-receita";
import { CompositionService } from "@/server/services/composition-service";

/*
 * A GUARDA, COM BANCO.
 *
 * A regra pura vive em `src/lib/__tests__/tipo-de-controle.test.ts`. Aqui se
 * prova o que aquele arquivo não alcança: que a regra é de fato CONSULTADA, que
 * os fatos que ela recebe vêm do banco recortados pela loja da sessão, e que
 * uma tentativa de usar dado de outra loja morre.
 *
 * TODO `storeId` DESTES TESTES É O DA "SESSÃO". A loja vizinha existe só para
 * ser recusada — é o cenário cross-tenant montado de propósito.
 */

let storeId = "";
let outraLoja = "";
let categoriaId = "";
let unitId = "";

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  await limparBanco();
  const un = await prisma.inventoryUnit.create({
    data: { code: "un", name: "Unidade", system: "COUNT", isBuiltIn: true },
  });
  unitId = un.id;

  const loja = await prisma.store.create({
    data: {
      slug: `cfg-${Date.now()}`,
      name: "Minha loja",
      // O controle LIGADO é o pressuposto de quase todo teste daqui: com ele
      // desligado a guarda devolve cedo e não há o que provar.
      settings: { create: { storeName: "Minha loja", whatsappNumber: "11999999999", inventoryControlEnabled: true } },
    },
  });
  storeId = loja.id;

  outraLoja = (
    await prisma.store.create({
      data: {
        slug: `viz-${Date.now()}`,
        name: "Loja vizinha",
        settings: { create: { storeName: "Vizinha", whatsappNumber: "11988888888", inventoryControlEnabled: true } },
      },
    })
  ).id;

  categoriaId = (
    await prisma.category.create({
      data: { storeId, name: "Geral", slug: "geral", icon: "🍽", kind: "SIMPLE" },
    })
  ).id;
});
afterAll(limparBanco);

async function item(name: string, itemType: string, loja = storeId) {
  return prisma.inventoryItem.create({
    data: { storeId: loja, name, itemType, baseUnitId: unitId },
  });
}

async function produto(dados: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoriaId,
      name: "Produto",
      slug: `p-${Math.random().toString(36).slice(2)}`,
      description: "",
      basePrice: 10,
      isActive: true,
      ...dados,
    },
  });
}

async function ficha(productId: string, inventoryItemId: string) {
  return prisma.productComposition.create({
    data: {
      storeId,
      productId,
      version: 1,
      isActive: true,
      items: { create: [{ inventoryItemId, quantity: 1, unitId, sortOrder: 0 }] },
    },
  });
}

/** O motivo da recusa, ou `null` se a guarda deixou passar. */
async function recusa(
  productId: string,
  proposta: Parameters<typeof exigirConfiguracaoDeEstoque>[2] = {},
): Promise<string | null> {
  try {
    await exigirConfiguracaoDeEstoque(storeId, productId, proposta);
    return null;
  } catch (e) {
    if (e instanceof ErroDeConfiguracaoDeEstoque) return e.motivo;
    if (e instanceof ErroDeVinculoDeEstoque) return e.codigo;
    throw e;
  }
}

describe("REVENDA", () => {
  it("passa com item de revenda da própria loja", async () => {
    const coca = await item("Coca lata", "RESALE");
    const p = await produto({ tipoDeControle: "REVENDA", inventoryItemId: coca.id });
    expect(await recusa(p.id)).toBeNull();
  });

  it("recusa sem item de estoque", async () => {
    const p = await produto({ tipoDeControle: "REVENDA" });
    expect(await recusa(p.id)).toBe("REVENDA_SEM_ITEM");
  });

  it("recusa embalagem como item vendido", async () => {
    const caixa = await item("Caixa", "PACKAGING");
    const p = await produto({ tipoDeControle: "REVENDA", inventoryItemId: caixa.id });
    expect(await recusa(p.id)).toBe("REVENDA_ITEM_INCOMPATIVEL");
  });

  it("recusa preparado: ele é a segunda forma de PRODUÇÃO", async () => {
    const bolo = await item("Bolo", "PREPARED");
    const p = await produto({ tipoDeControle: "REVENDA", inventoryItemId: bolo.id });
    expect(await recusa(p.id)).toBe("REVENDA_ITEM_INCOMPATIVEL");
  });

  it("recusa quando existe ficha ativa com ingrediente", async () => {
    const coca = await item("Coca lata", "RESALE");
    const acucar = await item("Açúcar", "INGREDIENT");
    const p = await produto({ tipoDeControle: "REVENDA", inventoryItemId: coca.id });
    await ficha(p.id, acucar.id);
    expect(await recusa(p.id)).toBe("REVENDA_COM_FICHA");
  });

  /*
   * A GUARDA JULGA O RESULTADO, NÃO O PRESENTE. Sem a proposta, ela leria o
   * vínculo que ainda está no banco e aprovaria a alteração que o remove.
   */
  it("recusa a proposta de desvincular, antes de ela acontecer", async () => {
    const coca = await item("Coca lata", "RESALE");
    const p = await produto({ tipoDeControle: "REVENDA", inventoryItemId: coca.id });
    expect(await recusa(p.id, { inventoryItemId: null })).toBe("REVENDA_SEM_ITEM");
  });
});

describe("PRODUCAO", () => {
  it("passa com ficha ativa com ingrediente", async () => {
    const farinha = await item("Farinha", "INGREDIENT");
    const p = await produto({ tipoDeControle: "PRODUCAO" });
    await ficha(p.id, farinha.id);
    expect(await recusa(p.id)).toBeNull();
  });

  it("passa com preparado vinculado", async () => {
    const bolo = await item("Bolo", "PREPARED");
    const p = await produto({ tipoDeControle: "PRODUCAO", inventoryItemId: bolo.id });
    expect(await recusa(p.id)).toBeNull();
  });

  it("recusa sem receita e sem preparado", async () => {
    const p = await produto({ tipoDeControle: "PRODUCAO" });
    expect(await recusa(p.id)).toBe("PRODUCAO_SEM_ORIGEM");
  });

  it("recusa as duas origens juntas", async () => {
    const farinha = await item("Farinha", "INGREDIENT");
    const bolo = await item("Bolo", "PREPARED");
    const p = await produto({ tipoDeControle: "PRODUCAO", inventoryItemId: bolo.id });
    await ficha(p.id, farinha.id);
    expect(await recusa(p.id)).toBe("PRODUCAO_COM_DUAS_ORIGENS");
  });

  it("recusa vincular item que não é preparado", async () => {
    const coca = await item("Coca lata", "RESALE");
    const p = await produto({ tipoDeControle: "PRODUCAO", inventoryItemId: coca.id });
    expect(await recusa(p.id)).toBe("PRODUCAO_ITEM_NAO_E_PREPARADO");
  });

  /*
   * Uma ficha VAZIA não consome nada, e o motor cai dela para o vínculo. Contá-
   * la como origem válida aprovaria justamente o produto que não desce saldo.
   */
  it("ficha ativa porém VAZIA não conta como origem", async () => {
    const p = await produto({ tipoDeControle: "PRODUCAO" });
    await prisma.productComposition.create({
      data: { storeId, productId: p.id, version: 1, isActive: true },
    });
    expect(await recusa(p.id)).toBe("PRODUCAO_SEM_ORIGEM");
  });

  /*
   * Apagar a última receita é o desvio mais direto de todos: monta-se a ficha
   * para conseguir salvar, apaga-se em seguida, e o produto continua ativo sem
   * origem. `ignorarComposicaoId` torna isso verificável ANTES de acontecer.
   */
  it("recusa apagar a última receita", async () => {
    const farinha = await item("Farinha", "INGREDIENT");
    const p = await produto({ tipoDeControle: "PRODUCAO" });
    const f = await ficha(p.id, farinha.id);
    expect(await recusa(p.id, { ignorarComposicaoId: f.id })).toBe(
      "PRODUCAO_SEM_ORIGEM",
    );
  });

  /*
   * Ativar uma versão desativa todas as outras do mesmo dono na mesma
   * transação. Nenhum filtro sobre o estado ATUAL descreve esse resultado — por
   * isso o chamador informa o desfecho.
   */
  it("recusa publicar uma versão vazia por cima da que funcionava", async () => {
    const farinha = await item("Farinha", "INGREDIENT");
    const p = await produto({ tipoDeControle: "PRODUCAO" });
    await ficha(p.id, farinha.id);
    expect(await recusa(p.id, { temFichaComIngrediente: false })).toBe(
      "PRODUCAO_SEM_ORIGEM",
    );
  });
});

describe("NAO_CONTROLA", () => {
  it("passa sem estoque e sem receita", async () => {
    const p = await produto({ tipoDeControle: "NAO_CONTROLA" });
    expect(await recusa(p.id)).toBeNull();
  });

  it("recusa enquanto sobrar vínculo ou receita", async () => {
    const coca = await item("Coca lata", "RESALE");
    const p = await produto({
      tipoDeControle: "NAO_CONTROLA",
      inventoryItemId: coca.id,
    });
    expect(await recusa(p.id)).toBe("NAO_CONTROLA_COM_ORIGEM");
  });

  it("passa quando a proposta limpa o vínculo na mesma escrita", async () => {
    const coca = await item("Coca lata", "RESALE");
    const p = await produto({
      tipoDeControle: "NAO_CONTROLA",
      inventoryItemId: coca.id,
    });
    expect(await recusa(p.id, { inventoryItemId: null })).toBeNull();
  });
});

describe("segurança multi-tenant", () => {
  /*
   * O ponto exato onde a tentativa cross-tenant morre: `tipoDoItemDaLoja`
   * consulta com o `storeId` da sessão, não acha o item alheio, devolve nulo — e
   * nulo não satisfaz REVENDA nem PRODUÇÃO. A guarda nem precisa saber que
   * existe outra loja.
   */
  it("item de OUTRA loja não satisfaz REVENDA", async () => {
    const alheio = await item("Coca da vizinha", "RESALE", outraLoja);
    const p = await produto({ tipoDeControle: "REVENDA", inventoryItemId: alheio.id });
    expect(await recusa(p.id)).toBe("REVENDA_ITEM_INCOMPATIVEL");
  });

  it("preparado de OUTRA loja não satisfaz PRODUÇÃO", async () => {
    const alheio = await item("Bolo da vizinha", "PREPARED", outraLoja);
    const p = await produto({ tipoDeControle: "PRODUCAO", inventoryItemId: alheio.id });
    expect(await recusa(p.id)).toBe("PRODUCAO_ITEM_NAO_E_PREPARADO");
  });

  it("item de outra loja é recusado mesmo vindo pela proposta", async () => {
    const alheio = await item("Coca da vizinha", "RESALE", outraLoja);
    const p = await produto({ tipoDeControle: "REVENDA" });
    expect(await recusa(p.id, { inventoryItemId: alheio.id })).toBe(
      "REVENDA_ITEM_INCOMPATIVEL",
    );
  });

  /*
   * Produto de outra loja é SILÊNCIO, não recusa: quem trata "não é seu" é o
   * chamador, com a mensagem dele. A guarda não é o lugar de decidir posse — e
   * recusar aqui vazaria a informação de que o id existe em algum lugar.
   */
  it("produto de outra loja não é julgado por esta guarda", async () => {
    const alheio = await prisma.product.create({
      data: {
        storeId: outraLoja,
        categoryId: (
          await prisma.category.create({
            data: {
              storeId: outraLoja,
              name: "G",
              slug: "g",
              icon: "🍽",
              kind: "SIMPLE",
            },
          })
        ).id,
        name: "Alheio",
        slug: "alheio",
        description: "",
        basePrice: 1,
        tipoDeControle: "REVENDA",
      },
    });
    expect(await recusa(alheio.id)).toBeNull();
  });

  /*
   * O tipo do item é lido do BANCO, nunca aceito do payload. Este teste fixa
   * isso: a proposta manda o id, e só o id — não há campo por onde alguém
   * afirme "confie, este item é RESALE".
   */
  it("o tipo do item nunca vem do payload", async () => {
    const caixa = await item("Caixa", "PACKAGING");
    const p = await produto({ tipoDeControle: "REVENDA" });
    expect(
      await recusa(p.id, { inventoryItemId: caixa.id, itemVinculadoTipo: "RESALE" } as any),
    ).toBe("REVENDA_ITEM_INCOMPATIVEL");
  });
});

describe("quando a guarda não cobra", () => {
  it("controle desligado não cobra nada", async () => {
    await prisma.storeSettings.update({
      where: { storeId },
      data: { inventoryControlEnabled: false },
    });
    const p = await produto({ tipoDeControle: "REVENDA" });
    expect(await recusa(p.id)).toBeNull();
  });

  it("desativar o produto nunca é recusado", async () => {
    const p = await produto({ tipoDeControle: "PRODUCAO" });
    expect(await recusa(p.id, { isActive: false })).toBeNull();
  });

  it("a exceção antiga continua valendo: taxa de entrega", async () => {
    const p = await produto({ tipoDeControle: "PRODUCAO", controlaEstoque: false });
    expect(await recusa(p.id)).toBeNull();
  });

  it("produto na lixeira não trava nada", async () => {
    const p = await produto({ tipoDeControle: "PRODUCAO", deletedAt: new Date() });
    expect(await recusa(p.id)).toBeNull();
  });
});

describe("compatibilidade: tipo nulo cai na regra legada", () => {
  /*
   * O teste que protege toda loja em produção. Nenhum produto foi classificado
   * automaticamente, então todos têm tipo nulo — e a regra antiga tem de
   * continuar valendo, inclusive na recusa que ela já fazia.
   */
  it("sem ficha e sem vínculo continua sendo recusado, como antes", async () => {
    const p = await produto();
    expect(await recusa(p.id)).toBe("SEM_VINCULO_DE_ESTOQUE");
  });

  it("com vínculo passa, mesmo sendo embalagem — como antes", async () => {
    // A regra antiga não olhava tipo de item. Endurecer isso aqui mudaria o
    // comportamento de quem não pediu nada.
    const caixa = await item("Caixa", "PACKAGING");
    const p = await produto({ inventoryItemId: caixa.id });
    expect(await recusa(p.id)).toBeNull();
  });

  it("com ficha passa, como antes", async () => {
    const farinha = await item("Farinha", "INGREDIENT");
    const p = await produto();
    await ficha(p.id, farinha.id);
    expect(await recusa(p.id)).toBeNull();
  });
});

describe("criação de produto", () => {
  it("REVENDA com item válido nasce ATIVO", async () => {
    const coca = await item("Coca lata", "RESALE");
    const r = await avaliarCriacaoDeProduto(storeId, {
      isActive: true,
      controlaEstoque: true,
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });
    expect(r.nasceInativo).toBe(false);
  });

  it("REVENDA sem item é RECUSADA: o dono conserta na mesma tela", async () => {
    await expect(
      avaliarCriacaoDeProduto(storeId, {
        isActive: true,
        controlaEstoque: true,
        tipoDeControle: "REVENDA",
      }),
    ).rejects.toThrow(ErroDeConfiguracaoDeEstoque);
  });

  it("REVENDA com item de outra loja é RECUSADA", async () => {
    const alheio = await item("Coca da vizinha", "RESALE", outraLoja);
    await expect(
      avaliarCriacaoDeProduto(storeId, {
        isActive: true,
        controlaEstoque: true,
        tipoDeControle: "REVENDA",
        inventoryItemId: alheio.id,
      }),
    ).rejects.toThrow(ErroDeConfiguracaoDeEstoque);
  });

  /*
   * O ÚNICO MOTIVO QUE VIRA "NASCE INATIVO", e por uma razão física: a ficha é
   * FK para o produto, então não pode precedê-lo. Recusar aqui fecharia o
   * cadastro inteiro. Os outros motivos são satisfazíveis na mesma tela, e
   * gravar inativo esconderia um erro que o dono conserta em dois cliques.
   */
  it("PRODUÇÃO sem origem nasce INATIVO, não é recusada", async () => {
    const r = await avaliarCriacaoDeProduto(storeId, {
      isActive: true,
      controlaEstoque: true,
      tipoDeControle: "PRODUCAO",
    });
    expect(r.nasceInativo).toBe(true);
  });

  it("PRODUÇÃO com preparado vinculado nasce ATIVO", async () => {
    const bolo = await item("Bolo", "PREPARED");
    const r = await avaliarCriacaoDeProduto(storeId, {
      isActive: true,
      controlaEstoque: true,
      tipoDeControle: "PRODUCAO",
      inventoryItemId: bolo.id,
    });
    expect(r.nasceInativo).toBe(false);
  });

  it("NÃO CONTROLAR nasce ATIVO, sem exigir nada", async () => {
    const r = await avaliarCriacaoDeProduto(storeId, {
      isActive: true,
      controlaEstoque: true,
      tipoDeControle: "NAO_CONTROLA",
    });
    expect(r.nasceInativo).toBe(false);
  });

  /*
   * ESTE TESTE MUDOU DE LADO, e a inversão é a regra nova.
   *
   * Ele afirmava que o controle desligado nunca fazia nascer inativo — nem em
   * PRODUÇÃO. Isso amarrava a exigência de receita a uma configuração de
   * ESTOQUE, e a receita de um produto de produção não existe para o estoque:
   * existe para o CUSTO. Sem ela não há CMV, não há lucro e não há margem, com
   * a flag ligada ou não. Decisão do João, 30/08/2026.
   */
  it("PRODUÇÃO nasce inativa mesmo com o controle DESLIGADO", async () => {
    await prisma.storeSettings.update({
      where: { storeId },
      data: { inventoryControlEnabled: false },
    });
    const r = await avaliarCriacaoDeProduto(storeId, {
      isActive: true,
      controlaEstoque: true,
      tipoDeControle: "PRODUCAO",
    });
    expect(r.nasceInativo).toBe(true);
  });

  /*
   * O OUTRO LADO DA MESMA MOEDA: só PRODUÇÃO escapou da flag. Preservar
   * integralmente o comportamento de REVENDA foi condição explícita, e estes
   * dois testes são o que impede alguém de "uniformizar" isso depois sem
   * perceber que está mudando uma regra que foi decidida.
   */
  it("REVENDA sem item continua LIVRE com o controle desligado", async () => {
    await prisma.storeSettings.update({
      where: { storeId },
      data: { inventoryControlEnabled: false },
    });
    const r = await avaliarCriacaoDeProduto(storeId, {
      isActive: true,
      controlaEstoque: true,
      tipoDeControle: "REVENDA",
    });
    expect(r.nasceInativo).toBe(false);
  });

  it("NAO_CONTROLA continua livre com o controle desligado", async () => {
    await prisma.storeSettings.update({
      where: { storeId },
      data: { inventoryControlEnabled: false },
    });
    const r = await avaliarCriacaoDeProduto(storeId, {
      isActive: true,
      controlaEstoque: false,
      tipoDeControle: "NAO_CONTROLA",
    });
    expect(r.nasceInativo).toBe(false);
  });

  it("produto LEGADO (tipo nulo) continua livre com o controle desligado", async () => {
    await prisma.storeSettings.update({
      where: { storeId },
      data: { inventoryControlEnabled: false },
    });
    const r = await avaliarCriacaoDeProduto(storeId, {
      isActive: true,
      controlaEstoque: true,
      tipoDeControle: null,
    });
    expect(r.nasceInativo).toBe(false);
  });
});

describe("a receita da PRODUÇÃO não depende do controle de estoque", () => {
  /*
   * O bloco que fixa o desacoplamento no caminho de EDIÇÃO/ATIVAÇÃO — o outro
   * portão, que é o que decide se um produto pode ficar operacional.
   */
  async function desligarControle() {
    await prisma.storeSettings.update({
      where: { storeId },
      data: { inventoryControlEnabled: false },
    });
  }

  it("PRODUÇÃO sem receita é RECUSADA mesmo com o controle desligado", async () => {
    await desligarControle();
    const p = await produto({ tipoDeControle: "PRODUCAO" });
    expect(await recusa(p.id)).toBe("PRODUCAO_SEM_ORIGEM");
  });

  it("PRODUÇÃO COM receita passa, com o controle desligado", async () => {
    await desligarControle();
    const farinha = await item("Farinha", "INGREDIENT");
    const p = await produto({ tipoDeControle: "PRODUCAO" });
    await ficha(p.id, farinha.id);
    expect(await recusa(p.id)).toBeNull();
  });

  it("PRODUÇÃO com preparado vinculado passa, com o controle desligado", async () => {
    await desligarControle();
    const bolo = await item("Bolo", "PREPARED");
    const p = await produto({ tipoDeControle: "PRODUCAO", inventoryItemId: bolo.id });
    expect(await recusa(p.id)).toBeNull();
  });

  it("REVENDA sem item continua PASSANDO com o controle desligado", async () => {
    await desligarControle();
    const p = await produto({ tipoDeControle: "REVENDA" });
    expect(await recusa(p.id)).toBeNull();
  });

  it("NAO_CONTROLA com vínculo continua passando com o controle desligado", async () => {
    await desligarControle();
    const coca = await item("Coca lata", "RESALE");
    const p = await produto({
      tipoDeControle: "NAO_CONTROLA",
      inventoryItemId: coca.id,
    });
    expect(await recusa(p.id)).toBeNull();
  });

  it("produto LEGADO sem origem continua passando com o controle desligado", async () => {
    await desligarControle();
    const p = await produto();
    expect(await recusa(p.id)).toBeNull();
  });

  /*
   * PRODUÇÃO INATIVA não é cobrada, com a flag ligada ou não: produto que não
   * é vendido não fura custo nenhum. É o que permite editar o preço de um
   * produto que ainda está esperando a receita.
   */
  it("PRODUÇÃO inativa não é cobrada, mesmo sem receita", async () => {
    await desligarControle();
    const p = await produto({ tipoDeControle: "PRODUCAO", isActive: false });
    expect(await recusa(p.id, { isActive: false })).toBeNull();
  });
});

describe("embalagem não é ingrediente", () => {
  /*
   * Eram DOIS caminhos de validação neste serviço — o laço inline de
   * `createComposition`/`updateComposition` e o `validarInsumos` das receitas de
   * preparado. Cobrir só um deixaria a porta aberta pelo outro, e é por isso que
   * há um teste para cada.
   */
  it("recusa PACKAGING na receita de um produto", async () => {
    const caixa = await item("Caixa de pizza", "PACKAGING");
    const p = await produto({ tipoDeControle: "PRODUCAO" });
    await expect(
      CompositionService.createComposition(storeId, p.id, {
        items: [{ inventoryItemId: caixa.id, quantity: 1, unitId }],
      } as any),
    ).rejects.toThrow(/embalagem/i);
  });

  it("recusa PACKAGING na receita de um preparado", async () => {
    const caixa = await item("Caixa de pizza", "PACKAGING");
    const bolo = await item("Bolo", "PREPARED");
    await expect(
      CompositionService.criarReceitaDePreparado(storeId, bolo.id, {
        items: [{ inventoryItemId: caixa.id, quantity: 1, unitId }],
        yieldQuantity: 1,
        yieldUnitId: unitId,
      } as any),
    ).rejects.toThrow(/embalagem/i);
  });

  it("aceita ingrediente normalmente", async () => {
    const farinha = await item("Farinha", "INGREDIENT");
    const p = await produto({ tipoDeControle: "PRODUCAO" });
    const c = await CompositionService.createComposition(storeId, p.id, {
      items: [{ inventoryItemId: farinha.id, quantity: 1, unitId }],
    } as any);
    expect(c).toBeTruthy();
  });
});

describe("produto de revenda recusa ficha técnica", () => {
  it("REVENDA recusa", async () => {
    const coca = await item("Coca lata", "RESALE");
    const p = await produto({ tipoDeControle: "REVENDA", inventoryItemId: coca.id });
    expect(await recusaFichaTecnica(storeId, p.id)).toBe(true);
  });

  it("PRODUÇÃO e NÃO CONTROLAR não recusam", async () => {
    const a = await produto({ tipoDeControle: "PRODUCAO" });
    const b = await produto({ tipoDeControle: "NAO_CONTROLA" });
    expect(await recusaFichaTecnica(storeId, a.id)).toBe(false);
    expect(await recusaFichaTecnica(storeId, b.id)).toBe(false);
  });

  it("produto legado não recusa: ele nunca escolheu nada", async () => {
    const p = await produto();
    expect(await recusaFichaTecnica(storeId, p.id)).toBe(false);
  });

  it("produto de outra loja não é encontrado, então não recusa", async () => {
    const alheio = await prisma.product.create({
      data: {
        storeId: outraLoja,
        categoryId: (
          await prisma.category.create({
            data: {
              storeId: outraLoja,
              name: "G",
              slug: "g2",
              icon: "🍽",
              kind: "SIMPLE",
            },
          })
        ).id,
        name: "Alheio",
        slug: "alheio2",
        description: "",
        basePrice: 1,
        tipoDeControle: "REVENDA",
      },
    });
    expect(await recusaFichaTecnica(storeId, alheio.id)).toBe(false);
  });
});

describe("a lista de pendentes de classificação", () => {
  it("lista só os de tipo nulo, ativos e que participam do estoque", async () => {
    const semTipo = await produto({ name: "Legado" });
    await produto({ name: "Classificado", tipoDeControle: "NAO_CONTROLA" });
    await produto({ name: "Inativo", isActive: false });
    await produto({ name: "Fora do estoque", controlaEstoque: false });
    await produto({ name: "Na lixeira", deletedAt: new Date() });

    const lista = await produtosSemTipoDeControle(storeId);

    expect(lista.map((p) => p.id)).toEqual([semTipo.id]);
  });

  it("não enxerga produto de outra loja", async () => {
    await prisma.product.create({
      data: {
        storeId: outraLoja,
        categoryId: (
          await prisma.category.create({
            data: {
              storeId: outraLoja,
              name: "G",
              slug: "g3",
              icon: "🍽",
              kind: "SIMPLE",
            },
          })
        ).id,
        name: "Alheio",
        slug: "alheio3",
        description: "",
        basePrice: 1,
      },
    });
    expect(await produtosSemTipoDeControle(storeId)).toHaveLength(0);
  });
});

describe("ligar o estoque com produtos de tipo NULL", () => {
  /*
   * A PERGUNTA QUE ESTE BLOCO RESPONDE: `semTipo` é informativo e não bloqueia a
   * ativação do controle. Isso é seguro?
   *
   * A resposta depende de uma coisa só: se a regra que BLOQUEIA continua sendo
   * exatamente a de antes desta fase. Se continua, ligar o estoque numa loja
   * cheia de produtos NULL leva ao mesmo estado a que levaria ontem — e o
   * campo novo não introduz risco nenhum, porque ninguém o consulta para
   * decidir baixa em produto NULL.
   */

  async function pendentes() {
    const { produtosPendentesDeVinculo } = await import(
      "@/server/inventory/guarda-de-receita"
    );
    return produtosPendentesDeVinculo(storeId);
  }

  /*
   * O produto NULL sem origem CONTINUA BLOQUEANDO a ativação — pela regra
   * legada, não pela nova. É isto que impede o cenário perigoso: ligar o
   * controle e ficar com um produto ativo que vende sem descer nada.
   */
  it("produto NULL sem origem continua travando a ativação, como antes", async () => {
    const p = await produto();
    expect((await pendentes()).map((x) => x.id)).toEqual([p.id]);
  });

  it("produto NULL COM origem não trava, e o motor sabe o que fazer com ele", async () => {
    const farinha = await item("Farinha", "INGREDIENT");
    const p = await produto();
    await ficha(p.id, farinha.id);
    expect(await pendentes()).toHaveLength(0);
  });

  /*
   * A DIFERENÇA ENTRE AS DUAS LISTAS, escrita como teste. Um produto NULL com
   * ficha aparece em `semTipo` (o dono nunca respondeu a pergunta) e NÃO aparece
   * em `pendentes` (ele tem de onde tirar o que vende). Bloquear pela primeira
   * lista impediria de ligar o estoque uma loja que já funciona perfeitamente.
   */
  it("as duas listas respondem perguntas diferentes, e é por isso que só uma bloqueia", async () => {
    const farinha = await item("Farinha", "INGREDIENT");
    const p = await produto();
    await ficha(p.id, farinha.id);

    expect(await pendentes()).toHaveLength(0);
    expect((await produtosSemTipoDeControle(storeId)).map((x) => x.id)).toEqual([p.id]);
  });

  /*
   * NULL NÃO É UM TIPO. Se alguém um dia acrescentar um valor ao enum e
   * esquecer de tratá-lo no motor, este teste não pega — mas o de baixo pega o
   * que importa hoje: nenhum dos três tipos conhecidos se comporta como NULL, e
   * NULL não se comporta como nenhum deles.
   */
  it("NULL não é confundido com NAO_CONTROLA", async () => {
    const semTipo = await produto();
    const naoControla = await produto({ tipoDeControle: "NAO_CONTROLA" });

    // NULL sem origem é recusado (regra legada); NAO_CONTROLA passa.
    expect(await recusa(semTipo.id)).toBe("SEM_VINCULO_DE_ESTOQUE");
    expect(await recusa(naoControla.id)).toBeNull();

    // E só o NULL conta como pendência de classificação.
    expect((await produtosSemTipoDeControle(storeId)).map((x) => x.id)).toEqual([
      semTipo.id,
    ]);
  });

  /*
   * A combinação parcial que mais preocupa: tipo escolhido, origem faltando. Ela
   * NÃO pode existir num produto ATIVO — a guarda recusa nas duas portas que
   * levam a isso, o formulário e o botão de ligar da listagem.
   */
  it("PRODUÇÃO sem origem não consegue ficar ativo por nenhuma porta", async () => {
    const p = await produto({ tipoDeControle: "PRODUCAO", isActive: false });
    // a porta do botão da listagem
    expect(await recusa(p.id, { isActive: true })).toBe("PRODUCAO_SEM_ORIGEM");
    // a porta do formulário
    expect(await recusa(p.id, { isActive: true, tipoDeControle: "PRODUCAO" })).toBe(
      "PRODUCAO_SEM_ORIGEM",
    );
  });

  it("REVENDA sem item não consegue ficar ativo por nenhuma porta", async () => {
    const p = await produto({ tipoDeControle: "REVENDA", isActive: false });
    expect(await recusa(p.id, { isActive: true })).toBe("REVENDA_SEM_ITEM");
    expect(await recusa(p.id, { isActive: true, tipoDeControle: "REVENDA" })).toBe(
      "REVENDA_SEM_ITEM",
    );
  });
});

describe("o ciclo completo de PRODUÇÃO sem origem", () => {
  /*
   * O FLUXO INTEIRO, do clique em "Novo produto" até o produto vendável.
   *
   * É o caminho mais delicado da fase, porque tem um estado intermediário
   * inevitável: entre criar o produto e montar a receita, ele existe e não pode
   * ser vendido. O que este teste fixa é que esse estado é SEGURO — não
   * vendável — e TEMPORÁRIO — o dono consegue sair dele.
   */
  it("criar → inativo → configurar → ativar", async () => {
    // 1 · o dono escolhe PRODUÇÃO e salva. Não há receita: ela é FK para o
    //     produto e não pode precedê-lo.
    const { nasceInativo } = await avaliarCriacaoDeProduto(storeId, {
      isActive: true,
      controlaEstoque: true,
      tipoDeControle: "PRODUCAO",
    });
    expect(nasceInativo).toBe(true);

    // 2 · o produto é gravado INATIVO, apesar de o dono ter marcado "Ativo"
    const p = await produto({ tipoDeControle: "PRODUCAO", isActive: false });

    // 3 · e não consegue ser ligado enquanto não houver origem
    expect(await recusa(p.id, { isActive: true })).toBe("PRODUCAO_SEM_ORIGEM");

    // 4 · o dono monta a receita na aba Estoque
    const farinha = await item("Farinha", "INGREDIENT");
    await ficha(p.id, farinha.id);

    // 5 · agora ativar passa
    expect(await recusa(p.id, { isActive: true })).toBeNull();
  });

  /*
   * O produto INATIVO não vende, então não fura estoque — e é por isso que a
   * guarda o deixa em paz. Sem esta saída, um produto criado e ainda não
   * configurado bloquearia toda edição dele: mudar o preço seria recusado por
   * falta de uma receita que o dono ainda vai montar.
   */
  it("enquanto inativo, o produto pode ser editado normalmente", async () => {
    const p = await produto({ tipoDeControle: "PRODUCAO", isActive: false });
    expect(await recusa(p.id, { isActive: false })).toBeNull();
  });

  /*
   * REVENDA não passa por este ciclo, e a diferença é deliberada: o item de
   * estoque já existe quando o produto é criado, então escolher os dois na
   * mesma tela é possível — e o produto nasce ATIVO. Gravar inativo aqui seria
   * esconder do dono um trabalho que ele acabou de fazer.
   */
  it("REVENDA configurada na mesma tela nasce ativa, sem ciclo nenhum", async () => {
    const coca = await item("Coca lata", "RESALE");
    const { nasceInativo } = await avaliarCriacaoDeProduto(storeId, {
      isActive: true,
      controlaEstoque: true,
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });
    expect(nasceInativo).toBe(false);
  });
});
