import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";

/*
 * A RESERVA DE UM PEDIDO NÃO PODE DEPENDER DA CONFIGURAÇÃO ATUAL DO PRODUTO.
 *
 * `onOrderPreparing` revertia as RESERVATIONs DENTRO do laço de consumo,
 * filtrando por `insumo.inventoryItemId` — então só era liberado o que ainda
 * aparecia na configuração de AGORA. O que saíra dela entre o pedido entrar e
 * ir ao preparo ficava reservado para sempre.
 *
 * A ficha técnica nunca sofreu com isso: ela é congelada em
 * `OrderItem.compositionVersionId`, então a versão que reservou é a mesma que
 * consome. A EMBALAGEM não tem congelamento, e o TIPO do produto é editável a
 * qualquer momento — eram esses os dois caminhos abertos.
 *
 * O saldo físico nunca se perdia. O que se corrompia era `quantityReserved`,
 * de forma cumulativa e sem nenhuma tela que desfizesse: o disponível
 * (`onHand − reserved`) encolhia a cada ocorrência.
 *
 * ESTES TESTES OLHAM O ESTADO, e não a chamada: saldo, `quantityReserved` e os
 * movimentos do razão. Um teste que só verificasse "a função foi chamada"
 * passaria com o bug de pé.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";
let categoriaId = "";

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

async function semear(migration: string) {
  const sql = readFileSync(
    resolve(__dirname, `../../../../prisma/migrations/${migration}/migration.sql`),
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
  await semear(SEED_UNIDADES);
  storeId = (
    await prisma.store.create({ data: { slug: `orfa-${Date.now()}`, name: "Cozinha" } })
  ).id;
  categoriaId = (
    await prisma.category.create({
      data: { storeId, name: "Geral", slug: "geral", icon: "🍽", kind: "SIMPLE" },
    })
  ).id;
});
afterAll(limparBanco);

async function item(name: string, itemType: string, quantidade = 100) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name, baseUnitId: "unit_un", itemType } as any,
    { quantidade, precoDaEmbalagem: 10 },
  );
}

async function produto(nome: string, dados: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoriaId,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2)}`,
      description: nome,
      basePrice: 20,
      ...dados,
    },
  });
}

/** Um pedido real, reservado pelo mesmo caminho que o checkout usa. */
async function pedidoCom(productId: string, quantity: number) {
  const order = await prisma.order.create({
    data: {
      storeId,
      number: Math.floor(Math.random() * 1000000),
      customerName: "Cliente",
      customerPhone: "11999999999",
      paymentMethod: "PIX",
      subtotal: 20,
      total: 20,
      items: {
        create: [{ productId, productNameSnapshot: "Item", unitPrice: 20, quantity }],
      },
    },
  });
  await prisma.$transaction((tx) =>
    OrderInventoryHandler.reservarNaCriacao(tx, order.id, storeId),
  );
  return order;
}

/** As reservas do pedido que AINDA não foram revertidas. É a medida do bug. */
const reservasAbertas = (orderId: string) =>
  prisma.inventoryMovement.findMany({
    where: {
      storeId,
      reference: orderId,
      referenceType: "ORDER",
      type: "RESERVATION",
      reversedBy: { is: null },
    },
    select: { itemId: true },
  });

const saldos = async (id: string) => {
  const i = await prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
  return { onHand: Number(i.quantityOnHand), reservado: Number(i.quantityReserved) };
};

const movimentos = (itemId: string, type: string) =>
  prisma.inventoryMovement.findMany({ where: { storeId, itemId, type: type as any } });

describe("A1 · a embalagem sai da configuração depois da reserva", () => {
  it("a reserva da embalagem é liberada mesmo ela não estando mais no produto", async () => {
    const massa = await item("Massa", "INGREDIENT");
    const caixa = await item("Caixa de pizza", "PACKAGING");
    const p = await produto("Pizza", { tipoDeControle: "PRODUCAO" });
    await prisma.productComposition.create({
      data: {
        storeId,
        productId: p.id,
        version: 1,
        isActive: true,
        items: {
          create: [
            { inventoryItemId: massa.id, quantity: 1, unitId: "unit_un", sortOrder: 0 },
          ],
        },
      },
    });
    const embalagem = await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: caixa.id,
        quantity: 1,
        unitId: "unit_un",
      },
    });

    const order = await pedidoCom(p.id, 2);

    // 1 · a reserva da embalagem existe de fato
    expect(await saldos(caixa.id)).toEqual({ onHand: 100, reservado: 2 });
    expect((await reservasAbertas(order.id)).map((r) => r.itemId).sort()).toEqual(
      [caixa.id, massa.id].sort(),
    );

    // 2 · o dono remove a embalagem do produto, com o pedido em aberto
    await prisma.productPackaging.delete({ where: { id: embalagem.id } });

    // 3 · o pedido segue para o preparo
    await OrderInventoryHandler.onOrderPreparing(order.id);

    // 4 · NENHUMA reserva do pedido fica aberta
    expect(await reservasAbertas(order.id)).toHaveLength(0);

    /*
     * 5 · a caixa volta a estar inteiramente livre: a reserva caiu e o consumo
     * não aconteceu, porque ela não faz mais parte do produto. Antes da
     * correção, `reservado` ficava em 2 para sempre.
     */
    expect(await saldos(caixa.id)).toEqual({ onHand: 100, reservado: 0 });
    expect(await movimentos(caixa.id, "CONSUMPTION")).toHaveLength(0);

    // 6 · o que continua configurado é consumido normalmente
    expect(await saldos(massa.id)).toEqual({ onHand: 98, reservado: 0 });
    expect(await movimentos(massa.id, "CONSUMPTION")).toHaveLength(1);
  });
});

describe("A2 · o produto deixa de controlar estoque depois da reserva", () => {
  it("a reserva antiga é revertida mesmo sem nada a consumir", async () => {
    const coca = await item("Coca-Cola lata", "RESALE");
    const p = await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });

    const order = await pedidoCom(p.id, 5);

    expect(await saldos(coca.id)).toEqual({ onHand: 100, reservado: 5 });
    expect(await reservasAbertas(order.id)).toHaveLength(1);

    // O dono troca o tipo: um clique no rádio da tela de produto.
    await prisma.product.update({
      where: { id: p.id },
      data: { tipoDeControle: "NAO_CONTROLA", inventoryItemId: null },
    });

    await OrderInventoryHandler.onOrderPreparing(order.id);

    /*
     * O CASO QUE O `return` ANTECIPADO ESCONDIA. Com a configuração nova a
     * lista de insumos fica VAZIA, e a função saía antes de reverter coisa
     * alguma — a reserva inteira do pedido ficava aberta.
     */
    expect(await reservasAbertas(order.id)).toHaveLength(0);
    expect(await saldos(coca.id)).toEqual({ onHand: 100, reservado: 0 });
    expect(await movimentos(coca.id, "CONSUMPTION")).toHaveLength(0);
  });

  it("o pedido entra em PREPARING normalmente quando não há o que consumir", async () => {
    const coca = await item("Coca-Cola lata", "RESALE");
    const p = await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });
    const order = await pedidoCom(p.id, 1);
    await prisma.product.update({
      where: { id: p.id },
      data: { tipoDeControle: "NAO_CONTROLA", inventoryItemId: null },
    });

    // Não lança, e não marca o pedido como inconsistente: não ter o que
    // consumir é um desfecho legítimo, não uma falha.
    await expect(
      OrderInventoryHandler.onOrderPreparing(order.id),
    ).resolves.toBeUndefined();
    const depois = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(depois.inventoryInconsistentAt).toBeNull();
  });
});

describe("a receita entre a reserva e o preparo", () => {
  /*
   * A ficha é CONGELADA em `OrderItem.compositionVersionId`, e este teste fixa
   * isso: desativar a receita não muda o que o pedido em aberto consome. É a
   * proteção que a embalagem não tinha, e a razão de a ficha nunca ter
   * produzido reserva órfã.
   */
  it("desativar a receita não muda o consumo do pedido já reservado", async () => {
    const massa = await item("Massa", "INGREDIENT");
    const p = await produto("Pizza", { tipoDeControle: "PRODUCAO" });
    const ficha = await prisma.productComposition.create({
      data: {
        storeId,
        productId: p.id,
        version: 1,
        isActive: true,
        items: {
          create: [
            { inventoryItemId: massa.id, quantity: 2, unitId: "unit_un", sortOrder: 0 },
          ],
        },
      },
    });

    const order = await pedidoCom(p.id, 1);
    await prisma.productComposition.update({
      where: { id: ficha.id },
      data: { isActive: false },
    });

    await OrderInventoryHandler.onOrderPreparing(order.id);

    expect(await reservasAbertas(order.id)).toHaveLength(0);
    expect(await saldos(massa.id)).toEqual({ onHand: 98, reservado: 0 });
  });

  /*
   * APAGAR a ficha é outra coisa: `resolverComposicao` faz `findUnique` na
   * versão congelada, e uma versão apagada devolve nulo — a lista fica vazia.
   * Sem a correção, este é o mesmo buraco do A2.
   */
  it("apagar a ficha congelada libera a reserva em vez de deixá-la aberta", async () => {
    const massa = await item("Massa", "INGREDIENT");
    const p = await produto("Pizza", { tipoDeControle: "PRODUCAO" });
    const ficha = await prisma.productComposition.create({
      data: {
        storeId,
        productId: p.id,
        version: 1,
        isActive: true,
        items: {
          create: [
            { inventoryItemId: massa.id, quantity: 3, unitId: "unit_un", sortOrder: 0 },
          ],
        },
      },
    });

    const order = await pedidoCom(p.id, 1);
    expect(await saldos(massa.id)).toEqual({ onHand: 100, reservado: 3 });

    await prisma.compositionItem.deleteMany({ where: { compositionId: ficha.id } });
    await prisma.productComposition.delete({ where: { id: ficha.id } });

    await OrderInventoryHandler.onOrderPreparing(order.id);

    expect(await reservasAbertas(order.id)).toHaveLength(0);
    expect(await saldos(massa.id)).toEqual({ onHand: 100, reservado: 0 });
  });
});

describe("o caminho normal continua idêntico", () => {
  /*
   * A correção move a reversão para fora do laço. Estes dois testes existem
   * para provar que o desfecho de quem NÃO mexeu em nada não mudou: mesma
   * baixa, mesma reserva zerada, mesma idempotência.
   */
  it("sem mudança de configuração, reserva vira consumo como sempre", async () => {
    const massa = await item("Massa", "INGREDIENT");
    const caixa = await item("Caixa", "PACKAGING");
    const p = await produto("Pizza", { tipoDeControle: "PRODUCAO" });
    await prisma.productComposition.create({
      data: {
        storeId,
        productId: p.id,
        version: 1,
        isActive: true,
        items: {
          create: [
            { inventoryItemId: massa.id, quantity: 1, unitId: "unit_un", sortOrder: 0 },
          ],
        },
      },
    });
    await prisma.productPackaging.create({
      data: {
        storeId,
        productId: p.id,
        inventoryItemId: caixa.id,
        quantity: 1,
        unitId: "unit_un",
      },
    });

    const order = await pedidoCom(p.id, 3);
    await OrderInventoryHandler.onOrderPreparing(order.id);

    expect(await reservasAbertas(order.id)).toHaveLength(0);
    expect(await saldos(massa.id)).toEqual({ onHand: 97, reservado: 0 });
    expect(await saldos(caixa.id)).toEqual({ onHand: 97, reservado: 0 });

    // O custo continua viajando congelado, para o CMV não mudar de forma.
    const consumo = (await movimentos(caixa.id, "CONSUMPTION"))[0];
    expect(consumo.costAtTime).not.toBeNull();
    expect(consumo.referenceType).toBe("ORDER");
    expect(consumo.reference).toBe(order.id);
  });

  /*
   * IDEMPOTÊNCIA, que a reversão fora do laço não pode ter quebrado: a segunda
   * passada não encontra reserva aberta e as chaves de consumo já existem.
   */
  it("rodar duas vezes não baixa duas vezes", async () => {
    const massa = await item("Massa", "INGREDIENT");
    const p = await produto("Pizza", { tipoDeControle: "PRODUCAO" });
    await prisma.productComposition.create({
      data: {
        storeId,
        productId: p.id,
        version: 1,
        isActive: true,
        items: {
          create: [
            { inventoryItemId: massa.id, quantity: 1, unitId: "unit_un", sortOrder: 0 },
          ],
        },
      },
    });

    const order = await pedidoCom(p.id, 4);
    await OrderInventoryHandler.onOrderPreparing(order.id);
    await OrderInventoryHandler.onOrderPreparing(order.id);

    expect(await saldos(massa.id)).toEqual({ onHand: 96, reservado: 0 });
    expect(await movimentos(massa.id, "CONSUMPTION")).toHaveLength(1);
    expect(await reservasAbertas(order.id)).toHaveLength(0);
  });
});
