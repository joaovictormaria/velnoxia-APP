import type { MenuPayload } from "@/lib/pizzaria2/menu-provider";

/**
 * O cardápio da vitrine com as alterações que ainda não foram salvas.
 *
 * A prévia do painel renderiza os componentes de verdade da vitrine — não um
 * desenho parecido. Para isso ela precisa entregar aos provedores um payload
 * igual ao que o servidor entregaria, só que com o que a lojista está
 * digitando agora aplicado por cima.
 *
 * Fica aqui, separado da tela, porque é a parte que pode dar errado em
 * silêncio: uma categoria nova que não aparece, uma existente que aparece
 * duplicada, a ordem que muda sozinha. Nada disso levanta erro — só faz a
 * prévia mostrar algo diferente do que será salvo, que é o único jeito de esta
 * funcionalidade ser pior que não existir.
 */

/** O que a tela de Categorias tem em mãos enquanto a lojista edita. */
export type RascunhoDeCategoria = {
  /** Null enquanto é uma categoria nova, ainda sem id. */
  id: string | null;
  name: string;
  slug: string;
  icon: string;
  badge: string;
  headline: string;
  subhead: string;
  kind: "PIZZA" | "SIMPLE";
  sortOrder: number;
  isActive: boolean;
};

type CategoriaDoPayload = MenuPayload["categories"][number];

/** Um endereço temporário para a categoria que ainda não existe no banco. */
export const SLUG_DA_NOVA = "__previa-categoria-nova";

/**
 * Aplica o rascunho e devolve o payload que a prévia deve renderizar.
 *
 * A categoria é encontrada pelo id, não pelo slug: o slug é justamente um dos
 * campos que a lojista pode estar editando, e procurar por ele faria a
 * categoria sumir e reaparecer como se fosse outra a cada tecla.
 */
export function aplicarRascunhoDeCategoria(
  payload: MenuPayload,
  rascunho: RascunhoDeCategoria | null,
): MenuPayload {
  if (!rascunho) return payload;

  // Categoria desativada some da vitrine, e a prévia mostra isso: é a resposta
  // à pergunta que a lojista está fazendo ao desmarcar "ativo".
  if (!rascunho.isActive) {
    return {
      ...payload,
      categories: payload.categories.filter((c) => c.id !== rascunho.id),
    };
  }

  const existente = rascunho.id
    ? payload.categories.find((c) => c.id === rascunho.id)
    : undefined;

  const atualizada: CategoriaDoPayload = {
    // O que não está no formulário vem do que já existe — produtos, imagem e
    // perguntas continuam sendo os de verdade.
    ...(existente ??
      ({
        id: rascunho.id ?? SLUG_DA_NOVA,
        imageUrl: null,
        optionGroups: [],
        products: [],
      } as unknown as CategoriaDoPayload)),
    name: rascunho.name,
    // Enquanto o nome está sendo digitado o slug pode estar vazio; um slug
    // vazio faria duas categorias colidirem e a lista piscar.
    slug: rascunho.slug || existente?.slug || SLUG_DA_NOVA,
    badge: rascunho.badge || null,
    headline: rascunho.headline || null,
    subhead: rascunho.subhead || null,
    icon: rascunho.icon || null,
    kind: rascunho.kind,
  };

  const categories = existente
    ? payload.categories.map((c) => (c.id === rascunho.id ? atualizada : c))
    : [...payload.categories, atualizada];

  return { ...payload, categories: ordenar(categories, rascunho) };
}

/**
 * A ordem que a vitrine mostraria.
 *
 * O payload já chega ordenado pelo servidor, e o campo "Ordem" do formulário é
 * o que decide a posição — então a categoria em edição é reposicionada, e as
 * demais mantêm a ordem em que vieram.
 */
function ordenar(
  categories: CategoriaDoPayload[],
  rascunho: RascunhoDeCategoria,
): CategoriaDoPayload[] {
  const alvoSlug = rascunho.slug || SLUG_DA_NOVA;
  const emEdicao = categories.find((c) => (rascunho.id ? c.id === rascunho.id : c.slug === alvoSlug));
  if (!emEdicao) return categories;

  const demais = categories.filter((c) => c !== emEdicao);
  const posicao = Math.max(0, Math.min(demais.length, rascunho.sortOrder - 1));
  return [...demais.slice(0, posicao), emEdicao, ...demais.slice(posicao)];
}

/** O que a tela de Produtos tem em mãos enquanto a lojista edita. */
export type RascunhoDeProduto = {
  /** Null enquanto é um produto novo, ainda sem id. */
  id: string | null;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  basePrice: number;
  imageUrl: string | null;
  tag: string | null;
  isActive: boolean;
  allowHalfAndHalf: boolean;
  sortOrder: number;
  /** Já com o rótulo do tamanho, que o formulário conhece e o payload exige. */
  sizes: { categorySizeId: string; label: string; price: number; isAvailable: boolean }[];
};

type ProdutoDoPayload = MenuPayload["categories"][number]["products"][number];

/** Um endereço temporário para o produto que ainda não existe no banco. */
export const SLUG_DO_NOVO_PRODUTO = "__previa-produto-novo";

/**
 * Aplica o rascunho do produto e devolve o cardápio que a prévia deve mostrar.
 *
 * O produto é tirado de todas as categorias antes de ser posto na escolhida.
 * Sem isso, trocar a categoria no formulário faria ele aparecer nas duas ao
 * mesmo tempo — e a lojista veria um cardápio que o banco nunca vai ter.
 */
export function aplicarRascunhoDeProduto(
  payload: MenuPayload,
  rascunho: RascunhoDeProduto | null,
): MenuPayload {
  if (!rascunho) return payload;

  const semEle = payload.categories.map((c) => ({
    ...c,
    products: c.products.filter((p) => !rascunho.id || p.id !== rascunho.id),
  }));

  // Produto desativado some da vitrine, e a prévia mostra isso.
  if (!rascunho.isActive) return { ...payload, categories: semEle };

  const antigo = payload.categories
    .flatMap((c) => c.products)
    .find((p) => rascunho.id && p.id === rascunho.id);

  const atualizado: ProdutoDoPayload = {
    ...(antigo ?? ({ id: rascunho.id ?? SLUG_DO_NOVO_PRODUTO } as unknown as ProdutoDoPayload)),
    name: rascunho.name,
    // Slug vazio no meio da digitação ganharia o mesmo endereço de outro
    // produto, e a vitrine trataria os dois como um só.
    slug: rascunho.slug || antigo?.slug || SLUG_DO_NOVO_PRODUTO,
    description: rascunho.description,
    basePrice: rascunho.basePrice,
    imageUrl: rascunho.imageUrl,
    tag: rascunho.tag,
    allowHalfAndHalf: rascunho.allowHalfAndHalf,
    optionGroups: antigo?.optionGroups ?? [],
    sizes: rascunho.sizes
      .filter((s) => s.isAvailable)
      .map((s) => ({ categorySize: { id: s.categorySizeId, label: s.label }, price: s.price })),
  };

  return {
    ...payload,
    categories: semEle.map((c) =>
      c.id === rascunho.categoryId
        ? { ...c, products: posicionar(c.products, atualizado, rascunho.sortOrder) }
        : c,
    ),
  };
}

/** Põe o produto na posição que o campo "Ordem de exibição" pede. */
function posicionar(
  produtos: ProdutoDoPayload[],
  produto: ProdutoDoPayload,
  sortOrder: number,
): ProdutoDoPayload[] {
  const posicao = Math.max(0, Math.min(produtos.length, sortOrder - 1));
  return [...produtos.slice(0, posicao), produto, ...produtos.slice(posicao)];
}
