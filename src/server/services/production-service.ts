import { prisma } from "@/server/db/client";

export class ProductionService {
  /**
   * Itens abaixo do limite mínimo.
   *
   * O filtro comparava com `item.minimumStock`, campo que não existe no
   * schema — o real é `minimumThreshold`. Sob `@ts-nocheck` isso compilava,
   * e em execução `undefined || 0` fazia toda comparação virar
   * `quantityOnHand < 0`. O alerta de estoque baixo nunca apontou um item
   * sequer, e não havia como perceber: uma lista vazia é exatamente o que se
   * espera quando está tudo bem.
   *
   * `minimumThreshold` é opcional. Item sem limite definido não é item em
   * falta — é item sem alerta configurado, e fica fora da lista em vez de ser
   * comparado contra um zero inventado.
   */
  static async getLowStockItems(storeId: string) {
    const items = await prisma.inventoryItem.findMany({
      where: {
        storeId,
        isActive: true,
        minimumThreshold: { not: null },
      },
    });

    return items.filter(
      (item) =>
        item.minimumThreshold !== null &&
        Number(item.quantityOnHand) < Number(item.minimumThreshold),
    );
  }
}
