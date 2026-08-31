import { conferirOpcoes, type GrupoDeOpcoes } from "@/server/services/option-pricing";

/**
 * O CARRINHO DO BALCÃO — só a manipulação da lista, nada de dinheiro.
 *
 * Puro e sem banco, para o teste da montagem do pedido custar milissegundos.
 * A CONTA DO PEDIDO NÃO MORA AQUI: quem soma o carrinho é `precificarBalcaoFn`,
 * que chama a mesma `precificarItens` do checkout. A única conta neste arquivo
 * é a PRÉVIA de um item enquanto ele está sendo montado no modal — e mesmo ela
 * delega a parte difícil (a cota grátis dos grupos) para `conferirOpcoes`, que
 * é a função que o servidor usa.
 */

export type ItemDoBalcao = {
  /** Identidade da LINHA, não do produto: o mesmo produto pode entrar duas
   *  vezes com configurações diferentes e precisa ser editável em separado. */
  uid: string;
  productId: string;
  productSlug: string;
  nome: string;
  imageUrl: string | null;
  categoryId: string;
  sizeId?: string;
  sizeLabel?: string;
  optionIds: string[];
  extraIds: string[];
  quantity: number;
  note?: string;
};

/** O item como o checkout o espera. É o mesmo formato da vitrine. */
export type ItemParaCheckout = {
  productSlug: string;
  sizeId?: string;
  optionIds?: string[];
  extraIds: string[];
  quantity: number;
  note?: string;
};

/**
 * A assinatura de uma configuração.
 *
 * Duas linhas com o MESMO produto, tamanho, opções, adicionais e observação
 * são a mesma coisa pedida duas vezes — e no papel do cozinheiro elas
 * apareceriam como duas linhas idênticas, que é exatamente o que confunde
 * quem monta. Somar a quantidade é o que o atendente faria à mão.
 *
 * A observação entra na assinatura de propósito: "sem cebola" muda o prato.
 */
export function assinatura(item: Omit<ItemDoBalcao, "uid" | "quantity">): string {
  return [
    item.productSlug,
    item.sizeId ?? "",
    [...item.optionIds].sort().join(","),
    [...item.extraIds].sort().join(","),
    (item.note ?? "").trim().toLowerCase(),
  ].join("|");
}

let sequencia = 0;
/** Identidade da linha. Contador local: não precisa ser único fora da tela. */
export function novoUid(): string {
  sequencia += 1;
  return `linha-${sequencia}-${Math.random().toString(36).slice(2, 8)}`;
}

export function adicionarItem(
  itens: ItemDoBalcao[],
  novo: Omit<ItemDoBalcao, "uid">,
): ItemDoBalcao[] {
  const chave = assinatura(novo);
  const existente = itens.find((i) => assinatura(i) === chave);
  if (existente) {
    return itens.map((i) =>
      i.uid === existente.uid ? { ...i, quantity: i.quantity + novo.quantity } : i,
    );
  }
  return [...itens, { ...novo, uid: novoUid() }];
}

/**
 * Muda a quantidade de uma linha. Chegar a zero REMOVE.
 *
 * Um item com quantidade zero no carrinho é um item que o atendente acha que
 * tirou e o checkout recusaria mais tarde, no meio da finalização.
 */
export function alterarQuantidade(
  itens: ItemDoBalcao[],
  uid: string,
  delta: number,
): ItemDoBalcao[] {
  return itens.flatMap((i) => {
    if (i.uid !== uid) return [i];
    const q = i.quantity + delta;
    return q <= 0 ? [] : [{ ...i, quantity: q }];
  });
}

export function removerItem(itens: ItemDoBalcao[], uid: string): ItemDoBalcao[] {
  return itens.filter((i) => i.uid !== uid);
}

/**
 * Troca a configuração de uma linha existente.
 *
 * A linha editada pode virar igual a outra que já estava no carrinho — mudar
 * o tamanho de uma para o da outra, por exemplo. Aí as duas se juntam, pelo
 * mesmo motivo de `adicionarItem`.
 */
export function substituirItem(
  itens: ItemDoBalcao[],
  uid: string,
  novo: Omit<ItemDoBalcao, "uid">,
): ItemDoBalcao[] {
  const semAntiga = itens.filter((i) => i.uid !== uid);
  const chave = assinatura(novo);
  const gemea = semAntiga.find((i) => assinatura(i) === chave);
  if (gemea) {
    return semAntiga.map((i) =>
      i.uid === gemea.uid ? { ...i, quantity: i.quantity + novo.quantity } : i,
    );
  }
  // Mantém a POSIÇÃO original: o item não pode pular para o fim da lista só
  // porque alguém corrigiu a quantidade dele.
  return itens.map((i) => (i.uid === uid ? { ...novo, uid } : i));
}

export function paraCheckout(itens: ItemDoBalcao[]): ItemParaCheckout[] {
  return itens.map((i) => ({
    productSlug: i.productSlug,
    sizeId: i.sizeId,
    optionIds: i.optionIds.length ? i.optionIds : undefined,
    extraIds: i.extraIds,
    quantity: i.quantity,
    note: i.note?.trim() || undefined,
  }));
}

export function totalDeItens(itens: ItemDoBalcao[]): number {
  return itens.reduce((s, i) => s + i.quantity, 0);
}

/** Os adicionais que este produto oferece: os da categoria dele mais os dele. */
export function extrasDoProduto<T extends { categoryIds: string[]; productIds: string[] }>(
  extras: T[],
  produto: { id: string; categoryId: string } | null | undefined,
): T[] {
  if (!produto) return [];
  return extras.filter(
    (e) => e.productIds.includes(produto.id) || e.categoryIds.includes(produto.categoryId),
  );
}

/**
 * A PRÉVIA do preço de um item enquanto o modal está aberto.
 *
 * Prévia, e não a conta: quem fecha o valor do pedido é o servidor, sempre. Ela
 * existe para o atendente ver o preço mudar ao marcar um adicional, e por isso
 * reusa `conferirOpcoes` — a cota grátis vale para as opções mais caras
 * primeiro, e refazer essa regra à mão aqui daria um número diferente do
 * cobrado justamente nos casos em que ela importa.
 */
export function precoDoItem(
  produto: {
    basePrice: number;
    sizes: { id: string; price: number }[];
    optionGroups: GrupoDeOpcoes[];
  },
  escolhas: {
    sizeId?: string;
    optionIds: string[];
    extraIds: string[];
    quantity: number;
  },
  extras: { id: string; price: number }[],
): { unitario: number; total: number } {
  const base = escolhas.sizeId
    ? (produto.sizes.find((s) => s.id === escolhas.sizeId)?.price ?? produto.basePrice)
    : produto.basePrice;

  const opcoes = conferirOpcoes(produto.optionGroups, escolhas.optionIds);
  const totalDasOpcoes = opcoes.ok ? opcoes.total : 0;

  const totalDosExtras = escolhas.extraIds.reduce(
    (s, id) => s + (extras.find((e) => e.id === id)?.price ?? 0),
    0,
  );

  const unitario = Math.round((base + totalDasOpcoes + totalDosExtras) * 100) / 100;
  return {
    unitario,
    total: Math.round(unitario * escolhas.quantity * 100) / 100,
  };
}

/**
 * Falta responder alguma pergunta obrigatória?
 *
 * A mesma regra do servidor, feita pela mesma função: se `conferirOpcoes`
 * recusaria, o botão "Adicionar" fica desligado com o motivo à vista, em vez
 * de o atendente descobrir na hora de finalizar.
 */
export function faltaResponder(
  grupos: GrupoDeOpcoes[],
  optionIds: string[],
): string | null {
  const r = conferirOpcoes(grupos, optionIds);
  return r.ok ? null : r.error;
}
