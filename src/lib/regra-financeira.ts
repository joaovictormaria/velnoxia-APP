/**
 * A definição única de venda, custo e margem.
 *
 * NASCEU DE CINCO DEFINIÇÕES CONCORRENTES. Antes cada tela decidia sozinha o
 * que era uma venda: o painel somava tudo que não fosse cancelado, os
 * relatórios somavam só o concluído, o histórico somava qualquer pedido, e o
 * monitoramento não filtrava nada. Quatro números diferentes para a mesma
 * pergunta, e nenhum jeito de dizer qual estava certo.
 *
 * Aqui ficam as regras, e só as regras: funções puras, sem Prisma e sem
 * `createServerFn`. Não é organização por gosto — server function não roda em
 * vitest (o `AsyncLocalStorage` não existe no ambiente de teste), então uma
 * regra escrita dentro do handler é uma regra que ninguém consegue testar.
 * Quem fala com o banco monta os números crus; quem decide o que eles
 * significam é este arquivo.
 */

/**
 * O quanto se sabe sobre o custo de uma venda.
 *
 * Os três primeiros estados descrevem uma LINHA do pedido. `PARCIAL` só existe
 * no nível do pedido: é o rótulo de quem tem linhas apuradas e não apuradas ao
 * mesmo tempo.
 *
 * Os estados existem porque colapsá-los num só foi o defeito mais caro do
 * relatório antigo: um produto sem vínculo de estoque chegava como custo zero,
 * e a tela anunciava margem de 100%. Ausência de dado virava lucro.
 */
export type Apuracao =
  /** Tem vínculo e todo o custo é conhecido. Entra na margem. */
  | "APURADO"
  /** Não desce até o estoque. Não gera custo nem entra na receita apurada. */
  | "SEM_VINCULO"
  /** Desce até o estoque, mas algum insumo não sabe quanto custou. */
  | "SEM_CUSTO"
  /** Só no nível do pedido: parte das linhas apurou, parte não. */
  | "PARCIAL";

/** Um insumo de que a linha depende, lido da ficha congelada ou do vínculo direto. */
export type InsumoDaLinha = { inventoryItemId: string };

/** Uma linha do pedido, reduzida ao que a apuração precisa. */
export type LinhaParaApurar = {
  /** `unitPrice × quantity`. É o preço da mercadoria, sem taxa nem desconto. */
  receita: number;
  /**
   * Os itens de estoque de que esta linha depende.
   *
   * Vem de dado CONGELADO, não de inferência: `OrderItem.compositionVersionId`
   * aponta para a versão da ficha usada no dia, e o vínculo direto mora em
   * `Product.inventoryItemId`. Nenhum dos dois muda quando o cardápio muda.
   */
  insumos: InsumoDaLinha[];
  /**
   * A linha perdeu os dois sinais de vínculo porque o PRODUTO foi apagado.
   *
   * `prisma.product.delete()` é exclusão de verdade: leva `productId` a nulo e
   * apaga a ficha técnica em cascata, deixando `compositionVersionId` nulo
   * junto. Uma linha assim é diferente de uma que nunca teve vínculo — o
   * cadastro sumiu, o consumo não.
   */
  orfa?: boolean;
};

/** Um consumo do pedido, já filtrado (tipo, referência e reversão). */
export type MovimentoDoPedido = {
  inventoryItemId: string;
  /** Sinal irrelevante: o razão grava consumo negativo. */
  quantidade: number;
  /** `costAtTime` congelado. Nulo quando nunca se soube o custo. */
  custoUnitario: number | null;
};

export type ResultadoDaApuracao = {
  /** Rótulo do pedido inteiro, para a tela. */
  apuracao: Apuracao;
  /** Soma das linhas. NÃO é `Order.total`: não inclui taxa nem desconto. */
  receitaDasLinhas: number;
  /** Só as linhas APURADAS. É o denominador da margem. */
  receitaApurada: number;
  /** Custo que sustenta a receita apurada. */
  custoApurado: number;
  /** CMV do pedido: todo movimento com custo conhecido. */
  custoConhecido: number;
  /** A classificação de cada linha, na ordem em que vieram. */
  linhas: Apuracao[];
};

/**
 * Apura um pedido LINHA A LINHA.
 *
 * POR QUE NÃO SE APURA O PEDIDO INTEIRO DE UMA VEZ. Um pedido com uma pizza
 * vinculada ao estoque e um refrigerante sem vínculo não é "não apurado": a
 * pizza foi medida. Descartar o pedido todo jogaria fora custo real e afundaria
 * a cobertura sem motivo.
 *
 * O CUSTO DO INSUMO COMPARTILHADO ENTRA INTEIRO, E ISSO É DELIBERADO.
 *
 * O razão guarda o vínculo do movimento com o PEDIDO, nunca com a linha — duas
 * linhas que usam o mesmo molho geram UM movimento, com as quantidades já
 * somadas na escrita. Quando uma dessas linhas apura e a outra não, é
 * impossível saber quanto daquele molho pertencia a cada uma.
 *
 * Diante disso a escolha é conservadora: o custo do item entra INTEIRO desde
 * que ao menos uma linha apurada dependa dele. O CMV fica maior do que o exato
 * e a margem menor do que a real — o erro aponta para o lado seguro. Dividir o
 * movimento por preço ou quantidade seria inventar um número que o banco não
 * tem, e um número inventado a favor da margem é o que esta regra existe para
 * impedir.
 *
 * Um item usado SÓ por linhas não apuradas não gera custo: aquela receita ficou
 * de fora, e o custo dela tem de ficar junto.
 */
export function apurarPedido(entrada: {
  linhas: LinhaParaApurar[];
  movimentos: MovimentoDoPedido[];
}): ResultadoDaApuracao {
  const { linhas, movimentos } = entrada;

  /*
   * Consolida o razão por item: quanto custou e se o custo é conhecido.
   *
   * Um único movimento sem `costAtTime` contamina o item inteiro. Somar só a
   * parte conhecida e apresentar como total seria pior do que admitir a
   * ignorância: o número pareceria completo e não estaria.
   */
  const porItem = new Map<string, { custo: number; conhecido: boolean }>();
  for (const m of movimentos) {
    const atual = porItem.get(m.inventoryItemId) ?? { custo: 0, conhecido: true };
    if (m.custoUnitario === null) {
      atual.conhecido = false;
    } else {
      atual.custo += Math.abs(m.quantidade) * m.custoUnitario;
    }
    porItem.set(m.inventoryItemId, atual);
  }

  /*
   * A LINHA ÓRFÃ SE RECUPERA PELO RAZÃO, MAS SÓ QUANDO ELA É ÚNICA.
   *
   * Apagar um produto do cardápio destrói os dois sinais de vínculo das vendas
   * passadas dele. O que sobrevive é o consumo: se o pedido tem movimento
   * `ORDER` com custo conhecido, alguma linha dele gastou estoque.
   *
   * Com UMA órfã, essa prova basta — só ela pode ter gastado. Com duas, não há
   * como saber qual, e escolher por preço, quantidade ou posição seria inventar
   * a resposta. Então nenhuma é reconhecida: o pedido perde cobertura, e é esse
   * o preço aceito. É melhor perder cobertura do que fabricar margem.
   *
   * O custo precisa ser MAIOR QUE ZERO, e não apenas conhecido: reconhecer uma
   * receita contra custo zero é a margem de 100% voltando por outro caminho.
   */
  const orfas = linhas.filter((l) => l.insumos.length === 0 && l.orfa).length;
  const custoProvado = [...porItem.values()].some((d) => d.conhecido && d.custo > 0);
  const reconheceOrfa = orfas === 1 && custoProvado;

  const classificacoes: Apuracao[] = linhas.map((linha) => {
    if (linha.insumos.length === 0) {
      return linha.orfa && reconheceOrfa ? "APURADO" : "SEM_VINCULO";
    }
    const tudoConhecido = linha.insumos.every((i) => {
      const item = porItem.get(i.inventoryItemId);
      // Insumo sem movimento nenhum não é custo zero — é custo não apurado.
      return item !== undefined && item.conhecido;
    });
    return tudoConhecido ? "APURADO" : "SEM_CUSTO";
  });

  const itensApurados = new Set<string>();
  let receitaDasLinhas = 0;
  let receitaApurada = 0;
  linhas.forEach((linha, i) => {
    receitaDasLinhas += linha.receita;
    if (classificacoes[i] !== "APURADO") return;
    receitaApurada += linha.receita;
    if (linha.insumos.length === 0) {
      /*
       * Órfã reconhecida: sabe-se QUE ela gastou, não O QUE ela gastou. Todo o
       * custo conhecido do pedido responde por ela — a leitura conservadora, e
       * a única que não exige eleger um item arbitrariamente. O erro aponta
       * para CMV maior e margem menor, que é o lado seguro.
       */
      for (const [itemId, dados] of porItem) {
        if (dados.conhecido) itensApurados.add(itemId);
      }
      return;
    }
    for (const insumo of linha.insumos) itensApurados.add(insumo.inventoryItemId);
  });

  let custoApurado = 0;
  let custoConhecido = 0;
  for (const [itemId, dados] of porItem) {
    if (!dados.conhecido) continue;
    custoConhecido += dados.custo;
    if (itensApurados.has(itemId)) custoApurado += dados.custo;
  }

  return {
    apuracao: rotuloDoPedido(classificacoes),
    receitaDasLinhas,
    receitaApurada,
    custoApurado,
    custoConhecido,
    linhas: classificacoes,
  };
}

/**
 * O rótulo do pedido, derivado das linhas.
 *
 * `PARCIAL` é o caso que mais importa mostrar: diz que o número apresentado é
 * verdadeiro sobre uma parte da venda, e não sobre ela toda.
 */
function rotuloDoPedido(linhas: Apuracao[]): Apuracao {
  if (linhas.length === 0) return "SEM_VINCULO";
  const apuradas = linhas.filter((l) => l === "APURADO").length;
  if (apuradas === linhas.length) return "APURADO";
  if (apuradas > 0) return "PARCIAL";
  // Nenhuma apurou. Falta de vínculo vence falta de custo: a tela precisa
  // dizer o que o dono resolve primeiro, e ligar o produto ao estoque vem
  // antes de precificar o insumo.
  return linhas.some((l) => l === "SEM_VINCULO") ? "SEM_VINCULO" : "SEM_CUSTO";
}

/**
 * Receita de um pedido, já líquida de estorno.
 *
 * `Order.total` JÁ É `subtotal + deliveryFee − discount`. Subtrair o desconto
 * de novo aqui foi o erro que quase entrou: o desconto sairia duas vezes e a
 * receita ficaria menor que o que o cliente pagou.
 */
export function receitaDoPedido(pedido: {
  total: number;
  refund?: number | null;
}): number {
  return pedido.total - (pedido.refund ?? 0);
}

/**
 * Margem sobre a fatia apurada, ou `null` quando não há o que medir.
 *
 * O denominador é a receita APURADA, nunca a total: dividir o lucro conhecido
 * pela receita inteira daria uma margem diluída por vendas cujo custo ninguém
 * mediu, e o número pioraria conforme o cadastro ficasse incompleto.
 */
export function margemApurada(entrada: {
  receitaApurada: number;
  custoApurado: number;
}): number | null {
  if (entrada.receitaApurada === 0) return null;
  const lucro = entrada.receitaApurada - entrada.custoApurado;
  return (lucro / entrada.receitaApurada) * 100;
}

/**
 * Que fatia do faturamento tem custo conhecido, em porcentagem.
 *
 * Este número acompanha a margem em toda tela que a exibe. Uma margem de 34%
 * apurada sobre 12% do faturamento e outra apurada sobre 97% são afirmações
 * muito diferentes, e sem a cobertura as duas aparecem idênticas.
 */
export function coberturaDeApuracao(entrada: {
  receitaApurada: number;
  receitaTotal: number;
}): number {
  if (entrada.receitaTotal === 0) return 0;
  return (entrada.receitaApurada / entrada.receitaTotal) * 100;
}

/**
 * Ticket médio: receita por pedido.
 *
 * Existe como função por causa do defeito que substitui. O campo chamado
 * `averageOrderValue` era preenchido com `averageCostPerOrder` — custo médio,
 * exibido sob o rótulo "Ticket médio". O divisor é a contagem de PEDIDOS
 * distintos, não de linhas nem de movimentos.
 */
export function ticketMedio(entrada: { receita: number; pedidos: number }): number {
  if (entrada.pedidos === 0) return 0;
  return entrada.receita / entrada.pedidos;
}

/**
 * A data em que a venda foi reconhecida.
 *
 * É a transição para COMPLETED, e não `Order.createdAt`: um pedido feito às
 * 23h50 e concluído às 00h10 pertence ao dia seguinte, e agrupar pela criação
 * jogaria a receita no dia errado todo fim de expediente.
 *
 * O fallback existe só para dados legados. Pedidos concluídos antes de o
 * histórico de status passar a ser gravado não têm a linha COMPLETED; descartá-
 * los apagaria vendas reais do passado, então esses — e apenas esses — voltam a
 * usar a data de criação.
 */
export function dataDeCompetencia(pedido: {
  concluidoEm?: Date | null;
  criadoEm: Date;
}): Date {
  return pedido.concluidoEm ?? pedido.criadoEm;
}
