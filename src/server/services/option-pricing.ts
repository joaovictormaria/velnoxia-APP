/**
 * Regras dos grupos de opções: o que é obrigatório, o que cabe e o que custa.
 *
 * Fora da service de pedido para poder ser exercida sem banco — é a conta que
 * decide quanto o cliente paga, e uma regra dessas precisa de teste barato.
 */

export type GrupoDeOpcoes = {
  id: string;
  name: string;
  minChoices: number;
  maxChoices: number;
  freeChoices: number;
  options: { id: string; name: string; price: number }[];
};

export type EscolhaCobrada = {
  optionItemId: string;
  groupName: string;
  name: string;
  /** O que entra na conta: zero quando a escolha caiu na cota grátis. */
  price: number;
};

export type ResultadoDasOpcoes =
  | { ok: true; escolhas: EscolhaCobrada[]; total: number }
  | { ok: false; error: string };

/**
 * Confere as escolhas contra os grupos e devolve o que cobrar.
 *
 * A cota grátis vale para as opções **mais caras** primeiro. É o que o cliente
 * espera de "3 complementos grátis": ele não aceitaria que a casa desse de
 * graça os três mais baratos e cobrasse o morango.
 */
export function conferirOpcoes(
  grupos: GrupoDeOpcoes[],
  escolhidos: string[],
): ResultadoDasOpcoes {
  const pedidos = new Set(escolhidos);
  const escolhas: EscolhaCobrada[] = [];
  let total = 0;

  const conhecidos = new Set(grupos.flatMap((g) => g.options.map((o) => o.id)));
  for (const id of pedidos) {
    if (!conhecidos.has(id)) {
      return { ok: false, error: "Uma das opções escolhidas não está mais disponível." };
    }
  }

  for (const grupo of grupos) {
    const doGrupo = grupo.options.filter((o) => pedidos.has(o.id));

    if (doGrupo.length < grupo.minChoices) {
      return {
        ok: false,
        error:
          grupo.minChoices === 1
            ? `Escolha uma opção em "${grupo.name}".`
            : `Escolha ao menos ${grupo.minChoices} opções em "${grupo.name}".`,
      };
    }
    if (doGrupo.length > grupo.maxChoices) {
      return {
        ok: false,
        error:
          grupo.maxChoices === 1
            ? `Só é possível escolher uma opção em "${grupo.name}".`
            : `Escolha no máximo ${grupo.maxChoices} opções em "${grupo.name}".`,
      };
    }

    // Do mais caro para o mais barato: as primeiras posições é que ganham a
    // cota grátis.
    const porPreco = [...doGrupo].sort((a, b) => b.price - a.price);
    porPreco.forEach((opcao, i) => {
      const gratis = i < grupo.freeChoices;
      const price = gratis ? 0 : opcao.price;
      total += price;
      escolhas.push({
        optionItemId: opcao.id,
        groupName: grupo.name,
        name: opcao.name,
        price,
      });
    });
  }

  return { ok: true, escolhas, total: Math.round(total * 100) / 100 };
}
