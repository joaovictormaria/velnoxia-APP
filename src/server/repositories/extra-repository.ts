import { prisma } from "../db/client";

export type ExtraInput = {
  name: string;
  price: number;
  isActive: boolean;
};

/** Onde o adicional vale: ids de categoria e de produto, como a tela mandou. */
export type AlcanceDoExtra = {
  categoryIds: string[];
  productIds: string[];
};

const COM_ALCANCE = {
  id: true,
  name: true,
  price: true,
  isActive: true,
  scopes: { select: { categoryId: true, productId: true } },
} as const;

export async function listExtras(storeId: string) {
  const extras = await prisma.extra.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
    select: COM_ALCANCE,
  });
  return extras.map(comIdsSeparados);
}

/**
 * Os adicionais que a vitrine pode oferecer, cada um dizendo onde vale.
 *
 * Quem filtra por produto é a tela, e não esta consulta: o cardápio inteiro vai
 * numa resposta só, e refiltrar no servidor a cada produto aberto seria uma ida
 * ao banco para responder algo que o navegador já tem na mão.
 */
export async function listActiveExtras(storeId: string) {
  const extras = await prisma.extra.findMany({
    where: {
      storeId,
      isActive: true,
      // Adicional sem alcance nenhum não é oferecido em lugar algum. Mandá-lo
      // assim mesmo faria a vitrine mostrar algo que o checkout depois recusa.
      scopes: { some: {} },
    },
    orderBy: { name: "asc" },
    select: COM_ALCANCE,
  });
  return extras.map(comIdsSeparados);
}

function comIdsSeparados<T extends { scopes: { categoryId: string | null; productId: string | null }[] }>(
  extra: T,
) {
  const { scopes, ...resto } = extra;
  return {
    ...resto,
    categoryIds: scopes.flatMap((s) => (s.categoryId ? [s.categoryId] : [])),
    productIds: scopes.flatMap((s) => (s.productId ? [s.productId] : [])),
  };
}

/**
 * Grava o adicional e o alcance dele de uma vez.
 *
 * O alcance é reescrito inteiro, e não comparado linha a linha: a tela manda o
 * conjunto que o dono está vendo, e apagar-e-recriar dentro da mesma transação
 * é mais fácil de conferir do que um diff que pode deixar um alcance órfão se
 * errar um caso.
 *
 * As categorias e os produtos são confirmados como sendo desta loja antes de
 * virar alcance — um id de outra lanchonete simplesmente não entra.
 */
export async function saveExtra(
  storeId: string,
  id: string | null,
  data: ExtraInput,
  alcance: AlcanceDoExtra,
) {
  return prisma.$transaction(async (tx) => {
    const [categorias, produtos] = await Promise.all([
      alcance.categoryIds.length
        ? tx.category.findMany({
            where: { storeId, id: { in: alcance.categoryIds } },
            select: { id: true },
          })
        : [],
      alcance.productIds.length
        ? tx.product.findMany({
            where: { storeId, id: { in: alcance.productIds } },
            select: { id: true },
          })
        : [],
    ]);

    let extraId = id;
    if (extraId) {
      const r = await tx.extra.updateMany({ where: { id: extraId, storeId }, data });
      if (r.count === 0) return null;
      await tx.extraScope.deleteMany({ where: { extraId } });
    } else {
      const criado = await tx.extra.create({ data: { ...data, storeId }, select: { id: true } });
      extraId = criado.id;
    }

    const linhas = [
      ...categorias.map((c) => ({ extraId: extraId!, categoryId: c.id, productId: null })),
      ...produtos.map((p) => ({ extraId: extraId!, categoryId: null, productId: p.id })),
    ];
    if (linhas.length) await tx.extraScope.createMany({ data: linhas });

    return extraId;
  });
}

export async function deleteExtra(storeId: string, id: string) {
  // O alcance vai junto pelo Cascade. O histórico dos pedidos não: o nome e o
  // preço do adicional ficam copiados no item desde a compra.
  const r = await prisma.extra.deleteMany({ where: { id, storeId } });
  return r.count > 0;
}

/**
 * Quais adicionais cada produto aceita — a pergunta que o checkout faz.
 *
 * Devolve um mapa de produto para o conjunto de adicionais permitidos, juntando
 * os que vieram pela categoria com os que foram marcados no produto. É uma
 * consulta só para o pedido inteiro: perguntar por item faria uma ida ao banco
 * por linha do carrinho.
 */
export async function extrasPermitidosPorProduto(
  storeId: string,
  produtos: { id: string; categoryId: string }[],
): Promise<Map<string, Set<string>>> {
  const porProduto = new Map<string, Set<string>>();
  if (produtos.length === 0) return porProduto;

  const alcances = await prisma.extraScope.findMany({
    where: {
      extra: { storeId, isActive: true },
      OR: [
        { productId: { in: produtos.map((p) => p.id) } },
        { categoryId: { in: [...new Set(produtos.map((p) => p.categoryId))] } },
      ],
    },
    select: { extraId: true, categoryId: true, productId: true },
  });

  for (const produto of produtos) {
    const permitidos = new Set<string>();
    for (const a of alcances) {
      if (a.productId === produto.id || a.categoryId === produto.categoryId) {
        permitidos.add(a.extraId);
      }
    }
    porProduto.set(produto.id, permitidos);
  }
  return porProduto;
}
