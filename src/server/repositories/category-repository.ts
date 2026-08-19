import type { CategoryKind } from "@prisma/client";
import { prisma } from "../db/client";

export type OptionGroupInput = {
  name: string;
  minChoices: number;
  maxChoices: number;
  freeChoices: number;
  options: { name: string; price: number }[];
};

export type CategoryInput = {
  /** Nomes dos tamanhos, na ordem. Lista vazia = categoria sem tamanhos. */
  sizes?: string[];
  optionGroups?: OptionGroupInput[];
  name: string;
  slug: string;
  badge?: string | null;
  headline?: string | null;
  subhead?: string | null;
  icon?: string | null;
  imageUrl?: string | null;
  kind: CategoryKind;
  sortOrder: number;
  isActive: boolean;
};

export function listCategories(storeId: string) {
  return prisma.category.findMany({
    where: { storeId },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { products: true } },
      sizes: { orderBy: { sortOrder: "asc" } },
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
}

export function listActiveCategories(storeId: string) {
  return prisma.category.findMany({
    where: { storeId, isActive: true },
    orderBy: { sortOrder: "asc" },
    // Os tamanhos vêm junto porque o formulário de produto precisa deles para
    // saber o que oferecer: é a categoria que decide se existe "P/M/G".
    include: { sizes: { orderBy: { sortOrder: "asc" } } },
  });
}

export function getCategoryById(storeId: string, id: string) {
  return prisma.category.findFirst({ where: { id, storeId } });
}

export function createCategory(
  storeId: string,
  { sizes, optionGroups, ...data }: CategoryInput,
) {
  return prisma.category.create({
    data: {
      ...data,
      storeId,
      sizes: { create: (sizes ?? []).map((label, i) => ({ label, sortOrder: i + 1 })) },
      optionGroups: {
        create: (optionGroups ?? []).map((g, i) => ({
          name: g.name,
          minChoices: g.minChoices,
          maxChoices: g.maxChoices,
          freeChoices: g.freeChoices,
          sortOrder: i + 1,
          options: {
            create: g.options.map((o, j) => ({ name: o.name, price: o.price, sortOrder: j + 1 })),
          },
        })),
      },
    },
  });
}

/**
 * storeId is part of the filter so an id from another store matches nothing.
 *
 * Os tamanhos são conciliados em vez de recriados: apagar e refazer geraria
 * ids novos, e os preços dos produtos apontam para eles — a loja perderia toda
 * a tabela de preços a cada vez que o dono salvasse a categoria.
 */
export async function updateCategory(
  storeId: string,
  id: string,
  { sizes, optionGroups, ...data }: Partial<CategoryInput>,
) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.category.findFirst({ where: { id, storeId }, select: { id: true } });
    if (!owned) throw new Error("NOT_FOUND");

    if (sizes) {
      const atuais = await tx.categorySize.findMany({ where: { categoryId: id } });
      const querAgora = new Set(sizes);

      // Some quem saiu — leva junto os preços que dependiam dele, que sem o
      // tamanho não teriam como ser mostrados.
      const removidos = atuais.filter((s) => !querAgora.has(s.label)).map((s) => s.id);
      if (removidos.length) {
        await tx.categorySize.deleteMany({ where: { id: { in: removidos } } });
      }

      for (const [i, label] of sizes.entries()) {
        const existente = atuais.find((s) => s.label === label);
        if (existente) {
          await tx.categorySize.update({ where: { id: existente.id }, data: { sortOrder: i + 1 } });
        } else {
          await tx.categorySize.create({ data: { categoryId: id, label, sortOrder: i + 1 } });
        }
      }
    }

    if (optionGroups) {
      /**
       * Conciliado pelo nome, como os tamanhos: apagar e recriar geraria ids
       * novos a cada salvamento, e um pedido em aberto perderia a ligação com
       * a opção que o cliente escolheu.
       */
      const atuais = await tx.optionGroup.findMany({
        where: { categoryId: id },
        include: { options: true },
      });
      const querAgora = new Set(optionGroups.map((g) => g.name));

      const removidos = atuais.filter((g) => !querAgora.has(g.name)).map((g) => g.id);
      if (removidos.length) {
        await tx.optionGroup.deleteMany({ where: { id: { in: removidos } } });
      }

      for (const [i, grupo] of optionGroups.entries()) {
        const existente = atuais.find((g) => g.name === grupo.name);
        const dados = {
          name: grupo.name,
          minChoices: grupo.minChoices,
          maxChoices: grupo.maxChoices,
          freeChoices: grupo.freeChoices,
          sortOrder: i + 1,
        };

        const groupId = existente
          ? (await tx.optionGroup.update({ where: { id: existente.id }, data: dados })).id
          : (await tx.optionGroup.create({ data: { ...dados, categoryId: id } })).id;

        const opcoesAtuais = existente?.options ?? [];
        const querOpcoes = new Set(grupo.options.map((o) => o.name));
        const opcoesRemovidas = opcoesAtuais
          .filter((o) => !querOpcoes.has(o.name))
          .map((o) => o.id);
        if (opcoesRemovidas.length) {
          await tx.optionItem.deleteMany({ where: { id: { in: opcoesRemovidas } } });
        }

        for (const [j, opcao] of grupo.options.entries()) {
          const jaTem = opcoesAtuais.find((o) => o.name === opcao.name);
          if (jaTem) {
            await tx.optionItem.update({
              where: { id: jaTem.id },
              data: { price: opcao.price, sortOrder: j + 1 },
            });
          } else {
            await tx.optionItem.create({
              data: { groupId, name: opcao.name, price: opcao.price, sortOrder: j + 1 },
            });
          }
        }
      }
    }

    return tx.category.update({ where: { id }, data });
  });
}

export function deleteCategory(storeId: string, id: string) {
  return prisma.category.delete({ where: { id, storeId } });
}

export function countProductsInCategory(storeId: string, id: string) {
  return prisma.product.count({ where: { categoryId: id, storeId } });
}
