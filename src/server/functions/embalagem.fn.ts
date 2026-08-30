import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { prisma } from "../db/client";
import {
  converterParaUnidadeBase,
  montarMapaDeConversoes,
} from "@/lib/conversao-de-unidade";

/**
 * A embalagem que sai junto com o produto vendido.
 *
 * FORA DA RECEITA, E ISSO É O PONTO. A caixa de pizza é item de estoque
 * comprado pronto, não ingrediente. Dentro da ficha técnica ela faria a corrida
 * de produção de um preparado consumir caixa — a caixa é usada na venda, não
 * quando a massa é feita — e deixaria um produto de REVENDA, que não tem ficha
 * nenhuma, sem lugar para declarar o copo dele.
 *
 * TODO `storeId` VEM DE `requireAdminSession()`. Do payload vêm apenas ids, e
 * cada um é conferido contra a loja da sessão antes de qualquer escrita. Um id
 * de produto ou de item da loja vizinha não é encontrado e a operação morre
 * ali — nunca com uma mensagem que revele que ele existe em outro lugar.
 */

const embalagemSchema = z.object({
  productId: z.string().min(1),
  inventoryItemId: z.string().min(1),
  /**
   * Quantas embalagens por unidade vendida.
   *
   * `positive()` e não `nonnegative()`: uma embalagem de quantidade zero é uma
   * linha que não faz nada, e guardá-la seria guardar uma configuração que
   * mente para quem a lê depois. Quem não usa embalagem simplesmente não
   * cadastra uma.
   */
  quantity: z.number().positive(),
  unitId: z.string().min(1),
});

/** As embalagens de um produto, com o que a tela precisa mostrar. */
export const listarEmbalagensDoProduto = createServerFn({ method: "GET" })
  .validator(z.object({ productId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const linhas = await prisma.productPackaging.findMany({
      where: { storeId, productId: data.productId },
      include: {
        inventoryItem: {
          select: { id: true, name: true, quantityOnHand: true, isActive: true },
        },
        unit: { select: { id: true, code: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return linhas.map((l) => ({
      id: l.id,
      inventoryItemId: l.inventoryItemId,
      nome: l.inventoryItem.name,
      itemAtivo: l.inventoryItem.isActive,
      // Decimal não sobrevive à serialização da server function.
      quantidade: Number(l.quantity),
      saldo: Number(l.inventoryItem.quantityOnHand),
      unitId: l.unitId,
      unidade: l.unit.code,
    }));
  });

/** Os itens que podem ser embalagem: só `PACKAGING`, só desta loja. */
export const listarItensDeEmbalagem = createServerFn({ method: "GET" }).handler(
  async () => {
    const { storeId } = await requireAdminSession();
    const itens = await prisma.inventoryItem.findMany({
      where: { storeId, isActive: true, itemType: "PACKAGING" },
      select: {
        id: true,
        name: true,
        quantityOnHand: true,
        baseUnit: { select: { id: true, code: true } },
      },
      orderBy: { name: "asc" },
    });
    return itens.map((i) => ({
      id: i.id,
      nome: i.name,
      saldo: Number(i.quantityOnHand),
      baseUnitId: i.baseUnit.id,
      unidade: i.baseUnit.code,
    }));
  },
);

/**
 * Adiciona ou atualiza a embalagem de um produto.
 *
 * UPSERT, e não create: o unique `(productId, inventoryItemId)` existe porque
 * duas caixas do mesmo tipo são `quantity = 2`, não duas linhas. Sem o upsert,
 * clicar duas vezes em adicionar devolveria um P2002 cru ao dono em vez de
 * simplesmente corrigir a quantidade.
 *
 * TUDO NUMA TRANSAÇÃO. As três conferências — produto da loja, item da loja e
 * do tipo certo, unidade existente — leem exatamente o estado em que a linha é
 * gravada. Fora dela, entre a conferência e a escrita caberia trocar o
 * `itemType` do item de PACKAGING para outra coisa.
 */
export const salvarEmbalagemDoProduto = createServerFn({ method: "POST" })
  .validator(embalagemSchema)
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();

    return prisma.$transaction(async (tx) => {
      const produto = await tx.product.findFirst({
        where: { id: data.productId, storeId },
        select: { id: true },
      });
      if (!produto) throw new Error("Produto não encontrado.");

      /*
       * O tipo é conferido AQUI, contra a loja da sessão, e nunca aceito do
       * payload. É o mesmo ponto em que uma tentativa cross-tenant morre: um id
       * de item da loja vizinha não satisfaz o `where` e vira "não encontrado".
       */
      const item = await tx.inventoryItem.findFirst({
        where: { id: data.inventoryItemId, storeId },
        select: { id: true, name: true, itemType: true },
      });
      if (!item) throw new Error("Item de estoque não encontrado.");
      if (item.itemType !== "PACKAGING") {
        throw new Error(
          `"${item.name}" não é uma embalagem. Só itens do tipo Embalagem ` +
            `podem ser configurados aqui — ingrediente entra na receita, e ` +
            `item de revenda é vinculado direto ao produto.`,
        );
      }

      /*
       * A UNIDADE PRECISA SER CONVERSÍVEL, e a checagem é aqui — não na venda.
       *
       * `InventoryUnit` é tabela GLOBAL: não tem `storeId`, e não há o que
       * recortar por loja. O que precisa ser conferido é outra coisa, e é o que
       * faltava: se existe caminho da unidade escolhida até a unidade base do
       * item.
       *
       * SEM ISTO A FALHA CAÍA NA VENDA. `converterParaUnidadeBase` LANÇA quando
       * não acha conversão nem `contentSize`, e ela roda dentro de
       * `insumosDoPedido`, que roda dentro da transação que cria o pedido. Uma
       * embalagem gravada em gramas contra um item contado em unidades derrubaria
       * o checkout inteiro do produto — e o dono não teria como ligar uma coisa
       * à outra, porque salvou a embalagem dias antes, sem erro nenhum.
       *
       * A CHECAGEM USA A MESMA FUNÇÃO QUE O MOTOR, de propósito. Reimplementar a
       * regra aqui criaria duas versões dela, e é assim que uma delas envelhece
       * sem ninguém notar.
       *
       * A tela sempre manda a unidade base do item, então este caminho não é
       * alcançável por ela. Ele existe porque a server function é pública e o
       * princípio vale: a interface orienta, o servidor garante.
       */
      const unidade = await tx.inventoryUnit.findUnique({
        where: { id: data.unitId },
        select: { id: true, code: true },
      });
      if (!unidade) throw new Error("Unidade não encontrada.");

      const completo = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: item.id },
        select: {
          baseUnitId: true,
          contentSize: true,
          contentUnit: true,
          baseUnit: { select: { code: true } },
        },
      });
      const conversoes = montarMapaDeConversoes(
        await tx.inventoryUnitConversion.findMany({
          select: { fromUnitId: true, toUnitId: true, conversionFactor: true },
        }),
      );
      try {
        converterParaUnidadeBase(data.quantity, data.unitId, completo, conversoes);
      } catch {
        throw new Error(
          `Não dá para converter ${unidade.code} para ${completo.baseUnit.code}, ` +
            `que é como "${item.name}" é contado no estoque. Escolha a mesma ` +
            `unidade do item, ou cadastre a conversão entre as duas.`,
        );
      }

      const linha = await tx.productPackaging.upsert({
        where: {
          productId_inventoryItemId: {
            productId: data.productId,
            inventoryItemId: data.inventoryItemId,
          },
        },
        create: {
          storeId,
          productId: data.productId,
          inventoryItemId: data.inventoryItemId,
          quantity: data.quantity,
          unitId: data.unitId,
        },
        update: { quantity: data.quantity, unitId: data.unitId },
      });

      return { ok: true as const, id: linha.id };
    });
  });

/**
 * Remove uma embalagem de um produto.
 *
 * `deleteMany` com o recorte por loja, e não `delete` por id: `delete` num id
 * que não é da loja da sessão devolveria P2025, que é indistinguível de "não
 * existe" para quem chama — mas só depois de o banco procurar a linha alheia.
 * `deleteMany` filtra e apaga no mesmo comando, e devolver `0` é a resposta
 * certa para os dois casos.
 *
 * Apagar a configuração NÃO mexe em saldo nem em movimento. O que já foi
 * consumido continua no razão: o razão é imutável, e a caixa que saiu da
 * prateleira saiu de verdade.
 */
export const removerEmbalagemDoProduto = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const { count } = await prisma.productPackaging.deleteMany({
      where: { id: data.id, storeId },
    });
    return { ok: count > 0 };
  });
