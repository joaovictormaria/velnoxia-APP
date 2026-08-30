import { prisma } from "@/server/db/client";
import type { Prisma } from "@prisma/client";
import { InventoryService } from "@/server/services/inventory-service";
import { insumosDoPedido, resolverComposicao } from "@/server/services/composicao-do-pedido";

/**
 * A ponte entre o andar do pedido e o saldo do estoque.
 *
 * Reserva e consumo resolvem os insumos pela MESMA função. Antes cada um tinha
 * a sua: o consumo expandia a ficha técnica, a reserva olhava só o vínculo
 * direto `Product.inventoryItemId`. Um prato feito por receita não reservava
 * nada — restavam três porções, chegavam oito pedidos, e o sistema aceitava os
 * oito. A cozinha descobria ao montar o sétimo.
 */
export class OrderInventoryHandler {
  /**
   * Pedido recebido: reservar, e congelar a ficha usada.
   *
   * Reserva não tira nada da prateleira — marca que aquele insumo deixou de
   * estar livre para o próximo cliente.
   *
   * Falta de saldo aqui recusa o pedido INTEIRO. É o único momento em que
   * recusar faz sentido: ninguém foi cobrado ainda, e aceitar seria prometer o
   * que não existe.
   */
  /**
   * Reserva o estoque DENTRO da transação que está criando o pedido.
   *
   * NASCEU DE PEDIDO CONFIRMADO SEM ESTOQUE. O caminho antigo — e ainda vivo,
   * logo abaixo — roda depois do commit, disparado sem espera. Quando faltava
   * saldo, a reserva falhava, o pedido já estava confirmado ao cliente, e tudo
   * o que sobrava era a marca `inventoryInconsistentAt` para alguém conferir
   * na mão. O cliente pagava por um bolo que não existia.
   *
   * Aqui a reserva entra no MESMO commit: falhar significa que o pedido inteiro
   * é desfeito pelo rollback, sem Order parcial e sem reserva órfã. Não há
   * `desfazerReservas` porque não há o que desfazer — o banco cuida disso.
   *
   * A CHECAGEM DE CONCORRÊNCIA CONTINUA SENDO A DE SEMPRE: o
   * `SELECT ... FOR UPDATE` dentro de `recordMovement`, agora sob a transação
   * do pedido. Dois clientes disputando a última unidade continuam serializados
   * pelo banco, e só um passa.
   *
   * A ficha técnica é congelada aqui também, pelo mesmo motivo do caminho
   * antigo: do consumo em diante todo mundo lê a versão do pedido, nunca "a
   * ativa agora".
   */
  static async reservarNaCriacao(
    tx: Prisma.TransactionClient,
    orderId: string,
    storeId: string,
  ) {
    const itens = await tx.orderItem.findMany({ where: { orderId } });
    if (itens.length === 0) return;

    for (const item of itens) {
      if (item.compositionVersionId) continue;
      const composicao = await resolverComposicao(item.productId, null, tx);
      if (composicao) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { compositionVersionId: composicao.id },
        });
        item.compositionVersionId = composicao.id;
      }
    }

    const { insumos } = await insumosDoPedido(itens as any, tx);
    if (insumos.length === 0) return;

    /*
     * O PEDIDO DO CLIENTE NÃO É RECUSADO POR FALTA DE ESTOQUE.
     *
     * Quem compra não conhece o estoque interno da casa e não responde por
     * ele. Recusar aqui devolvia "resta apenas 0,93" a uma pessoa que só
     * queria um bolo — expondo controle interno e perdendo a venda por um
     * saldo que o salão talvez já tivesse resolvido.
     *
     * A reserva é gravada mesmo faltando: o disponível fica negativo, o item
     * passa a aparecer como esgotado no painel, e o pedido é marcado para o
     * salão ver. A decisão de cancelar, repor ou avisar o cliente passa a ser
     * de quem está na cozinha — que é quem tem como decidir.
     */
    let faltouAlgum = false;
    for (const insumo of insumos) {
      const r = await InventoryService.reserveForOrder(
        storeId,
        insumo.inventoryItemId,
        insumo.quantidade,
        orderId,
        tx,
        { permitirIndisponivel: true },
      );
      if (r?.faltou) faltouAlgum = true;
    }

    /*
     * `inventoryInconsistentAt` já existia para marcar pedido cujo estoque não
     * fechou — é o campo que o salão consulta. Reusado aqui em vez de inventar
     * um segundo sinal para a mesma pergunta.
     */
    if (faltouAlgum) {
      await tx.order.update({
        where: { id: orderId },
        data: { inventoryInconsistentAt: new Date() },
      });
    }
  }

  static async onOrderReceived(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order?.storeId) return;

    /*
     * Congela a versão da ficha em cada item, antes de qualquer reserva. Do
     * ponto seguinte em diante — consumo, reversão — todo mundo lê daqui, nunca
     * "a ativa agora".
     */
    for (const item of order.items) {
      if (item.compositionVersionId) continue;
      const composicao = await resolverComposicao(item.productId, null);
      if (composicao) {
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { compositionVersionId: composicao.id },
        });
        item.compositionVersionId = composicao.id;
      }
    }

    const { insumos } = await insumosDoPedido(order.items);
    if (insumos.length === 0) return;

    /*
     * Ou reserva tudo, ou nada. Reservar parcialmente deixaria metade do pedido
     * comprometendo estoque para um prato que não vai sair — e ninguém liberaria
     * essa metade depois.
     */
    try {
      for (const insumo of insumos) {
        await InventoryService.reserveForOrder(
          order.storeId,
          insumo.inventoryItemId,
          insumo.quantidade,
          orderId,
        );
      }
    } catch (erro) {
      await this.desfazerReservas(order.storeId, orderId);
      throw erro;
    }
  }

  /**
   * Pedido em preparo: consumir de verdade.
   *
   * Aqui falta de saldo NÃO recusa. O prato já foi vendido e a cozinha vai
   * montá-lo de qualquer jeito; recusar só faria o sistema perder o registro do
   * que aconteceu. A baixa é gravada, o saldo pode ficar negativo, e o pedido
   * recebe uma marca legível para a contagem física resolver depois.
   */
  static async onOrderPreparing(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order?.storeId) return;

    const { insumos } = await insumosDoPedido(order.items);

    /*
     * AS RESERVAS DO PEDIDO CAEM TODAS, ANTES DE QUALQUER CONSUMO.
     *
     * Isto ficava DENTRO do laço abaixo, filtrado por `insumo.inventoryItemId`
     * — e então só era revertido o que ainda aparecia na configuração ATUAL do
     * produto. O que saíra dela no meio do caminho ficava reservado para sempre.
     *
     * A ficha técnica não sofria com isso porque é congelada em
     * `OrderItem.compositionVersionId`: a versão que reservou é a mesma que
     * consome. A EMBALAGEM não tem congelamento nenhum, e o TIPO do produto é
     * editável a qualquer momento — bastava remover a embalagem, ou trocar o
     * produto para "não controla", entre o pedido entrar e ir ao preparo:
     *
     *   pedido reserva 2 caixas → dono remove a embalagem → PREPARING
     *   → a caixa não está mais em `insumos` → a reserva nunca era revertida
     *
     * O saldo físico não se perdia, mas `quantityReserved` subia de forma
     * cumulativa e sem nenhuma tela que desfizesse: o disponível encolhia a
     * cada ocorrência.
     *
     * A reversão passa a não depender da configuração atual — é o mesmo
     * princípio que `onOrderCancelled` sempre usou, e é por isso que o
     * cancelamento nunca teve este problema. Mesma função, sem segunda
     * implementação: só sem o filtro por item.
     *
     * A ORDEM É SEGURA. Reverter uma RESERVATION mexe apenas em
     * `quantityReserved` (`calcularDelta`: REVERSAL de RESERVATION devolve só
     * `reserved`), e a checagem de saldo insuficiente abaixo lê
     * `quantityOnHand`. Antecipar a reversão não muda um número dessa conta.
     */
    await this.reverterMovimentos(order.storeId, orderId, ["RESERVATION"]);

    /*
     * Sai DEPOIS de reverter, e não antes.
     *
     * Este `return` ficava acima da reversão, e era o caso extremo do mesmo
     * bug: quando a configuração nova não produzia insumo nenhum — trocar
     * REVENDA para "não controla", por exemplo — o pedido saía daqui sem
     * liberar nada, e a reserva inteira ficava aberta.
     *
     * Não há o que consumir, e isso é um desfecho legítimo: o pedido segue
     * para PREPARING normalmente.
     */
    if (insumos.length === 0) return;

    const insuficientes: string[] = [];

    for (const insumo of insumos) {
      const item = await prisma.inventoryItem.findUnique({
        where: { id: insumo.inventoryItemId },
        select: { name: true, quantityOnHand: true },
      });
      if (item && Number(item.quantityOnHand) < insumo.quantidade) {
        insuficientes.push(
          `${item.name} (tinha ${Number(item.quantityOnHand)}, precisou de ${insumo.quantidade.toFixed(4)})`,
        );
      }

      await InventoryService.recordMovement(order.storeId, {
        idempotencyKey: `${order.storeId}#ORDER#${orderId}#CONSUMPTION#${insumo.inventoryItemId}`,
        itemId: insumo.inventoryItemId,
        type: "CONSUMPTION",
        quantity: -insumo.quantidade,
        unitId: insumo.unitId,
        reference: orderId,
        referenceType: "ORDER",
        /*
         * O pedido PODE deixar o saldo negativo, e diz isso de propósito.
         *
         * Antes a permissão vinha do tipo do movimento — todo `CONSUMPTION`
         * podia. Aí a produção passou a gravar `CONSUMPTION` também, e herdava
         * uma permissão que não é dela: produzir é ato planejado, com um
         * humano na frente da tela, e recusar ainda é possível. Aqui não: o
         * prato foi vendido e a cozinha já usou. Recusar não devolveria o
         * ingrediente, só apagaria o registro de que ele saiu.
         */
        permitirSaldoNegativo: true,
        authorType: "SYSTEM",
        authorId: "ORDER",
        authorName: `Pedido #${order.number}`,
      } as any);
    }

    if (insuficientes.length > 0) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          inventoryInconsistentAt: new Date(),
          inventoryInconsistency:
            `Baixa feita com saldo insuficiente: ${insuficientes.join("; ")}. ` +
            `O estoque ficou negativo e precisa de contagem física.`,
        },
      });
    }
  }

  /** Estoque já saiu no preparo. Concluir não move nada. */
  static async onOrderCompleted(_orderId: string) {}

  /**
   * Pedido cancelado: a reserva volta, o que já foi consumido vira perda.
   *
   * A REGRA MUDOU, E A MUDANÇA TEM UM MOTIVO FÍSICO. Antes isto revertia
   * RESERVATION e CONSUMPTION juntos, e o insumo voltava inteiro para a
   * prateleira. Só que `onOrderPreparing` grava o consumo justamente porque a
   * cozinha JÁ USOU o material — é o que o `permitirSaldoNegativo` de lá
   * admite. Devolver farinha que virou massa criava saldo que ninguém
   * encontraria na contagem física.
   *
   * Os dois momentos passam a ser tratados de forma diferente:
   *
   *   RECEIVED → CANCELLED    nada saiu da prateleira. A reserva é revertida e
   *                           o saldo volta a ficar livre. Idêntico ao anterior.
   *
   *   PREPARING → CANCELLED   o material saiu. O consumo é anulado como VENDA,
   *                           deixando de ser CMV, e reclassificado como PERDA,
   *                           sem que o saldo suba.
   *
   * A ordem importa: a reserva primeiro. Um pedido cancelado em PREPARING já
   * teve a reserva revertida lá atrás, então a primeira chamada não acha nada e
   * segue — mas um pedido cancelado em RECEIVED depende dela, e o laço de
   * perdas abaixo é que fica vazio.
   */
  static async onOrderCancelled(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { storeId: true },
    });
    if (!order?.storeId) return;

    await this.reverterMovimentos(order.storeId, orderId, ["RESERVATION"]);
    await this.perderConsumos(order.storeId, orderId);
  }

  /**
   * Transforma em perda o que o pedido cancelado já tinha consumido.
   *
   * SÃO DOIS MOVIMENTOS, E NENHUM DELES SOZINHO RESOLVE:
   *
   *   REVERSAL do consumo   devolve `+q` ao saldo e preenche `reversedBy` no
   *                         movimento original. É esse preenchimento que tira o
   *                         consumo do CMV: o custo da venda não pode carregar
   *                         um pedido que não virou venda.
   *
   *   LOSS de `q`           tira `−q` de novo, agora com o nome certo. É assim
   *                         que este material passa a aparecer no relatório de
   *                         perdas, onde antes era invisível.
   *
   * A SOMA DOS DOIS É ZERO — o insumo não reaparece na prateleira. O par existe
   * pela TRILHA, não pelo saldo: sem ele, ou o estoque mente (devolvendo comida
   * usada) ou o razão mente (chamando de venda o que foi desperdício).
   *
   * OS DOIS NA MESMA TRANSAÇÃO, e não por hábito: entre um e outro o saldo fica
   * momentaneamente alto, e um segundo pedido poderia reservar estoque que não
   * existe. Dentro da transação essa janela não existe para mais ninguém.
   *
   * IDEMPOTENTE por construção: a busca exige `reversedBy: null`, então uma
   * segunda passada não encontra nada. E as duas chaves derivam do id do
   * movimento original, que é único — duas execuções simultâneas disputam o
   * índice e a segunda recebe o que a primeira gravou.
   */
  private static async perderConsumos(storeId: string, orderId: string) {
    const consumos = await prisma.inventoryMovement.findMany({
      where: {
        storeId,
        reference: orderId,
        referenceType: "ORDER",
        type: "CONSUMPTION",
        reversedBy: { is: null },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const consumo of consumos) {
      /*
       * O custo viaja junto, congelado. É o custo do momento da BAIXA, não o de
       * hoje: uma perda de março vale o que o insumo valia em março, e o preço
       * que o fornecedor cobrar em abril não reescreve isso.
       *
       * Nulo continua nulo, e é por isso que o ternário existe: `undefined`
       * faria `recordMovement` cair no custo ATUAL do item, inventando um valor
       * para uma perda cujo custo nunca foi conhecido.
       */
      const custo = consumo.costAtTime === null ? null : consumo.costAtTime.toString();

      await prisma.$transaction(async (tx) => {
        /*
         * TRAVA A LINHA DO CONSUMO ANTES DE ESCREVER QUALQUER COISA.
         *
         * Sem isto, duas execuções simultâneas — e elas acontecem: a transição
         * dispara o sync sem `await`, e a varredura de expiração chama
         * `syncOrderStatus` por conta própria — encontravam o mesmo consumo não
         * revertido e tentavam gravar o MESMO `idempotencyKey`.
         *
         * O `recordMovement` sabe transformar esse P2002 em "já processado",
         * mas só quando abre a própria transação: ali o conflito aborta apenas
         * a dela. Dentro de uma transação de FORA, o P2002 aborta a transação
         * COMPARTILHADA, e a chamada seguinte — o LOSS — morria com
         * `25P02: current transaction is aborted`. O par ficava pela metade e o
         * cancelamento estourava, em vez de simplesmente não ter nada a fazer.
         *
         * Travar aqui EVITA o conflito em vez de tentar se recuperar dele: a
         * segunda transação espera, e quando entra já enxerga a reversão da
         * primeira. Nenhum P2002 chega a existir.
         */
        await tx.$queryRaw`SELECT "id" FROM "InventoryMovement" WHERE "id" = ${consumo.id} FOR UPDATE`;

        /*
         * Saída explícita, relida DEPOIS da trava.
         *
         * É DEFESA, NÃO O GUARDA. Removê-la não muda o comportamento: com a
         * trava acima, o atalho de idempotência do próprio `recordMovement` já
         * encontra a reversão que a vencedora acabou de gravar e devolve o
         * registro sem tentar inserir. Quem elimina a corrida é o FOR UPDATE.
         *
         * Fica porque torna a intenção legível e porque não faz este caminho
         * depender do comportamento interno de `recordMovement` — se aquele
         * atalho mudar um dia, aqui continua correto.
         */
        const jaRevertido = await tx.inventoryMovement.findUnique({
          where: { originalMovementId: consumo.id },
          select: { id: true },
        });
        // Já processado por outra execução. Não é erro: é não ter o que fazer.
        if (jaRevertido) return;

        await InventoryService.recordMovement(storeId, {
          idempotencyKey: `${storeId}#REVERSAL#${consumo.id}`,
          itemId: consumo.itemId,
          type: "REVERSAL",
          quantity: Number(consumo.quantity) * -1,
          unitId: consumo.unitId,
          originalMovementId: consumo.id,
          reference: orderId,
          referenceType: "ORDER",
          permitirSaldoNegativo: true,
          authorType: "SYSTEM",
          authorId: "ORDER",
          authorName: "Cancelamento após preparo",
          tx,
        } as any);

        await InventoryService.recordMovement(storeId, {
          idempotencyKey: `${storeId}#LOSS#${consumo.id}`,
          itemId: consumo.itemId,
          type: "LOSS",
          quantity: Math.abs(Number(consumo.quantity)),
          unitId: consumo.unitId,
          reference: orderId,
          referenceType: "ORDER",
          costAtTime: custo,
          /*
           * A perda recusa saldo negativo por padrão — ali o negativo seria erro
           * de digitação. Aqui não: se o consumo já tinha deixado o item
           * negativo, esta baixa apenas devolve o saldo ao valor que ele tinha
           * antes do REVERSAL acima. Recusar deixaria o par pela metade.
           */
          permitirSaldoNegativo: true,
          authorType: "SYSTEM",
          authorId: "ORDER",
          authorName: "Cancelamento após preparo",
          note: "Pedido cancelado depois do preparo: material já consumido.",
          tx,
        } as any);
      });
    }
  }

  /** Desfaz só as reservas — usado quando a reserva falha no meio. */
  private static async desfazerReservas(storeId: string, orderId: string) {
    await this.reverterMovimentos(storeId, orderId, ["RESERVATION"]);
  }

  /**
   * Reverte os movimentos de um pedido que ainda não foram revertidos.
   *
   * O `originalMovementId @unique` do banco é quem garante que nada seja
   * revertido duas vezes; a consulta por `reversedBy` só evita o erro.
   */
  private static async reverterMovimentos(
    storeId: string,
    orderId: string,
    tipos: string[],
    itemId?: string,
  ) {
    const movimentos = await prisma.inventoryMovement.findMany({
      where: {
        storeId,
        reference: orderId,
        referenceType: "ORDER",
        type: { in: tipos as any },
        ...(itemId ? { itemId } : {}),
        reversedBy: { is: null },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const movimento of movimentos) {
      await InventoryService.recordMovement(storeId, {
        idempotencyKey: `${storeId}#REVERSAL#${movimento.id}`,
        itemId: movimento.itemId,
        type: "REVERSAL",
        quantity: Number(movimento.quantity) * -1,
        unitId: movimento.unitId,
        originalMovementId: movimento.id,
        reference: orderId,
        referenceType: "ORDER",
        /*
         * Explícito pelo mesmo motivo do consumo, e não por simetria vazia:
         * desfazer um consumo REPÕE saldo, mas se o item já estava negativo o
         * saldo continua negativo depois da reposição. Sem esta permissão, um
         * cancelamento sobre estoque negativo seria recusado — e o pedido
         * ficaria cancelado com o consumo dele ainda de pé.
         */
        permitirSaldoNegativo: true,
        authorType: "SYSTEM",
        authorId: "ORDER",
        authorName: "Reversão automática",
      } as any);
    }
  }

  /** Traduz o status do pedido no efeito correspondente sobre o estoque. */
  static async syncOrderStatus(orderId: string, newStatus: string) {
    switch (newStatus) {
      case "RECEIVED":
        return this.onOrderReceived(orderId);
      case "PREPARING":
        return this.onOrderPreparing(orderId);
      case "COMPLETED":
        return this.onOrderCompleted(orderId);
      case "CANCELLED":
        return this.onOrderCancelled(orderId);
      default:
        return;
    }
  }
}
