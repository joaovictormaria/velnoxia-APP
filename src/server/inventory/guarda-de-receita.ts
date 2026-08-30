/**
 * A cobrança da regra de estoque, num lugar só.
 *
 * `@/lib/regra-de-estoque` DECIDE; este arquivo REÚNE OS FATOS e cobra. A
 * separação não é gosto: a decisão precisa rodar em vitest sem banco, e a
 * cobrança precisa de Prisma. Misturar as duas produz uma regra que ninguém
 * testa isoladamente.
 *
 * TUDO AQUI RECEBE `storeId` COMO PRIMEIRO ARGUMENTO, e esse `storeId` vem
 * sempre de `requireAdminSession()` no chamador — nunca do payload. Nenhuma
 * função deste módulo aceita loja, usuário ou identidade vinda do cliente, e
 * nenhuma consulta daqui roda sem o recorte por loja. É o que impede um
 * produto da loja A ser satisfeito por uma ficha da loja B.
 *
 * POR QUE UMA GUARDA E NÃO UMA CHECAGEM NO FORMULÁRIO: os caminhos que podem
 * deixar um produto irregular são sete, e só um deles é o formulário. Salvar
 * produto, ativar produto, desvincular o item de estoque, apagar a última
 * ficha, desativar a última ficha, trocar a ficha por uma vazia e criar
 * produto por efeito colateral da ficha técnica — todos passam por aqui.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import {
  produtoEstaIrregular,
  MOTIVO_SEM_VINCULO_DE_ESTOQUE,
} from "@/lib/regra-de-estoque";

/** Prisma normal ou o cliente de uma transação do chamador. */
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * A recusa da guarda, com classe própria.
 *
 * Classe, e não `new Error("texto")`, porque a tela precisa distinguir esta
 * recusa de uma falha qualquer para oferecer a saída certa — "cadastre a
 * ficha" — em vez de um "erro ao salvar" genérico.
 */
export class ErroDeVinculoDeEstoque extends Error {
  readonly codigo = "SEM_VINCULO_DE_ESTOQUE" as const;

  constructor(mensagem: string = MOTIVO_SEM_VINCULO_DE_ESTOQUE) {
    super(mensagem);
    this.name = "ErroDeVinculoDeEstoque";
  }
}

/**
 * A loja liga o controle de estoque?
 *
 * `?? false` cobre a loja sem linha de settings — a relação é opcional no
 * schema. Ausência de configuração é ausência de exigência, que é o default
 * seguro: nunca recusa por um dado que não existe.
 */
export async function controleDeEstoqueAtivo(
  storeId: string,
  db: Db = prisma,
): Promise<boolean> {
  const settings = await db.storeSettings.findUnique({
    where: { storeId },
    select: { inventoryControlEnabled: true },
  });
  return settings?.inventoryControlEnabled ?? false;
}

/**
 * O que se pretende gravar, para a guarda julgar o resultado e não o presente.
 *
 * Sem isto a guarda leria o estado ANTIGO do produto e aprovaria a alteração
 * que o quebra: desvincular o item de estoque passaria porque, no banco, o
 * vínculo ainda está lá no instante da checagem.
 */
export type AlteracaoProposta = {
  isActive?: boolean;
  controlaEstoque?: boolean;
  inventoryItemId?: string | null;
  /**
   * Desconsidera esta ficha ao verificar se ainda sobra alguma válida.
   *
   * É o que torna "apagar a última receita" e "desativar a última receita"
   * verificáveis ANTES de acontecerem. Checar depois seria checar um estrago
   * já feito.
   */
  ignorarComposicaoId?: string;
  /**
   * Diz de fora se sobrará ficha válida, em vez de deduzir do banco.
   *
   * Existe para UM caso, e o comentário serve para que não vire dois: ativar
   * uma versão de receita desativa todas as outras do mesmo dono na mesma
   * transação. Nenhum filtro sobre o estado ATUAL descreve esse resultado —
   * `ignorarComposicaoId` sabe excluir uma ficha, não sabe que as demais estão
   * prestes a cair.
   *
   * Só use onde o chamador conhece o resultado com certeza. Passar isto para
   * "acelerar" uma checagem que o banco responderia é abrir mão da guarda.
   */
  temFichaComIngrediente?: boolean;
};

/**
 * Os fatos de um produto, já recortados pela loja da sessão.
 *
 * UMA consulta, nunca duas: a existência de ficha válida vem como subconsulta
 * (`items: { some: {} }`), não como um segundo `findMany` que o chamador
 * teria de lembrar de filtrar por loja também.
 *
 * O `storeId` é repetido no filtro da composição de propósito. A ficha sempre
 * pertence à mesma loja do produto na prática, mas isso é convenção do código
 * que a cria, não constraint do banco. Repetir o recorte custa nada e fecha a
 * porta de satisfazer um produto da loja A com uma ficha da loja B.
 */
async function fatosDoProduto(
  storeId: string,
  productId: string,
  alteracao: AlteracaoProposta,
  db: Db,
) {
  const produto = await db.product.findFirst({
    where: { id: productId, storeId },
    select: {
      isActive: true,
      controlaEstoque: true,
      inventoryItemId: true,
      deletedAt: true,
      productCompositions: {
        where: {
          storeId,
          isActive: true,
          // D3: ficha sem nenhuma linha não consome nada, então não conta.
          items: { some: {} },
          ...(alteracao.ignorarComposicaoId
            ? { id: { not: alteracao.ignorarComposicaoId } }
            : {}),
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!produto) return null;

  return {
    produto: {
      /*
       * Produto na lixeira não está à venda, então não fura estoque. Tratá-lo
       * como ativo faria a ativação do controle travar em produtos que o dono
       * já apagou e não tem mais como configurar.
       */
      isActive:
        alteracao.isActive ?? (produto.isActive && produto.deletedAt === null),
      controlaEstoque: alteracao.controlaEstoque ?? produto.controlaEstoque,
    },
    vinculo: {
      temFichaComIngrediente:
        alteracao.temFichaComIngrediente ??
        produto.productCompositions.length > 0,
      inventoryItemId:
        alteracao.inventoryItemId !== undefined
          ? alteracao.inventoryItemId
          : produto.inventoryItemId,
    },
  };
}

/**
 * Recusa a alteração se ela deixaria o produto ativo sem de onde tirar o que
 * vende.
 *
 * Produto inexistente na loja da sessão é silêncio, não recusa: quem trata
 * "não é seu" é o chamador, que já o faz, e com a mensagem dele. A guarda não
 * é o lugar de decidir posse.
 */
export async function exigirVinculoDeEstoque(
  storeId: string,
  productId: string,
  alteracao: AlteracaoProposta = {},
  db: Db = prisma,
): Promise<void> {
  if (!(await controleDeEstoqueAtivo(storeId, db))) return;

  const fatos = await fatosDoProduto(storeId, productId, alteracao, db);
  if (!fatos) return;

  if (produtoEstaIrregular(true, fatos.produto, fatos.vinculo)) {
    throw new ErroDeVinculoDeEstoque();
  }
}

/**
 * Um produto que ainda não existe deve nascer inativo?
 *
 * Na criação não há o que consultar: produto novo nunca tem ficha (a ficha é
 * FK para ele, então não pode precedê-lo) nem vínculo direto (o `ProductForm`
 * grava isso numa segunda chamada, depois que o id existe).
 *
 * DECISÃO DE PRODUTO, do João, em 29/08/2026: com o controle ligado, criar não
 * é recusado — o produto é gravado INATIVO. Recusar deixaria o cadastro sem
 * saída, porque não há como montar a ficha de um produto que ainda não foi
 * criado.
 *
 * Quem chama devolve isto à tela, para que "nasceu inativo" seja uma
 * informação e não uma surpresa que o dono descobre pela vitrine vazia.
 */
export async function nasceInativoPorFaltaDeVinculo(
  storeId: string,
  proposto: { isActive: boolean; controlaEstoque: boolean },
  db: Db = prisma,
): Promise<boolean> {
  if (!proposto.isActive || !proposto.controlaEstoque) return false;
  return controleDeEstoqueAtivo(storeId, db);
}

/**
 * Os produtos que impedem a loja de ligar o controle de estoque.
 *
 * UMA CONSULTA, e o `NOT` é o motivo. A versão ingênua — listar produtos e
 * perguntar a ficha de cada um — é N+1 e fica lenta exatamente na loja grande,
 * que é a que mais precisa desta tela.
 *
 * Devolve só `id` e `name`. Saldo, custo e ficha não vão: a tela não usa, e
 * dado interno que não é usado é dado que vaza de graça.
 */
export async function produtosPendentesDeVinculo(
  storeId: string,
  db: Db = prisma,
): Promise<Array<{ id: string; name: string }>> {
  return db.product.findMany({
    where: {
      storeId,
      isActive: true,
      controlaEstoque: true,
      // Produto na lixeira não está à venda e não deve travar a ativação.
      deletedAt: null,
      inventoryItemId: null,
      NOT: {
        productCompositions: {
          some: { storeId, isActive: true, items: { some: {} } },
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
