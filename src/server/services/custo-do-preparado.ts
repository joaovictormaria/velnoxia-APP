import { prisma } from "@/server/db/client";
import { Decimal } from "@prisma/client/runtime/client";
import { converterParaUnidadeBase } from "@/server/services/composicao-do-pedido";

/**
 * O que as coisas custam.
 *
 * Três perguntas, uma função para cada, e um princípio comum: dinheiro é
 * somado em `Decimal`. Quantidade continua em `Number`, como o motor de saldo
 * sempre fez — a diferença importa porque centavos acumulados num laço viram
 * divergência de balanço, e gramas não viram nada.
 */
export class CustoDoPreparado {
  /**
   * O custo unitário que vale AGORA para um item.
   *
   * "Aquisição" cobre os dois jeitos de estoque entrar: uma corrida de
   * produção e uma compra. São a mesma categoria de fato — entrou material, a
   * um custo unitário conhecido — e diferem só em de onde vem o número: a
   * produção CALCULA (entrada ÷ produzido), a compra INFORMA (pago ÷ quantidade).
   *
   * Por isso a regra é "a mais recente das duas", e não "a última produção".
   * Numa sequência que mistura os dois — produz a 10,40, compra a 15,00,
   * produz a 9,80 — só esta leitura acerta em cada ponto.
   *
   * E é autocorretiva: reverter a compra do meio faz o custo voltar a 10,40
   * sozinho, porque o movimento revertido deixa de ser candidato. Um campo
   * escrito e esquecido continuaria mentindo 15,00.
   */
  static async custoDeAquisicaoMaisRecente(
    storeId: string,
    itemId: string,
  ): Promise<Decimal | null> {
    const [corrida, compra] = await Promise.all([
      prisma.productionRun.findFirst({
        where: {
          storeId,
          status: "COMPLETED",
          unitCost: { not: null },
          composition: { inventoryItemId: itemId },
        },
        orderBy: { createdAt: "desc" },
        select: { unitCost: true, createdAt: true },
      }),
      prisma.inventoryMovement.findFirst({
        where: {
          storeId,
          itemId,
          type: "PURCHASE",
          costAtTime: { not: null },
          // Compra revertida não precifica nada: o material voltou.
          reversedBy: { is: null },
        },
        orderBy: { createdAt: "desc" },
        select: { costAtTime: true, createdAt: true },
      }),
    ]);

    if (!corrida && !compra) return null;
    if (!compra) return corrida!.unitCost;
    if (!corrida) return compra.costAtTime;

    return corrida.createdAt >= compra.createdAt ? corrida.unitCost : compra.costAtTime;
  }

  /**
   * O custo de uma ficha técnica: o que ela consome, ao custo de cada insumo.
   *
   * Compõe pelos níveis sem recursão nenhuma. O custo de um preparado já é o
   * unitário da última aquisição dele, então uma ficha que leva molho lê o
   * custo do molho — que por sua vez já embute o tomate e a merma. Somar os
   * ingredientes do molho aqui contaria duas vezes, pelo mesmo motivo que o
   * pedido não desce até eles.
   *
   * A CONVERSÃO DE UNIDADE não é detalhe. A ficha pensa em gramas; o estoque
   * pode contar potes. Sem converter, 45 g de um item a R$ 10,40 o pote viram
   * R$ 468,00 em vez de R$ 0,94 — erro de duas ordens de grandeza, num número
   * que ninguém confere de cabeça.
   */
  static async custoDaFicha(storeId: string, compositionId: string) {
    const ficha = await prisma.productComposition.findFirst({
      where: { id: compositionId, storeId },
      include: { items: { include: { inventoryItem: true, unit: true } } },
    });
    if (!ficha) throw new Error("Ficha técnica não encontrada.");

    let total = new Decimal(0);
    const linhas: Array<{
      inventoryItemId: string;
      nome: string;
      quantidadeNaBase: number;
      custoUnitario: Decimal | null;
      custoDaLinha: Decimal;
    }> = [];

    for (const item of ficha.items) {
      const quantidadeNaBase = converterParaUnidadeBase(
        Number(item.quantity),
        item.unitId,
        item.inventoryItem,
      );

      /*
       * Insumo sem custo conhecido fica fora da soma, em vez de entrar como
       * zero. Zero afirmaria que é de graça; ficar de fora deixa o número
       * incompleto e visível — `linhasSemCusto` conta quantas.
       */
      const custoUnitario = item.inventoryItem.cost ?? null;
      const custoDaLinha = custoUnitario
        ? new Decimal(custoUnitario).mul(quantidadeNaBase)
        : new Decimal(0);

      total = total.add(custoDaLinha);
      linhas.push({
        inventoryItemId: item.inventoryItemId,
        nome: item.inventoryItem.name,
        quantidadeNaBase,
        custoUnitario,
        custoDaLinha,
      });
    }

    return {
      compositionId,
      total,
      linhas,
      linhasSemCusto: linhas.filter((l) => l.custoUnitario == null).length,
    };
  }

  /**
   * Quanto a corrida rendeu contra o que a receita prometia.
   *
   * `producedQuantity / yieldQuantity`. Simples e sempre definido — um
   * "rendimento real sobre a matéria-prima" só seria calculável quando todos
   * os insumos compartilhassem dimensão, o que quase nunca acontece: tomate em
   * kg, sal em g, óleo em ml.
   *
   * É a distância entre expectativa e balança, e é o número que mede a
   * cozinha. Uma receita que promete 4 kg e entrega 3,7 não está errada — está
   * dizendo que o molho custa mais do que a ficha sugeria.
   */
  static async eficienciaDaCorrida(storeId: string, runId: string) {
    const corrida = await prisma.productionRun.findFirst({
      where: { id: runId, storeId },
      include: { composition: { include: { inventoryItem: true } } },
    });
    if (!corrida) throw new Error("Corrida de produção não encontrada.");

    const esperado = Number(corrida.composition.yieldQuantity ?? 0);
    const produzido = Number(corrida.producedQuantity);
    const planejado = Number(corrida.plannedQuantity);

    /*
     * O denominador é o PLANEJADO, não o rendimento da receita: produzir uma
     * panela dupla planeja 8 kg de uma receita que rende 4, e comparar 8 com 4
     * daria 200% de eficiência numa corrida perfeitamente normal.
     */
    const eficiencia = planejado > 0 ? (produzido / planejado) * 100 : null;

    return {
      runId,
      preparado: corrida.composition.inventoryItem?.name ?? null,
      rendimentoDaReceita: esperado || null,
      planejado,
      produzido,
      perdaDeclarada: corrida.lossQuantity == null ? null : Number(corrida.lossQuantity),
      eficiencia,
      custoTotal: corrida.totalInputCost,
      custoUnitario: corrida.unitCost,
    };
  }
}
