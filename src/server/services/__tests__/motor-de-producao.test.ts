import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { ProducaoService } from "@/server/services/producao-service";
import { InventoryService } from "@/server/services/inventory-service";

/*
 * O motor de produção, contra o Postgres local.
 *
 * Cada cenário confere o SALDO no banco depois de rodar, não o retorno da
 * função. É a diferença entre os dois que revela uma reversão que não repõe,
 * uma corrida que perdeu uma baixa, ou um custo calculado sobre o número
 * errado.
 *
 * O caso de referência é sempre o mesmo, porque ele contém a ideia inteira:
 * 5,2 kg de tomate a R$ 8,00 rendem 4 kg de molho. O molho custa R$ 10,40/kg,
 * não R$ 8,00/kg — a merma é paga pelo produto que sobreviveu.
 */

let storeId = "";
let unitKg = "";
let tomateId = "";
let molhoId = "";
let receitaId = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

async function criarInsumo(nome: string, saldo: number, custo: number | null) {
  return prisma.inventoryItem.create({
    data: {
      storeId,
      name: nome,
      itemType: "INGREDIENT",
      baseUnitId: unitKg,
      quantityOnHand: saldo,
      cost: custo,
    },
  });
}

async function semear() {
  await limparBanco();
  const loja = await prisma.store.create({
    data: { slug: `producao-${Date.now()}`, name: "Cozinha de Teste" },
  });
  storeId = loja.id;

  const kg = await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  });
  unitKg = kg.id;

  tomateId = (await criarInsumo("Tomate", 100, 8)).id;

  const molho = await prisma.inventoryItem.create({
    data: {
      storeId,
      name: "Molho de tomate",
      itemType: "PREPARED",
      baseUnitId: unitKg,
      quantityOnHand: 0,
    },
  });
  molhoId = molho.id;

  // 5,2 kg de tomate rendem 4 kg de molho.
  const receita = await prisma.productComposition.create({
    data: {
      storeId,
      inventoryItemId: molhoId,
      version: 1,
      yieldQuantity: 4,
      yieldUnitId: unitKg,
      items: { create: [{ inventoryItemId: tomateId, quantity: 5.2, unitId: unitKg }] },
    },
  });
  receitaId = receita.id;
}

const saldo = async (id: string) =>
  Number((await prisma.inventoryItem.findUnique({ where: { id } }))!.quantityOnHand);
const custoDoItem = async (id: string) => {
  const c = (await prisma.inventoryItem.findUnique({ where: { id } }))!.cost;
  return c == null ? null : Number(c);
};

let token = 0;
const proximoToken = () => `t${Date.now()}-${token++}`;

async function produzir(extra: Partial<Parameters<typeof ProducaoService.produzir>[1]> = {}) {
  return ProducaoService.produzir(storeId, {
    compositionId: receitaId,
    plannedQuantity: 4,
    producedQuantity: 4,
    runToken: proximoToken(),
    ...extra,
  } as any);
}

beforeEach(semear);
afterAll(limparBanco);

describe("produção", () => {
  it("01 · 5,2 kg entram, 4 kg saem, e os três saldos conferem", async () => {
    const corrida = await produzir();

    expect(await saldo(tomateId)).toBeCloseTo(94.8, 4); // 100 − 5,2
    expect(await saldo(molhoId)).toBeCloseTo(4, 4);
    expect(corrida.status).toBe("COMPLETED");
    expect(corrida.completedAt).toBeInstanceOf(Date);

    const movimentos = await prisma.inventoryMovement.findMany({
      where: { productionRunId: corrida.id },
      orderBy: { createdAt: "asc" },
    });
    expect(movimentos.map((m) => m.type).sort()).toEqual(["CONSUMPTION", "PRODUCTION"]);
  });

  it("02 · o custo unitário reflete o rendimento: R$ 10,40/kg, não R$ 8,00", async () => {
    const corrida = await produzir();

    expect(Number(corrida.totalInputCost)).toBeCloseTo(41.6, 2); // 5,2 × 8
    expect(Number(corrida.unitCost)).toBeCloseTo(10.4, 2); // 41,60 ÷ 4

    /*
     * A asserção que separa este motor do anterior. Repassar o custo do insumo
     * daria R$ 8,00 e a merma sairia de graça — o molho pareceria mais barato
     * do que é, e toda margem calculada a partir dele seria otimista.
     */
    expect(Number(corrida.unitCost)).not.toBeCloseTo(8, 2);

    // E o preparado passa a valer isso.
    expect(await custoDoItem(molhoId)).toBeCloseTo(10.4, 2);
  });

  it("03 · o custo é congelado: mudar o preço do tomate depois não mexe na corrida", async () => {
    const corrida = await produzir();
    expect(Number(corrida.unitCost)).toBeCloseTo(10.4, 2);

    await prisma.inventoryItem.update({ where: { id: tomateId }, data: { cost: 99 } });

    const relida = await prisma.productionRun.findUnique({ where: { id: corrida.id } });
    expect(Number(relida!.unitCost)).toBeCloseTo(10.4, 2);

    const consumo = await prisma.inventoryMovement.findFirst({
      where: { productionRunId: corrida.id, type: "CONSUMPTION" },
    });
    expect(Number(consumo!.costAtTime)).toBeCloseTo(8, 2);
  });

  it("04 · idempotência: o mesmo token duas vezes é uma corrida só", async () => {
    const t = proximoToken();
    const a = await produzir({ runToken: t });
    const b = await produzir({ runToken: t });

    expect(b.id).toBe(a.id);
    expect(await prisma.productionRun.count()).toBe(1);

    /*
     * O saldo é o que importa. Uma segunda corrida silenciosa apareceria aqui
     * como 89,6 de tomate — a baixa aplicada duas vezes.
     */
    expect(await saldo(tomateId)).toBeCloseTo(94.8, 4);
    expect(await saldo(molhoId)).toBeCloseTo(4, 4);
  });

  it("05 · dois tokens distintos são duas panelas de verdade, e somam", async () => {
    await produzir();
    await produzir();

    /*
     * O espelho do cenário 04, e o que o default `"AVULSO"` destruía: duas
     * produções da MESMA receita são dois fatos reais. Com a chave antiga a
     * segunda colidia com a primeira e desaparecia.
     */
    expect(await prisma.productionRun.count()).toBe(2);
    expect(await saldo(tomateId)).toBeCloseTo(89.6, 4); // 100 − 10,4
    expect(await saldo(molhoId)).toBeCloseTo(8, 4);
  });

  it("06 · concorrência: dez produções simultâneas com insumo para três", async () => {
    await prisma.inventoryItem.update({
      where: { id: tomateId },
      data: { quantityOnHand: 16 }, // 3 × 5,2 = 15,6; a quarta não cabe
    });

    const tentativas = await Promise.allSettled(
      Array.from({ length: 10 }, () => produzir()),
    );
    const aceitas = tentativas.filter((t) => t.status === "fulfilled").length;

    /*
     * Sem a trava dentro da transação, as dez leriam "há 16 kg" ao mesmo tempo
     * e as dez passariam — o tomate terminaria em −36 kg. Foi assim que a
     * Fase 1 descobriu o teto de reserva que faltava.
     */
    expect(aceitas).toBe(3);
    expect(await saldo(tomateId)).toBeCloseTo(0.4, 4);
    expect(await saldo(molhoId)).toBeCloseTo(12, 4);
    expect(await saldo(tomateId)).toBeGreaterThanOrEqual(0);
  });

  it("07 · produção é recusada quando falta insumo, e não deixa saldo negativo", async () => {
    await prisma.inventoryItem.update({
      where: { id: tomateId },
      data: { quantityOnHand: 1 },
    });

    await expect(produzir()).rejects.toThrow(/estoque|suficiente|Disponível/i);

    /*
     * Aqui produção difere do pedido de propósito. No pedido a comida já foi
     * vendida e a cozinha já usou: recusar apagaria o registro. Na produção há
     * um humano na frente da tela e ainda dá para não começar.
     */
    expect(await saldo(tomateId)).toBeCloseTo(1, 4);
    expect(await saldo(molhoId)).toBeCloseTo(0, 4);
  });

  it("07b · falha no meio desfaz tudo: nenhum insumo fica baixado sozinho", async () => {
    const sal = await criarInsumo("Sal", 0.01, 2); // não dá para a receita
    await prisma.compositionItem.create({
      data: { compositionId: receitaId, inventoryItemId: sal.id, quantity: 0.1, unitId: unitKg },
    });

    const tomateAntes = await saldo(tomateId);
    await expect(produzir()).rejects.toThrow();

    /*
     * Os dois insumos são travados em ordem de id, então um deles é baixado
     * antes de o outro falhar. Sem o desfazimento, o estoque ficaria mentindo
     * sem ninguém para reconciliar.
     */
    expect(await saldo(tomateId)).toBeCloseTo(tomateAntes, 4);
    expect(await saldo(sal.id)).toBeCloseTo(0.01, 4);
    expect(await saldo(molhoId)).toBeCloseTo(0, 4);

    // A corrida fica registrada como revertida, com o motivo — não some.
    const corridas = await prisma.productionRun.findMany();
    expect(corridas).toHaveLength(1);
    expect(corridas[0].status).toBe("REVERSED");
    expect(corridas[0].inventoryInconsistency).toMatch(/desfeita/i);
  });

  it("12 · reverter devolve os insumos e retira o que foi produzido", async () => {
    const corrida = await produzir();
    expect(await saldo(tomateId)).toBeCloseTo(94.8, 4);

    const revertida = await ProducaoService.reverter(storeId, corrida.id, "admin-7");

    expect(revertida.status).toBe("REVERSED");
    expect(revertida.reversedById).toBe("admin-7");
    expect(revertida.reversedAt).toBeInstanceOf(Date);
    expect(await saldo(tomateId)).toBeCloseTo(100, 4);
    expect(await saldo(molhoId)).toBeCloseTo(0, 4);

    // Sem produção válida sobrando, o preparado deixa de ter custo.
    expect(await custoDoItem(molhoId)).toBeNull();
  });

  it("12b · reverter com o preparado já vendido leva o saldo a negativo, e marca", async () => {
    const corrida = await produzir();

    // A cozinha usou 3 dos 4 kg antes de alguém notar o erro de digitação.
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#ORDER#x#CONSUMPTION#${molhoId}`,
      itemId: molhoId,
      type: "CONSUMPTION",
      quantity: -3,
      unitId: unitKg,
    } as any);
    expect(await saldo(molhoId)).toBeCloseTo(1, 4);

    const revertida = await ProducaoService.reverter(storeId, corrida.id);

    /*
     * Recusar deixaria o operador sem saída depois de um erro. O negativo é
     * registrado e fica visível — mesmo padrão que a Fase 1 usa no pedido.
     */
    expect(await saldo(molhoId)).toBeCloseTo(-3, 4);
    expect(revertida.inventoryInconsistentAt).toBeInstanceOf(Date);
    expect(revertida.inventoryInconsistency).toMatch(/negativo/i);
  });

  it("12c · o custo volta para o da produção anterior que ainda vale", async () => {
    const primeira = await produzir(); // 10,40/kg
    await prisma.inventoryItem.update({ where: { id: tomateId }, data: { cost: 16 } });
    const segunda = await produzir(); // 5,2 × 16 ÷ 4 = 20,80/kg

    expect(await custoDoItem(molhoId)).toBeCloseTo(20.8, 2);

    await ProducaoService.reverter(storeId, segunda.id);

    /*
     * Deixar 20,80 seria precificar o molho por uma corrida que deixou de
     * existir. O custo é o da aquisição não revertida mais recente.
     */
    expect(await custoDoItem(molhoId)).toBeCloseTo(10.4, 2);
    expect(Number((await prisma.productionRun.findUnique({ where: { id: primeira.id } }))!.unitCost))
      .toBeCloseTo(10.4, 2);
  });

  it("13 · reverter duas vezes não reverte duas vezes", async () => {
    const corrida = await produzir();
    await ProducaoService.reverter(storeId, corrida.id);
    const depoisDaPrimeira = await saldo(tomateId);

    await ProducaoService.reverter(storeId, corrida.id);

    /*
     * A segunda passada não pode devolver tomate de novo. O
     * `originalMovementId @unique` do banco é a garantia; o atalho por status
     * só evita o erro.
     */
    expect(await saldo(tomateId)).toBeCloseTo(depoisDaPrimeira, 4);
    expect(await saldo(tomateId)).toBeCloseTo(100, 4);

    const reversoes = await prisma.inventoryMovement.count({
      where: { storeId, type: "REVERSAL" },
    });
    expect(reversoes).toBe(2); // uma por movimento original, e só
  });

  it("17 · a versão da receita fica congelada na corrida", async () => {
    const corrida = await produzir();

    // Publica a v2, com metade do tomate.
    await prisma.productComposition.update({
      where: { id: receitaId },
      data: { isActive: false },
    });
    const v2 = await prisma.productComposition.create({
      data: {
        storeId,
        inventoryItemId: molhoId,
        version: 2,
        yieldQuantity: 4,
        yieldUnitId: unitKg,
        items: { create: [{ inventoryItemId: tomateId, quantity: 2.6, unitId: unitKg }] },
      },
    });

    const relida = await prisma.productionRun.findUnique({ where: { id: corrida.id } });
    expect(relida!.compositionId).toBe(receitaId);
    expect(relida!.compositionId).not.toBe(v2.id);
    // E o que ela gastou continua sendo o da v1.
    expect(Number(relida!.totalInputCost)).toBeCloseTo(41.6, 2);
  });

  it("18 · receita sem rendimento é recusada", async () => {
    const semRendimento = await prisma.productComposition.create({
      data: {
        storeId,
        inventoryItemId: molhoId,
        version: 2,
        items: { create: [{ inventoryItemId: tomateId, quantity: 1, unitId: unitKg }] },
      },
    });

    await expect(
      produzir({ compositionId: semRendimento.id }),
    ).rejects.toThrow(/rendimento/i);

    await prisma.productComposition.update({
      where: { id: semRendimento.id },
      data: { yieldQuantity: 0, yieldUnitId: unitKg },
    });
    await expect(
      produzir({ compositionId: semRendimento.id }),
    ).rejects.toThrow(/rendimento/i);

    expect(await saldo(tomateId)).toBeCloseTo(100, 4);
  });

  it("18b · ficha de produto do cardápio não é produzida", async () => {
    const categoria = await prisma.category.create({
      data: { storeId, name: "Pizzas", slug: `p-${Date.now()}`, kind: "PIZZA" },
    });
    const pizza = await prisma.product.create({
      data: {
        storeId,
        categoryId: categoria.id,
        name: "Margherita",
        slug: `m-${Date.now()}`,
        description: "",
        basePrice: 50,
      },
    });
    const fichaDaPizza = await prisma.productComposition.create({
      data: { storeId, productId: pizza.id, version: 1 },
    });

    await expect(
      produzir({ compositionId: fichaDaPizza.id }),
    ).rejects.toThrow(/produto do cardápio|preparado/i);
  });

  it("19 · a perda declarada vira LOSS e NÃO infla o custo unitário", async () => {
    const corrida = await produzir({ lossQuantity: 0.3 });

    // O custo continua sendo entrada ÷ produzido. A perda é sobre onde o
    // produto foi parar, não sobre quanto ele custou.
    expect(Number(corrida.unitCost)).toBeCloseTo(10.4, 2);
    expect(Number(corrida.totalInputCost)).toBeCloseTo(41.6, 2);

    // E sai do saldo: produziu 4, perdeu 0,3.
    expect(await saldo(molhoId)).toBeCloseTo(3.7, 4);

    const perda = await prisma.inventoryMovement.findFirst({
      where: { productionRunId: corrida.id, type: "LOSS" },
    });
    expect(perda).toBeTruthy();
    expect(Number(perda!.quantity)).toBeCloseTo(0.3, 4);
  });

  it("20 · o rendimento real diverge do esperado sem quebrar o custo", async () => {
    // A receita esperava 4 kg; saíram 3,6.
    const corrida = await produzir({ producedQuantity: 3.6 });

    expect(Number(corrida.plannedQuantity)).toBeCloseTo(4, 4);
    expect(Number(corrida.producedQuantity)).toBeCloseTo(3.6, 4);
    expect(await saldo(molhoId)).toBeCloseTo(3.6, 4);

    /*
     * Menos molho pelo mesmo tomate significa molho mais caro. É exatamente
     * este número que torna o rendimento uma medida útil da cozinha, em vez
     * de um campo decorativo.
     */
    expect(Number(corrida.unitCost)).toBeCloseTo(41.6 / 3.6, 2);
    expect(Number(corrida.unitCost)).toBeGreaterThan(10.4);
  });

  it("21 · escala pelo planejado: produzir o dobro gasta o dobro", async () => {
    const corrida = await produzir({ plannedQuantity: 8, producedQuantity: 8 });

    expect(await saldo(tomateId)).toBeCloseTo(89.6, 4); // 100 − 10,4
    expect(Number(corrida.totalInputCost)).toBeCloseTo(83.2, 2);
    // Mesmo custo por quilo: dobrou tudo proporcionalmente.
    expect(Number(corrida.unitCost)).toBeCloseTo(10.4, 2);
  });

  it("22 · o preparado não pode ser insumo da própria receita", async () => {
    await prisma.compositionItem.create({
      data: { compositionId: receitaId, inventoryItemId: molhoId, quantity: 1, unitId: unitKg },
    });

    await expect(produzir()).rejects.toThrow(/própria receita/i);
    expect(await saldo(tomateId)).toBeCloseTo(100, 4);
  });
});
