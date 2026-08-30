import type { HalfPizzaPricingRule, Prisma } from "@prisma/client";
import { prisma } from "../db/client";

/** Prisma normal ou o cliente de uma transação do chamador. */
type Db = Prisma.TransactionClient | typeof prisma;
import {
  criarGrupos,
  sincronizarGrupos,
  type OptionGroupInput,
} from "./option-group-sync";

/** Um preço para um tamanho que a categoria do produto oferece. */
export type ProductSizeInput = {
  categorySizeId: string;
  price: number;
  isAvailable: boolean;
};

export type ProductInput = {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  basePrice: number;
  imageUrl?: string | null;
  tag?: string | null;
  isActive: boolean;
  /**
   * Se o produto participa do controle de estoque da loja.
   *
   * Quem cobra é `@/server/inventory/guarda-de-receita`, nunca este arquivo:
   * o repositório grava o que mandaram e não conhece sessão nem configuração
   * de loja. Regra de negócio escrita aqui seria regra que a guarda não vê.
   */
  controlaEstoque: boolean;
  /**
   * Como este produto controla o estoque.
   *
   * `undefined` não mexe na classificação; `null` a devolve ao estado "não
   * escolhido". Quem decide se a classificação é válida é
   * `@/server/inventory/guarda-de-receita` — o repositório grava o que
   * mandaram e não conhece sessão nem configuração de loja.
   */
  tipoDeControle?: "NAO_CONTROLA" | "REVENDA" | "PRODUCAO" | null;
  /**
   * O item de estoque que este produto consome ao ser vendido.
   *
   * PASSOU A VIAJAR COM O PRODUTO, e isso é o que torna a operação atômica.
   * Antes o vínculo era gravado por uma segunda chamada, depois do produto já
   * salvo: com o controle de estoque ligado, marcar "Ativo" e escolher o item
   * na mesma tela era recusado, porque a guarda lia o banco antes de a segunda
   * chamada existir. E, se ela falhasse, o produto ficava salvo sem vínculo.
   *
   * Sendo uma coluna da mesma linha, os dois campos são escritos pelo MESMO
   * comando. Não há estado parcial possível: ou o produto fica ativo e
   * vinculado, ou nada acontece.
   *
   * `undefined` não mexe no vínculo; `null` desvincula. Quem confere se o item
   * é da loja da sessão é `saveProductFn` — o repositório grava o que mandaram.
   */
  inventoryItemId?: string | null;
  allowHalfAndHalf: boolean;
  halfPizzaPricingRule: HalfPizzaPricingRule;
  sortOrder: number;
  sizes: ProductSizeInput[];
  /**
   * Perguntas só deste produto, ao lado das que a categoria já faz. É o que
   * permite o suco perguntar laranja ou maracujá sem obrigar o refrigerante da
   * mesma categoria a oferecer a mesma lista.
   */
  optionGroups?: OptionGroupInput[];
};

export function listProducts(
  storeId: string,
  filters?: { categoryId?: string; search?: string },
) {
  return prisma.product.findMany({
    where: {
      storeId,
      categoryId: filters?.categoryId,
      name: filters?.search
        ? { contains: filters.search, mode: "insensitive" }
        : undefined,
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    include: {
      category: { select: { id: true, name: true } },
      /*
       * A FICHA VEM SÓ COMO "EXISTE OU NÃO", e é o mínimo que a listagem
       * precisa: sem isto ela não tem como distinguir um produto de PRODUÇÃO
       * já configurado de um que ficou pela metade, e o selo "Configuração
       * pendente" mentiria para um dos dois.
       *
       * `take: 1` e só o `id`: a pergunta é de existência. Trazer as linhas da
       * receita de todo produto do cardápio para responder "tem?" seria pagar
       * uma consulta grande por um booleano.
       *
       * O filtro repete as MESMAS três condições da guarda — ativa, com pelo
       * menos uma linha, da mesma loja. Divergir aqui faria a tela dizer uma
       * coisa e o servidor recusar outra.
       */
      productCompositions: {
        where: { storeId, isActive: true, items: { some: {} } },
        select: { id: true },
        take: 1,
      },
      // O nome do tamanho vem junto: a listagem mostra "Brotinho, Grande" e
      // não teria como saber disso só com o id.
      sizes: {
        where: { isAvailable: true },
        orderBy: { categorySize: { sortOrder: "asc" } },
        include: { categorySize: { select: { id: true, label: true, sortOrder: true } } },
      },
    },
  });
}

export function getProductById(storeId: string, id: string) {
  return prisma.product.findFirst({
    where: { id, storeId },
    include: {
      sizes: { include: { categorySize: { select: { id: true, label: true, sortOrder: true } } } },
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
}

export async function createProduct(
  storeId: string,
  { sizes, optionGroups, ...data }: ProductInput,
  /**
   * Transação do chamador, quando ele precisa que a checagem que autorizou a
   * gravação e a gravação em si sejam o mesmo instante. É o caso de
   * `saveProductFn`: a guarda de estoque lê a ficha técnica logo antes, e ler
   * fora da transação abriria a janela de alguém apagá-la no meio.
   */
  tx: Db = prisma,
) {
  // The category is re-checked against the store so a forged categoryId cannot
  // attach a product to someone else's category.
  await assertCategoryBelongsToStore(storeId, data.categoryId, tx);
  await assertSizesBelongToCategory(data.categoryId, sizes, tx);
  return tx.product.create({
    data: {
      ...data,
      storeId,
      sizes: { create: sizes },
      optionGroups: criarGrupos(optionGroups ?? []),
    },
    include: { sizes: true },
  });
}

/** Sizes are replaced wholesale — the form always submits the complete set. */
export async function updateProduct(
  storeId: string,
  id: string,
  { sizes, optionGroups, ...data }: ProductInput,
  /** Ver `createProduct`. Ausente, abre a própria, como sempre fez. */
  tx?: Db,
) {
  await assertCategoryBelongsToStore(storeId, data.categoryId, tx);
  await assertSizesBelongToCategory(data.categoryId, sizes, tx);

  const corpo = async (db: Db) => {
    const owned = await db.product.findFirst({ where: { id, storeId }, select: { id: true } });
    if (!owned) throw new Error("NOT_FOUND");
    await db.productSize.deleteMany({ where: { productId: id } });
    // Os tamanhos podem ser recriados porque ninguém guarda o id deles; as
    // perguntas, não — um pedido em aberto aponta para a opção escolhida.
    if (optionGroups) await sincronizarGrupos(db, { productId: id }, optionGroups);
    return db.product.update({
      where: { id },
      data: { ...data, sizes: { create: sizes } },
      include: { sizes: true },
    });
  };

  /*
   * Transação aninhada não existe no Prisma: recebendo uma de fora, roda dentro
   * dela. Sem ela, abre a própria — que é o comportamento de sempre, e o que
   * mantém esta função utilizável por quem não precisa de guarda nenhuma.
   */
  return tx ? corpo(tx) : prisma.$transaction(corpo);
}

/**
 * Os preços só podem apontar para tamanhos da categoria do próprio produto.
 *
 * Sem isso, um categorySizeId de outra categoria — ou de outra loja — entraria
 * pelo formulário e o produto passaria a ter um tamanho que a vitrine dele nem
 * mostra, cobrando um preço que ninguém consegue explicar.
 */
async function assertSizesBelongToCategory(
  categoryId: string,
  sizes: ProductSizeInput[],
  db: Db = prisma,
) {
  if (sizes.length === 0) return;
  const validos = await db.categorySize.count({
    where: { categoryId, id: { in: sizes.map((s) => s.categorySizeId) } },
  });
  if (validos !== new Set(sizes.map((s) => s.categorySizeId)).size) {
    throw new Error("SIZE_NOT_IN_CATEGORY");
  }
}

export function setProductActive(storeId: string, id: string, isActive: boolean) {
  return prisma.product.update({ where: { id, storeId }, data: { isActive } });
}

export function deleteProduct(storeId: string, id: string) {
  return prisma.product.delete({ where: { id, storeId } });
}

/** Public menu for the storefront: only active products in active categories. */
export function listMenuForStorefront(storeId: string) {
  return prisma.category.findMany({
    where: { storeId, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: {
          options: {
            where: { isAvailable: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      products: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          /*
           * O saldo NÃO é mais consultado aqui.
           *
           * Ele existia para derivar `esgotado` e esconder o produto quando
           * zerava. Estoque virou controle interno e parou de decidir o que
           * está à venda, então a vitrine deixou de ter motivo para ler saldo
           * — e o dado sensível deixa de sair do banco numa consulta pública.
           */
          optionGroups: {
            orderBy: { sortOrder: "asc" },
            include: {
              options: { where: { isAvailable: true }, orderBy: { sortOrder: "asc" } },
            },
          },
          sizes: {
            where: { isAvailable: true },
            orderBy: { categorySize: { sortOrder: "asc" } },
            include: { categorySize: { select: { id: true, label: true } } },
          },
        },
      },
    },
  });
}

export function getProductBySlug(storeId: string, slug: string) {
  return prisma.product.findUnique({
    where: { storeId_slug: { storeId, slug } },
    include: {
      category: true,
      sizes: {
        where: { isAvailable: true },
        orderBy: { categorySize: { sortOrder: "asc" } },
        include: { categorySize: { select: { id: true, label: true } } },
      },
    },
  });
}

async function assertCategoryBelongsToStore(
  storeId: string,
  categoryId: string,
  db: Db = prisma,
) {
  const category = await db.category.findFirst({
    where: { id: categoryId, storeId },
    select: { id: true },
  });
  if (!category) throw new Error("CATEGORY_NOT_FOUND");
}
