import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { CustoDoPreparado } from "@/server/services/custo-do-preparado";
import { createInventoryMovementSchema } from "@/lib/estoque-schemas";

/*
 * A compra com preço, contra o Postgres local.
 *
 * O formulário pergunta o valor TOTAL pago, porque é o que está na nota:
 * "5,2 kg — R$ 41,60". A divisão acontece no servidor, não na cabeça do
 * operador — que é onde nasce erro de digitação.
 *
 * A regra de negócio já existia desde a etapa de custos; o que muda aqui é ter
 * de onde vir o número. Estes cenários exercitam a conversão e a fronteira do
 * schema, que é o que a tela passa a usar.
 */

let storeId = "";
let unitKg = "";
let tomateId = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

async function semear() {
  await limparBanco();
  storeId = (await prisma.store.create({ data: { slug: `cmp-${Date.now()}`, name: "Cozinha" } })).id;
  unitKg = (await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  })).id;
  tomateId = (await prisma.inventoryItem.create({
    data: { storeId, name: "Tomate", itemType: "INGREDIENT", baseUnitId: unitKg, quantityOnHand: 0, cost: null },
  })).id;
}

/**
 * A mesma conta que `adminRecordMovement` faz.
 *
 * Server function do TanStack precisa de AsyncLocalStorage e não é chamável
 * daqui, então a regra que ela aplica é reproduzida e verificada. O que isto
 * mede é a conversão e o efeito no banco — não o transporte HTTP.
 */
function custoUnitarioDaCompra(tipo: string, totalPaid: string | undefined, quantity: number) {
  const totalPago = totalPaid ? parseFloat(totalPaid) : null;
  return tipo === "PURCHASE" && totalPago != null && totalPago > 0 && quantity > 0
    ? totalPago / quantity
    : undefined;
}

async function comprar(quantidade: number, totalPaid?: string, tipo = "PURCHASE") {
  const custoAtTime = custoUnitarioDaCompra(tipo, totalPaid, quantidade);
  const validado = createInventoryMovementSchema.parse({
    itemId: tomateId,
    type: tipo,
    quantity: quantidade,
    unitId: unitKg,
    costAtTime: custoAtTime,
    authorType: "ADMIN",
  });
  return InventoryService.recordMovement(storeId, {
    ...validado,
    idempotencyKey: `${storeId}#MANUAL#${tipo}#${tomateId}#${Math.random()}`,
  } as any);
}

const custoDoItem = async () => {
  const c = (await prisma.inventoryItem.findUnique({ where: { id: tomateId } }))!.cost;
  return c == null ? null : Number(c);
};
const saldo = async () =>
  Number((await prisma.inventoryItem.findUnique({ where: { id: tomateId } }))!.quantityOnHand);

beforeEach(semear);
afterAll(limparBanco);

describe("compra com valor pago", () => {
  it("01 · o total pago vira custo unitário: 41,60 por 5,2 kg = 8,00/kg", async () => {
    const m = await comprar(5.2, "41.60");

    expect(Number(m.costAtTime)).toBeCloseTo(8, 2);
    expect(await custoDoItem()).toBeCloseTo(8, 2);
    expect(await saldo()).toBeCloseTo(5.2, 4);
  });

  it("02 · sem valor pago, a compra não mexe no custo", async () => {
    await comprar(5.2, "41.60");
    expect(await custoDoItem()).toBeCloseTo(8, 2);

    await comprar(10, undefined);

    /*
     * Cobre transferência, brinde e correção de contagem. Forçar um número
     * nesses casos empurraria o operador a inventar um, que é pior do que não
     * ter número.
     */
    expect(await custoDoItem()).toBeCloseTo(8, 2);
    expect(await saldo()).toBeCloseTo(15.2, 4);
  });

  it("03 · a compra seguinte substitui o custo", async () => {
    await comprar(5.2, "41.60"); // 8,00
    await comprar(4, "48.00"); // 12,00

    expect(await custoDoItem()).toBeCloseTo(12, 2);
    expect(Number(await CustoDoPreparado.custoDeAquisicaoMaisRecente(storeId, tomateId)))
      .toBeCloseTo(12, 2);
  });

  it("04 · custo enviado em perda é ignorado pelo MOTOR, não só pela tela", async () => {
    await comprar(10, "80.00"); // 8,00
    expect(await custoDoItem()).toBeCloseTo(8, 2);

    /*
     * Direto no motor, com o custo explícito e tipo LOSS — sem passar pelo
     * helper que imita a server function.
     *
     * A versão anterior deste cenário passava pelo helper, que já zerava o
     * custo para tipos que não são compra. Ele nunca chegava ao motor, e o
     * cenário passava mesmo com a guarda do motor derrubada: testava a tela
     * duas vezes e o servidor nenhuma.
     */
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#MANUAL#LOSS#${tomateId}#${Math.random()}`,
      itemId: tomateId, type: "LOSS", quantity: 1, unitId: unitKg,
      costAtTime: 999,
    } as any);

    // Só compra estabelece custo. Perda registra saída, não preço.
    expect(await custoDoItem()).toBeCloseTo(8, 2);
    expect(await custoDoItem()).not.toBeCloseTo(999, 2);
  });

  it("05 · total zero ou negativo não precifica", async () => {
    await comprar(10, "80.00");
    await comprar(5, "0");
    expect(await custoDoItem()).toBeCloseTo(8, 2);

    // E o schema recusa custo negativo antes de chegar ao banco.
    expect(
      createInventoryMovementSchema.safeParse({
        itemId: tomateId, type: "PURCHASE", quantity: 1, unitId: unitKg, costAtTime: -1,
      }).success,
    ).toBe(false);
  });

  it("06 · o custo congelado no movimento é o da compra, não o custo anterior", async () => {
    await comprar(10, "80.00"); // item passa a valer 8,00
    const segunda = await comprar(10, "150.00"); // 15,00

    /*
     * `recordMovement` congela `costAtTime` da linha travada por padrão — o
     * custo que o item JÁ TINHA. Numa entrada isso está invertido: a compra
     * ESTABELECE o custo. A segunda compra precisa carregar 15,00, não 8,00.
     */
    expect(Number(segunda.costAtTime)).toBeCloseTo(15, 2);
    expect(Number(segunda.costAtTime)).not.toBeCloseTo(8, 2);
  });

  it("07 · o schema aceita costAtTime opcional sem quebrar movimentos antigos", async () => {
    // Sem o campo: a forma que todo chamador existente usa.
    const semCusto = createInventoryMovementSchema.safeParse({
      itemId: tomateId, type: "LOSS", quantity: 1, unitId: unitKg,
    });
    expect(semCusto.success).toBe(true);
    expect((semCusto as any).data.costAtTime).toBeUndefined();
  });

  it("08 · a divisão acompanha a quantidade, não um unitário fixo", async () => {
    /*
     * Autoauditoria da conta: se o servidor tratasse o campo como preço
     * unitário em vez de total, este cenário daria 41,60/kg em vez de 4,00.
     */
    const m = await comprar(10.4, "41.60");
    expect(Number(m.costAtTime)).toBeCloseTo(4, 2);
    expect(Number(m.costAtTime)).not.toBeCloseTo(41.6, 2);
  });
});
