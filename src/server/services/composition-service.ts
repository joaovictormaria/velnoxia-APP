import { prisma } from "@/server/db/client";
import {
  productCompositionRepository,
  compositionItemRepository,
  inventoryUnitRepository,
  inventoryItemRepository,
  inventoryMovementRepository,
} from "@/server/repositories";
import type {
  CreateProductCompositionInput,
  UpdateProductCompositionInput,
  CriarReceitaDePreparadoInput,
  AtualizarReceitaDePreparadoInput,
} from "@/lib/estoque-schemas";
import { CicloDeReceita } from "./ciclo-de-receita";

export class CompositionService {
  /**
   * Create a new product composition (recipe)
   * Validates all items and units exist, creates version
   */
  static async createComposition(
    storeId: string,
    productId: string,
    data: CreateProductCompositionInput
  ) {
    // productId é apenas um identificador para a receita, não precisa validar se existe na tabela Product

    // Validate all items and units exist
    for (const item of data.items) {
      const inventoryItem = await inventoryItemRepository.findById(
        storeId,
        item.inventoryItemId
      );
      if (!inventoryItem) {
        throw new Error(`Inventory item not found: ${item.inventoryItemId}`);
      }

      const unit = await inventoryUnitRepository.findById(item.unitId);
      if (!unit) {
        throw new Error(`Unit not found: ${item.unitId}`);
      }
    }

    // Get next version number
    const nextVersion = await productCompositionRepository.getNextVersion(
      productId
    );

    return prisma.$transaction(async (tx) => {
      // Deactivate previous active version
      await tx.productComposition.updateMany({
        where: { productId, isActive: true },
        data: { isActive: false },
      });

      // Create new composition
      const composition = await tx.productComposition.create({
        data: {
          storeId,
          productId,
          version: nextVersion,
          isActive: data.isActive ?? true,
        },
      });

      // Create composition items
      if (data.items.length > 0) {
        await tx.compositionItem.createMany({
          data: data.items.map((item, idx) => ({
            compositionId: composition.id,
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitId: item.unitId,
            sortOrder: item.sortOrder ?? idx,
          })),
        });
      }

      const result = await tx.productComposition.findUnique({
        where: { id: composition.id },
        include: {
          items: {
            include: { inventoryItem: true, unit: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      // Serialize ALL Decimals to Numbers
      if (result) {
        return {
          ...result,
          items: (result?.items || []).map((item) => ({
            ...item,
            quantity: Number(item.quantity),
            inventoryItem: item.inventoryItem ? {
              ...item.inventoryItem,
              quantityOnHand: Number(item.inventoryItem.quantityOnHand ?? 0),
              quantityReserved: Number(item.inventoryItem.quantityReserved ?? 0),
              cost: item.inventoryItem.cost ? Number(item.inventoryItem.cost) : null,
              contentSize: item.inventoryItem.contentSize ? Number(item.inventoryItem.contentSize) : null,
              maximumQuantity: Number(item.inventoryItem.maximumQuantity ?? 0),
            } : null,
          })),
        };
      }

      return result;
    });
  }

  /**
   * Update a composition (can be edited even after being used)
   */
  static async updateComposition(
    storeId: string,
    compositionId: string,
    data: UpdateProductCompositionInput
  ) {
    const composition =
      await productCompositionRepository.findById(storeId, compositionId);
    if (!composition) {
      throw new Error("Composition not found");
    }

    // Permitir edição mesmo após uso
    // O campo firstUsedAt é apenas histórico, não congela a receita

    // If items provided, replace all
    if (data.items) {
      // Validate all items
      for (const item of data.items) {
        const invItem = await inventoryItemRepository.findById(
          storeId,
          item.inventoryItemId
        );
        if (!invItem) {
          throw new Error(
            `Inventory item not found: ${item.inventoryItemId}`
          );
        }

        const unit = await inventoryUnitRepository.findById(item.unitId);
        if (!unit) {
          throw new Error(`Unit not found: ${item.unitId}`);
        }
      }

      return prisma.$transaction(async (tx) => {
        // Delete old items
        await tx.compositionItem.deleteMany({
          where: { compositionId },
        });

        // Create new items
        await tx.compositionItem.createMany({
          data: data.items!.map((item, idx) => ({
            compositionId,
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitId: item.unitId,
            sortOrder: item.sortOrder ?? idx,
          })),
        });

        return tx.productComposition.findUnique({
          where: { id: compositionId },
          include: {
            items: {
              include: { inventoryItem: true, unit: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        });
      });
    }

    // Just update isActive
    await productCompositionRepository.update(compositionId, {
      isActive: data.isActive,
    });

    return productCompositionRepository.findById(storeId, compositionId);
  }

  /**
   * Get active composition for a product
   */
  static async getActiveComposition(storeId: string, productId: string) {
    return productCompositionRepository.findActiveForProduct(storeId, productId);
  }

  /**
   * Get all versions of a product
   */
  static async getProductVersions(storeId: string, productId: string) {
    return productCompositionRepository.findAllVersions(storeId, productId);
  }

  /**
   * Ativa uma versão e desativa as irmãs — as do MESMO dono.
   *
   * O filtro precisa nomear o dono certo. Enquanto `productId` era NOT NULL,
   * `where: { productId: composition.productId }` sempre vinha preenchido e
   * escopava sozinho. Depois que a ficha ganhou um segundo dono possível, uma
   * receita de preparado traz `productId` nulo — e `WHERE "productId" IS NULL`
   * casa TODAS as receitas de preparado do banco, de todas as lojas. Ativar
   * uma versão de molho desativaria a receita de todo mundo.
   *
   * O `storeId` entra junto por cinto e suspensório: mesmo com o dono certo,
   * nenhuma consulta deste módulo deveria poder atravessar lojas.
   */
  static async activateVersion(storeId: string, compositionId: string) {
    const composition =
      await productCompositionRepository.findById(storeId, compositionId);
    if (!composition) {
      throw new Error("Composition not found");
    }

    const dono = composition.productId
      ? { productId: composition.productId }
      : { inventoryItemId: composition.inventoryItemId };

    return prisma.$transaction(async (tx) => {
      // Desativa as outras versões DESTE dono, nesta loja.
      await tx.productComposition.updateMany({
        where: { storeId, isActive: true, ...dono },
        data: { isActive: false },
      });

      // Activate this version
      return tx.productComposition.update({
        where: { id: compositionId },
        data: { isActive: true },
        include: {
          items: {
            include: { inventoryItem: true, unit: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
    });
  }

  /**
   * Calculate total cost of a composition
   */
  static async calculateCost(storeId: string, compositionId: string) {
    const composition =
      await productCompositionRepository.findById(storeId, compositionId);
    if (!composition) {
      throw new Error("Composition not found");
    }

    return compositionItemRepository.calculateTotalCost(compositionId);
  }

  /**
   * Delete a composition (only if never used)
   */
  static async deleteComposition(storeId: string, compositionId: string) {
    const composition =
      await productCompositionRepository.findById(storeId, compositionId);
    if (!composition) {
      throw new Error("Composition not found");
    }

    if (composition.firstUsedAt) {
      throw new Error("Cannot delete composition that has been used");
    }

    // Don't delete, just deactivate
    return productCompositionRepository.deactivate(storeId, compositionId);
  }

  /**
   * Mark composition as used (freezes it, prevents edits)
   * Called when composition is first used in a movement
   */
  static async markAsUsed(compositionId: string) {
    return productCompositionRepository.markAsUsed(compositionId);
  }

  // ==================================================================
  // RECEITA DE PREPARADO
  //
  // Métodos próprios, ao lado dos de produto, em vez de um parâmetro a mais
  // nos existentes. O caminho de produto é chamado pelo CompositionBuilder,
  // que está no ar; mudar a assinatura dele obrigaria a mexer na tela agora,
  // e a tela é a última etapa. A unificação vem junto com ela.
  //
  // As duas fichas respondem a perguntas diferentes: a de produto diz o que a
  // Pizza consome; a de preparado diz o que o Molho consome E QUANTO RENDE.
  // ==================================================================

  /**
   * Cria uma nova versão da receita de um preparado.
   *
   * Versiona como a de produto: a anterior é desativada e a nova nasce ativa,
   * para que uma produção em andamento continue lendo a versão que congelou.
   */
  static async criarReceitaDePreparado(
    storeId: string,
    inventoryItemId: string,
    data: CriarReceitaDePreparadoInput,
  ) {
    const preparado = await this.preparadoValidado(storeId, inventoryItemId);
    await this.validarInsumos(storeId, data.items);
    await this.validarRendimento(data.yieldUnitId);

    /*
     * O ciclo é conferido ANTES de gravar. Depois é tarde: qualquer caminho
     * que leia a receita entra em laço, inclusive o motor de produção no meio
     * de uma transação segurando travas de estoque.
     */
    await CicloDeReceita.conferir(
      storeId,
      inventoryItemId,
      data.items.map((i) => i.inventoryItemId),
    );

    const proximaVersao = await this.proximaVersaoDoPreparado(inventoryItemId);

    return prisma.$transaction(async (tx) => {
      await tx.productComposition.updateMany({
        where: { inventoryItemId, isActive: true },
        data: { isActive: false },
      });

      const receita = await tx.productComposition.create({
        data: {
          storeId,
          inventoryItemId,
          version: proximaVersao,
          isActive: data.isActive ?? true,
          yieldQuantity: data.yieldQuantity,
          yieldUnitId: data.yieldUnitId,
          items: {
            create: data.items.map((item, idx) => ({
              inventoryItemId: item.inventoryItemId,
              quantity: item.quantity,
              unitId: item.unitId,
              sortOrder: item.sortOrder ?? idx,
            })),
          },
        },
        include: {
          items: { include: { inventoryItem: true, unit: true }, orderBy: { sortOrder: "asc" } },
          inventoryItem: true,
          yieldUnit: true,
        },
      });

      return this.serializar(receita, preparado.name);
    });
  }

  /**
   * Substitui os insumos e o rendimento de uma receita de preparado.
   *
   * Edita a versão no lugar, como a de produto faz. Uma produção que já
   * congelou esta versão continua apontando para ela — o congelamento guarda o
   * id, e o id não muda.
   */
  static async atualizarReceitaDePreparado(
    storeId: string,
    compositionId: string,
    data: AtualizarReceitaDePreparadoInput,
  ) {
    const receita = await prisma.productComposition.findFirst({
      where: { id: compositionId, storeId },
      include: { items: true },
    });
    if (!receita) throw new Error("Receita não encontrada.");
    if (!receita.inventoryItemId) {
      throw new Error(
        "Esta ficha pertence a um produto do cardápio. Use a edição de ficha de produto.",
      );
    }

    if (data.items) {
      await this.validarInsumos(storeId, data.items);
      // Confere o ciclo com os insumos NOVOS, não com os que estão gravados.
      await CicloDeReceita.conferir(
        storeId,
        receita.inventoryItemId,
        data.items.map((i) => i.inventoryItemId),
      );
    }
    if (data.yieldUnitId) await this.validarRendimento(data.yieldUnitId);

    return prisma.$transaction(async (tx) => {
      if (data.items) {
        await tx.compositionItem.deleteMany({ where: { compositionId } });
        await tx.compositionItem.createMany({
          data: data.items.map((item, idx) => ({
            compositionId,
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitId: item.unitId,
            sortOrder: item.sortOrder ?? idx,
          })),
        });
      }

      const atualizada = await tx.productComposition.update({
        where: { id: compositionId },
        data: {
          ...(data.yieldQuantity !== undefined ? { yieldQuantity: data.yieldQuantity } : {}),
          ...(data.yieldUnitId !== undefined ? { yieldUnitId: data.yieldUnitId } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
        include: {
          items: { include: { inventoryItem: true, unit: true }, orderBy: { sortOrder: "asc" } },
          inventoryItem: true,
          yieldUnit: true,
        },
      });

      return this.serializar(atualizada, atualizada.inventoryItem?.name ?? "");
    });
  }

  /** A receita que vale para um preparado agora. */
  static async receitaAtivaDoPreparado(storeId: string, inventoryItemId: string) {
    return prisma.productComposition.findFirst({
      where: { storeId, inventoryItemId, isActive: true },
      orderBy: { version: "desc" },
      include: {
        items: { include: { inventoryItem: true, unit: true }, orderBy: { sortOrder: "asc" } },
        yieldUnit: true,
      },
    });
  }

  // ---------------- privados, compartilhados ----------------

  private static async preparadoValidado(storeId: string, inventoryItemId: string) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, storeId },
    });
    if (!item) throw new Error("Item de estoque não encontrado.");
    if (item.itemType !== "PREPARED") {
      throw new Error(
        `"${item.name}" não é um preparado. Só itens do tipo PREPARED têm receita — ` +
          `um insumo comprado não é produzido.`,
      );
    }
    return item;
  }

  private static async validarInsumos(
    storeId: string,
    items: Array<{ inventoryItemId: string; unitId: string }>,
  ) {
    for (const item of items) {
      const insumo = await prisma.inventoryItem.findFirst({
        where: { id: item.inventoryItemId, storeId },
        select: { id: true },
      });
      if (!insumo) throw new Error(`Insumo não encontrado: ${item.inventoryItemId}`);

      const unidade = await prisma.inventoryUnit.findUnique({
        where: { id: item.unitId },
        select: { id: true },
      });
      if (!unidade) throw new Error(`Unidade não encontrada: ${item.unitId}`);
    }
  }

  private static async validarRendimento(yieldUnitId: string) {
    const unidade = await prisma.inventoryUnit.findUnique({
      where: { id: yieldUnitId },
      select: { id: true },
    });
    if (!unidade) {
      throw new Error(`Unidade de rendimento não encontrada: ${yieldUnitId}`);
    }
  }

  private static async proximaVersaoDoPreparado(inventoryItemId: string) {
    const ultima = await prisma.productComposition.findFirst({
      where: { inventoryItemId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    return (ultima?.version ?? 0) + 1;
  }

  /** Decimal não atravessa a fronteira do servidor; vira número aqui. */
  private static serializar(receita: any, nomeDoPreparado: string) {
    return {
      ...receita,
      nomeDoPreparado,
      yieldQuantity: receita.yieldQuantity == null ? null : Number(receita.yieldQuantity),
      items: (receita.items ?? []).map((item: any) => ({
        ...item,
        quantity: Number(item.quantity),
        inventoryItem: item.inventoryItem
          ? {
              ...item.inventoryItem,
              quantityOnHand: Number(item.inventoryItem.quantityOnHand ?? 0),
              quantityReserved: Number(item.inventoryItem.quantityReserved ?? 0),
              cost: item.inventoryItem.cost == null ? null : Number(item.inventoryItem.cost),
              contentSize:
                item.inventoryItem.contentSize == null
                  ? null
                  : Number(item.inventoryItem.contentSize),
              maximumQuantity: Number(item.inventoryItem.maximumQuantity ?? 0),
            }
          : null,
      })),
    };
  }
}
