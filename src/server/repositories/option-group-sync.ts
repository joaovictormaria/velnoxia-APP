import type { Prisma } from "@prisma/client";

export type OptionGroupInput = {
  name: string;
  minChoices: number;
  maxChoices: number;
  freeChoices: number;
  options: { name: string; price: number }[];
};

/** De quem são as perguntas: da categoria inteira, ou só deste produto. */
export type DonoDosGrupos = { categoryId: string } | { productId: string };

/**
 * Grava as perguntas de um dono conciliando pelo nome, em vez de apagar e
 * recriar.
 *
 * Recriar geraria ids novos a cada salvamento, e um pedido em aberto perderia
 * a ligação com a opção que o cliente escolheu — o pedido na cozinha ficaria
 * apontando para um "Sabor: Morango" que não existe mais.
 *
 * A mesma rotina serve a categoria e a produto porque a diferença entre os
 * dois é só de quem o grupo pendura; a reconciliação é idêntica.
 */
export async function sincronizarGrupos(
  tx: Prisma.TransactionClient,
  dono: DonoDosGrupos,
  grupos: OptionGroupInput[],
) {
  const atuais = await tx.optionGroup.findMany({
    where: dono,
    include: { options: true },
  });

  const querAgora = new Set(grupos.map((g) => g.name));
  const removidos = atuais.filter((g) => !querAgora.has(g.name)).map((g) => g.id);
  if (removidos.length) {
    await tx.optionGroup.deleteMany({ where: { id: { in: removidos } } });
  }

  for (const [i, grupo] of grupos.entries()) {
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
      : (await tx.optionGroup.create({ data: { ...dados, ...dono } })).id;

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

/** O formato que o Prisma espera para criar as perguntas junto com o dono. */
export function criarGrupos(grupos: OptionGroupInput[]) {
  return {
    create: grupos.map((g, i) => ({
      name: g.name,
      minChoices: g.minChoices,
      maxChoices: g.maxChoices,
      freeChoices: g.freeChoices,
      sortOrder: i + 1,
      options: {
        create: g.options.map((o, j) => ({ name: o.name, price: o.price, sortOrder: j + 1 })),
      },
    })),
  };
}
