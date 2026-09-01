// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { exigirRecurso } from "@/server/billing/guarda-de-recurso";
import { InventoryService } from "@/server/services/inventory-service";
import {
  createInventoryItemClientSchema,
  createInventoryItemSchema,
  updateInventoryItemSchema,
  createInventoryMovementSchema,
  createReversalSchema,
  createReservationSchema,
  createConsumptionSchema,
  createAdjustmentSchema,
} from "@/lib/estoque-schemas";
import { inventoryItemRepository, inventoryUnitRepository, reportRepository } from "@/server/repositories";
import { numeros } from "./serializar";
import { prisma } from "@/server/db/client";
import { calcularMovimentoDeCompra } from "@/lib/embalagem-de-compra";

/**
 * Generate unique SKU automatically
 * Format: {ITEMTYPE}-{TIMESTAMP}-{RANDOM}
 * Example: ING-1724272800-A7K9
 */
function generateSKU(itemType: string): string {
  const typePrefix = {
    INGREDIENT: "ING",
    RESALE: "RSL",
    PRODUCED: "PRD",
    PACKAGING: "PKG",
  }[itemType] || "ITM";

  const timestamp = Math.floor(Date.now() / 1000);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();

  return `${typePrefix}-${timestamp}-${random}`;
}

/**
 * Serialize InventoryItem Decimals to Numbers
 */
function serializeInventoryItem(item: any) {
  return {
    ...item,
    quantityOnHand: Number(item.quantityOnHand ?? 0),
    quantityReserved: Number(item.quantityReserved ?? 0),
    quantityAvailable: Number(item.quantityAvailable ?? 0),
    cost: item.cost ? Number(item.cost) : null,
    minimumThreshold: item.minimumThreshold ? Number(item.minimumThreshold) : null,
    idealQuantity: item.idealQuantity ? Number(item.idealQuantity) : null,
    maximumQuantity: item.maximumQuantity ? Number(item.maximumQuantity) : null,
    contentSize: item.contentSize ? Number(item.contentSize) : null,
    purchasePackSize: item.purchasePackSize ? Number(item.purchasePackSize) : null,
    purchasePackLabel: item.purchasePackLabel ?? null,
    contentSize: item.contentSize ? Number(item.contentSize) : null,
    contentUnit: item.contentUnit ?? null,
  };
}

/**
 * Admin only: Create a new inventory item
 */

/**
 * As unidades de medida disponíveis.
 *
 * A tela precisa delas para oferecer o id certo. Antes as opções eram fixas no
 * componente — inclusive "m" e "cm", que não existem no banco — e o que ia para
 * o servidor era o código, não o id.
 */
export const adminListarUnidades = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireAdminSession();
    const unidades = await inventoryUnitRepository.findAll();
    // `system` (WEIGHT/VOLUME/COUNT) e o que deixa a tela decidir se o campo de
    // conteudo faz sentido para a unidade escolhida.
    return unidades.map((u: any) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      system: u.system,
    }));
  },
);

/**
 * As conversoes entre unidades, para a tela fazer a MESMA conta do servidor.
 *
 * O custo estimado da ficha tecnica precisa bater com o custo que a venda vai
 * gravar. Enquanto a tela nao tinha as conversoes, ela so conseguia multiplicar
 * quantidade por custo — o que dava 100 g de acucar a R$ 5,00/kg valendo
 * R$ 500,00. Mandar as mesmas linhas que o servidor usa e o que garante uma
 * formula so.
 */
export const adminListarConversoesDeUnidade = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireAdminSession();
    const linhas = await prisma.inventoryUnitConversion.findMany({
      select: { fromUnitId: true, toUnitId: true, conversionFactor: true },
    });
    return linhas.map((c: any) => ({
      fromUnitId: c.fromUnitId,
      toUnitId: c.toUnitId,
      conversionFactor: Number(c.conversionFactor),
    }));
  },
);
export const adminCreateInventoryItem = createServerFn({ method: "POST" })
  .handler(async ({ data }: any) => {
    const admin = await exigirRecurso("ESTOQUE");
    const itemData = data?.data || data;

    const itemType = itemData?.itemType || "INGREDIENT";

    /*
     * A tela manda o ID da unidade, não o código.
     *
     * Aqui existia uma tradução código → id com a heurística
     * `if (!baseUnitId.includes('-'))` — "sem hífen, deve ser código" —
     * desenhada para UUID, formato que este projeto não usa. Ela quebrava dos
     * dois lados: `"kg"` só funcionava por acidente, e o id real `unit_kg`
     * também não tem hífen, então era tratado como código e morria em
     * `Unit "unit_kg" not found`.
     *
     * Adivinhar o que o cliente mandou é o problema. A tela agora carrega as
     * unidades do banco e manda o id; quem não existir é recusado pelo
     * `findById` do serviço, com mensagem clara.
     */
    const unitId = itemData?.baseUnitId;
    if (!unitId) {
      throw new Error("Escolha a unidade em que este item é contado.");
    }

    // Gerar SKU automaticamente
    const sku = itemData?.sku || generateSKU(itemType);

    // Usar SKU como nome se nÃ£o fornecido
    const name = itemData?.name || sku;

    const createData = createInventoryItemSchema.parse({
      name: name,
      sku: sku,
      barcode: itemData?.barcode || null,
      baseUnitId: unitId,
      cost: itemData?.cost ? parseFloat(itemData.cost) : undefined,
      itemType: itemType,
      purchasePackSize: itemData?.purchasePackSize
        ? parseFloat(String(itemData.purchasePackSize))
        : null,
      purchasePackLabel: itemData?.purchasePackLabel || null,
      contentSize: itemData?.contentSize
        ? parseFloat(String(itemData.contentSize))
        : null,
      contentUnit: itemData?.contentUnit || null,
      /*
       * O MÍNIMO DO ALERTA, que nunca chegava ao banco.
       *
       * A tela sempre mandou o campo, mas ele não estava nesta lista — e o que
       * não está aqui não entra no `parse`, logo não existe para o serviço. O
       * item nascia com `minimumThreshold` nulo, `statusDoEstoque` respondia
       * NORMAL para todo mundo e o contador de alertas ficava em zero para
       * sempre. Nada dava erro: o valor era descartado em silêncio.
       *
       * Ausente continua sendo `undefined` — item que nasce sem alerta.
       */
      minimumThreshold:
        itemData?.minimumThreshold == null
          ? undefined
          : Number(itemData.minimumThreshold),
    });

    /*
     * A quantidade inicial faz parte da criação, e por isso vai na MESMA
     * chamada. A tela fazia duas: criava o item e depois registrava a entrada,
     * engolindo o erro da segunda num `console.error`. O item ficava com saldo
     * zero e o operador via "criado com sucesso".
     */
    /*
     * `initialQuantity` conta EMBALAGENS quando o item tem uma, e unidades
     * de estoque quando não tem. Quem faz a conta é o serviço: a tela mostra
     * o resultado, mas não é ela quem decide.
     */
    const inicial = itemData?.initialQuantity
      ? parseFloat(String(itemData.initialQuantity))
      : 0;
    const precoDaEmbalagem = itemData?.cost
      ? parseFloat(String(itemData.cost))
      : null;

    const result = await InventoryService.criarItemComSaldoInicial(
      admin.storeId,
      createData,
      inicial > 0
        ? { quantidade: inicial, unitId, precoDaEmbalagem }
        : undefined,
    );
    return serializeInventoryItem(result);
  });

/**
 * Admin only: Update inventory item
 */
export const adminUpdateInventoryItem = createServerFn({ method: "POST" })
  .validator(z.object({
    itemId: z.string(),
    name: z.string().optional(),
    sku: z.string().optional(),
    barcode: z.string().optional(),
    cost: z.string().optional(),
    isActive: z.string().optional(),
    // A embalagem tambem se edita: o item ja existe e so agora se soube que
    // vem em caixa de 30. Sem estes tres, o .validator descartava tudo em
    // silencio antes de o handler ver.
    purchasePackSize: z.string().optional(),
    purchasePackLabel: z.string().optional(),
    precoDaEmbalagem: z.string().optional(),
    contentSize: z.string().optional(),
    contentUnit: z.string().optional(),
    /*
     * NÚMERO, e não string como os vizinhos.
     *
     * Os outros campos numéricos chegam como texto porque a tela manda o valor
     * cru do input. Este não: o formulário já converte com `Number()` antes de
     * enviar, e manda `null` quando o campo está vazio. Declarar `z.string()`
     * aqui recusaria a requisição inteira com "expected string, received
     * number" — trocaria um descarte silencioso por um erro na cara do
     * operador, e o mínimo continuaria sem ser gravado.
     *
     * Ausente = não mexe. Nulo = apaga o alerta.
     */
    minimumThreshold: z.number().nonnegative().nullable().optional(),
  }))
  .handler(async ({ data }) => {
    const admin = await exigirRecurso("ESTOQUE");

    const validated = updateInventoryItemSchema.parse({
      name: data.name || undefined,
      sku: data.sku ? data.sku : undefined,
      barcode: data.barcode ? data.barcode : undefined,
      cost: data.cost ? parseFloat(data.cost) : undefined,
      isActive: data.isActive !== undefined ? data.isActive === "true" : undefined,
      purchasePackSize: data.purchasePackSize
        ? parseFloat(data.purchasePackSize)
        : data.purchasePackSize === ""
          ? null
          : undefined,
      purchasePackLabel:
        data.purchasePackLabel === ""
          ? null
          : data.purchasePackLabel || undefined,
      precoDaEmbalagem: data.precoDaEmbalagem
        ? parseFloat(data.precoDaEmbalagem)
        : undefined,
      // "" apaga o conteudo; ausente nao mexe.
      contentSize: data.contentSize
        ? parseFloat(data.contentSize)
        : data.contentSize === ""
          ? null
          : undefined,
      contentUnit:
        data.contentUnit === "" ? null : data.contentUnit || undefined,
      // Os três estados são distintos e cada um significa uma coisa: ausente
      // não mexe no que está gravado, nulo apaga o alerta, número define.
      minimumThreshold:
        data.minimumThreshold === undefined ? undefined : data.minimumThreshold,
    });

    const result = await InventoryService.updateItem(admin.storeId, data.itemId, validated);
    return serializeInventoryItem(result);
  });

/**
 * Admin only: Record a movement (PURCHASE, LOSS, ADJUSTMENT, etc)
 */
export const adminRecordMovement = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await exigirRecurso("ESTOQUE");
    const data = context?.data?.data || context?.data;

    const digitado = data?.quantity ? parseFloat(data.quantity) : 0;

    /*
     * COMPRA EM EMBALAGENS.
     *
     * Quando a tela manda `emEmbalagens`, o número digitado conta CAIXAS, não
     * unidades de estoque: 5 caixas de 30 entram como 150 ovos. O conteúdo vem
     * do item, cadastrado uma vez, e não do formulário — assim ninguém redigita
     * "30 por caixa" a cada compra, nem erra o número numa delas.
     *
     * Sem `emEmbalagens`, ou em item sem embalagem, `conteudo` é 1 e a conta é
     * a de sempre. É o caminho de todo item anterior a este conceito.
     */
    const item = data?.itemId
      ? await inventoryItemRepository.findById(admin.storeId, data.itemId)
      : null;
    const emEmbalagens =
      data?.emEmbalagens === true || data?.emEmbalagens === "true";

    /*
     * O formulário pergunta o valor TOTAL pago, porque é o que está na nota:
     * "5,2 kg — R$ 41,60". A divisão acontece aqui, não na cabeça do operador,
     * que é onde nasce erro de digitação.
     *
     * Dividido pela quantidade em UNIDADE DE ESTOQUE — 150, não 5 — para que o
     * unitário saia R$ 0,50 por ovo, e não R$ 15,00 por caixa disfarçado de
     * preço do ovo.
     *
     * Só vale para compra. Perda e ajuste não têm valor pago, e um total
     * enviado por engano num desses tipos é ignorado em vez de virar custo.
     */
    const totalPago = data?.totalPaid ? parseFloat(data.totalPaid) : null;

    const movimento = calcularMovimentoDeCompra({
      digitado,
      conteudoDoItem: item?.purchasePackSize
        ? Number(item.purchasePackSize)
        : null,
      emEmbalagens,
      // Só a compra tem valor pago. Perda e ajuste não, e um total enviado por
      // engano num desses é ignorado em vez de virar custo.
      totalPago: data?.type === "PURCHASE" ? totalPago : null,
    });
    const quantity = movimento.quantity;
    const custoUnitario = movimento.custoUnitario ?? undefined;

    const validated = createInventoryMovementSchema.parse({
      itemId: data?.itemId,
      type: data?.type,
      quantity,
      unitId: data?.unitId,
      reference: data?.reference || undefined,
      referenceType: data?.referenceType || undefined,
      note: data?.note || undefined,
      costAtTime: custoUnitario,
      authorType: "ADMIN",
      authorId: admin.id,
      authorName: admin.name,
    });

    // Generate idempotency key - use timestamp for manual movements (no reference)
    const timestamp = Date.now();
    const idempotencyKey = data.reference
      ? `${admin.storeId}#${data.referenceType}#${data.reference}#${data.type}#${data.itemId}`
      : `${admin.storeId}#MANUAL#${data.type}#${data.itemId}#${timestamp}`;

    const result = await InventoryService.recordMovement(admin.storeId, {
      ...validated,
      idempotencyKey,
    });

    // Serialize Decimal values - convert ALL numeric fields
    return {
      id: result.id,
      storeId: result.storeId,
      itemId: result.itemId,
      type: result.type,
      quantity: Number(result.quantity ?? 0),
      unitId: result.unitId,
      reference: result.reference,
      referenceType: result.referenceType,
      originalMovementId: result.originalMovementId,
      compositionId: result.compositionId,
      costAtTime: result.costAtTime ? Number(result.costAtTime) : null,
      note: result.note,
      authorType: result.authorType,
      authorId: result.authorId,
      authorName: result.authorName,
      idempotencyKey: result.idempotencyKey,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  });

/**
 * Admin only: Reverse a movement
 */
export const adminReverseMovement = createServerFn({ method: "POST" })
  .validator(z.object({
    originalMovementId: z.string(),
  }))
  .handler(async ({ data }) => {
    const admin = await exigirRecurso("ESTOQUE");

    const validated = createReversalSchema.parse({
      originalMovementId: data.originalMovementId,
      authorType: "ADMIN",
      authorId: admin.id,
      authorName: admin.name,
    });

    return InventoryService.reverseMovement(admin.storeId, validated.originalMovementId, {
      authorType: validated.authorType,
      authorId: validated.authorId,
      authorName: validated.authorName,
    });
  });

/**
 * System: Reserve quantity for an order (called on ORDER RECEIVED)
 */
export const systemReserveForOrder = createServerFn({ method: "POST" })
  .validator(z.object({
    itemId: z.string(),
    quantity: z.string(),
    orderId: z.string(),
  }))
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();

    return InventoryService.reserveForOrder(
      admin.storeId,
      data.itemId,
      parseFloat(data.quantity),
      data.orderId
    );
  });

/**
 * System: Consume quantity for an order (called on PREPARING)
 */
export const systemConsumeForOrder = createServerFn({ method: "POST" })
  .validator(z.object({
    itemId: z.string(),
    quantity: z.string(),
    orderId: z.string(),
  }))
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();

    return InventoryService.consumeForOrder(
      admin.storeId,
      data.itemId,
      parseFloat(data.quantity),
      data.orderId
    );
  });

/**
 * Public: Get store inventory (active items only)
 */
export const getStoreInventory = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await exigirRecurso("ESTOQUE");

    return inventoryItemRepository.findAll(admin.storeId, { includeInactive: false });
  });

/**
 * Public: Get item details with quantities
 */
export const getItemDetails = createServerFn({ method: "POST" })
  .validator(z.object({
    itemId: z.string(),
  }))
  .handler(async ({ data }) => {
    const admin = await exigirRecurso("ESTOQUE");

    return inventoryItemRepository.getSummary(admin.storeId, data.itemId);
  });

/**
 * Admin only: Get total inventory value
 */
export const adminGetInventoryValue = createServerFn({ method: "POST" })
  .handler(async () => {
    const admin = await exigirRecurso("ESTOQUE");

    const items = await inventoryItemRepository.findAll(admin.storeId, {
      includeInactive: false,
    });

    const totalValue = items.reduce((sum, item) => {
      return sum + (Number(item.quantityOnHand) * (item.cost || 0));
    }, 0);

    return { totalValue };
  });

/**
 * Admin only: Get low stock alerts
 *
 * O RETORNO PASSA POR `numeros()`, e essa era a razao do painel mostrar zero.
 *
 * O handler devolvia os itens CRUS do Prisma, com `quantityOnHand`,
 * `quantityReserved`, `minimumThreshold` e `cost` como `Decimal`. O seroval do
 * TanStack Start nao serializa `Decimal`: a chamada morria na fronteira, o
 * `Promise.all` do painel rejeitava e o `catch` zerava a tela inteira — o
 * contador de alertas E o valor total em estoque, que nem vem daqui.
 *
 * A REGRA NAO MUDOU: `getLowStockItems` ja filtrava por `statusDoEstoque`, a
 * mesma funcao que a aba Itens usa para pintar a linha. O que havia eram DUAS
 * consultas escrevendo o mesmo filtro; agora e uma. De quebra sai o `take: 100`
 * do `findAll`, que escondia alerta de loja com mais de cem itens.
 */
export const adminGetLowStockAlerts = createServerFn({ method: "POST" })
  .handler(async () => {
    const admin = await exigirRecurso("ESTOQUE");
    return numeros(await reportRepository.getLowStockItems(admin.storeId));
  });



/**
 * Os itens de estoque que um produto de cardápio pode controlar.
 *
 * Enxuta de propósito: o seletor precisa de nome, tipo, unidade e saldo, e nada
 * mais. O relatório de estoque traz movimentação e custo, que aqui só pesariam.
 *
 * NÃO FILTRA POR TIPO. Vender farinha a quilo é legítimo, ainda que raro —
 * bloquear ingrediente seria decidir pelo lojista. O que a ordenação faz é
 * colocar Preparado e Revenda na frente, que é o caso comum, e deixar
 * Ingrediente e Embalagem embaixo.
 */
export const adminListarItensParaVinculo = createServerFn({ method: "POST" }).handler(
  async () => {
    const admin = await requireAdminSession();
    const itens = await prisma.inventoryItem.findMany({
      where: { storeId: admin.storeId, isActive: true },
      select: {
        id: true,
        name: true,
        itemType: true,
        quantityOnHand: true,
        baseUnit: { select: { code: true } },
      },
      orderBy: { name: "asc" },
    });

    const ordem: Record<string, number> = {
      PREPARED: 0,
      RESALE: 1,
      INGREDIENT: 2,
      PACKAGING: 3,
    };

    return itens
      .map((i) => ({
        id: i.id,
        nome: i.name,
        tipo: i.itemType as string,
        unidade: i.baseUnit.code,
        // Decimal não sobrevive à serialização da server function.
        saldo: Number(i.quantityOnHand),
      }))
      .sort(
        (a, b) =>
          (ordem[a.tipo] ?? 9) - (ordem[b.tipo] ?? 9) ||
          a.nome.localeCompare(b.nome),
      );
  },
);
