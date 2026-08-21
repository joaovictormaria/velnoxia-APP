import type { LucideIcon } from "lucide-react";

/**
 * Types and pure helpers for the customer-facing menu.
 *
 * The menu data itself lives in the database and is served by
 * getStorefrontMenuFn — consume it through `useMenu()` in menu-provider.tsx.
 */

export type CategorySlug = string;

/**
 * Se o produto tem alguma pergunta obrigatória — dele ou da categoria.
 *
 * O botão "Adicionar" do card monta o item sem passar pela tela do produto, e
 * portanto sem responder nada. Um shake que exige sabor entraria no carrinho
 * sem sabor e só seria recusado no fim do checkout, com o cliente achando que
 * o site quebrou. Quando há pergunta obrigatória, o botão leva à tela em vez
 * de adicionar.
 */
export function exigeEscolha(
  product: { optionGroups: OptionGroup[] },
  category: { optionGroups: OptionGroup[] } | undefined,
): boolean {
  return [...(category?.optionGroups ?? []), ...product.optionGroups].some((g) => g.min > 0);
}

export type Category = {
  slug: CategorySlug;
  name: string;
  shortName: string;
  /** Storefront copy, editable per category in the admin. */
  badge?: string;
  headline?: string;
  subhead?: string;
  /** Pizza categories have a photo; simple categories fall back to a branded icon tile. */
  image?: string;
  icon?: LucideIcon;
  kind: "pizza" | "simple";
  /** Perguntas feitas a qualquer produto desta categoria. */
  optionGroups: OptionGroup[];
};

/**
 * Um tamanho oferecido, já com o nome que o dono escolheu.
 *
 * O id é o do tamanho da categoria: é ele que vai no carrinho e no checkout,
 * porque o servidor reconfere o preço por ele. O nome viaja junto só para a
 * tela ter o que mostrar sem uma segunda consulta.
 */
export type ProductSize = { id: string; label: string; price: number };

export type Product = {
  slug: string;
  name: string;
  desc: string;
  /**
   * Perguntas só deste produto, além das da categoria. É o que deixa o suco
   * perguntar laranja ou maracujá sem o refrigerante ao lado herdar a lista.
   */
  optionGroups: OptionGroup[];
  /** Reference price — the base price, used when the product has no sizes. */
  price: number;
  image?: string;
  icon?: LucideIcon;
  categorySlug: CategorySlug;
  /** Ids do banco. Vêm junto porque o alcance dos adicionais é por id. */
  id: string;
  categoryId: string;
  tag?: string;
  allowHalfAndHalf?: boolean;
  /** Absolute price per size, as configured in the admin panel. */
  sizes?: ProductSize[];
};

/**
 * Um adicional e onde ele pode ser pedido.
 *
 * Os ids de alcance viajam para o navegador porque o cardápio inteiro vem numa
 * resposta só: filtrar por produto aqui é uma varredura numa lista pequena que
 * já está na memória, e não uma ida ao servidor a cada produto aberto.
 */
export type Extra = {
  id: string;
  label: string;
  price: number;
  /** Categorias em que ele vale por inteiro. */
  categoryIds: string[];
  /** Produtos avulsos em que ele foi marcado. */
  productIds: string[];
};

/** Os adicionais que este produto oferece: os da categoria dele mais os dele. */
export function extrasDoProduto(
  extras: Extra[],
  produto: { id: string; categoryId?: string } | null | undefined,
): Extra[] {
  if (!produto) return [];
  return extras.filter(
    (e) =>
      e.productIds.includes(produto.id) ||
      (produto.categoryId !== undefined && e.categoryIds.includes(produto.categoryId)),
  );
}

/**
 * Uma pergunta que o cardápio faz antes de o item ir para o carrinho: o sabor
 * do shake, o ponto da carne, os complementos do açaí.
 */
export type OptionGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  /** Quantas escolhas não são cobradas, contando das mais caras. */
  free: number;
  options: { id: string; name: string; price: number }[];
};

/**
 * Preço num tamanho. Cai no preço base quando o produto não tem tamanhos —
 * bebidas e porções são vendidas assim.
 */
export function sizePrice(product: Product, sizeId?: string): number {
  if (!sizeId) return defaultSize(product)?.price ?? product.price;
  return product.sizes?.find((s) => s.id === sizeId)?.price ?? product.price;
}

/** Tamanhos oferecidos, na ordem em que a categoria os define. */
export function availableSizes(product: Product): ProductSize[] {
  return product.sizes ?? [];
}

/**
 * O tamanho que o "adicionar rápido" do cardápio usa.
 *
 * É o primeiro da categoria, e não um nome fixo: antes o código pedia "media",
 * o que só existia numa pizzaria. Numa marmitaria de P/M/G isso não resolveria
 * para nada e o produto entraria no carrinho pelo preço base.
 */
export function defaultSize(product: Product): ProductSize | null {
  return product.sizes?.[0] ?? null;
}

export function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

/**
 * Categorias que valem como "para acompanhar", pelo slug da categoria.
 *
 * Heurística, e assumidamente imperfeita: o cardápio não tem um campo dizendo
 * "isto é bebida", e inventar um obrigaria todo lojista a preencher mais uma
 * coisa. Errar aqui custa uma sugestão fraca, nunca um pedido errado.
 */
const PARECE_ACOMPANHAMENTO = /bebida|drink|suco|refrigerante|cerveja|caf|sobremesa|doce/i;

/**
 * O que oferecer para completar o pedido, tirado do cardápio da própria loja.
 *
 * Antes isto era uma lista de três slugs escritos no código —
 * "coca-cola-2l", "guarana-antarctica-2l", "ice-tea-limao-2l" — vindos de um
 * catálogo de demonstração. Nenhuma loja de verdade tem esses slugs, então a
 * busca não achava nada e a caixa "Que tal completar seu pedido?" aparecia com
 * o título e nada embaixo. Em todas as lojas, o tempo inteiro.
 *
 * A regra agora é a que um atendente usaria: oferecer o que a pessoa **ainda
 * não pediu**, preferindo bebida e sobremesa. Quem já tem refrigerante no
 * carrinho não ouve "que tal um refrigerante?".
 */
export function sugestoesParaOPedido(
  products: Product[],
  noCarrinho: string[],
  limite = 3,
): Product[] {
  const fora = products.filter((p) => !noCarrinho.includes(p.slug));

  const categoriasNoCarrinho = new Set(
    products.filter((p) => noCarrinho.includes(p.slug)).map((p) => p.categorySlug),
  );

  // Primeiro o que acompanha e ainda não está no carrinho; depois qualquer
  // coisa de uma categoria que o pedido ainda não tem. Sugerir outra pizza a
  // quem já pediu pizza não completa nada.
  const acompanhamentos = fora.filter((p) => PARECE_ACOMPANHAMENTO.test(p.categorySlug));
  const outrasCategorias = fora.filter(
    (p) => !categoriasNoCarrinho.has(p.categorySlug) && !acompanhamentos.includes(p),
  );

  return [...acompanhamentos, ...outrasCategorias].slice(0, limite);
}
