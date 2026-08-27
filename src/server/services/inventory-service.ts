import { prisma } from "@/server/db/client";
import {
  inventoryItemRepository,
  inventoryMovementRepository,
  inventoryUnitRepository,
} from "@/server/repositories";
import type {
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
} from "@/lib/estoque-schemas";
import type { CreateInventoryMovementInput } from "@/server/repositories";

export class InventoryService {
  private static serializeItem(item: any) {
    return {
      ...item,
      quantityOnHand: Number(item.quantityOnHand ?? 0),
      quantityReserved: Number(item.quantityReserved ?? 0),
      cost: item.cost ? Number(item.cost) : null,
      minimumThreshold: item.minimumThreshold ? Number(item.minimumThreshold) : null,
      idealQuantity: item.idealQuantity ? Number(item.idealQuantity) : null,
      maximumCapacity: item.maximumCapacity ? Number(item.maximumCapacity) : null,
    };
  }

  /**
   * Create a new inventory item
   * Validates baseUnitId exists
   */
  static async createItem(storeId: string, data: CreateInventoryItemInput) {
    // Validate baseUnit exists
    const baseUnit = await inventoryUnitRepository.findById(data.baseUnitId);
    if (!baseUnit) {
      throw new Error("Invalid baseUnitId");
    }

    // Check for duplicate SKU/barcode
    if (
      await inventoryItemRepository.skuOrBarcodeExists(
        storeId,
        data.sku ?? undefined,
        data.barcode ?? undefined
      )
    ) {
      throw new Error("SKU or barcode already exists in this store");
    }

    const item = await inventoryItemRepository.create(storeId, {
      name: data.name,
      sku: data.sku,
      barcode: data.barcode,
      itemType: data.itemType,
      baseUnitId: data.baseUnitId,
      cost: data.cost,
      minimumThreshold: data.minimumThreshold,
      idealQuantity: data.idealQuantity,
      maximumCapacity: data.maximumCapacity,
    } as any);

    return this.serializeItem(item);
  }

  /**
   * Cria o item e, se houver quantidade inicial, o movimento que a registra.
   *
   * ISTO NASCEU DE UM ESTADO PARCIAL REAL. A tela fazia duas chamadas — criar o
   * item, depois registrar a entrada — e o erro da segunda ia para um
   * `console.error` que ninguém lê. O item ficava gravado com saldo zero, o
   * operador via "criado com sucesso", e a quantidade que ele digitou
   * simplesmente não existia.
   *
   * Duas chamadas do navegador não podem ser atômicas: entre uma e outra pode
   * cair a rede, o processo, ou a aba. Por isso a orquestração desce para cá.
   *
   * E fica no SERVIÇO, não na server function, porque server function do
   * TanStack precisa de AsyncLocalStorage e não é chamável do vitest — regra
   * que mora lá não tem como ser testada.
   */
  static async criarItemComSaldoInicial(
    storeId: string,
    data: CreateInventoryItemInput,
    saldoInicial?: {
      quantidade: number;
      unitId?: string;
      nota?: string;
    },
  ) {
    const item = await this.createItem(storeId, data);

    if (!saldoInicial || !(saldoInicial.quantidade > 0)) return item;

    try {
      await this.recordMovement(storeId, {
        /*
         * Chave determinística por item. Uma retentativa do mesmo movimento é
         * reconhecida como repetição em vez de somar a quantidade de novo.
         */
        idempotencyKey: `${storeId}#ITEM_INICIAL#${item.id}`,
        itemId: item.id,
        type: "PURCHASE",
        quantity: saldoInicial.quantidade,
        // A unidade do movimento é a do item: entrada inicial não converte nada.
        unitId: saldoInicial.unitId ?? data.baseUnitId,
        note: saldoInicial.nota ?? "Quantidade inicial registrada na criação do item",
        authorType: "ADMIN",
      } as any);
    } catch (erro) {
      /*
       * O item acabou de nascer: sem movimento, sem saldo, sem nada apontando
       * para ele. Apagá-lo devolve o sistema ao estado anterior à tentativa —
       * melhor do que deixar um item que o operador não sabe se existe, com um
       * SKU que passa a estar ocupado.
       */
      await prisma.inventoryItem.delete({ where: { id: item.id } }).catch(() => {});
      throw erro;
    }

    const comSaldo = await inventoryItemRepository.findById(storeId, item.id);
    return this.serializeItem(comSaldo);
  }


  /**
   * Update an existing item
   * Cannot update quantityOnHand/quantityReserved directly
   */
  static async updateItem(
    storeId: string,
    itemId: string,
    data: UpdateInventoryItemInput
  ) {
    const item = await inventoryItemRepository.findById(storeId, itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // If changing SKU/barcode, check for duplicates
    if (
      (data.sku !== undefined || data.barcode !== undefined) &&
      (await inventoryItemRepository.skuOrBarcodeExists(
        storeId,
        data.sku ?? item.sku ?? undefined,
        data.barcode ?? item.barcode ?? undefined,
        itemId
      ))
    ) {
      throw new Error("SKU or barcode already exists in this store");
    }

    await inventoryItemRepository.update(storeId, itemId, data);
    return inventoryItemRepository.findById(storeId, itemId);
  }

  /**
   * Record a movement (INSERT ONLY)
  /**
   * Grava uma movimentação e atualiza o saldo, atomicamente.
   *
   * Três garantias, da mais externa à mais interna:
   *
   * 1. A chave de idempotência é determinística — mesma operação, mesma chave.
   * 2. O índice único em `idempotencyKey` é quem realmente decide. A consulta
   *    prévia é atalho; duas chamadas simultâneas passam as duas por ela, e é o
   *    banco que recusa a segunda. O P2002 vira "já processado", não erro.
   * 3. A linha do item é travada com FOR UPDATE antes de qualquer cálculo, e o
   *    saldo é escrito por incremento.
   *
   * O ponto 3 conserta o bug mais caro daqui: a versão anterior lia o saldo
   * fora de transação e gravava um valor absoluto calculado em memória. Dois
   * pedidos liam 10, ambos gravavam 7, e o resultado final era 7 em vez de 4 —
   * a baixa de um sumia sem deixar rastro.
   */
  static async recordMovement(
    storeId: string,
    data: CreateInventoryMovementInput & {
      idempotencyKey: string;
      /**
       * Custo unitário a congelar neste movimento.
       *
       * Sem isto, `costAtTime` sai sempre do custo que o item JÁ TINHA. Para
       * um consumo é o certo. Para uma entrada é o contrário: a compra e a
       * produção ESTABELECEM um custo, não o herdam — a compra pelo preço
       * pago, a produção pelo que a corrida apurou.
       *
       * Quando não vem, o comportamento é exatamente o de antes. Nenhum
       * chamador existente passa este campo.
       */
      costAtTime?: number | string | null;
      /**
       * Se este movimento pode deixar `quantityOnHand` negativo.
       *
       * Quando não vem, vale a regra da Fase 1: consumo pode, o resto não.
       * Existe para que a produção diga NÃO explicitamente — ela também grava
       * `CONSUMPTION`, e sem isto herdaria a permissão do pedido.
       *
       * A distinção é de fato, não de tipo. No pedido a comida já foi vendida
       * e a cozinha já usou: recusar apagaria o registro do que aconteceu. Na
       * produção há um humano na frente da tela e ainda dá para não começar.
       */
      permitirSaldoNegativo?: boolean;
    }
  ) {
    const itemId = (data as any).itemId as string;
    const unitId = (data as any).unitId as string;
    const originalMovementId = (data as any).originalMovementId as string | undefined;
    const custoExplicito = (data as any).costAtTime as number | string | null | undefined;
    const permitirNegativoExplicito = (data as any).permitirSaldoNegativo as
      | boolean
      | undefined;

    // Atalho: se já existe, devolve sem abrir transação. Não é a garantia.
    const existing = await inventoryMovementRepository.findByIdempotencyKey(
      data.idempotencyKey
    );
    if (existing) return existing;

    if (data.type === "REVERSAL" && !originalMovementId) {
      throw new Error("REVERSAL requires originalMovementId");
    }

    try {
      return await prisma.$transaction(async (tx) => {
        /*
         * Trava a linha antes de ler o saldo. Sem isto, dois pedidos disputando
         * o mesmo insumo leem o mesmo número e um sobrescreve o outro.
         */
        const travados = await tx.$queryRaw<
          Array<{ quantityOnHand: string; quantityReserved: string; cost: string | null }>
        >`SELECT "quantityOnHand"::text, "quantityReserved"::text, "cost"::text
            FROM "InventoryItem"
           WHERE "id" = ${itemId} AND "storeId" = ${storeId}
           FOR UPDATE`;

        const travado = travados[0];
        if (!travado) throw new Error("Item not found");

        const unit = await tx.inventoryUnit.findUnique({ where: { id: unitId } });
        if (!unit) throw new Error("Unit not found");

        /*
         * O que a reversão desfaz é lido DENTRO da transação: entre a decisão de
         * reverter e este ponto, outra reversão pode ter passado.
         */
        let original: { type: string; quantity: unknown } | null = null;
        if (data.type === "REVERSAL") {
          original = await tx.inventoryMovement.findFirst({
            where: { id: originalMovementId, storeId },
            select: { type: true, quantity: true },
          });
          if (!original) throw new Error("Original movement not found");
          if (original.type === "REVERSAL") {
            throw new Error("Cannot reverse a REVERSAL movement");
          }
        }

        const movement = await tx.inventoryMovement.create({
          data: {
            storeId,
            idempotencyKey: data.idempotencyKey,
            itemId,
            type: data.type,
            quantity: data.quantity,
            unitId,
            reference: data.reference,
            referenceType: data.referenceType,
            originalMovementId,
            compositionId: (data as any).compositionId,
            // A corrida que gerou este movimento, quando houver. É o que
            // distingue o preparado produzido do preparado comprado pronto.
            productionRunId: (data as any).productionRunId,
            /*
             * Congela o custo do momento: sem isto, mudar o preço do insumo
             * reescreveria o custo de tudo que já foi vendido.
             *
             * O custo explícito ganha quando vem, porque entradas estabelecem
             * custo em vez de herdá-lo. Sem ele, vale a linha travada.
             */
            costAtTime:
              custoExplicito !== undefined
                ? custoExplicito
                : travado.cost === null
                  ? null
                  : travado.cost,
            note: data.note,
            authorType: data.authorType,
            authorId: data.authorId,
            authorName: data.authorName,
          },
          include: { item: true, unit: true },
        });

        const delta = this.calcularDelta(
          data.type,
          Number(data.quantity),
          original ? { type: original.type, quantity: Number(original.quantity) } : null
        );

        /*
         * `quantityReserved` nunca pode ficar negativo — reserva negativa não
         * significa nada, e só aparece quando uma reversão roda duas vezes. O
         * CHECK do banco também barra, mas errar aqui dá mensagem melhor.
         */
        if (delta.reserved) {
          const reservadoDepois = Number(travado.quantityReserved) + delta.reserved;
          if (reservadoDepois < 0) {
            throw new Error(
              `Reserva não pode ficar negativa. Atual: ${travado.quantityReserved}, movimento: ${delta.reserved}`
            );
          }

          /*
           * O teto da reserva. Só se pode prometer o que existe na prateleira:
           * `quantityOnHand − quantityReserved` é o que ainda está livre.
           *
           * Esta checagem TEM que ficar aqui dentro, sobre a linha travada.
           * Havia uma igual em `reserveForOrder`, antes da transação, e ela não
           * servia para nada: dez pedidos simultâneos liam "há 3 disponíveis" ao
           * mesmo tempo e os dez passavam. Um teste de concorrência pegou —
           * saldo para três, dez reservas, dez aceitas.
           */
          if (delta.reserved > 0) {
            const disponivel =
              Number(travado.quantityOnHand) - Number(travado.quantityReserved);
            if (delta.reserved > disponivel) {
              throw new Error(
                `Não há estoque suficiente. Disponível: ${disponivel}, solicitado: ${delta.reserved}`
              );
            }
          }
        }

        /*
         * `quantityOnHand` PODE ficar negativo, e de propósito — mas só no
         * consumo, que é o caso em que a cozinha já usou o que o sistema achava
         * que não tinha. Toda outra saída (perda, ajuste, devolução) continua
         * barrada: ali o negativo seria erro de digitação, não fato consumado.
         */
        const saldoDepois = Number(travado.quantityOnHand) + (delta.onHand ?? 0);

        /*
         * Quem decide é o chamador, quando ele diz. Só quando não diz é que
         * vale a regra herdada da Fase 1.
         *
         * O default continua sendo a derivação antiga, e não `false`, por uma
         * razão prática: o caminho do pedido não passa o campo, e mudá-lo para
         * `false` faria pedidos com estoque curto passarem a ser RECUSADOS —
         * o oposto do que a Fase 1 decidiu, e uma regressão que só apareceria
         * na cozinha. Assim a produção diz `false` de propósito, a reversão de
         * produção diz `true` de propósito, e o pedido segue como está.
         */
        const podeFicarNegativo =
          permitirNegativoExplicito ??
          (data.type === "CONSUMPTION" ||
            (data.type === "REVERSAL" && original?.type === "CONSUMPTION"));
        if (delta.onHand && saldoDepois < 0 && !podeFicarNegativo) {
          throw new Error(
            `Não há estoque suficiente. Disponível: ${travado.quantityOnHand}, solicitado: ${Math.abs(delta.onHand)}`
          );
        }

        /*
         * A COMPRA ESTABELECE O CUSTO DO ITEM.
         *
         * É a metade de compra da regra "custo = o da aquisição não revertida
         * mais recente"; a metade de produção é escrita pela corrida, que só
         * conhece o unitário depois de somar todos os insumos.
         *
         * Aqui dentro, e não numa segunda escrita depois, porque a linha já
         * está travada: separar as duas abriria uma janela em que duas compras
         * simultâneas gravam movimentos em ordem e custos em ordem inversa.
         *
         * Só quando o custo vem explícito. Sem ele, uma compra não mexe no
         * custo — que é o comportamento de hoje, e o que vale enquanto o
         * formulário de movimento não tiver campo de preço.
         */
        const ehAquisicaoComPreco =
          data.type === "PURCHASE" && custoExplicito !== undefined && custoExplicito !== null;

        if (delta.onHand || delta.reserved || ehAquisicaoComPreco) {
          await tx.inventoryItem.update({
            where: { id: itemId },
            data: {
              // Incremento, não valor absoluto: quem soma é o banco, sobre a
              // linha travada.
              ...(delta.onHand ? { quantityOnHand: { increment: delta.onHand } } : {}),
              ...(delta.reserved ? { quantityReserved: { increment: delta.reserved } } : {}),
              ...(ehAquisicaoComPreco ? { cost: custoExplicito } : {}),
            },
          });
        }

        return movement;
      });
    } catch (erro) {
      /*
       * Corrida de idempotência: outra chamada gravou a mesma chave entre o
       * atalho lá em cima e este INSERT. O índice único fez o seu trabalho —
       * devolvemos o que ela gravou, porque o efeito pedido já aconteceu.
       */
      if (violouChaveDeIdempotencia(erro)) {
        const gravado = await inventoryMovementRepository.findByIdempotencyKey(
          data.idempotencyKey
        );
        if (gravado) return gravado;
      }
      throw erro;
    }
  }

  /**
   * Quanto cada saldo muda, por tipo de movimento.
   *
   * Devolve deltas, nunca valores absolutos: quem soma é o banco.
   *
   * A reversão não tem regra própria — aplica o inverso exato do que o
   * movimento original aplicou. Era isto que faltava: o `case "REVERSAL"`
   * antigo caía num `break` sem preencher nada, o `if (Object.keys(updates))`
   * seguinte pulava a atualização, e o saldo nunca voltava. Na prática,
   * cancelar um pedido gravava a reversão na trilha e não devolvia estoque.
   */
  private static calcularDelta(
    type: string,
    quantity: number,
    original: { type: string; quantity: number } | null
  ): { onHand?: number; reserved?: number } {
    switch (type) {
      case "PURCHASE":
      case "RETURN":
      case "PRODUCTION":
        return { onHand: quantity };

      case "CONSUMPTION":
        // O chamador passa quantidade negativa para consumo.
        return { onHand: quantity };

      case "LOSS":
        return { onHand: -Math.abs(quantity) };

      case "ADJUSTMENT":
        return { onHand: quantity };

      case "RESERVATION":
        return { reserved: quantity };

      case "REVERSAL": {
        if (!original) return {};
        const inverso = this.calcularDelta(original.type, original.quantity, null);
        return {
          ...(inverso.onHand ? { onHand: -inverso.onHand } : {}),
          ...(inverso.reserved ? { reserved: -inverso.reserved } : {}),
        };
      }

      default:
        return {};
    }
  }

  /**
   * Cria a REVERSAL de um movimento.
   *
   * A quantidade vai invertida porque o `calcularDelta` do REVERSAL le o
   * movimento original e aplica o inverso do efeito dele. Reverter duas vezes e
   * recusado pelo indice unico em `originalMovementId`.
   */
  static async reverseMovement(
    storeId: string,
    originalMovementId: string,
    authorData?: {
      authorType?: string;
      authorId?: string;
      authorName?: string;
    }
  ) {
    const original = await inventoryMovementRepository.findById(
      storeId,
      originalMovementId
    );
    if (!original) {
      throw new Error("Original movement not found");
    }

    // Check if already reversed
    const existingReversal = await inventoryMovementRepository.findReversal(
      storeId,
      originalMovementId
    );
    if (existingReversal) {
      throw new Error("Movement has already been reversed");
    }

    // Cannot reverse a REVERSAL
    if (original.type === "REVERSAL") {
      throw new Error("Cannot reverse a REVERSAL movement");
    }

    const reversalKey = `${storeId}#REVERSAL#${originalMovementId}`;

    return this.recordMovement(storeId, {
      idempotencyKey: reversalKey,
      itemId: original.itemId,
      type: "REVERSAL",
      quantity: Number(original.quantity) * -1,
      unitId: original.unitId,
      originalMovementId: originalMovementId,
      reference: original.reference,
      referenceType: original.referenceType,
      authorType: authorData?.authorType,
      authorId: authorData?.authorId,
      authorName: authorData?.authorName,
    } as any);
  }

  /**
   * Get item summary (quantities + availability)
   */
  static async getItemSummary(storeId: string, itemId: string) {
    return inventoryItemRepository.getSummary(storeId, itemId);
  }

  /**
   * Reserve quantity for an order (RESERVATION is a flag, not physical movement)
   */
  static async reserveForOrder(
    storeId: string,
    itemId: string,
    quantity: number,
    orderId: string
  ) {
    const item = await inventoryItemRepository.findById(storeId, itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // Check availability
    const quantityAvailable = Number(item.quantityOnHand) - Number(item.quantityReserved);
    if (quantityAvailable < quantity) {
      throw new Error(
        `Insufficient quantity. Available: ${quantityAvailable}, Requested: ${quantity}`
      );
    }

    // Create RESERVATION movement (flag)
    const reservationKey = `${storeId}#ORDER#${orderId}#RESERVATION#${itemId}#0`;

    return this.recordMovement(storeId, {
      idempotencyKey: reservationKey,
      itemId,
      type: "RESERVATION",
      quantity,
      unitId: item.baseUnitId,
      reference: orderId,
      referenceType: "ORDER",
      authorType: "SYSTEM",
    } as any);
  }

  /**
   * Consume (deduct) quantity from order preparation (CONSUMPTION is physical)
   */
  static async consumeForOrder(
    storeId: string,
    itemId: string,
    quantity: number,
    orderId: string
  ) {
    const item = await inventoryItemRepository.findById(storeId, itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // Check if reserved (quantityReserved >= quantity)
    if (Number(item.quantityReserved) < quantity) {
      throw new Error(
        `Insufficient reserved quantity. Reserved: ${item.quantityReserved}, Requested: ${quantity}`
      );
    }

    const consumptionKey = `${storeId}#ORDER#${orderId}#CONSUMPTION#${itemId}#0`;

    return this.recordMovement(storeId, {
      idempotencyKey: consumptionKey,
      itemId,
      type: "CONSUMPTION",
      quantity: -quantity,
      unitId: item.baseUnitId,
      reference: orderId,
      referenceType: "ORDER",
      authorType: "SYSTEM",
    } as any);
  }

}

/**
 * Reconhece a violacao do indice unico de `idempotencyKey`.
 *
 * Procura em mais de um lugar porque o nome do campo muda de posicao conforme o
 * driver: `meta.target` no Prisma classico, `meta.driverAdapterError` no adapter
 * pg do Prisma 7. Este mesmo formato ja tinha enganado o cadastro de CPF/CNPJ,
 * onde a mensagem amigavel de documento duplicado nunca aparecia.
 */
function violouChaveDeIdempotencia(erro: unknown): boolean {
  const e = erro as any;
  if (e?.code !== "P2002") return false;

  const candidatos: unknown[] = [
    e.meta?.target,
    e.meta?.driverAdapterError?.cause?.constraint?.fields,
    e.meta?.driverAdapterError?.cause?.originalMessage,
    e.message,
  ];
  return candidatos.some((c) => {
    if (c == null) return false;
    const texto = Array.isArray(c) ? c.join(",") : String(c);
    return texto.includes("idempotencyKey");
  });
}
