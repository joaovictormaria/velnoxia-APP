import { prisma } from "@/server/db/client";
import { statusDoEstoque } from "@/lib/status-do-estoque";

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
      where: { storeId, isActive: true },
    });

    /*
     * A REGRA SAIU DAQUI e foi para `statusDoEstoque`. O filtro de
     * `minimumThreshold: { not: null }` também: item sem mínimo continua fora
     * de LOW_STOCK, mas agora aparece quando está sem disponível — que é
     * exatamente o item que a produção não pode usar.
     */
    return items.filter((item) => statusDoEstoque(item).status !== "NORMAL");
  }
}
