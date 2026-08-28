import { prisma } from "@/server/db/client";
import type { Prisma } from "@prisma/client";
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
import {
  calcularCompra,
  conteudoDaEmbalagem,
} from "@/lib/embalagem-de-compra";
import { validarConteudo } from "@/lib/embalagem-vs-conteudo";

export class InventoryService {
  /**
   * O conteúdo declarado faz sentido para esta unidade de estoque?
   *
   * MORA NO SERVIÇO, e não só no zod da server function, porque quem chama o
   * serviço direto — script, teste, código futuro — passaria reto. A regra que
   * só existe no caminho HTTP não é regra, é sugestão. Foi assim que
   * `baseUnitId` continuou mutável muito depois de a gente decidir que não era.
   */
  private static async conferirConteudo(
    baseUnitId: string,
    contentSize?: number | null,
    contentUnit?: string | null,
  ) {
    if (contentSize == null && contentUnit == null) return;

    const [base, conteudo] = await Promise.all([
      inventoryUnitRepository.findById(baseUnitId),
      contentUnit ? inventoryUnitRepository.findById(contentUnit) : null,
    ]);
    if (!base) throw new Error("Invalid baseUnitId");
    if (contentUnit && !conteudo) {
      throw new Error(
        "A unidade do conteúdo não existe. Escolha uma das unidades " +
          "cadastradas.",
      );
    }

    const veredito = validarConteudo({
      unidadeDeEstoque: { id: base.id, system: (base as any).system },
      contentSize,
      contentUnit: conteudo
        ? { id: conteudo.id, system: (conteudo as any).system }
        : null,
    });
    if (!veredito.ok) throw new Error(veredito.mensagem);
  }

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

    await this.conferirConteudo(
      data.baseUnitId,
      data.contentSize ?? null,
      data.contentUnit ?? null,
    );

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
      // Embalagem de compra: lembrada para as próximas compras deste item.
      purchasePackSize: data.purchasePackSize ?? null,
      purchasePackLabel: data.purchasePackLabel ?? null,
      // Conteudo da embalagem: o que permite a ficha pedir em gramas.
      contentSize: data.contentSize ?? null,
      contentUnit: data.contentUnit ?? null,
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
      /** Quantas EMBALAGENS, ou quantas unidades quando não há embalagem. */
      quantidade: number;
      unitId?: string;
      nota?: string;
      /** Preço de UMA embalagem. R$ 15,00 a caixa. */
      precoDaEmbalagem?: number | null;
    },
  ) {
    /*
     * A EMBALAGEM ENTRA AQUI, e não na tela.
     *
     * "Ovos, un, custo 15, quantidade 1" era gravado como UM ovo custando
     * QUINZE REAIS — o operador queria dizer "uma caixa de 30 por R$ 15,00".
     * A conta é `embalagens × conteúdo` para o saldo e `preço ÷ conteúdo` para
     * o custo, e mora no serviço porque a tela não pode ser a única a saber.
     */
    const conteudo = conteudoDaEmbalagem(data.purchasePackSize);

    const compra = saldoInicial
      ? calcularCompra({
          embalagens: saldoInicial.quantidade,
          conteudoPorEmbalagem: conteudo,
          precoDaEmbalagem: saldoInicial.precoDaEmbalagem,
        })
      : null;

    /*
     * `cost` é R$ POR UNIDADE DE ESTOQUE, sempre. É o que `costAtTime`, o custo
     * da ficha e o custo do preparado consomem. O preço da embalagem é entrada
     * de formulário, e vira unitário aqui — nunca é gravado cru.
     */
    const item = await this.createItem(storeId, {
      ...data,
      ...(compra?.custoPorUnidade != null ? { cost: compra.custoPorUnidade } : {}),
    });

    if (!compra || !(compra.quantidadeEmEstoque > 0)) return item;

    try {
      await this.recordMovement(storeId, {
        /*
         * Chave determinística por item. Uma retentativa do mesmo movimento é
         * reconhecida como repetição em vez de somar a quantidade de novo.
         */
        idempotencyKey: `${storeId}#ITEM_INICIAL#${item.id}`,
        itemId: item.id,
        type: "PURCHASE",
        // Já na unidade de ESTOQUE: 5 caixas de 30 entram como 150 ovos.
        quantity: compra.quantidadeEmEstoque,
        // A unidade do movimento é a do item: entrada inicial não converte nada.
        unitId: saldoInicial!.unitId ?? data.baseUnitId,
        ...(compra.custoPorUnidade != null
          ? { costAtTime: compra.custoPorUnidade }
          : {}),
        note: saldoInicial!.nota ?? "Quantidade inicial registrada na criação do item",
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

    /*
     * A EMBALAGEM TAMBÉM SE EDITA.
     *
     * O item já existe e só agora se soube que vem em caixa de 30. Informar
     * "preço da caixa = R$ 15,00" tem que gravar R$ 0,50 no `cost`, porque
     * `cost` é R$ por unidade de ESTOQUE em todo o sistema — nunca R$ 15,00,
     * que é o preço da CAIXA, e nunca R$ 15,00 × quantidade.
     *
     * O conteúdo usado é o que o item VAI ter depois deste update: mudar de
     * caixa de 30 para caixa de 12 na mesma gravação recalcula por 12.
     *
     * `precoDaEmbalagem` não é coluna: sai daqui antes de chegar ao Prisma.
     */
    const {
      precoDaEmbalagem,
      /*
       * A UNIDADE DE ESTOQUE É IMUTÁVEL, e a garantia mora aqui.
       *
       * Trocá-la reinterpretaria em silêncio três coisas já gravadas: o saldo
       * (30 un virariam 30 kg), o `cost` (R$/un viraria R$/kg) e todo
       * movimento passado, que guarda a própria unidade. Nada daria erro — o
       * número mudaria de significado e ninguém perceberia.
       *
       * O zod da server function já não expõe o campo, mas isso é o caminho
       * HTTP. Quem chama o serviço direto — teste, script, código futuro —
       * passava reto. Descartar aqui é o que torna a regra uma regra.
       */
      baseUnitId: _unidadeImutavel,
      ...campos
    } = data as UpdateInventoryItemInput & {
      precoDaEmbalagem?: number | null;
      baseUnitId?: string;
    };

    if (precoDaEmbalagem != null) {
      const conteudo = conteudoDaEmbalagem(
        campos.purchasePackSize !== undefined
          ? campos.purchasePackSize
          : (item as any).purchasePackSize,
      );
      const compra = calcularCompra({
        embalagens: 1,
        conteudoPorEmbalagem: conteudo,
        precoDaEmbalagem,
      });
      if (compra.custoPorUnidade != null) campos.cost = compra.custoPorUnidade;
    }

    /*
     * A validação olha o estado RESULTANTE, não só o que veio na requisição.
     *
     * Editar só o nome de um item cujo conteúdo já está incoerente tem que
     * falhar, porque a alternativa seria deixá-lo incoerente para sempre desde
     * que ninguém toque nesse campo. E NADA é apagado por conta própria: o
     * cadastro errado é apontado, e quem corrige é a pessoa.
     *
     * DESATIVAR É A EXCEÇÃO, e ela nasceu de itens presos. O botão "Deletar"
     * manda `isActive: false` por este mesmo caminho, e a validação recusava —
     * porque a exclusão não mexe no conteúdo, e o conteúdo continuava
     * incoerente. Farinha e Leite ficaram sem saída: não podiam ser corrigidos
     * nem removidos. Quem tira o item de circulação não está afirmando nada
     * sobre a embalagem dele.
     *
     * REATIVAR continua sendo cobrado. Sem isso, desativar e reativar viraria
     * a porta dos fundos para trazer de volta um cadastro que a regra recusa.
     */
    if (campos.isActive !== false) {
      await this.conferirConteudo(
        (item as any).baseUnitId,
        campos.contentSize !== undefined
          ? campos.contentSize
          : ((item as any).contentSize == null
              ? null
              : Number((item as any).contentSize)),
        campos.contentUnit !== undefined
          ? campos.contentUnit
          : ((item as any).contentUnit ?? null),
      );
    }

    /*
     * O que já foi gravado NÃO se mexe. Cada movimento tem seu `costAtTime`
     * congelado, e mudar a embalagem hoje não pode reescrever o que a compra
     * de ontem custou — senão o histórico deixa de ser histórico.
     */
    await inventoryItemRepository.update(storeId, itemId, campos);
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
      /**
       * Transação de fora, para o movimento entrar no MESMO commit do chamador.
       *
       * O checkout precisa disto: a reserva tem que nascer e morrer junto com o
       * pedido. Sem `tx`, este método abre a própria transação e o pedido
       * commita antes — foi assim que pedido confirmado sem estoque virou marca
       * de inconsistência em vez de recusa.
       *
       * Prisma não aninha transação: passar uma de fora é o único jeito.
       * Ausente, o comportamento é exatamente o de antes.
       */
      tx?: Prisma.TransactionClient;
    }
  ) {
    const itemId = (data as any).itemId as string;
    const unitId = (data as any).unitId as string;
    const originalMovementId = (data as any).originalMovementId as string | undefined;
    const custoExplicito = (data as any).costAtTime as number | string | null | undefined;
    const permitirNegativoExplicito = (data as any).permitirSaldoNegativo as
      | boolean
      | undefined;
    const txDeFora = (data as any).tx as Prisma.TransactionClient | undefined;

    /*
     * Atalho: se já existe, devolve sem abrir transação. Não é a garantia.
     *
     * Dentro de uma transação de fora a consulta precisa ir pelo MESMO cliente,
     * senão ela não enxerga o que aquela transação ainda não commitou — e uma
     * retentativa dentro do mesmo pedido gravaria a chave duas vezes.
     */
    const existing = txDeFora
      ? await txDeFora.inventoryMovement.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
        })
      : await inventoryMovementRepository.findByIdempotencyKey(
          data.idempotencyKey
        );
    if (existing) return existing;

    if (data.type === "REVERSAL" && !originalMovementId) {
      throw new Error("REVERSAL requires originalMovementId");
    }

    /*
     * O corpo inteiro, parametrizado pelo cliente. Com `tx` de fora ele roda
     * dentro daquela transação; sem, abre a própria — o mesmo de sempre.
     *
     * O `SELECT ... FOR UPDATE` e a checagem de disponível continuam aqui
     * dentro, então a proteção vale nos dois modos.
     */
    const corpo = async (tx: Prisma.TransactionClient) => {
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
    };

    try {
      return txDeFora
        ? await corpo(txDeFora)
        : await prisma.$transaction(corpo);
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
    orderId: string,
    /**
     * Transação do chamador, para a reserva viver ou morrer com o pedido.
     *
     * Sem ela, o pedido commita e a reserva vem depois — e uma reserva que
     * falha deixa pedido confirmado sem estoque. Com ela, falhar aqui desfaz
     * o pedido inteiro.
     */
    tx?: Prisma.TransactionClient,
  ) {
    /*
     * A conferência de disponível AQUI é atalho para dar mensagem cedo. Quem
     * garante é a checagem dentro de `recordMovement`, sobre a linha travada:
     * esta lê sem lock e dois pedidos simultâneos passariam os dois.
     *
     * Dentro de uma transação de fora, a leitura vai pelo mesmo cliente para
     * enxergar o que ela já escreveu.
     */
    const item = tx
      ? await tx.inventoryItem.findFirst({ where: { id: itemId, storeId } })
      : await inventoryItemRepository.findById(storeId, itemId);
    if (!item) {
      throw new Error("Item not found");
    }

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
      tx,
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
