import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { createOrderFromCheckout } from "@/server/services/order-service";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";

/*
 * CANCELAR DEPOIS DE PREPARAR É PERDA, NÃO DEVOLUÇÃO.
 *
 * O sistema devolvia ao estoque tudo que um pedido cancelado tinha consumido —
 * inclusive quando o consumo já tinha acontecido de verdade. `onOrderPreparing`
 * grava a baixa justamente porque a cozinha JÁ USOU o material; é por isso que
 * ali o saldo pode ficar negativo. Devolver farinha que virou massa criava
 * saldo que a contagem física nunca encontraria.
 *
 * A regra agora separa os dois momentos:
 *
 *   RECEIVED → CANCELLED    nada saiu. A reserva volta. Nada mais acontece.
 *   PREPARING → CANCELLED   o material saiu. Vira LOSS, e o saldo não sobe.
 *
 * O par REVERSAL+LOSS soma zero no saldo de propósito. Ele não existe para
 * mexer no estoque — existe para a trilha dizer a verdade: o REVERSAL preenche
 * `reversedBy` no consumo, tirando-o do CMV (não foi venda), e o LOSS registra
 * o desperdício onde o relatório de perdas consegue vê-lo.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";

let storeId = "";
let slugDaLoja = "";

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

async function semearUnidades() {
  const sql = readFileSync(
    resolve(__dirname, `../../../../prisma/migrations/${SEED_UNIDADES}/migration.sql`),
    "utf8",
  )
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);
}

beforeEach(async () => {
  await limparBanco();
  await semearUnidades();
  slugDaLoja = `perda-${Date.now()}`;
  const loja = await prisma.store.create({
    data: { slug: slugDaLoja, name: "Cozinha" },
  });
  storeId = loja.id;
  await prisma.storeSettings.create({
    data: { storeId, whatsappNumber: "11999999999" },
  });
});
afterAll(limparBanco);

/** Um preparado com saldo, como sai de uma produção. */
async function boloEmEstoque(unidades: number, precoDaEmbalagem: number | null = 9.71) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: "Bolo de Chocolate", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
    unidades > 0 ? { quantidade: unidades, precoDaEmbalagem } : undefined,
  );
}

async function produto(nome: string, inventoryItemId?: string) {
  const categoria = await prisma.category.create({
    data: {
      storeId,
      name: "Doces",
      slug: `doces-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      icon: "🍰",
      kind: "SIMPLE",
    },
  });
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoria.id,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 7)}`,
      description: nome,
      basePrice: 25,
      ...(inventoryItemId ? { inventoryItemId } : {}),
    },
  });
}

const comprar = (slugDoProduto: string, quantity: number) =>
  createOrderFromCheckout(storeId, {
    storeSlug: slugDaLoja,
    items: [{ productSlug: slugDoProduto, quantity, extraIds: [] }],
    customerName: "Cliente",
    customerPhone: "11999999999",
    type: "PICKUP",
    paymentMethod: "CASH",
  } as any);

const saldo = async (id: string) =>
  Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantityOnHand);
const reservado = async (id: string) =>
  Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantityReserved);

const movimentos = (itemId: string, type: string) =>
  prisma.inventoryMovement.findMany({
    where: { itemId, type: type as any },
    orderBy: { createdAt: "asc" },
  });
const quantos = async (itemId: string, type: string) => (await movimentos(itemId, type)).length;

/** Leva o pedido até PREPARING, que é onde o consumo é gravado. */
async function prepararEDepois(orderId: string, destino: "CANCELLED" | "COMPLETED") {
  await OrderInventoryHandler.syncOrderStatus(orderId, "PREPARING");
  await OrderInventoryHandler.syncOrderStatus(orderId, destino);
}

describe("cancelar DEPOIS de preparar: o insumo não volta", () => {
  it("01 · o saldo não sobe: o que foi consumido continua fora", async () => {
    const bolo = await boloEmEstoque(5);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, 2);

    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "PREPARING");
    expect(await saldo(bolo.id)).toBe(3); // a cozinha usou 2

    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "CANCELLED");

    // ERA AQUI QUE VOLTAVA PARA 5, inventando dois bolos que ninguém acharia.
    expect(await saldo(bolo.id)).toBe(3);
  });

  it("02 · a perda é registrada como LOSS", async () => {
    const bolo = await boloEmEstoque(5);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, 2);

    await prepararEDepois((r as any).orderId, "CANCELLED");

    const perdas = await movimentos(bolo.id, "LOSS");
    expect(perdas).toHaveLength(1);
    expect(Math.abs(Number(perdas[0].quantity))).toBe(2);
    expect(perdas[0].reference).toBe((r as any).orderId);
    expect(perdas[0].referenceType).toBe("ORDER");
  });

  it("03 · o LOSS carrega o costAtTime do consumo, não o custo de hoje", async () => {
    const bolo = await boloEmEstoque(5, 9.71);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, 2);
    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "PREPARING");

    const consumo = (await movimentos(bolo.id, "CONSUMPTION"))[0];

    /*
     * O preço muda ENTRE o consumo e o cancelamento. Se a perda lesse o custo
     * atual do item, ela valeria 50 — e uma perda de ontem passaria a valer o
     * preço de hoje toda vez que o fornecedor reajustasse.
     */
    await prisma.inventoryItem.update({
      where: { id: bolo.id },
      data: { cost: 50 },
    });

    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "CANCELLED");

    const perda = (await movimentos(bolo.id, "LOSS"))[0];
    expect(Number(perda.costAtTime)).toBe(Number(consumo.costAtTime));
    expect(Number(perda.costAtTime)).toBeCloseTo(9.71, 4);
  });

  it("04 · custo desconhecido continua desconhecido", async () => {
    // Sem preço na entrada, `costAtTime` nasce nulo. Inventar um número aqui
    // seria pior do que admitir que não se sabe quanto custou.
    const bolo = await boloEmEstoque(5, null);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, 1);

    await prepararEDepois((r as any).orderId, "CANCELLED");

    const perda = (await movimentos(bolo.id, "LOSS"))[0];
    expect(perda.costAtTime).toBeNull();
  });
});

describe("o consumo sai do CMV", () => {
  it("05 · o CONSUMPTION fica marcado como revertido", async () => {
    const bolo = await boloEmEstoque(5);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, 2);

    await prepararEDepois((r as any).orderId, "CANCELLED");

    /*
     * É `reversedBy` que tira o consumo da conta do custo de venda. O pedido não
     * virou receita; o custo dele não pode continuar pesando no CMV.
     */
    const consumo = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: bolo.id, type: "CONSUMPTION" },
      include: { reversedBy: true },
    });
    expect(consumo.reversedBy).not.toBeNull();
    expect(consumo.reversedBy!.type).toBe("REVERSAL");
  });

  it("06 · o par REVERSAL+LOSS se anula no saldo", async () => {
    const bolo = await boloEmEstoque(5);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, 2);

    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "PREPARING");
    const saldoAposOConsumo = await saldo(bolo.id);

    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "CANCELLED");

    /*
     * CUIDADO COM O SINAL AO LER ESTES MOVIMENTOS. O que se anula são os
     * EFEITOS, não os campos `quantity`: o REVERSAL guarda `+2` e aplica `+2`,
     * enquanto o LOSS guarda `+2` e aplica `−2`, porque `calcularDelta` faz
     * `-Math.abs(quantity)` para perda. Somar os dois campos dá 4, não 0 —
     * quem prova a anulação é o saldo.
     */
    const perdas = await movimentos(bolo.id, "LOSS");
    /*
     * O filtro é pelo TIPO do movimento original, não pela existência dele: a
     * reversão da RESERVA também carrega `originalMovementId`, e olhar só para
     * o campo devolveria as duas.
     */
    const doConsumo = await prisma.inventoryMovement.findMany({
      where: {
        itemId: bolo.id,
        type: "REVERSAL",
        originalMovement: { is: { type: "CONSUMPTION" } },
      },
    });
    expect(perdas).toHaveLength(1);
    expect(doConsumo).toHaveLength(1);
    expect(Math.abs(Number(perdas[0].quantity))).toBe(
      Math.abs(Number(doConsumo[0].quantity)),
    );

    expect(await saldo(bolo.id)).toBe(saldoAposOConsumo);
  });

  it("07 · pedido COMPLETED não gera perda nenhuma", async () => {
    const bolo = await boloEmEstoque(5);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, 2);

    await prepararEDepois((r as any).orderId, "COMPLETED");

    expect(await quantos(bolo.id, "LOSS")).toBe(0);
    expect(await saldo(bolo.id)).toBe(3);
    const consumo = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: bolo.id, type: "CONSUMPTION" },
      include: { reversedBy: true },
    });
    // Venda de verdade: o consumo continua valendo como CMV.
    expect(consumo.reversedBy).toBeNull();
  });
});

describe("não-regressão: cancelar ANTES de preparar", () => {
  it("08 · RECEIVED → CANCELLED devolve a reserva e não gera perda", async () => {
    const bolo = await boloEmEstoque(3);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, 2);
    expect(await reservado(bolo.id)).toBe(2);

    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "CANCELLED");

    // Nada saiu da prateleira: aqui devolver é o certo.
    expect(await reservado(bolo.id)).toBe(0);
    expect(await saldo(bolo.id)).toBe(3);
    expect(await quantos(bolo.id, "LOSS")).toBe(0);
  });
});

describe("repetição e casos difíceis", () => {
  it("09 · cancelar duas vezes não duplica a perda", async () => {
    const bolo = await boloEmEstoque(5);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, 2);
    await prepararEDepois((r as any).orderId, "CANCELLED");

    const saldoDepois = await saldo(bolo.id);
    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "CANCELLED");

    expect(await quantos(bolo.id, "LOSS")).toBe(1);
    expect(await saldo(bolo.id)).toBe(saldoDepois);
  });

  it("10 · funciona com o saldo negativo que o preparo permite", async () => {
    /*
     * `onOrderPreparing` aceita deixar o saldo negativo: o prato foi vendido e
     * a cozinha usou o que o sistema achava que não tinha. O cancelamento tem
     * de sobreviver a isso — a perda recusa negativo por padrão, e sem a
     * permissão explícita o par ficaria pela metade.
     */
    const bolo = await boloEmEstoque(2);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, 2);

    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "PREPARING");
    await prisma.inventoryItem.update({
      where: { id: bolo.id },
      data: { quantityOnHand: -1 },
    });

    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "CANCELLED");

    expect(await quantos(bolo.id, "LOSS")).toBe(1);
    expect(await saldo(bolo.id)).toBe(-1); // segue negativo, não foi "consertado"
  });

  it("11 · a perda aponta para o pedido que a causou", async () => {
    const bolo = await boloEmEstoque(5);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, 1);
    await prepararEDepois((r as any).orderId, "CANCELLED");

    const perda = (await movimentos(bolo.id, "LOSS"))[0];
    expect(perda.reference).toBe((r as any).orderId);
    expect(perda.authorType).toBe("SYSTEM");
    expect(perda.note).toMatch(/cancelado depois do preparo/i);
  });

  it("12 · produto sem vínculo de estoque não gera perda nem quebra", async () => {
    const semVinculo = await produto("Refrigerante");
    const r = await comprar(semVinculo.slug, 2);

    await prepararEDepois((r as any).orderId, "CANCELLED");

    const perdas = await prisma.inventoryMovement.count({
      where: { storeId, type: "LOSS" },
    });
    expect(perdas).toBe(0);
  });
});

describe("concorrência: dois cancelamentos ao mesmo tempo", () => {
  /*
   * DUAS EXECUÇÕES SIMULTÂNEAS ACONTECEM DE VERDADE.
   *
   * `transitionOrderStatus` dispara `onStatusChange` sem `await`, e a varredura
   * de expiração chama `syncOrderStatus` por conta própria. As duas podem cair
   * sobre o mesmo pedido no mesmo instante.
   *
   * Antes da trava, a perdedora tentava gravar o MESMO `idempotencyKey` da
   * vencedora dentro da transação COMPARTILHADA do par. O P2002 abortava a
   * transação inteira, e o LOSS seguinte morria com `25P02`. O cancelamento
   * estourava por não ter nada a fazer.
   */

  async function boloPreparado(saldoInicial = 5, quantidade = 2) {
    const bolo = await boloEmEstoque(saldoInicial);
    const p = await produto("Bolo de Chocolate", bolo.id);
    const r = await comprar(p.slug, quantidade);
    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "PREPARING");
    return { bolo, orderId: (r as any).orderId as string };
  }

  it("13 · duas sincronizações simultâneas: nenhuma estoura", async () => {
    const { orderId } = await boloPreparado();

    const resultados = await Promise.allSettled([
      OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
      OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
    ]);

    const rejeitadas = resultados.filter((r) => r.status === "rejected");
    expect(rejeitadas).toHaveLength(0);
  });

  it("14 · resulta em exatamente UM par REVERSAL + LOSS", async () => {
    const { bolo, orderId } = await boloPreparado();

    await Promise.all([
      OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
      OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
    ]);

    const doConsumo = await prisma.inventoryMovement.findMany({
      where: {
        itemId: bolo.id,
        type: "REVERSAL",
        originalMovement: { is: { type: "CONSUMPTION" } },
      },
    });
    expect(doConsumo).toHaveLength(1);
    expect(await quantos(bolo.id, "LOSS")).toBe(1);
  });

  it("15 · o saldo final é o mesmo de um cancelamento único", async () => {
    const { bolo, orderId } = await boloPreparado(5, 2);
    expect(await saldo(bolo.id)).toBe(3); // a cozinha usou 2

    await Promise.all([
      OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
      OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
    ]);

    // O par soma zero, e duas execuções não somam duas vezes zero errado.
    expect(await saldo(bolo.id)).toBe(3);
    expect(await reservado(bolo.id)).toBe(0);
  });

  it("16 · o CONSUMPTION original fica marcado como revertido", async () => {
    const { bolo, orderId } = await boloPreparado();

    await Promise.all([
      OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
      OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
    ]);

    const consumo = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: bolo.id, type: "CONSUMPTION" },
      include: { reversedBy: true },
    });
    expect(consumo.reversedBy).not.toBeNull();
  });

  it("17 · uma terceira execução, depois, continua sendo no-op", async () => {
    const { bolo, orderId } = await boloPreparado();

    await Promise.all([
      OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
      OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
    ]);
    const saldoDepois = await saldo(bolo.id);

    await expect(
      OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
    ).resolves.not.toThrow();

    expect(await quantos(bolo.id, "LOSS")).toBe(1);
    expect(await saldo(bolo.id)).toBe(saldoDepois);
  });

  it("18 · quatro simultâneas continuam produzindo um único par", async () => {
    // Mais pressão: se a trava não estivesse valendo, aqui seria evidente.
    const { bolo, orderId } = await boloPreparado(10, 3);

    const resultados = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED"),
      ),
    );

    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(0);
    expect(await quantos(bolo.id, "LOSS")).toBe(1);
    expect(await saldo(bolo.id)).toBe(7);
  });
});
