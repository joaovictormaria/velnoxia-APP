import { prisma } from "@/server/db/client";
import { Decimal } from "@prisma/client/runtime/client";
import {
  apurarPedido,
  coberturaDeApuracao,
  dataDeCompetencia,
  margemApurada,
  receitaDoPedido,
  ticketMedio,
} from "@/lib/regra-financeira";

/**
 * Custo de mercadoria vendida, margem e rentabilidade.
 *
 * DUAS CORREÇÕES ESTRUTURAIS
 *
 * 1. Custo histórico vem de `movement.costAtTime`, não de `item.cost`.
 *
 *    O motor da Fase 1 congela em cada movimento o custo do insumo no
 *    instante da baixa, justamente para que o passado pare quieto. Este
 *    serviço ignorava isso e multiplicava pelo custo ATUAL do item: subir o
 *    preço do tomate reescrevia o custo de tudo que já tinha sido vendido, e
 *    o relatório de março mudava em abril sem nada ter acontecido em março.
 *
 *    `costAtTime` é opcional — movimentos anteriores ao campo não o têm.
 *    Nesses, cai-se em `item.cost`, que é a melhor aproximação disponível.
 *
 * 2. `new Decimal(0)`, não `(0 as Decimal)`.
 *
 *    O acumulador nascia como o número 0 disfarçado de Decimal por uma
 *    asserção de tipo. Números não têm `.add`, então a primeira linha com
 *    custo derrubava a função inteira com TypeError. Sob `@ts-nocheck` o
 *    compilador não tinha como avisar. O `@ts-nocheck` saiu junto.
 */
export class InventoryCostService {
  /**
   * Custo unitário que vale para um movimento: o congelado, se houver.
   *
   * Só existe uma função para isto porque os dois relatórios precisam
   * responder à mesma pergunta, e antes cada um respondia do seu jeito.
   */
  private static custoDoMovimento(movimento: {
    costAtTime: Decimal | null;
    item: { cost: Decimal | null };
  }): Decimal | null {
    return movimento.costAtTime ?? movimento.item.cost ?? null;
  }

  /**
   * Os pedidos que contam como venda no período — com receita, custo e apuração.
   *
   * O CARREGADOR ÚNICO. Antes cada relatório montava a sua própria noção de
   * venda: um filtrava COMPLETED, outro não filtrava nada, e o custo vinha de
   * uma consulta que não sabia a que pedido pertencia. Três respostas para a
   * mesma pergunta. Aqui a pergunta é feita uma vez.
   *
   * O RECORTE É PELA DATA DE CONCLUSÃO, não pela de criação. Um pedido feito às
   * 23h50 e concluído às 00h10 é receita do dia seguinte, e agrupar pela criação
   * jogaria dinheiro no dia errado em todo fim de expediente. O segundo ramo do
   * `OR` é o fallback para dados legados: pedidos concluídos antes de o
   * histórico de status existir não têm a linha COMPLETED, e descartá-los
   * apagaria vendas reais do passado.
   *
   * O CUSTO VEM EM UMA SEGUNDA CONSULTA, não num `include`. É o que impede o
   * N+1 que existia em `getProductProfitability`, onde o custo de cada pedido
   * era buscado dentro do laço.
   *
   * Os quatro filtros dos movimentos são a regra de CMV inteira:
   *   type=CONSUMPTION       saída de verdade, não reserva
   *   referenceType=ORDER    exclui a PRODUÇÃO — sem isto o sistema soma o
   *                          custo do ingrediente E o do preparado feito com
   *                          ele, cobrando o mesmo dinheiro duas vezes
   *   reference IN (válidos) casa a janela do custo com a da receita
   *   reversedBy IS NULL     exclui o que virou perda por cancelamento
   */
  private static async carregarPedidosValidos(
    storeId: string,
    inicio: Date,
    fim: Date,
  ) {
    const pedidos = await prisma.order.findMany({
      where: {
        storeId,
        status: "COMPLETED",
        deletedAt: null,
        OR: [
          {
            statusHistory: {
              some: { status: "COMPLETED", createdAt: { gte: inicio, lte: fim } },
            },
          },
          {
            statusHistory: { none: { status: "COMPLETED" } },
            createdAt: { gte: inicio, lte: fim },
          },
        ],
      },
      select: {
        id: true,
        total: true,
        refund: true,
        createdAt: true,
        // Não muda regra nenhuma: a venda continua reconhecida. É só o aviso
        // de que a baixa de estoque daquele pedido não fechou.
        inventoryInconsistentAt: true,
        statusHistory: {
          where: { status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
        items: {
          select: {
            productNameSnapshot: true,
            productId: true,
            quantity: true,
            unitPrice: true,
            compositionVersionId: true,
            // A ficha da versão usada NAQUELE dia, e não a ativa hoje.
            compositionVersion: {
              select: { items: { select: { inventoryItemId: true } } },
            },
            product: { select: { name: true, inventoryItemId: true } },
          },
        },
      },
    });

    if (pedidos.length === 0) return [];

    const movimentos = await prisma.inventoryMovement.findMany({
      where: {
        storeId,
        type: "CONSUMPTION",
        referenceType: "ORDER",
        reference: { in: pedidos.map((p) => p.id) },
        reversedBy: { is: null },
      },
      select: {
        reference: true,
        itemId: true,
        quantity: true,
        costAtTime: true,
        createdAt: true,
        item: { select: { name: true, cost: true } },
      },
    });

    const porPedido = new Map<string, typeof movimentos>();
    for (const m of movimentos) {
      if (!m.reference) continue;
      const lista = porPedido.get(m.reference);
      if (lista) lista.push(m);
      else porPedido.set(m.reference, [m]);
    }

    return pedidos.map((pedido) => {
      const movs = porPedido.get(pedido.id) ?? [];

      /*
       * Os insumos de CADA LINHA, lidos de dado congelado.
       *
       * `compositionVersion.items` é a ficha da versão usada NAQUELE dia, presa
       * ao OrderItem na reserva — mudar a receita hoje não reescreve o pedido de
       * ontem. Sem ficha, vale o vínculo direto do produto. Sem nenhum dos dois,
       * a linha não desce até o estoque, e é isso que a classifica.
       *
       * O produto pode ter sido apagado (`onDelete: SetNull`): aí a linha conta
       * como sem vínculo, que é a leitura conservadora.
       */
      const linhas = pedido.items.map((item) => {
        const daFicha = item.compositionVersion?.items ?? [];
        const insumos = daFicha.length
          ? daFicha.map((i) => ({ inventoryItemId: i.inventoryItemId }))
          : item.product?.inventoryItemId
            ? [{ inventoryItemId: item.product.inventoryItemId }]
            : [];
        /*
         * ÓRFÃ é a linha que perdeu os DOIS sinais de vínculo de uma vez.
         *
         * Apagar um produto do cardápio é exclusão de verdade: `productId`
         * vira nulo e a ficha técnica cai em cascata, levando junto o
         * `compositionVersionId`. Uma linha assim não é igual a uma que nunca
         * desceu ao estoque — aquela ainda tem o produto no cadastro dizendo
         * que não tem vínculo. Quem decide o que fazer com a órfã é
         * `apurarPedido`, olhando o razão.
         */
        return {
          receita: Number(item.unitPrice) * item.quantity,
          insumos,
          orfa: item.productId === null && item.compositionVersionId === null,
        };
      });

      const apuracao = apurarPedido({
        linhas,
        movimentos: movs.map((m) => {
          const custo = this.custoDoMovimento(m);
          return {
            inventoryItemId: m.itemId,
            quantidade: Number(m.quantity),
            custoUnitario: custo === null ? null : custo.toNumber(),
          };
        }),
      });

      return {
        id: pedido.id,
        competencia: dataDeCompetencia({
          concluidoEm: pedido.statusHistory[0]?.createdAt ?? null,
          criadoEm: pedido.createdAt,
        }),
        /*
         * A receita do PEDIDO é `Order.total` — já líquida de desconto e com a
         * taxa de entrega dentro. É o dinheiro que entrou.
         *
         * `receitaDasLinhas` é outra coisa: a soma das mercadorias, sem taxa nem
         * desconto. É ela que serve de base à cobertura, porque a receita
         * apurada também sai das linhas. Comparar coisas de bases diferentes
         * faria um pedido inteiramente apurado com taxa de entrega aparecer com
         * cobertura abaixo de 100%.
         */
        receita: receitaDoPedido({
          total: Number(pedido.total),
          refund: pedido.refund === null ? null : Number(pedido.refund),
        }),
        estoqueInconsistente: pedido.inventoryInconsistentAt !== null,
        receitaDasLinhas: apuracao.receitaDasLinhas,
        receitaApurada: apuracao.receitaApurada,
        custoApurado: apuracao.custoApurado,
        custoConhecido: apuracao.custoConhecido,
        apuracao: apuracao.apuracao,
        linhasApuradas: apuracao.linhas,
        itens: pedido.items,
        movimentos: movs,
      };
    });
  }

  /**
   * Calcular custo total de um pedido baseado em consumos
   * (COGS - Cost of Goods Sold)
   */
  /**
   * Os pedidos reconhecidos como venda no período, para quem monta séries.
   *
   * Existe para que a linha do tempo financeira não reimplemente o recorte:
   * gráfico e cards têm de discordar por dado, nunca por regra.
   */
  static async pedidosReconhecidos(storeId: string, inicio: Date, fim: Date) {
    return this.carregarPedidosValidos(storeId, inicio, fim);
  }

  /**
   * Os pedidos do período cuja baixa de estoque não fechou.
   *
   * PASSA PELO MESMO CARREGADOR DOS KPIs, e não por uma consulta paralela.
   *
   * A primeira versão montava o próprio recorte — sem filtro de status e com a
   * janela sobre `createdAt` — e o resultado era um cabeçalho dizendo "1
   * pedido" com três linhas embaixo. `inventoryInconsistentAt` é carimbado na
   * reserva e no preparo, muito antes de o pedido virar venda: um pedido em
   * PREPARING entrava na lista sem entrar na contagem.
   *
   * Reusando `carregarPedidosValidos`, o universo é IDÊNTICO por construção —
   * mesmo status, mesma janela de competência, mesmo recorte de loja. Não
   * existem dois filtros para divergirem no dia em que um deles mudar.
   *
   * A RECEITA VEM DO MESMO LUGAR: `receitaDoPedido()`, já líquida de estorno.
   * A tela mostrava `Order.total` bruto embaixo de um total líquido, e as duas
   * colunas não fechavam quando havia refund.
   */
  static async pedidosComEstoqueInconsistente(storeId: string, dias: number) {
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - dias);

    const inconsistentes = (
      await this.carregarPedidosValidos(storeId, inicio, fim)
    ).filter((p) => p.estoqueInconsistente);
    if (inconsistentes.length === 0) return [];

    /*
     * Segunda consulta só para o que a TELA mostra. O carregador não traz
     * número nem nome do cliente porque nenhum cálculo financeiro depende
     * deles — e engordar o select dos KPIs por causa de um bloco de aviso
     * seria pagar em toda leitura do dashboard.
     */
    const detalhes = await prisma.order.findMany({
      where: { id: { in: inconsistentes.map((p) => p.id) } },
      select: {
        id: true,
        number: true,
        customerName: true,
        inventoryInconsistentAt: true,
        inventoryInconsistency: true,
      },
    });

    const receitaPorPedido = new Map(inconsistentes.map((p) => [p.id, p.receita]));
    return detalhes
      .map((d) => ({ ...d, receita: receitaPorPedido.get(d.id) ?? 0 }))
      .sort(
        (a, b) =>
          (b.inventoryInconsistentAt?.getTime() ?? 0) -
          (a.inventoryInconsistentAt?.getTime() ?? 0),
      );
  }

  static async calculateOrderCost(
    storeId: string,
    orderId: string
  ): Promise<{
    orderId: string;
    totalItems: number;
    totalCost: Decimal;
    costBreakdown: Array<{
      itemName: string;
      quantity: Decimal;
      unitCost: Decimal;
      totalCost: Decimal;
    }>;
  }> {
    // Pegar todos os consumos do pedido
    const consumptions = await prisma.inventoryMovement.findMany({
      where: {
        storeId,
        reference: orderId,
        type: "CONSUMPTION",
        /*
         * Os dois filtros que faltavam. `referenceType` separa a venda da
         * PRODUÇÃO — sem ele um `reference` de corrida de produção poderia
         * entrar como custo de pedido. `reversedBy` exclui o consumo que
         * virou perda por cancelamento: o pedido não foi venda, e o custo
         * dele não pode pesar no CMV.
         */
        referenceType: "ORDER",
        reversedBy: { is: null },
      },
      include: {
        item: {
          select: {
            name: true,
            cost: true,
          },
        },
      },
    });

    const breakdown: Array<{
      itemName: string;
      quantity: Decimal;
      unitCost: Decimal;
      totalCost: Decimal;
    }> = [];

    let totalCost = new Decimal(0);

    for (const consumption of consumptions) {
      const itemCost = this.custoDoMovimento(consumption);
      if (!itemCost) {
        continue; // Sem custo conhecido: fica fora, não entra como zero.
      }

      const quantity = consumption.quantity.abs(); // CONSUMPTION é negativo
      const lineCost = quantity.mul(itemCost);

      breakdown.push({
        itemName: consumption.item.name,
        quantity,
        unitCost: itemCost,
        totalCost: lineCost,
      });

      totalCost = totalCost.add(lineCost);
    }

    return {
      orderId,
      totalItems: consumptions.length,
      totalCost,
      costBreakdown: breakdown,
    };
  }

  /**
   * RelatÃ³rio de custos por perÃ­odo
   */
  static async getCostReport(
    storeId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    period: {
      startDate: Date;
      endDate: Date;
    };
    summary: {
      totalOrders: number;
      totalCost: Decimal;
      averageCostPerOrder: Decimal;
      costByType: Record<string, { count: number; total: Decimal }>;
    };
    topExpensiveItems: Array<{
      itemName: string;
      totalCost: Decimal;
      usageCount: number;
      averageCost: Decimal;
    }>;
    orders: Array<{
      orderId: string;
      createdAt: Date;
      cost: Decimal;
    }>;
  }> {
    /*
     * O RELATÓRIO PARTE DOS PEDIDOS, NÃO DOS MOVIMENTOS.
     *
     * Antes ele varria todo `CONSUMPTION` do período e agrupava por
     * `movement.reference`. Isso tinha três consequências, todas silenciosas:
     * cada corrida de PRODUÇÃO virava uma linha de "pedido"; o custo do
     * ingrediente e o do preparado feito com ele eram somados juntos, cobrando
     * o mesmo dinheiro duas vezes; e `totalOrders` contava grupos de
     * referência, não pedidos — o que distorcia o custo médio.
     *
     * Partindo dos pedidos válidos, os três problemas somem de uma vez: o que
     * não é venda não entra, e um pedido é um pedido.
     */
    const pedidos = await this.carregarPedidosValidos(storeId, startDate, endDate);

    const costByItem: Record<
      string,
      { count: number; total: Decimal; usage: number }
    > = {};
    const costByType: Record<string, { count: number; total: Decimal }> = {};

    let totalCost = new Decimal(0);

    for (const pedido of pedidos) {
      totalCost = totalCost.add(new Decimal(pedido.custoConhecido));

      for (const movimento of pedido.movimentos) {
        const itemCost = this.custoDoMovimento(movimento);
        if (!itemCost) continue;

        const lineCost = movimento.quantity.abs().mul(itemCost);
        const nome = movimento.item.name;

        if (!costByItem[nome]) {
          costByItem[nome] = { count: 0, total: new Decimal(0), usage: 0 };
        }
        costByItem[nome].count += 1;
        costByItem[nome].usage += 1;
        costByItem[nome].total = costByItem[nome].total.add(lineCost);

        /*
         * Só existe uma chave aqui — CONSUMPTION — porque o carregador já
         * filtrou por tipo. O campo permanece pela forma do retorno, que a
         * server function `getCostReport` expõe.
         */
        if (!costByType.CONSUMPTION) {
          costByType.CONSUMPTION = { count: 0, total: new Decimal(0) };
        }
        costByType.CONSUMPTION.count += 1;
        costByType.CONSUMPTION.total = costByType.CONSUMPTION.total.add(lineCost);
      }
    }

    const totalOrders = pedidos.length;
    const averageCostPerOrder =
      totalOrders > 0 ? totalCost.dividedBy(totalOrders) : new Decimal(0);

    const topExpensive = Object.entries(costByItem)
      .map(([name, data]) => ({
        itemName: name,
        totalCost: data.total,
        usageCount: data.usage,
        averageCost: data.total.dividedBy(data.usage),
      }))
      .sort((a, b) => b.totalCost.toNumber() - a.totalCost.toNumber())
      .slice(0, 10);

    return {
      period: { startDate, endDate },
      summary: {
        totalOrders,
        totalCost,
        averageCostPerOrder,
        costByType,
      },
      topExpensiveItems: topExpensive,
      // A data é a de COMPETÊNCIA — quando a venda foi reconhecida.
      orders: pedidos.map((p) => ({
        orderId: p.id,
        createdAt: p.competencia,
        cost: new Decimal(p.custoConhecido),
      })),
    };
  }

  /**
   * Calcular margem de lucro
   * Precisa de: preÃ§o de venda do pedido
   */
  static calculateMargin(
    sellingPrice: Decimal,
    costPrice: Decimal
  ): {
    margin: Decimal;
    marginPercent: Decimal;
    profitAmount: Decimal;
  } {
    const profitAmount = sellingPrice.minus(costPrice);
    const marginPercent = sellingPrice.isZero()
      ? new Decimal(0)
      : profitAmount.dividedBy(sellingPrice).times(100);

    return {
      margin: profitAmount,
      marginPercent,
      profitAmount,
    };
  }

  /**
   * AnÃ¡lise de rentabilidade por produto
   * Baseado em histÃ³rico de pedidos
   */
  static async getProductProfitability(
    storeId: string,
    days: number = 30
  ): Promise<
    Array<{
      productName: string;
      totalOrders: number;
      totalSalesValue: Decimal;
      totalCost: Decimal;
      totalProfit: Decimal;
      profitPercent: Decimal;
      averageOrderValue: Decimal;
      averageCost: Decimal;
      averageProfit: Decimal;
    }>
  > {
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - days);

    /*
     * SÓ OS PEDIDOS COM CUSTO INTEGRALMENTE APURADO ENTRAM AQUI.
     *
     * Um pedido cujo produto nunca foi ligado ao estoque tem custo zero, e
     * incluí-lo faria o produto aparecer nesta lista com margem de 100% —
     * liderando o ranking de rentabilidade justamente por não ter sido medido.
     * Um produto sem vínculo não é lucrativo: é desconhecido, e desaparecer da
     * lista diz isso melhor do que um número inventado.
     *
     * Quantos pedidos ficaram de fora e por quê é o que `getFinancialKPIs`
     * devolve em `pedidosSemVinculo` e `pedidosSemCusto`.
     */
    /*
     * AQUI O RECORTE CONTINUA SENDO O PEDIDO INTEIRO, e não a linha.
     *
     * O custo por produto já é uma aproximação — o rateio por preço de venda
     * logo abaixo. Aceitar pedidos PARCIAIS obrigaria a ratear o custo entre
     * linhas apuradas e não apuradas, que é exatamente a divisão que o razão
     * não permite fazer. Então só entram os pedidos em que todas as linhas
     * foram medidas.
     */
    const apurados = (await this.carregarPedidosValidos(storeId, inicio, fim)).filter(
      (p) => p.apuracao === "APURADO",
    );

    const profitByProduct: Record<
      string,
      {
        productName: string;
        orders: number;
        totalSales: Decimal;
        totalCost: Decimal;
      }
    > = {};

    for (const pedido of apurados) {
      /*
       * O custo do pedido é apurado UMA VEZ, aqui fora.
       *
       * Antes esta chamada ficava dentro do laço de itens, somando o custo do
       * pedido inteiro a cada linha: um pedido com três produtos contava o
       * custo três vezes, e a margem saía negativa sem que nada estivesse
       * errado na cozinha.
       */
      const custoDoPedidoInteiro = new Decimal(pedido.custoApurado);

      /*
       * Rateio proporcional ao valor de venda de cada linha.
       *
       * É uma APROXIMAÇÃO, e vale dizer por quê: o custo real por produto
       * exigiria rastrear cada movimento de consumo até o item de pedido que o
       * originou, e o razão guarda o vínculo com o PEDIDO, não com a linha.
       * Ratear pelo preço assume que produtos mais caros consomem mais — falso
       * no detalhe, razoável no agregado, e infinitamente melhor do que contar
       * o mesmo custo N vezes.
       */
      const vendaDoPedido = pedido.itens.reduce(
        (soma, i) => soma.add(new Decimal(i.unitPrice).mul(i.quantity)),
        new Decimal(0),
      );

      for (const item of pedido.itens) {
        /*
         * `productNameSnapshot` e não `product.name`: é o nome congelado no
         * momento do pedido, que é o correto num relatório histórico —
         * renomear um produto hoje não deve reescrever o passado dele.
         *
         * E `product` é opcional: o pedido sobrevive à exclusão do produto
         * (`onDelete: SetNull`). Antes lia-se `item.product.name` direto, o
         * que estourava no primeiro pedido com produto removido.
         */
        const key = item.productNameSnapshot || item.product?.name || "Produto removido";
        if (!profitByProduct[key]) {
          profitByProduct[key] = {
            productName: key,
            orders: 0,
            totalSales: new Decimal(0),
            totalCost: new Decimal(0),
          };
        }

        // Valor de venda. O campo é `unitPrice`; `price` não existe em
        // OrderItem e chegava aqui como undefined.
        const itemSalesValue = new Decimal(item.unitPrice).mul(item.quantity);
        profitByProduct[key].totalSales =
          profitByProduct[key].totalSales.add(itemSalesValue);

        const fatia = vendaDoPedido.isZero()
          ? new Decimal(0)
          : itemSalesValue.dividedBy(vendaDoPedido);
        profitByProduct[key].totalCost = profitByProduct[key].totalCost.add(
          custoDoPedidoInteiro.mul(fatia),
        );
        profitByProduct[key].orders += 1;
      }
    }

    return Object.values(profitByProduct)
      .map((product) => {
        const profit = product.totalSales.minus(product.totalCost);
        const profitPercent = product.totalSales.isZero()
          ? new Decimal(0)
          : profit.dividedBy(product.totalSales).times(100);

        return {
          productName: product.productName,
          totalOrders: product.orders,
          totalSalesValue: product.totalSales,
          totalCost: product.totalCost,
          totalProfit: profit,
          profitPercent,
          averageOrderValue: product.totalSales.dividedBy(
            (product.orders)
          ),
          averageCost: product.totalCost.dividedBy(
            (product.orders)
          ),
          averageProfit: profit.dividedBy((product.orders)),
        };
      })
      .sort((a, b) => b.profitPercent.toNumber() - a.profitPercent.toNumber());
  }

  /**
   * Dashboard widget: KPIs financeiros
   */
  /**
   * As PERDAS do período, lidas do razão de estoque.
   *
   * Perda é a terceira categoria do resultado, ao lado de receita e CMV — e não
   * uma delas. Material que virou lixo não vendeu nada e não é custo de venda
   * nenhuma; somá-lo ao CMV faria a margem cair por um motivo que não é a
   * margem, e ignorá-lo faz o dinheiro sumir sem explicação.
   *
   * NÃO HÁ REGRA NOVA AQUI. O razão já sabe o que foi perdido: cancelamento
   * depois do preparo grava `LOSS` ao lado do `REVERSAL` do consumo, e a
   * produção grava `LOSS` do que estragou. Esta função só soma o que já existe.
   *
   * SEM DUPLA CONTAGEM. O par REVERSAL+LOSS do cancelamento soma zero no saldo,
   * mas são movimentos de tipos diferentes: o filtro é `type: "LOSS"`, então o
   * REVERSAL nunca entra. E o consumo revertido já saiu do CMV pelo
   * `reversedBy` — o material aparece uma vez, como perda, e nenhuma como venda.
   *
   * `reversedBy: null` exclui a perda que foi ela mesma estornada.
   *
   * O VALOR VEM DO CUSTO HISTÓRICO. `costAtTime` é o que o material valia
   * quando saiu; o custo de hoje não descreve o prejuízo de ontem. Sem ele,
   * cai para o custo atual do item — e, sem nem isso, a perda entra em
   * `semCusto` em vez de virar zero, pela mesma razão que rege o CMV: ausência
   * de dado não é ausência de valor.
   */
  static async perdasNoPeriodo(storeId: string, inicio: Date, fim: Date) {
    const movimentos = await prisma.inventoryMovement.findMany({
      where: {
        storeId,
        type: "LOSS",
        reversedBy: { is: null },
        createdAt: { gte: inicio, lte: fim },
      },
      select: {
        id: true,
        quantity: true,
        costAtTime: true,
        reference: true,
        referenceType: true,
        note: true,
        createdAt: true,
        item: { select: { id: true, name: true, cost: true } },
        // A unidade em que a perda foi medida: "2" não diz nada sem o "kg".
        unit: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    let total = 0;
    let semCusto = 0;
    const linhas = movimentos.map((m) => {
      // LOSS grava quantidade positiva; o sinal do saldo é aplicado no delta.
      const quantidade = Math.abs(Number(m.quantity));
      const custoUnitario = this.custoDoMovimento(m);
      const valor = custoUnitario === null ? null : quantidade * custoUnitario.toNumber();

      if (valor === null) semCusto += 1;
      else total += valor;

      return {
        movimentoId: m.id,
        itemId: m.item.id,
        item: m.item.name,
        quantidade,
        unidade: m.unit.code,
        /*
         * O unitário sai do MESMO custo usado no total — não é uma segunda
         * conta. Exposto para a tela poder mostrar de onde o valor veio, em vez
         * de pedir para o leitor confiar no produto final.
         */
        custoUnitario: custoUnitario === null ? null : custoUnitario.toNumber(),
        valor,
        /*
         * A origem da perda, para o rastro não morrer no total: `ORDER` com o
         * id do pedido cancelado, `PRODUCTION_RUN` com o da corrida.
         */
        origem: m.referenceType,
        referencia: m.reference,
        motivo: m.note,
        data: m.createdAt,
      };
    });

    return { total, semCusto, linhas };
  }

  /**
   * Dashboard widget: KPIs financeiros.
   *
   * DOIS PARES DE NÚMEROS, E A DIFERENÇA ENTRE ELES É O ASSUNTO.
   *
   *   totalSalesValue / totalCost   o período inteiro: tudo que foi vendido e
   *                                 tudo que se sabe ter saído do estoque.
   *
   *   receitaApurada / custoApurado só os pedidos com custo INTEGRALMENTE
   *                                 conhecido. É sobre estes que a margem é
   *                                 calculada.
   *
   * Por isso `totalProfit` não é `totalSalesValue − totalCost`. Aquela conta
   * trataria como lucro toda venda cujo custo ninguém mediu — um produto sem
   * vínculo de estoque apareceria com margem de 100%, que era exatamente o
   * defeito que esta regra existe para eliminar. `cobertura` diz que fatia do
   * faturamento sustenta a margem, e sem ela os dois pares se confundem.
   */
  static async getFinancialKPIs(storeId: string, days: number = 30) {
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - days);

    const [pedidos, profitability, perdas] = await Promise.all([
      this.carregarPedidosValidos(storeId, inicio, fim),
      this.getProductProfitability(storeId, days),
      this.perdasNoPeriodo(storeId, inicio, fim),
    ]);

    const receitaTotal = pedidos.reduce((soma, p) => soma + p.receita, 0);
    const custoTotal = pedidos.reduce((soma, p) => soma + p.custoConhecido, 0);

    /*
     * A soma é das FATIAS APURADAS de cada pedido, não dos pedidos inteiros.
     *
     * Um pedido com uma pizza medida e um refrigerante sem vínculo contribui
     * com a pizza. Exigir o pedido inteiro descartaria custo real e afundaria a
     * cobertura por causa de uma linha de R$ 5.
     */
    const receitaApurada = pedidos.reduce((soma, p) => soma + p.receitaApurada, 0);
    const custoApurado = pedidos.reduce((soma, p) => soma + p.custoApurado, 0);

    /*
     * A cobertura compara MERCADORIA com MERCADORIA. O denominador é a soma das
     * linhas, não `Order.total`: a taxa de entrega entra no total e não sai de
     * linha nenhuma, então usá-la como base faria um pedido inteiramente apurado
     * com entrega aparecer abaixo de 100%.
     */
    const receitaDasLinhas = pedidos.reduce((soma, p) => soma + p.receitaDasLinhas, 0);
    const margem = margemApurada({ receitaApurada, custoApurado });
    const conta = (rotulo: string) => pedidos.filter((p) => p.apuracao === rotulo).length;

    return {
      period: `Últimos ${days} dias`,
      totalSalesValue: receitaTotal,
      totalCost: custoTotal,
      totalProfit: receitaApurada - custoApurado,
      profitMargin: margem ?? 0,
      /*
       * Ticket MÉDIO, e não custo médio.
       *
       * Este campo era preenchido com `averageCostPerOrder` e exibido na tela
       * sob o rótulo "Ticket médio". Numa loja com margem saudável os dois
       * números são muito diferentes, e ninguém percebia porque ambos são
       * "um dinheiro por pedido".
       */
      averageOrderValue: ticketMedio({ receita: receitaTotal, pedidos: pedidos.length }),
      totalOrders: pedidos.length,

      // A apuração, para a tela poder ser honesta sobre o que mediu.
      receitaApurada,
      custoApurado,
      receitaDasLinhas,
      margemApurada: margem,
      cobertura: coberturaDeApuracao({ receitaApurada, receitaTotal: receitaDasLinhas }),
      pedidosApurados: conta("APURADO"),
      pedidosParciais: conta("PARCIAL"),
      pedidosSemVinculo: conta("SEM_VINCULO"),
      pedidosSemCusto: conta("SEM_CUSTO"),

      /*
       * Quanto do faturamento ficou FORA da apuração, em reais.
       *
       * A cobertura já dizia isso em porcentagem, mas "87%" não responde à
       * pergunta que o dono faz — quanto dinheiro eu não sei medir. A base é
       * a receita das LINHAS, a mesma da cobertura: taxa de entrega não sai
       * de linha nenhuma e não pode aparecer como mercadoria sem custo.
       */
      receitaSemCusto: receitaDasLinhas - receitaApurada,

      /*
       * PERDAS: a terceira categoria. Não é receita e não é CMV — some do
       * estoque sem ter vendido nada. Fica ao lado dos outros dois para o
       * resultado fechar de verdade.
       */
      perdas: perdas.total,
      perdasSemCusto: perdas.semCusto,

      /*
       * Pedidos cuja baixa de estoque não fechou. A RECEITA DELES CONTINUA
       * VALENDO — estão aqui dentro, somados no faturamento. O que pode estar
       * incompleto é o custo, e é isso que o número avisa.
       */
      pedidosInconsistentes: pedidos.filter((p) => p.estoqueInconsistente).length,
      valorInconsistente: pedidos
        .filter((p) => p.estoqueInconsistente)
        .reduce((soma, p) => soma + p.receita, 0),

      mostProfitableProduct: profitability[0] || null,
      leastProfitableProduct: profitability[profitability.length - 1] || null,
    };
  }
}

