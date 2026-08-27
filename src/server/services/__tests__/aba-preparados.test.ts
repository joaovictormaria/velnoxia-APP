import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { CompositionService } from "@/server/services/composition-service";
import { ProducaoService } from "@/server/services/producao-service";

/*
 * O que a aba Preparados acrescentou de REGRA, contra o Postgres local.
 *
 * A tela em si não decide nada: ficha, produção, custo e reversão vivem nos
 * serviços das etapas anteriores. O que nasceu aqui são duas coisas — criar
 * item e receita num fluxo só, e listar o histórico com a eficiência já
 * calculada — e é o que estes cenários medem.
 *
 * A eficiência é calculada no SERVIÇO de propósito. Refazer a conta no
 * navegador seria a segunda implementação da mesma regra, e é assim que dois
 * números divergem meses depois sem ninguém saber qual está certo.
 */

let storeId = "";
let unitKg = "";
let unitG = "";
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
  storeId = (await prisma.store.create({ data: { slug: `aba-${Date.now()}`, name: "Cozinha" } })).id;
  unitKg = (await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  })).id;
  unitG = (await prisma.inventoryUnit.create({
    data: { code: "g", name: "Grama", system: "WEIGHT", isBuiltIn: true },
  })).id;
  tomateId = (await prisma.inventoryItem.create({
    data: { storeId, name: "Tomate", itemType: "INGREDIENT", baseUnitId: unitKg, quantityOnHand: 100, cost: 8 },
  })).id;
}

const receitaPadrao = (insumoId = tomateId) => ({
  items: [{ inventoryItemId: insumoId, quantity: 5.2, unitId: unitKg, sortOrder: 0 }],
  yieldQuantity: 4,
  yieldUnitId: unitKg,
  isActive: true,
});

beforeEach(semear);
afterAll(limparBanco);

describe("criar preparado com receita", () => {
  it("01 · cria o item e a ficha no mesmo fluxo", async () => {
    const { item, receita }: any = await CompositionService.criarPreparadoComReceita(storeId, {
      nome: "Molho de tomate",
      baseUnitId: unitKg,
      receita: receitaPadrao(),
    });

    expect(item.itemType).toBe("PREPARED");
    expect(Number(item.quantityOnHand)).toBe(0);
    expect(receita.inventoryItemId).toBe(item.id);
    expect(receita.yieldQuantity).toBe(4);
    expect(receita.items).toHaveLength(1);
  });

  it("02 · insumo inexistente NÃO deixa preparado órfão", async () => {
    await expect(
      CompositionService.criarPreparadoComReceita(storeId, {
        nome: "Molho fantasma",
        baseUnitId: unitKg,
        receita: { ...receitaPadrao("item-que-nao-existe") },
      }),
    ).rejects.toThrow(/Insumo não encontrado/i);

    /*
     * Se o item fosse criado antes da conferência, ele sobraria na lista sem
     * receita — e o operador refaria o cadastro por cima de um nome ocupado.
     */
    expect(await prisma.inventoryItem.count({ where: { itemType: "PREPARED" } })).toBe(0);
  });

  it("03 · unidade inexistente é recusada antes de criar o item", async () => {
    await expect(
      CompositionService.criarPreparadoComReceita(storeId, {
        nome: "Molho",
        baseUnitId: "unidade-inexistente",
        receita: receitaPadrao(),
      }),
    ).rejects.toThrow(/Unidade de estoque/i);

    expect(await prisma.inventoryItem.count({ where: { itemType: "PREPARED" } })).toBe(0);
  });

  it("04 · falha DEPOIS de criar o item também não deixa órfão", async () => {
    /*
     * O caminho difícil: insumos válidos, mas a receita é recusada na gravação.
     * Um ciclo com o próprio item recém-criado é o gatilho mais direto — e o
     * item já existe quando isso acontece.
     */
    const { item }: any = await CompositionService.criarPreparadoComReceita(storeId, {
      nome: "Base",
      baseUnitId: unitKg,
      receita: receitaPadrao(),
    });

    const antes = await prisma.inventoryItem.count({ where: { itemType: "PREPARED" } });
    expect(antes).toBe(1);

    await expect(
      CompositionService.criarPreparadoComReceita(storeId, {
        nome: "Molho",
        baseUnitId: unitKg,
        receita: {
          ...receitaPadrao(),
          items: [{ inventoryItemId: item.id, quantity: 1, unitId: unitKg, sortOrder: 0 }],
          yieldUnitId: "unidade-que-nao-existe",
        },
      }),
    ).rejects.toThrow();

    expect(await prisma.inventoryItem.count({ where: { itemType: "PREPARED" } })).toBe(antes);
  });

  it("05 · o preparado criado aqui produz de verdade", async () => {
    const { item, receita }: any = await CompositionService.criarPreparadoComReceita(storeId, {
      nome: "Molho",
      baseUnitId: unitKg,
      receita: receitaPadrao(),
    });

    const corrida = await ProducaoService.produzir(storeId, {
      compositionId: receita.id,
      plannedQuantity: 4,
      producedQuantity: 4,
      runToken: `t-${Date.now()}`,
    });

    expect(corrida.status).toBe("COMPLETED");
    expect(Number(corrida.unitCost)).toBeCloseTo(10.4, 2);

    const depois = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(Number(depois!.quantityOnHand)).toBeCloseTo(4, 4);
    expect(Number(depois!.cost)).toBeCloseTo(10.4, 2);
  });
});

describe("histórico de produção", () => {
  async function criarEProduzir(nome: string, planejado: number, produzido: number) {
    const { receita }: any = await CompositionService.criarPreparadoComReceita(storeId, {
      nome,
      baseUnitId: unitKg,
      receita: receitaPadrao(),
    });
    return ProducaoService.produzir(storeId, {
      compositionId: receita.id,
      plannedQuantity: planejado,
      producedQuantity: produzido,
      runToken: `t-${nome}-${Date.now()}`,
    });
  }

  it("06 · traz a eficiência já calculada, com o PLANEJADO no denominador", async () => {
    await criarEProduzir("Molho", 8, 8);

    const [linha] = await ProducaoService.historico(storeId);

    /*
     * Panela dupla: planejado 8 de uma receita que rende 4. Comparar com o
     * rendimento da receita daria 200% numa corrida perfeitamente normal.
     */
    expect(linha.eficiencia).toBeCloseTo(100, 4);
    expect(linha.planejado).toBe(8);
    expect(linha.produzido).toBe(8);
  });

  it("07 · rendimento abaixo do planejado aparece como menos de 100%", async () => {
    await criarEProduzir("Molho", 4, 3.6);
    const [linha] = await ProducaoService.historico(storeId);

    expect(linha.eficiencia).toBeCloseTo(90, 4);
    expect(linha.custoUnitario).toBeGreaterThan(10.4);
  });

  it("08 · números saem como number, não Decimal", async () => {
    await criarEProduzir("Molho", 4, 4);
    const [linha] = await ProducaoService.historico(storeId);

    /*
     * Decimal não atravessa a fronteira da server function: o tipo que chega ao
     * cliente colapsa para `{}` e métodos de Decimal estouram em execução. Foi
     * assim que o CostAnalysis ficou quebrado.
     */
    for (const campo of ["planejado", "produzido", "custoTotal", "custoUnitario"] as const) {
      expect(typeof (linha as any)[campo], `${campo} deveria ser number`).toBe("number");
    }
  });

  it("09 · filtra por preparado", async () => {
    await criarEProduzir("Molho", 4, 4);
    const segunda = await criarEProduzir("Base", 4, 4);

    const todas = await ProducaoService.historico(storeId);
    expect(todas).toHaveLength(2);

    const soDaBase = await ProducaoService.historico(storeId, {
      inventoryItemId: segunda.compositionId
        ? (await prisma.productComposition.findUnique({ where: { id: segunda.compositionId } }))!
            .inventoryItemId!
        : "",
    });
    expect(soDaBase).toHaveLength(1);
    expect(soDaBase[0].preparado).toBe("Base");
  });

  it("10 · a corrida revertida aparece marcada, e o saldo voltou", async () => {
    const corrida = await criarEProduzir("Molho", 4, 4);
    await ProducaoService.reverter(storeId, corrida.id, "admin-1");

    const [linha] = await ProducaoService.historico(storeId);
    expect(linha.status).toBe("REVERSED");
    expect(linha.revertidaEm).toBeInstanceOf(Date);

    // E o tomate voltou: reverter devolve os insumos.
    const tomate = await prisma.inventoryItem.findUnique({ where: { id: tomateId } });
    expect(Number(tomate!.quantityOnHand)).toBeCloseTo(100, 4);
  });

  it("11 · não vaza corridas de outra loja", async () => {
    await criarEProduzir("Molho", 4, 4);

    const outra = await prisma.store.create({ data: { slug: `o-${Date.now()}`, name: "Outra" } });
    expect(await ProducaoService.historico(outra.id)).toHaveLength(0);
    expect(await ProducaoService.historico(storeId)).toHaveLength(1);
  });

  it("12 · o disponível da lista é onHand menos reservado", async () => {
    const { item, receita }: any = await CompositionService.criarPreparadoComReceita(storeId, {
      nome: "Molho",
      baseUnitId: unitKg,
      receita: receitaPadrao(),
    });
    await ProducaoService.produzir(storeId, {
      compositionId: receita.id, plannedQuantity: 4, producedQuantity: 4,
      runToken: `t-${Date.now()}`,
    });

    const { InventoryService } = await import("@/server/services/inventory-service");
    await InventoryService.reserveForOrder(storeId, item.id, 1.5, "pedido-1");

    const depois = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    const disponivel = Number(depois!.quantityOnHand) - Number(depois!.quantityReserved);

    /*
     * É o número que a lista mostra, e o mesmo que o teto de reserva usa: o que
     * ainda pode ser prometido a um pedido novo. Mostrar só o saldo faria o
     * operador achar que tem 4 kg livres quando 1,5 já está comprometido.
     */
    expect(Number(depois!.quantityOnHand)).toBeCloseTo(4, 4);
    expect(Number(depois!.quantityReserved)).toBeCloseTo(1.5, 4);
    expect(disponivel).toBeCloseTo(2.5, 4);
  });
});
