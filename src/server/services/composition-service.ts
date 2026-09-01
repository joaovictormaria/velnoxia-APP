import { prisma } from "@/server/db/client";
import {
  converterParaUnidadeBase,
  montarMapaDeConversoes,
} from "@/lib/conversao-de-unidade";
import { unidadeEhCompativel } from "@/lib/unidades-compativeis";
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
import { CustoDoPreparado } from "./custo-do-preparado";

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

    /*
      UMA CONFERENCIA SO, e nao uma copia local dela.

      Aqui havia um laco proprio que checava existencia de insumo e de unidade —
      as mesmas duas coisas que `validarInsumos` ja checava para os preparados,
      escritas de novo. Duas copias de uma regra sao duas regras: quando a
      compatibilidade de unidade foi exigida, ela entrou so em uma delas, e a
      receita de PRODUTO — que e o caminho desta funcao — continuou aceitando
      "Leite: 100 g" sem reclamar.
    */
    await this.validarInsumos(storeId, data.items);

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
      // A mesma conferencia da criacao: editar a ficha nao pode ser a porta
      // que aceita o que a criacao recusa.
      await this.validarInsumos(storeId, data.items);

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

    /*
     * Delegado ao serviço de custo. A versão do repositório somava
     * `quantidade × custo` em `Number` e sem converter unidade — 45 g de um
     * item contado em potes de 500 g viravam R$ 468,00 em vez de R$ 0,94.
     */
    const { total, linhasSemCusto } = await CustoDoPreparado.custoDaFicha(
      storeId,
      compositionId,
    );
    return { total: Number(total), linhasSemCusto };
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

  /**
   * Cria o item preparado E a receita dele, num fluxo só.
   *
   * Existe porque a tela pergunta as duas coisas juntas — nome, unidade,
   * insumos, rendimento — e separar em duas chamadas deixaria uma janela em que
   * o item existe sem receita. Um preparado sem receita é legítimo (a loja pode
   * só comprar pronto), mas não é o que quem preencheu este formulário pediu.
   *
   * A regra fica aqui, e não na server function, para poder ser testada: server
   * function do TanStack precisa de AsyncLocalStorage e não é chamável do
   * vitest.
   */
  static async criarPreparadoComReceita(
    storeId: string,
    dados: {
      nome: string;
      baseUnitId: string;
      sku?: string | null;
      receita: CriarReceitaDePreparadoInput;
    },
  ) {
    const unidade = await prisma.inventoryUnit.findUnique({
      where: { id: dados.baseUnitId },
      select: { id: true },
    });
    if (!unidade) throw new Error("Unidade de estoque não encontrada.");

    /*
     * Os insumos são conferidos ANTES de criar o item. Criar primeiro e
     * descobrir depois que um insumo não existe deixaria um preparado órfão na
     * lista, e o operador refazendo o cadastro por cima de um nome já ocupado.
     */
    await this.validarInsumos(storeId, dados.receita.items);
    await this.validarRendimento(dados.receita.yieldUnitId);

    const item = await prisma.inventoryItem.create({
      data: {
        storeId,
        name: dados.nome,
        sku: dados.sku || null,
        itemType: "PREPARED",
        baseUnitId: dados.baseUnitId,
        quantityOnHand: 0,
      },
    });

    try {
      const receita = await this.criarReceitaDePreparado(storeId, item.id, dados.receita);
      return { item, receita };
    } catch (erro) {
      /*
       * O item acabou de nascer: não tem movimento, não tem saldo, não tem
       * nada apontando para ele. Apagá-lo é seguro e é melhor do que deixar um
       * preparado sem receita que ninguém pediu.
       */
      await prisma.inventoryItem.delete({ where: { id: item.id } }).catch(() => {});
      throw erro;
    }
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  EXCLUIR UM PREPARADO
   * ═════════════════════════════════════════════════════════════════════════
   *
   * É DESATIVAÇÃO, e não `DELETE`. `InventoryItem` não tem `deletedAt`; quem
   * decide o que aparece na aba é `isActive`, e `adminListarPreparados` já
   * filtra por ele. Apagar de verdade levaria junto o histórico: os
   * `InventoryMovement` que explicam o saldo de hoje e as `ProductionRun` que
   * dizem quanto custou produzir. Um custo de venda apurado no mês passado
   * deixaria de ter de onde vir.
   *
   * A receita do preparado é desativada junto. Deixá-la ativa manteria uma
   * ficha técnica apontando para um item que não está mais na lista — e a
   * próxima produção a encontraria.
   *
   * ⚠️ TRÊS SITUAÇÕES EM QUE ELE RECUSA, e cada uma por um motivo diferente:
   *
   *   1. TEM SALDO. Sumir com um item que tem 8 kg em estoque não faz os 8 kg
   *      deixarem de existir — faz eles deixarem de ser contados. O valor do
   *      inventário cairia sem nenhum movimento que explicasse a queda.
   *
   *   2. TEM RESERVA. Há pedido aberto contando com ele. A reserva só se
   *      desfaz quando o pedido fecha ou é cancelado; desativar agora deixaria
   *      a reserva presa para sempre, e o consumo não teria o que baixar.
   *
   *   3. É INGREDIENTE DE OUTRA FICHA. Algum produto do cardápio usa este
   *      preparado. Sem ele, aquela ficha perde uma parcela do custo — e não
   *      dá erro: o produto simplesmente passa a parecer mais barato do que é,
   *      e a margem que a loja lê fica errada.
   *
   * Nos três casos a recusa diz O QUE fazer, porque em todos há saída: dar
   * baixa, fechar o pedido, tirar da outra ficha.
   */
  static async excluirPreparado(storeId: string, inventoryItemId: string) {
    const item = await prisma.inventoryItem.findFirst({
      /*
       * `storeId` no `where`, e não conferido depois. É a mesma regra de
       * isolamento do resto do módulo: a loja A não enxerga o id da loja B, e
       * a consulta que não acha devolve "não encontrado" — sem revelar que o
       * id existe em outro lugar.
       */
      where: { id: inventoryItemId, storeId, itemType: "PREPARED" },
      select: {
        id: true,
        name: true,
        isActive: true,
        quantityOnHand: true,
        quantityReserved: true,
      },
    });
    if (!item) throw new Error("Preparado não encontrado.");

    if (!item.quantityOnHand.equals(0)) {
      throw new Error(
        `"${item.name}" ainda tem saldo em estoque. Dê baixa por perda ou consumo antes de excluir.`,
      );
    }

    if (item.quantityReserved.greaterThan(0)) {
      throw new Error(
        `"${item.name}" está reservado para pedidos em aberto. Feche ou cancele esses pedidos antes de excluir.`,
      );
    }

    /*
     * Só as fichas ATIVAS bloqueiam. Uma versão antiga e desativada de uma
     * receita é histórico — ela não vai ser usada em nenhuma venda nova, e
     * exigir que a loja limpe versões velhas para poder excluir um preparado
     * seria pedir arqueologia por nada.
     */
    const emUso = await prisma.compositionItem.findFirst({
      where: {
        inventoryItemId: item.id,
        composition: { storeId, isActive: true },
      },
      select: { composition: { select: { product: { select: { name: true } } } } },
    });
    if (emUso) {
      const onde = emUso.composition?.product?.name;
      throw new Error(
        onde
          ? `"${item.name}" é ingrediente da ficha de "${onde}". Tire ele de lá antes de excluir.`
          : `"${item.name}" é ingrediente da ficha técnica de outro produto. Tire ele de lá antes de excluir.`,
      );
    }

    /*
     * Item e receita na MESMA transação. Separados, uma queda no meio deixaria
     * o preparado fora da lista com a receita ainda ativa — invisível de
     * consertar pela tela, porque a tela só mostra o que está ativo.
     */
    return prisma.$transaction(async (tx) => {
      await tx.productComposition.updateMany({
        where: { storeId, inventoryItemId: item.id, isActive: true },
        data: { isActive: false },
      });
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { isActive: false },
      });
      return { id: item.id, nome: item.name };
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

  /**
   * Embalagem não é ingrediente, e o servidor é quem garante isso.
   *
   * A caixa de pizza é item de estoque comprado pronto. Dentro da ficha técnica
   * ela produziria três erros de uma vez: o custo dela viraria custo de
   * PRODUÇÃO (a corrida de produção de um preparado passaria a consumir caixa,
   * quando a caixa só é usada na venda), a lista de ingredientes deixaria de
   * significar comida, e um produto de REVENDA — que não tem ficha nenhuma —
   * continuaria sem ter onde declarar o copo dele.
   *
   * O lugar da embalagem é `ProductPackaging`, que baixa junto com a venda para
   * os três tipos de produto.
   *
   * VALE PARA AS DUAS RECEITAS: a de produto e a de preparado. Eram dois
   * caminhos de validação diferentes neste arquivo, e cobrir só um deixaria a
   * porta aberta pelo outro.
   *
   * UMA CONSULTA, com `in` — não uma por linha. Uma ficha de dez ingredientes
   * não deve custar dez viagens ao banco para descobrir que nenhuma delas é
   * embalagem.
   */
  private static async recusarEmbalagemComoInsumo(
    storeId: string,
    items: Array<{ inventoryItemId: string }>,
  ) {
    if (items.length === 0) return;
    const embalagens = await prisma.inventoryItem.findMany({
      where: {
        storeId,
        id: { in: items.map((i) => i.inventoryItemId) },
        itemType: "PACKAGING",
      },
      select: { name: true },
    });
    if (embalagens.length > 0) {
      const nomes = embalagens.map((e) => `"${e.name}"`).join(", ");
      throw new Error(
        `${nomes} ${embalagens.length === 1 ? "é uma embalagem" : "são embalagens"} ` +
          `e não pode entrar na receita. Embalagem é configurada na seção ` +
          `Embalagem do produto, e baixa junto com a venda.`,
      );
    }
  }


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

  /*
   * A UNIDADE DA RECEITA PRECISA CABER NA UNIDADE DO ESTOQUE.
   *
   * Antes daqui só se conferia que a unidade EXISTE. Bastava, enquanto a tela
   * travava a unidade na base do insumo — mas travada a tela não estava
   * validando nada, estava impedindo. Com a unidade selecionável, "existe"
   * deixaria passar "Leite: 100 g": o banco aceitaria, e a falha só apareceria
   * NA VENDA, quando `converterParaUnidadeBase` lançasse no meio da reserva.
   *
   * A tela é conveniência; a autoridade é aqui. Duas conferências, nesta ordem:
   *
   *   1. mesmo `system` — g e kg são peso, ml e L são volume, un é contagem.
   *      É a mesma regra que o `<select>` usa, na mesma função pura.
   *   2. a conversão de fato existe — mesmo sistema com fator ausente e sem
   *      `contentSize` utilizável ainda quebraria na venda. Recusar aqui é
   *      recusar enquanto a pessoa está olhando o campo.
   */
  private static async validarInsumos(
    storeId: string,
    items: Array<{ inventoryItemId: string; unitId: string; quantity?: unknown }>,
  ) {
    await this.recusarEmbalagemComoInsumo(storeId, items);

    const unidades = await prisma.inventoryUnit.findMany({
      select: { id: true, code: true, system: true },
    });
    const conversoes = montarMapaDeConversoes(
      await prisma.inventoryUnitConversion.findMany({
        select: { fromUnitId: true, toUnitId: true, conversionFactor: true },
      }),
    );

    for (const item of items) {
      const insumo = await prisma.inventoryItem.findFirst({
        where: { id: item.inventoryItemId, storeId },
        select: {
          id: true,
          name: true,
          baseUnitId: true,
          contentSize: true,
          contentUnit: true,
        },
      });
      if (!insumo) throw new Error(`Insumo não encontrado: ${item.inventoryItemId}`);

      const unidade = unidades.find((u) => u.id === item.unitId);
      if (!unidade) throw new Error(`Unidade não encontrada: ${item.unitId}`);

      const base = unidades.find((u) => u.id === insumo.baseUnitId);
      if (!base) {
        throw new Error(
          `O insumo "${insumo.name}" aponta para uma unidade de estoque que não existe.`,
        );
      }

      /*
       * O INSUMO INTEIRO, e não só o `baseUnitId`.
       *
       * É o que permite a segunda porta: um item contado em `un` que declara
       * "cada garrafa tem 900 ml" aceita receita em ml. Enquanto só o id da
       * unidade base atravessava, `contentSize` era invisível aqui e a ficha
       * do óleo era recusada — obrigando a lançar uma garrafa por salgado.
       */
      if (!unidadeEhCompativel(item.unitId, insumo, unidades)) {
        const conteudo =
          insumo.contentUnit && Number(insumo.contentSize) > 0
            ? unidades.find((u) => u.id === insumo.contentUnit)
            : undefined;
        throw new Error(
          conteudo
            ? `"${insumo.name}" é contado em ${base.code}, e cada ${base.code} ` +
                `contém ${Number(insumo.contentSize)} ${conteudo.code}. A receita ` +
                `aceita ${base.code} ou ${conteudo.code} — ${unidade.code} é de ` +
                `outra grandeza.`
            : `"${insumo.name}" é controlado em ${base.code}, e ${unidade.code} não se ` +
                `converte para ${base.code}. Use uma unidade da mesma grandeza, ou ` +
                `informe no cadastro do insumo quanto cada ${base.code} contém.`,
        );
      }

      /*
       * O ensaio da conta que a venda vai fazer. Quantidade 1 basta: o que se
       * quer saber é se existe caminho de conversão, não quanto dá.
       */
      try {
        converterParaUnidadeBase(1, item.unitId, insumo, conversoes);
      } catch {
        throw new Error(
          `Não dá para converter ${unidade.code} para ${base.code} no insumo ` +
            `"${insumo.name}". Cadastre o conteúdo da embalagem ou use ${base.code}.`,
        );
      }
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
