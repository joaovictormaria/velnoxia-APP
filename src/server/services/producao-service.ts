import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { carregarConversoes } from "@/server/services/composicao-do-pedido";
import {
  converterParaUnidadeBase,
  type MapaDeConversoes,
} from "@/lib/conversao-de-unidade";
import { CustoDoPreparado } from "@/server/services/custo-do-preparado";

/**
 * O motor de produção: transformar insumos em preparado.
 *
 * Uma corrida grava TRÊS coisas distintas, e a distinção é o que torna o custo
 * correto:
 *
 *   CONSUMPTION  o que saiu da prateleira — um movimento por insumo
 *   PRODUCTION   o que entrou na prateleira — um movimento, no preparado
 *   LOSS         a perda DECLARADA pelo operador — opcional
 *
 * A merma não declarada não vira LOSS. Ela aparece sozinha na diferença entre
 * o que entrou e o que saiu, e é absorvida pelo custo unitário. 5,2 kg de
 * tomate a R$ 8,00 custam R$ 41,60; saindo 4 kg de molho, o molho custa
 * R$ 10,40/kg e não R$ 8,00/kg. Quem paga a casca é o produto que sobreviveu,
 * e descontar a perda de novo contaria duas vezes.
 */

export type EntradaDeProducao = {
  compositionId: string;
  /** O que se pretendia, na unidade de rendimento da receita. */
  plannedQuantity: number;
  /** O que de fato saiu da balança. Informado pelo operador, não calculado. */
  producedQuantity: number;
  /** Perda identificada, se houver. */
  lossQuantity?: number;
  /**
   * Gerado pelo NAVEGADOR, uma vez por clique em "Produzir".
   *
   * É o que separa "a mesma produção, repetida por falha de rede" de "uma
   * segunda panela, feita de propósito". Os dois casos chegam ao servidor com
   * payloads idênticos — nenhum valor derivável aqui os distingue. Era isso
   * que o antigo default `"AVULSO"` destruía: a segunda panela colidia com a
   * primeira.
   */
  runToken: string;
  note?: string;
  autor?: { authorType?: string; authorId?: string; authorName?: string };
};

type InsumoDaCorrida = {
  inventoryItemId: string;
  unitId: string;
  quantidade: number;
  nome: string;
};

export class ProducaoService {
  /** A chave que o índice único de `ProductionRun` vai julgar. */
  private static chaveDaCorrida(storeId: string, runToken: string) {
    return `${storeId}#PRODUCTION_RUN#${runToken}`;
  }

  /**
   * Executa uma corrida de produção.
   *
   * Idempotente pelo `runToken`: reenviar o mesmo token devolve a corrida que
   * já existe, sem descontar nada de novo.
   */
  static async produzir(storeId: string, entrada: EntradaDeProducao) {
    const chave = this.chaveDaCorrida(storeId, entrada.runToken);

    // Atalho. A garantia real é o índice único, lá embaixo.
    const jaExiste = await prisma.productionRun.findUnique({
      where: { idempotencyKey: chave },
    });
    if (jaExiste) return jaExiste;

    const receita = await this.receitaValidada(storeId, entrada.compositionId);
    const saidaId = receita.inventoryItemId!;

    if (!(entrada.producedQuantity > 0)) {
      throw new Error("A quantidade produzida precisa ser maior que zero.");
    }
    if (!(entrada.plannedQuantity > 0)) {
      throw new Error("A quantidade planejada precisa ser maior que zero.");
    }
    if (entrada.lossQuantity != null && entrada.lossQuantity < 0) {
      throw new Error("A perda declarada não pode ser negativa.");
    }

    const conversoes = await carregarConversoes();
    const insumos = this.insumosDaCorrida(receita, entrada.plannedQuantity, conversoes);
    if (insumos.length === 0) {
      throw new Error("A receita não tem insumos: não há o que produzir.");
    }

    /*
     * Guarda contra o ciclo direto. A detecção completa de ciclos é a etapa
     * seguinte; esta cobre o caso trivial — e é ela que mantém a ordenação de
     * travas abaixo livre de deadlock no intervalo.
     */
    if (insumos.some((i) => i.inventoryItemId === saidaId)) {
      throw new Error(
        `"${receita.inventoryItem!.name}" não pode ser insumo da própria receita.`,
      );
    }

    const corrida = await prisma.productionRun.create({
      data: {
        storeId,
        compositionId: receita.id,
        plannedQuantity: entrada.plannedQuantity,
        producedQuantity: entrada.producedQuantity,
        lossQuantity: entrada.lossQuantity ?? null,
        unitId: receita.yieldUnitId!,
        status: "COMPLETED",
        idempotencyKey: chave,
        note: entrada.note ?? null,
        authorType: entrada.autor?.authorType ?? "ADMIN",
        authorId: entrada.autor?.authorId ?? null,
        authorName: entrada.autor?.authorName ?? null,
      },
    });

    try {
      const custoTotal = await this.baixarInsumos(storeId, corrida.id, insumos);
      const custoUnitario = custoTotal / entrada.producedQuantity;

      await this.darEntradaNoPreparado(
        storeId,
        corrida.id,
        receita,
        entrada,
        custoUnitario,
      );

      const concluida = await prisma.productionRun.update({
        where: { id: corrida.id },
        data: {
          totalInputCost: custoTotal,
          unitCost: custoUnitario,
          completedAt: new Date(),
        },
      });

      /*
       * O custo do preparado passa a ser o desta corrida. É a metade de
       * produção da regra "custo = o da aquisição não revertida mais recente";
       * a metade de compra entra na etapa de custos.
       *
       * Precisa ser agora, e não depois: `recordMovement` congela `costAtTime`
       * a partir do custo do item. Se o molho ficasse sem custo, o próximo
       * consumo dele gravaria `costAtTime` nulo — e movimento é imutável, então
       * o buraco na trilha não teria conserto.
       */
      await prisma.inventoryItem.update({
        where: { id: saidaId },
        data: { cost: custoUnitario },
      });

      await prisma.productComposition.update({
        where: { id: receita.id },
        data: {
          usageCount: { increment: 1 },
          firstUsedAt: receita.firstUsedAt ?? new Date(),
        },
      });

      return concluida;
    } catch (erro) {
      /*
       * Tudo ou nada. Uma corrida que baixou três insumos e falhou no quarto
       * deixaria o estoque mentindo, sem ninguém para reconciliar.
       *
       * A corrida não é apagada: ela fica REVERSED com o motivo. Apagá-la
       * liberaria o `runToken` para uma segunda tentativa que passaria como se
       * fosse a primeira, e o histórico perderia a evidência da falha.
       */
      await this.desfazerMovimentos(storeId, corrida.id);
      const motivo = erro instanceof Error ? erro.message : "erro desconhecido";
      await prisma.productionRun.update({
        where: { id: corrida.id },
        data: {
          status: "REVERSED",
          reversedAt: new Date(),
          inventoryInconsistentAt: new Date(),
          inventoryInconsistency: `A produção falhou e foi desfeita: ${motivo}`,
        },
      });
      throw erro;
    }
  }

  /**
   * Desfaz uma corrida: devolve os insumos e retira o que foi produzido.
   *
   * Se o preparado já foi vendido, o saldo dele vai a negativo — e é assim
   * mesmo. Recusar deixaria o operador sem saída depois de um erro de
   * digitação; o negativo fica marcado e a contagem física resolve.
   */
  static async reverter(storeId: string, runId: string, quemReverteu?: string) {
    const corrida = await prisma.productionRun.findFirst({
      where: { id: runId, storeId },
      include: { composition: true },
    });
    if (!corrida) throw new Error("Corrida de produção não encontrada.");
    if (corrida.status === "REVERSED") return corrida;

    const saidaId = corrida.composition.inventoryItemId!;
    const antes = await prisma.inventoryItem.findUnique({
      where: { id: saidaId },
      select: { name: true, quantityOnHand: true },
    });
    const ficariaNegativo =
      antes != null &&
      Number(antes.quantityOnHand) < Number(corrida.producedQuantity);

    await this.desfazerMovimentos(storeId, runId);

    /*
     * A marca de REVERSED vem ANTES do recálculo do custo, e a ordem importa:
     * `custoDeAquisicaoMaisRecente` decide olhando o estado do banco, e uma
     * corrida ainda marcada COMPLETED se elegeria a si mesma como a aquisição
     * mais recente. Marcando primeiro, não é preciso passar "ignore este id" —
     * o helper simplesmente não a vê mais.
     */
    const revertida = await prisma.productionRun.update({
      where: { id: runId },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversedById: quemReverteu ?? null,
        ...(ficariaNegativo
          ? {
              inventoryInconsistentAt: new Date(),
              inventoryInconsistency:
                `A reversão retirou ${Number(corrida.producedQuantity)} de "${antes?.name}", ` +
                `que tinha apenas ${Number(antes?.quantityOnHand)}. O saldo ficou negativo ` +
                `porque parte já havia sido consumida, e precisa de contagem física.`,
            }
          : {}),
      },
    });

    /*
     * O custo volta a ser o da aquisição anterior que ainda vale — e ela pode
     * ser uma COMPRA, não só outra corrida. Deixar o valor de uma corrida
     * revertida seria precificar por um fato que deixou de existir.
     */
    await prisma.inventoryItem.update({
      where: { id: saidaId },
      data: { cost: await CustoDoPreparado.custoDeAquisicaoMaisRecente(storeId, saidaId) },
    });

    return revertida;
  }

  /**
   * As corridas de produção da loja, da mais recente para a mais antiga.
   *
   * Cada linha já traz a eficiência calculada, porque a tela precisa dela em
   * todas e refazer a conta no navegador seria a segunda implementação da mesma
   * regra — o tipo de duplicação que faz os dois números divergirem meses
   * depois, sem ninguém saber qual está certo.
   */
  static async historico(
    storeId: string,
    opcoes?: { inventoryItemId?: string; limite?: number },
  ) {
    const corridas = await prisma.productionRun.findMany({
      where: {
        storeId,
        ...(opcoes?.inventoryItemId
          ? { composition: { inventoryItemId: opcoes.inventoryItemId } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: opcoes?.limite ?? 50,
      include: {
        composition: { include: { inventoryItem: true } },
        unit: true,
      },
    });

    return corridas.map((c) => {
      const planejado = Number(c.plannedQuantity);
      const produzido = Number(c.producedQuantity);
      return {
        id: c.id,
        preparadoId: c.composition.inventoryItemId,
        preparado: c.composition.inventoryItem?.name ?? "(preparado removido)",
        versaoDaReceita: c.composition.version,
        unidade: c.unit.code,
        planejado,
        produzido,
        perda: c.lossQuantity == null ? null : Number(c.lossQuantity),
        // Denominador é o PLANEJADO: uma panela dupla não é 200% de eficiência.
        eficiencia: planejado > 0 ? (produzido / planejado) * 100 : null,
        custoTotal: c.totalInputCost == null ? null : Number(c.totalInputCost),
        custoUnitario: c.unitCost == null ? null : Number(c.unitCost),
        status: c.status,
        inconsistencia: c.inventoryInconsistency,
        autor: c.authorName,
        criadaEm: c.createdAt,
        revertidaEm: c.reversedAt,
      };
    });
  }

  // ------------------------------------------------------------------

  private static async receitaValidada(storeId: string, compositionId: string) {
    const receita = await prisma.productComposition.findFirst({
      where: { id: compositionId, storeId },
      include: {
        inventoryItem: true,
        items: { include: { inventoryItem: true, unit: true } },
      },
    });

    if (!receita) throw new Error("Receita não encontrada.");
    if (!receita.inventoryItemId || !receita.inventoryItem) {
      throw new Error(
        "Esta ficha técnica pertence a um produto do cardápio, não a um preparado. Só preparados são produzidos.",
      );
    }
    if (!(Number(receita.yieldQuantity ?? 0) > 0) || !receita.yieldUnitId) {
      throw new Error(
        `A receita de "${receita.inventoryItem.name}" não tem rendimento definido. ` +
          `Sem saber quanto ela rende, não há como calcular quanto de insumo usar.`,
      );
    }
    return receita;
  }

  /**
   * Quanto de cada insumo esta corrida gasta, na unidade em que o estoque conta.
   *
   * A escala é `planejado / rendimento`: uma receita que rende 4 kg, produzindo
   * 8 kg, gasta o dobro de tudo.
   */
  private static insumosDaCorrida(
    receita: Awaited<ReturnType<typeof ProducaoService.receitaValidada>>,
    plannedQuantity: number,
  conversoes: MapaDeConversoes,
  ): InsumoDaCorrida[] {
    const fator = plannedQuantity / Number(receita.yieldQuantity);
    const acumulado = new Map<string, InsumoDaCorrida>();

    for (const ingrediente of receita.items) {
      const bruta = Number(ingrediente.quantity) * fator;
      const naBase = converterParaUnidadeBase(
        bruta,
        ingrediente.unitId,
        ingrediente.inventoryItem,
        conversoes,
      );

      // Somado por insumo: a mesma receita pode listar farinha duas vezes, e
      // duas baixas separadas gerariam duas chaves para o mesmo par.
      const atual = acumulado.get(ingrediente.inventoryItemId);
      if (atual) atual.quantidade += naBase;
      else
        acumulado.set(ingrediente.inventoryItemId, {
          inventoryItemId: ingrediente.inventoryItemId,
          unitId: ingrediente.inventoryItem.baseUnitId,
          quantidade: naBase,
          nome: ingrediente.inventoryItem.name,
        });
    }

    /*
     * Ordenado por id, como no caminho do pedido: é o que impede deadlock.
     * Duas corridas que travam os mesmos insumos em ordem inversa esperariam
     * uma pela outra para sempre.
     *
     * O item de SAÍDA é travado por último, e não no meio da ordenação. Isso
     * só é seguro porque receita cíclica é proibida: para haver ciclo de
     * travas, A teria que produzir X a partir de Y enquanto B produz Y a
     * partir de X — exatamente o que a detecção de ciclos recusa. Enquanto ela
     * não existe, a guarda contra ciclo direto em `produzir` cobre o caso.
     */
    return [...acumulado.values()].sort((a, b) =>
      a.inventoryItemId.localeCompare(b.inventoryItemId),
    );
  }

  /** Baixa os insumos e devolve quanto custou, pelo custo congelado de cada um. */
  private static async baixarInsumos(
    storeId: string,
    runId: string,
    insumos: InsumoDaCorrida[],
  ) {
    let total = 0;

    for (const insumo of insumos) {
      const movimento = await InventoryService.recordMovement(storeId, {
        idempotencyKey: `${storeId}#PRODUCTION_RUN#${runId}#CONSUMPTION#${insumo.inventoryItemId}`,
        itemId: insumo.inventoryItemId,
        type: "CONSUMPTION",
        quantity: -insumo.quantidade,
        unitId: insumo.unitId,
        reference: runId,
        referenceType: "PRODUCTION_RUN",
        productionRunId: runId,
        /*
         * Produção NÃO deixa insumo negativo. Sem este `false` herdaria a
         * permissão do pedido, porque o tipo do movimento é o mesmo.
         */
        permitirSaldoNegativo: false,
        authorType: "SYSTEM",
        authorId: "PRODUCTION_RUN",
        authorName: `Produção ${runId}`,
      } as any);

      const custo = movimento.costAtTime == null ? 0 : Number(movimento.costAtTime);
      total += Math.abs(Number(movimento.quantity)) * custo;
    }

    return total;
  }

  /** Dá entrada do produzido, e da perda declarada, no saldo do preparado. */
  private static async darEntradaNoPreparado(
    storeId: string,
    runId: string,
    receita: Awaited<ReturnType<typeof ProducaoService.receitaValidada>>,
    entrada: EntradaDeProducao,
    custoUnitario: number,
  ) {
    const saidaId = receita.inventoryItemId!;
    const unidade = receita.inventoryItem!.baseUnitId;

    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#PRODUCTION_RUN#${runId}#PRODUCTION#${saidaId}`,
      itemId: saidaId,
      type: "PRODUCTION",
      quantity: entrada.producedQuantity,
      unitId: unidade,
      reference: runId,
      referenceType: "PRODUCTION_RUN",
      productionRunId: runId,
      compositionId: receita.id,
      // A produção ESTABELECE o custo do preparado; não herda o antigo.
      costAtTime: custoUnitario,
      authorType: "SYSTEM",
      authorId: "PRODUCTION_RUN",
      authorName: `Produção ${runId}`,
    } as any);

    if (entrada.lossQuantity && entrada.lossQuantity > 0) {
      /*
       * A perda sai do que foi produzido, e não infla o custo unitário: ele já
       * foi calculado sobre `producedQuantity`. Registrar LOSS aqui é sobre
       * saber ONDE o produto foi parar, não sobre recalcular quanto custou.
       */
      await InventoryService.recordMovement(storeId, {
        idempotencyKey: `${storeId}#PRODUCTION_RUN#${runId}#LOSS#${saidaId}`,
        itemId: saidaId,
        type: "LOSS",
        quantity: entrada.lossQuantity,
        unitId: unidade,
        reference: runId,
        referenceType: "PRODUCTION_RUN",
        productionRunId: runId,
        costAtTime: custoUnitario,
        note: "Perda declarada na produção",
        authorType: "SYSTEM",
        authorId: "PRODUCTION_RUN",
        authorName: `Produção ${runId}`,
      } as any);
    }
  }

  /**
   * Reverte todos os movimentos da corrida, na ordem inversa da criação.
   *
   * O `originalMovementId @unique` do banco é quem garante que nada seja
   * revertido duas vezes; filtrar por `reversedBy` só evita o erro.
   */
  private static async desfazerMovimentos(storeId: string, runId: string) {
    const movimentos = await prisma.inventoryMovement.findMany({
      where: {
        storeId,
        productionRunId: runId,
        type: { in: ["CONSUMPTION", "PRODUCTION", "LOSS"] },
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
        reference: runId,
        referenceType: "PRODUCTION_RUN",
        productionRunId: runId,
        /*
         * Aqui o negativo é permitido de propósito: desfazer uma produção cujo
         * preparado já foi vendido tira do saldo mais do que existe. O fato já
         * aconteceu; o que resta é registrar e marcar.
         */
        permitirSaldoNegativo: true,
        authorType: "SYSTEM",
        authorId: "PRODUCTION_RUN",
        authorName: "Reversão de produção",
      } as any);
    }
  }
}
