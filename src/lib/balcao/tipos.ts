/**
 * OS TIPOS DO CARDÁPIO DO BALCÃO, num arquivo SEM IMPORT NENHUM.
 *
 * Eles moravam junto de `montarCardapioDoBalcao`, dentro de um `.fn.ts`, e a
 * tela os importava de lá. Isso derrubava o painel: o bundler não consegue
 * separar um tipo de um `export` comum quando os dois estão no mesmo módulo, e
 * arrastava repositórios e Prisma para o navegador — `ReferenceError: Buffer
 * is not defined` em toda tela que importasse aquele arquivo.
 *
 * Aqui não há o que arrastar. Um arquivo só de tipos some inteiro na
 * compilação, e cliente e servidor podem importá-lo sem consequência.
 */

/** Uma pergunta do cardápio: sabor, ponto da carne, complementos. */
export type GrupoDoBalcao = {
  id: string;
  name: string;
  minChoices: number;
  maxChoices: number;
  /** Quantas escolhas não são cobradas, contando das mais caras. */
  freeChoices: number;
  options: { id: string; name: string; price: number }[];
};

export type TamanhoDoBalcao = { id: string; label: string; price: number };

export type ProdutoDoBalcao = {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  tag: string | null;
  basePrice: number;
  categoryId: string;
  categoryName: string;
  sizes: TamanhoDoBalcao[];
  /** As perguntas da categoria seguidas das do produto, nessa ordem. */
  optionGroups: GrupoDoBalcao[];
};

export type ExtraDoBalcao = {
  id: string;
  name: string;
  price: number;
  /** Categorias em que o adicional vale por inteiro. */
  categoryIds: string[];
  /** Produtos avulsos em que ele foi marcado. */
  productIds: string[];
};

export type CategoriaDoBalcao = { id: string; name: string; quantidade: number };

export type CardapioDoBalcao = {
  categorias: CategoriaDoBalcao[];
  produtos: ProdutoDoBalcao[];
  extras: ExtraDoBalcao[];
  formasDePagamento: string[];
};

/** Uma linha do carrinho já precificada PELO SERVIDOR. */
export type LinhaPrecificada = {
  unitPrice: number;
  quantity: number;
  extras: { nome: string; grupo: string | null; preco: number }[];
  extrasTotal: number;
};
