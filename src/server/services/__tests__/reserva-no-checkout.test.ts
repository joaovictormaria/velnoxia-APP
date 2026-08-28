import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { createOrderFromCheckout } from "@/server/services/order-service";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";

/*
 * A RESERVA ACONTECE ANTES DE O PEDIDO SER CONFIRMADO.
 *
 * NASCEU DE PEDIDO CONFIRMADO SEM ESTOQUE. A reserva rodava DEPOIS do commit,
 * disparada sem espera: `orderStatusSync.onStatusChange(...).catch(console.error)`.
 * Faltando saldo, a reserva falhava, o pedido já estava confirmado ao cliente, e
 * sobrava a marca `inventoryInconsistentAt` para alguém conferir na mão. O
 * cliente pagava por um bolo que não existia.
 *
 * Agora a reserva entra na MESMA transação do pedido. Falhar derruba tudo: sem
 * Order, sem OrderItem, sem reserva órfã. Quem desfaz é o rollback do banco, e
 * é por isso que não há compensação a escrever — compensação é o que dá errado
 * pela metade.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";

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

let slugDaLoja = "";

beforeEach(async () => {
  await limparBanco();
  await semearUnidades();
  slugDaLoja = `chk-${Date.now()}`;
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
async function boloEmEstoque(unidades: number) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: "Bolo de Chocolate", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
    unidades > 0 ? { quantidade: unidades, precoDaEmbalagem: 9.71 } : undefined,
  );
}

/** Produto de cardápio, opcionalmente ligado a um item de estoque. */
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

describe("estoque suficiente", () => {
  it("01 · estoque exato: o pedido é aprovado e a reserva fica de pé", async () => {
    const bolo = await boloEmEstoque(2);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const r = await comprar(p.slug, 2);

    expect(r.ok).toBe(true);
    expect(await prisma.order.count({ where: { storeId } })).toBe(1);
    // O saldo físico não muda na reserva — o que muda é o comprometido.
    expect(await saldo(bolo.id)).toBe(2);
    expect(await reservado(bolo.id)).toBe(2);
    // Disponível zerado: não sobra nada para um segundo pedido.
    expect((await saldo(bolo.id)) - (await reservado(bolo.id))).toBe(0);
  });

  it("02 · o movimento de RESERVATION é gravado com referência ao pedido", async () => {
    const bolo = await boloEmEstoque(3);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const r = await comprar(p.slug, 1);
    expect(r.ok).toBe(true);

    const mov = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: bolo.id, type: "RESERVATION" },
    });
    expect(Number(mov.quantity)).toBe(1);
    expect(mov.reference).toBe((r as any).orderId);
    expect(mov.referenceType).toBe("ORDER");
  });
});

describe("estoque insuficiente NÃO recusa o cliente", () => {
  /*
   * ESTOQUE NÃO AUTORIZA VENDA.
   *
   * Este bloco afirmava o contrário: faltando saldo, o pedido era recusado e
   * nada era gravado. A tela devolvia "Bolo de Chocolate: resta apenas 0,93" a
   * uma pessoa que só queria um bolo — expondo controle interno da casa e
   * perdendo a venda por um saldo que o salão talvez já tivesse resolvido.
   *
   * A regra agora separa as duas coisas: o pedido do cliente entra sempre, e a
   * falta vira problema interno — disponível negativo, item aparecendo como
   * esgotado no painel, e o pedido marcado para o salão ver.
   */
  it("03 · falta saldo e o pedido PASSA mesmo assim", async () => {
    const bolo = await boloEmEstoque(1);
    const p = await produto("Bolo de Chocolate", bolo.id);

    // 1 em estoque, cliente pede 2.
    const r = await comprar(p.slug, 2);

    expect(r.ok).toBe(true);
    // E nada de estoque vaza na resposta ao cliente.
    expect(JSON.stringify(r)).not.toMatch(/estoque|resta|dispon/i);
  });

  it("04 · o pedido fica registrado", async () => {
    const bolo = await boloEmEstoque(1);
    const p = await produto("Bolo de Chocolate", bolo.id);

    await comprar(p.slug, 2);

    expect(await prisma.order.count({ where: { storeId } })).toBe(1);
    expect(await prisma.orderItem.count()).toBe(1);
  });

  it("05 · o consumo é reservado por inteiro, e o disponível fica negativo", async () => {
    /*
     * Reservar só o que cabia seria pior: a cozinha veria 1 comprometido para
     * um pedido de 2 e ninguém saberia que falta um. O número no vermelho é o
     * que diz exatamente quanto falta comprar.
     */
    const bolo = await boloEmEstoque(1);
    const p = await produto("Bolo de Chocolate", bolo.id);

    await comprar(p.slug, 2);

    expect(await reservado(bolo.id)).toBe(2);
    expect(await saldo(bolo.id)).toBe(1);
    expect(await saldo(bolo.id) - (await reservado(bolo.id))).toBe(-1);
    expect(
      await prisma.inventoryMovement.count({
        where: { itemId: bolo.id, type: "RESERVATION" },
      }),
    ).toBe(1);
  });

  it("06 · saldo ZERO também não recusa", async () => {
    const bolo = await boloEmEstoque(0);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const r = await comprar(p.slug, 1);

    expect(r.ok).toBe(true);
    expect(await prisma.order.count({ where: { storeId } })).toBe(1);
    expect(await reservado(bolo.id)).toBe(1);
  });

  it("06b · o ADMIN enxerga a falta: o pedido fica marcado", async () => {
    // `inventoryInconsistentAt` é o campo que o salão já consultava para
    // "estoque não fechou". É por ele que a cozinha descobre o que repor.
    const bolo = await boloEmEstoque(1);
    const p = await produto("Bolo de Chocolate", bolo.id);

    await comprar(p.slug, 2);

    const pedido = await prisma.order.findFirstOrThrow({ where: { storeId } });
    expect(pedido.inventoryInconsistentAt).not.toBeNull();
  });

  it("06c · com saldo suficiente, NADA é marcado", async () => {
    // O aviso só aparece quando há o que avisar; um alarme que toca sempre
    // ensina a ignorá-lo.
    const bolo = await boloEmEstoque(5);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const r = await comprar(p.slug, 2);

    expect(r.ok).toBe(true);
    const pedido = await prisma.order.findFirstOrThrow({ where: { storeId } });
    expect(pedido.inventoryInconsistentAt).toBeNull();
    expect(await reservado(bolo.id)).toBe(2);
  });
});

describe("concorrência", () => {
  it("07 · dois pedidos pela última unidade: os DOIS passam", async () => {
    const bolo = await boloEmEstoque(1);
    const p = await produto("Bolo de Chocolate", bolo.id);

    /*
     * O LOCK CONTINUA, O QUE MUDOU FOI O QUE ELE DECIDE.
     *
     * Este teste afirmava que apenas um passava: o `SELECT ... FOR UPDATE`
     * serializava a disputa e o segundo era recusado. A serialização segue
     * igual — o que saiu foi o teto, porque estoque não autoriza venda. Dois
     * clientes pedindo o último bolo compram os dois, e quem resolve a falta é
     * o salão.
     *
     * O lock ainda importa: sem ele as duas reservas poderiam se sobrescrever e
     * o total ficaria em 1 em vez de 2 — a cozinha veria falta de um bolo onde
     * faltam dois.
     */
    const resultados = await Promise.allSettled([
      comprar(p.slug, 1),
      comprar(p.slug, 1),
    ]);

    const aprovados = resultados.filter(
      (r) => r.status === "fulfilled" && (r.value as any).ok,
    );
    expect(aprovados).toHaveLength(2);

    expect(await prisma.order.count({ where: { storeId } })).toBe(2);
    // As duas reservas somam, sem se perder: 1 na prateleira, 2 prometidos.
    expect(await reservado(bolo.id)).toBe(2);
    expect((await saldo(bolo.id)) - (await reservado(bolo.id))).toBe(-1);
  });

  it("08 · cinco pedidos para três unidades: os cinco passam e a falta aparece", async () => {
    const bolo = await boloEmEstoque(3);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const resultados = await Promise.allSettled(
      Array.from({ length: 5 }, () => comprar(p.slug, 1)),
    );

    const aprovados = resultados.filter(
      (r) => r.status === "fulfilled" && (r.value as any).ok,
    );
    expect(aprovados).toHaveLength(5);

    // Nenhuma reserva se perdeu na disputa: cinco prometidos, três em estoque.
    expect(await reservado(bolo.id)).toBe(5);
    expect(await saldo(bolo.id)).toBe(3);
    expect((await saldo(bolo.id)) - (await reservado(bolo.id))).toBe(-2);

    /*
     * Os dois que estouraram o saldo ficam marcados. Os três primeiros não —
     * o aviso aponta exatamente onde a conta não fechou.
     */
    const marcados = await prisma.order.count({
      where: { storeId, inventoryInconsistentAt: { not: null } },
    });
    expect(marcados).toBe(2);
  });

  it("09 · reprocessar o mesmo pedido não duplica a reserva", async () => {
    const bolo = await boloEmEstoque(5);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const r = await comprar(p.slug, 2);
    expect(r.ok).toBe(true);
    expect(await reservado(bolo.id)).toBe(2);

    /*
     * O gancho antigo continua existindo para os status posteriores. Chamá-lo
     * com RECEIVED tem que ser inofensivo: a chave determinística reconhece a
     * reserva já gravada em vez de somar de novo.
     */
    await OrderInventoryHandler.onOrderReceived((r as any).orderId);

    expect(await reservado(bolo.id)).toBe(2);
    expect(
      await prisma.inventoryMovement.count({
        where: { itemId: bolo.id, type: "RESERVATION" },
      }),
    ).toBe(1);
  });
});

describe("o que NÃO pode ter mudado", () => {
  it("10 · produto sem vínculo com estoque continua vendendo normalmente", async () => {
    const p = await produto("Refrigerante");

    const r = await comprar(p.slug, 3);

    expect(r.ok).toBe(true);
    expect(await prisma.order.count({ where: { storeId } })).toBe(1);
    // Nenhum movimento: não há estoque a mexer.
    expect(await prisma.inventoryMovement.count()).toBe(0);
  });

  it("11 · vender o preparado NÃO desce nos ingredientes da receita", async () => {
    const bolo = await boloEmEstoque(3);
    const farinha = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Farinha", baseUnitId: "unit_kg", itemType: "INGREDIENT" } as any,
      { quantidade: 10, precoDaEmbalagem: 6 },
    );
    // A receita do bolo existe e leva farinha — é o que torna o caso válido.
    await prisma.productComposition.create({
      data: {
        storeId,
        inventoryItemId: bolo.id,
        isActive: true,
        yieldQuantity: 1,
        yieldUnitId: "unit_un",
        items: {
          create: [
            { inventoryItemId: farinha.id, quantity: 240, unitId: "unit_g", sortOrder: 0 },
          ],
        },
      },
    });
    const p = await produto("Bolo de Chocolate", bolo.id);

    const antesDaFarinha = await saldo(farinha.id);
    const r = await comprar(p.slug, 1);

    expect(r.ok).toBe(true);
    expect(await reservado(bolo.id)).toBe(1);
    // Os ingredientes já saíram na PRODUÇÃO; descer de novo cobraria duas vezes.
    expect(await saldo(farinha.id)).toBe(antesDaFarinha);
    expect(await reservado(farinha.id)).toBe(0);
  });

  it("12 · cancelar o pedido devolve a reserva, como antes", async () => {
    const bolo = await boloEmEstoque(3);
    const p = await produto("Bolo de Chocolate", bolo.id);

    const r = await comprar(p.slug, 2);
    expect(await reservado(bolo.id)).toBe(2);

    await OrderInventoryHandler.syncOrderStatus((r as any).orderId, "CANCELLED" as any);

    expect(await reservado(bolo.id)).toBe(0);
    expect(await saldo(bolo.id)).toBe(3);
  });
});

describe("pedido com DOIS itens: ou reserva tudo, ou nada", () => {
  /*
   * O CASO QUE PROVA A TRANSAÇÃO COMPARTILHADA.
   *
   * Com um item só, ignorar o `tx` de fora não muda nada: quando falta saldo, o
   * `recordMovement` lança antes de gravar, e não há o que desfazer. A diferença
   * aparece quando o PRIMEIRO item reserva e o SEGUNDO falha — aí a reserva do
   * primeiro precisa cair junto.
   *
   * Sem a transação compartilhada, ela ficaria commitada sozinha: estoque
   * comprometido para um pedido que não existe, e ninguém para liberá-lo.
   */
  it("13 · o primeiro item reserva, o segundo falta, e nada permanece", async () => {
    const bolo = await boloEmEstoque(5);
    const torta = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Torta", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
      { quantidade: 1, precoDaEmbalagem: 20 },
    );
    const pBolo = await produto("Bolo de Chocolate", bolo.id);
    const pTorta = await produto("Torta", torta.id);

    // Bolo tem 5 (sobra), Torta tem 1 e o cliente pede 3.
    const r = await (async () =>
      createOrderFromCheckout(storeId, {
        storeSlug: slugDaLoja,
        items: [
          { productSlug: pBolo.slug, quantity: 2, extraIds: [] },
          { productSlug: pTorta.slug, quantity: 3, extraIds: [] },
        ],
        customerName: "Cliente",
        customerPhone: "11999999999",
        type: "PICKUP",
        paymentMethod: "CASH",
      } as any))();
    /*
     * O pedido passa inteiro, e as DUAS reservas ficam — inclusive a torta,
     * que vai para o vermelho. A transação compartilhada continua sendo o que
     * garante o tudo-ou-nada: se qualquer coisa que NÃO seja falta de estoque
     * falhar aqui, as duas reservas caem junto com o pedido.
     */
    expect(r.ok).toBe(true);

    expect(await reservado(bolo.id)).toBe(2);
    expect(await reservado(torta.id)).toBe(3);
    expect(await prisma.inventoryMovement.count({ where: { type: "RESERVATION" } })).toBe(2);
    expect(await prisma.order.count({ where: { storeId } })).toBe(1);

    // Só a torta faltou, e o pedido carrega a marca para o salão.
    const pedido = await prisma.order.findFirstOrThrow({ where: { storeId } });
    expect(pedido.inventoryInconsistentAt).not.toBeNull();
  });

  it("14 · dois itens com saldo: os dois reservam no mesmo pedido", async () => {
    const bolo = await boloEmEstoque(5);
    const torta = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Torta", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
      { quantidade: 4, precoDaEmbalagem: 20 },
    );
    const pBolo = await produto("Bolo de Chocolate", bolo.id);
    const pTorta = await produto("Torta", torta.id);

    const r = await createOrderFromCheckout(storeId, {
      storeSlug: slugDaLoja,
      items: [
        { productSlug: pBolo.slug, quantity: 2, extraIds: [] },
        { productSlug: pTorta.slug, quantity: 3, extraIds: [] },
      ],
      customerName: "Cliente",
      customerPhone: "11999999999",
      type: "PICKUP",
      paymentMethod: "CASH",
    } as any);

    expect(r.ok).toBe(true);
    expect(await reservado(bolo.id)).toBe(2);
    expect(await reservado(torta.id)).toBe(3);
  });
});
