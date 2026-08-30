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
  motivoDeConfiguracaoInvalida,
  tipoDeControleExigido,
  MOTIVOS,
  type MotivoDeRecusa,
  type TipoDeControleOuNulo,
  type TipoDeItem,
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

/* ------------------------------------------------------------------------- *
 * A COBRANÇA DO TIPO DE CONTROLE.
 *
 * Mesmo contrato do resto do arquivo: `storeId` é o primeiro argumento, vem de
 * `requireAdminSession()` no chamador, e nenhuma consulta daqui roda sem o
 * recorte por loja. É o que impede um produto da loja A ser satisfeito por um
 * item da loja B.
 * ------------------------------------------------------------------------- */

/**
 * A recusa por configuração inválida, com o motivo dentro.
 *
 * Classe própria pelo mesmo motivo de `ErroDeVinculoDeEstoque`: a tela precisa
 * distinguir "faltou o item de estoque" de "esta receita não pode existir" para
 * oferecer a saída certa. O `motivo` viaja junto para que ela não precise
 * comparar strings de mensagem.
 */
export class ErroDeConfiguracaoDeEstoque extends Error {
  readonly codigo = "CONFIGURACAO_DE_ESTOQUE_INVALIDA" as const;
  readonly motivo: MotivoDeRecusa;

  constructor(motivo: MotivoDeRecusa) {
    super(MOTIVOS[motivo]);
    this.name = "ErroDeConfiguracaoDeEstoque";
    this.motivo = motivo;
  }
}

/** O item de estoque é desta loja, e o que ele é. Nulo se não for dela. */
export async function tipoDoItemDaLoja(
  storeId: string,
  inventoryItemId: string,
  db: Db = prisma,
): Promise<TipoDeItem | null> {
  const item = await db.inventoryItem.findFirst({
    where: { id: inventoryItemId, storeId },
    select: { itemType: true },
  });
  /*
   * O `itemType` é TEXT no banco (o CHECK vale para o que entra daqui em
   * diante, não para o que já estava lá). Um valor fora dos quatro vira null,
   * e null nunca satisfaz regra nenhuma — que é o desfecho certo: um item que
   * o sistema não sabe classificar não deve autorizar baixa de saldo.
   */
  const tipo = item?.itemType as TipoDeItem | undefined;
  if (!tipo) return null;
  return ["INGREDIENT", "RESALE", "PREPARED", "PACKAGING"].includes(tipo)
    ? tipo
    : null;
}

/**
 * O que se pretende gravar, para a guarda julgar o RESULTADO e não o presente.
 *
 * Mesma razão de `AlteracaoProposta`: sem isto a guarda leria o estado antigo e
 * aprovaria a alteração que o quebra.
 */
export type ConfiguracaoProposta = AlteracaoProposta & {
  tipoDeControle?: TipoDeControleOuNulo;
};

/**
 * Recusa a alteração se ela deixaria o produto com uma configuração que o motor
 * não sabe executar.
 *
 * DUAS REGRAS, E ELAS NÃO SE SUBSTITUEM:
 *
 *   tipo nulo    cai em `exigirVinculoDeEstoque`, a regra legada, intacta. É o
 *                que preserva o comportamento de todo produto anterior a esta
 *                fase, byte a byte.
 *   tipo escolhido cobra a regra nova, que é mais estrita — e por isso a antiga
 *                não precisa rodar junto: "REVENDA com item RESALE" já implica
 *                "tem de onde tirar o que vende".
 *
 * Produto inexistente na loja da sessão é silêncio, não recusa: quem trata "não
 * é seu" é o chamador, com a mensagem dele. A guarda não decide posse.
 */
export async function exigirConfiguracaoDeEstoque(
  storeId: string,
  productId: string,
  proposta: ConfiguracaoProposta = {},
  db: Db = prisma,
): Promise<void> {
  if (!(await controleDeEstoqueAtivo(storeId, db))) return;

  const produto = await db.product.findFirst({
    where: { id: productId, storeId },
    select: {
      isActive: true,
      controlaEstoque: true,
      inventoryItemId: true,
      tipoDeControle: true,
      deletedAt: true,
      productCompositions: {
        where: {
          storeId,
          isActive: true,
          items: { some: {} },
          ...(proposta.ignorarComposicaoId
            ? { id: { not: proposta.ignorarComposicaoId } }
            : {}),
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!produto) return;

  const tipo =
    proposta.tipoDeControle !== undefined
      ? proposta.tipoDeControle
      : (produto.tipoDeControle as TipoDeControleOuNulo);

  // Produto legado: a regra antiga, sem uma linha de diferença.
  if (tipo === null) {
    return exigirVinculoDeEstoque(storeId, productId, proposta, db);
  }

  const alvo = {
    isActive:
      proposta.isActive ?? (produto.isActive && produto.deletedAt === null),
    controlaEstoque: proposta.controlaEstoque ?? produto.controlaEstoque,
  };
  if (!tipoDeControleExigido(true, alvo)) return;

  const inventoryItemId =
    proposta.inventoryItemId !== undefined
      ? proposta.inventoryItemId
      : produto.inventoryItemId;

  /*
   * O tipo do item é lido AGORA, contra a loja da sessão, e nunca aceito do
   * payload. É o ponto exato onde uma tentativa cross-tenant morre: um id de
   * item da loja vizinha não é encontrado, `tipoDoItemDaLoja` devolve null, e
   * null não satisfaz REVENDA nem PRODUÇÃO.
   */
  const itemVinculadoTipo = inventoryItemId
    ? await tipoDoItemDaLoja(storeId, inventoryItemId, db)
    : null;

  const motivo = motivoDeConfiguracaoInvalida(tipo, {
    temFichaComIngrediente:
      proposta.temFichaComIngrediente ??
      produto.productCompositions.length > 0,
    inventoryItemId,
    itemVinculadoTipo,
  });

  if (motivo) throw new ErroDeConfiguracaoDeEstoque(motivo);
}

/**
 * Este produto recusa ficha técnica?
 *
 * Pergunta separada porque quem precisa dela — as quatro portas de
 * `composition.fn.ts` — não está gravando produto nenhum: está criando,
 * ativando ou apagando uma receita, e precisa saber se o dono dela aceita uma.
 *
 * Vale mesmo com o controle de estoque DESLIGADO. É a única regra desta fase
 * que não depende dele, e de propósito: uma receita para Coca-Cola é errada
 * enquanto o dono a monta, não só quando ele liga o controle — e permitir criá-
 * la agora para recusá-la depois transformaria o "ligar" numa lista de
 * consertos.
 */
export async function recusaFichaTecnica(
  storeId: string,
  productId: string,
  db: Db = prisma,
): Promise<boolean> {
  const produto = await db.product.findFirst({
    where: { id: productId, storeId },
    select: { tipoDeControle: true },
  });
  return produto?.tipoDeControle === "REVENDA";
}

/**
 * Os produtos que ainda não foram classificados.
 *
 * SÃO OUTRA COISA que `produtosPendentesDeVinculo`, e as duas listas convivem:
 * aquela pergunta "tem de onde tirar o que vende?" (regra legada, para quem tem
 * tipo nulo); esta pergunta "o dono já disse como este produto funciona?".
 *
 * Com `tipoDeControle` nulo em toda linha existente, esta lista começa igual à
 * de lá, e as duas divergem à medida que os produtos forem sendo classificados.
 */
export async function produtosSemTipoDeControle(
  storeId: string,
  db: Db = prisma,
): Promise<Array<{ id: string; name: string }>> {
  return db.product.findMany({
    where: {
      storeId,
      isActive: true,
      controlaEstoque: true,
      deletedAt: null,
      tipoDeControle: null,
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * O que fazer com um produto que ainda não existe.
 *
 * A CRIAÇÃO TEM UM LIMITE FÍSICO: uma ficha técnica é FK para o produto, então
 * não pode precedê-lo. Quem escolhe PRODUÇÃO com receita própria não tem como
 * entregar a receita nesta chamada — ela é montada depois, na aba Estoque.
 *
 * Daí a assimetria deliberada entre os motivos:
 *
 *   PRODUCAO_SEM_ORIGEM   é o único impossível de satisfazer agora. O produto
 *                         é gravado INATIVO e a tela avisa — decisão do João,
 *                         29/08/2026, mantida.
 *   qualquer outro motivo é satisfazível nesta mesma tela: escolher o item,
 *                         trocar por um item compatível, limpar a configuração.
 *                         Recusar é o certo — gravar inativo esconderia um erro
 *                         que o dono conserta em dois cliques.
 *
 * Tipo nulo cai no caminho legado, intacto: produto criado por um caminho que
 * não pergunta o tipo (a ficha técnica cria produto por efeito colateral)
 * continua se comportando como antes desta fase.
 */
export async function avaliarCriacaoDeProduto(
  storeId: string,
  proposto: {
    isActive: boolean;
    controlaEstoque: boolean;
    tipoDeControle?: TipoDeControleOuNulo;
    inventoryItemId?: string | null;
  },
  db: Db = prisma,
): Promise<{ nasceInativo: boolean }> {
  if (!(await controleDeEstoqueAtivo(storeId, db))) return { nasceInativo: false };

  const tipo = proposto.tipoDeControle ?? null;
  if (tipo === null) {
    return {
      nasceInativo: await nasceInativoPorFaltaDeVinculo(
        storeId,
        { isActive: proposto.isActive, controlaEstoque: proposto.controlaEstoque },
        db,
      ),
    };
  }

  if (!tipoDeControleExigido(true, proposto)) return { nasceInativo: false };

  const inventoryItemId = proposto.inventoryItemId ?? null;
  const itemVinculadoTipo = inventoryItemId
    ? await tipoDoItemDaLoja(storeId, inventoryItemId, db)
    : null;

  const motivo = motivoDeConfiguracaoInvalida(tipo, {
    // Produto novo nunca tem ficha: ela é FK para ele e não pode precedê-lo.
    temFichaComIngrediente: false,
    inventoryItemId,
    itemVinculadoTipo,
  });

  if (motivo === null) return { nasceInativo: false };
  if (motivo === "PRODUCAO_SEM_ORIGEM") return { nasceInativo: true };
  throw new ErroDeConfiguracaoDeEstoque(motivo);
}
