import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { CompositionService } from "@/server/services/composition-service";
import { CicloDeReceita, PROFUNDIDADE_MAXIMA } from "@/server/services/ciclo-de-receita";
import { ProducaoService } from "@/server/services/producao-service";

/*
 * A receita de preparado, contra o Postgres local.
 *
 * O que esta etapa entrega é a porta de entrada legítima: até aqui, um
 * preparado com receita só existia se alguém o criasse por Prisma direto — foi
 * o que os testes das etapas anteriores fizeram.
 *
 * A metade mais importante é o guarda de ciclo. "Molho leva base; base leva
 * molho" é fácil de escrever e impossível de produzir, e o dano não é um erro
 * de validação: é o servidor caminhando o grafo para sempre dentro de uma
 * transação que está segurando travas de estoque.
 */

let storeId = "";
let outraLojaId = "";
let unitKg = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

async function semear() {
  await limparBanco();
  const loja = await prisma.store.create({
    data: { slug: `receita-${Date.now()}`, name: "Cozinha de Teste" },
  });
  storeId = loja.id;
  const outra = await prisma.store.create({
    data: { slug: `outra-${Date.now()}`, name: "Outra Cozinha" },
  });
  outraLojaId = outra.id;

  const kg = await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  });
  unitKg = kg.id;
}

async function criarItem(nome: string, tipo: string, loja = storeId) {
  return prisma.inventoryItem.create({
    data: {
      storeId: loja,
      name: nome,
      itemType: tipo,
      baseUnitId: unitKg,
      quantityOnHand: 100,
      cost: 8,
    },
  });
}

const receitaDe = (itemId: string, insumos: string[], rendimento = 4) =>
  CompositionService.criarReceitaDePreparado(storeId, itemId, {
    items: insumos.map((id) => ({ inventoryItemId: id, quantity: 1, unitId: unitKg, sortOrder: 0 })),
    yieldQuantity: rendimento,
    yieldUnitId: unitKg,
    isActive: true,
  });

beforeEach(semear);
afterAll(limparBanco);

describe("receita de preparado", () => {
  it("1 · cria a receita com rendimento e insumos", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const molho = await criarItem("Molho", "PREPARED");

    const receita: any = await receitaDe(molho.id, [tomate.id]);

    expect(receita.inventoryItemId).toBe(molho.id);
    expect(receita.productId).toBeNull();
    expect(receita.version).toBe(1);
    expect(receita.isActive).toBe(true);
    expect(receita.yieldQuantity).toBe(4);
    expect(receita.yieldUnitId).toBe(unitKg);
    expect(receita.items).toHaveLength(1);
    // Decimal não atravessa a fronteira do servidor.
    expect(typeof receita.items[0].quantity).toBe("number");
  });

  it("2 · versiona: a nova nasce ativa e a anterior é desativada", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const sal = await criarItem("Sal", "INGREDIENT");
    const molho = await criarItem("Molho", "PREPARED");

    const v1: any = await receitaDe(molho.id, [tomate.id]);
    const v2: any = await receitaDe(molho.id, [tomate.id, sal.id]);

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);

    const todas = await prisma.productComposition.findMany({
      where: { inventoryItemId: molho.id },
      orderBy: { version: "asc" },
    });
    expect(todas.map((r) => r.isActive)).toEqual([false, true]);
  });

  it("3 · só item PREPARED tem receita", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const outroInsumo = await criarItem("Cebola", "INGREDIENT");

    await expect(receitaDe(tomate.id, [outroInsumo.id])).rejects.toThrow(
      /não é um preparado|PREPARED/i,
    );
    expect(await prisma.productComposition.count()).toBe(0);
  });

  it("4 · rendimento é obrigatório e precisa ser positivo", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const molho = await criarItem("Molho", "PREPARED");

    /*
     * Sem rendimento não há fator de escala: produzir 8 kg de uma receita que
     * ninguém sabe quanto rende é uma conta sem denominador. O zod barra antes
     * de o serviço ser chamado.
     */
    const { criarReceitaDePreparadoSchema } = await import("@/lib/estoque-schemas");
    const semRendimento = criarReceitaDePreparadoSchema.safeParse({
      items: [{ inventoryItemId: tomate.id, quantity: 1, unitId: unitKg }],
      yieldUnitId: unitKg,
    });
    expect(semRendimento.success).toBe(false);

    const rendimentoZero = criarReceitaDePreparadoSchema.safeParse({
      items: [{ inventoryItemId: tomate.id, quantity: 1, unitId: unitKg }],
      yieldQuantity: 0,
      yieldUnitId: unitKg,
    });
    expect(rendimentoZero.success).toBe(false);

    await expect(
      CompositionService.criarReceitaDePreparado(storeId, molho.id, {
        items: [{ inventoryItemId: tomate.id, quantity: 1, unitId: unitKg, sortOrder: 0 }],
        yieldQuantity: 4,
        yieldUnitId: "unidade-que-nao-existe",
        isActive: true,
      }),
    ).rejects.toThrow(/Unidade de rendimento/i);
  });

  it("5 · não aceita insumo de outra loja", async () => {
    const molho = await criarItem("Molho", "PREPARED");
    const alheio = await criarItem("Tomate alheio", "INGREDIENT", outraLojaId);

    await expect(receitaDe(molho.id, [alheio.id])).rejects.toThrow(/Insumo não encontrado/i);
  });

  it("6 · a receita criada aqui produz de verdade", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const molho = await criarItem("Molho", "PREPARED");
    const receita: any = await receitaDe(molho.id, [tomate.id]);

    /*
     * A prova de que os dois lados se encaixam: até agora o motor de produção
     * só tinha sido exercitado contra receitas montadas por Prisma direto.
     */
    const corrida = await ProducaoService.produzir(storeId, {
      compositionId: receita.id,
      plannedQuantity: 4,
      producedQuantity: 4,
      runToken: `t-${Date.now()}`,
    });

    expect(corrida.status).toBe("COMPLETED");
    const saldo = await prisma.inventoryItem.findUnique({ where: { id: molho.id } });
    expect(Number(saldo!.quantityOnHand)).toBeCloseTo(104, 4); // 100 + 4
  });
});

describe("ciclo de receita", () => {
  it("10 · A → B → A é recusado ao gravar", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const molho = await criarItem("Molho", "PREPARED");
    const base = await criarItem("Base", "PREPARED");

    // Base leva molho.
    await receitaDe(base.id, [molho.id]);

    /*
     * Agora molho tentando levar base fecha o ciclo. Recusar aqui é o que
     * impede o caminhamento infinito no motor de produção.
     */
    await expect(receitaDe(molho.id, [base.id, tomate.id])).rejects.toThrow(/ciclo/i);

    // E a receita não foi gravada pela metade.
    expect(await prisma.productComposition.count({ where: { inventoryItemId: molho.id } })).toBe(0);
  });

  it("10b · o ciclo indireto A → B → C → A também é recusado", async () => {
    const a = await criarItem("A", "PREPARED");
    const b = await criarItem("B", "PREPARED");
    const c = await criarItem("C", "PREPARED");
    const tomate = await criarItem("Tomate", "INGREDIENT");

    await receitaDe(b.id, [c.id]);
    await receitaDe(c.id, [a.id]);

    // a → b → c → a
    await expect(receitaDe(a.id, [b.id, tomate.id])).rejects.toThrow(/ciclo/i);
  });

  it("10c · o autociclo direto é recusado", async () => {
    const molho = await criarItem("Molho", "PREPARED");
    await expect(receitaDe(molho.id, [molho.id])).rejects.toThrow(/própria receita/i);
  });

  it("10d · cadeia funda mas SEM ciclo é aceita", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const n1 = await criarItem("N1", "PREPARED");
    const n2 = await criarItem("N2", "PREPARED");
    const n3 = await criarItem("N3", "PREPARED");

    await receitaDe(n1.id, [tomate.id]);
    await receitaDe(n2.id, [n1.id]);
    const ok = await receitaDe(n3.id, [n2.id]);

    /*
     * Autoauditoria: um guarda de ciclo mal escrito tende a recusar tudo que
     * é aninhado. Este cenário só passa se ele distinguir profundidade de
     * ciclo.
     */
    expect(ok).toBeTruthy();
    expect(await CicloDeReceita.profundidade(storeId, [n3.id])).toBeGreaterThan(1);
  });

  it("11 · cadeia acima do limite de profundidade é recusada", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const niveis = [];
    for (let i = 0; i < PROFUNDIDADE_MAXIMA + 2; i++) {
      niveis.push(await criarItem(`N${i}`, "PREPARED"));
    }

    // N0 usa tomate; N1 usa N0; N2 usa N1; ... até bater no teto.
    await receitaDe(niveis[0].id, [tomate.id]);

    let recusouEm = -1;
    for (let i = 1; i < niveis.length; i++) {
      try {
        await receitaDe(niveis[i].id, [niveis[i - 1].id]);
      } catch (erro) {
        expect(String((erro as Error).message)).toMatch(/níveis|profund/i);
        recusouEm = i;
        break;
      }
    }

    expect(recusouEm, "a cadeia deveria ter sido recusada em algum nível").toBeGreaterThan(0);
    expect(recusouEm).toBeLessThanOrEqual(PROFUNDIDADE_MAXIMA + 1);
  });

  it("12 · versão DESATIVADA não conta para o ciclo", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const molho = await criarItem("Molho", "PREPARED");
    const massa = await criarItem("Massa", "PREPARED");

    // v1 do molho usa massa. Depois a v2 troca para tomate, e a v1 morre.
    await receitaDe(molho.id, [massa.id]);
    await receitaDe(molho.id, [tomate.id]);

    /*
     * Agora massa pode usar molho: a única receita ativa do molho é a v2, que
     * leva tomate. Contar a v1 desativada bloquearia para sempre uma receita
     * legítima — uma versão morta não produz nada.
     */
    const ok = await receitaDe(massa.id, [molho.id]);
    expect(ok).toBeTruthy();
  });

  it("13 · a mensagem nomeia o preparado, para dizer onde olhar", async () => {
    const molho = await criarItem("Molho de tomate", "PREPARED");
    const base = await criarItem("Base", "PREPARED");
    await receitaDe(base.id, [molho.id]);

    await expect(receitaDe(molho.id, [base.id])).rejects.toThrow(/Molho de tomate/);
  });
});

describe("atualização de receita de preparado", () => {
  it("14 · troca os insumos mantendo a mesma versão", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const sal = await criarItem("Sal", "INGREDIENT");
    const molho = await criarItem("Molho", "PREPARED");

    const receita: any = await receitaDe(molho.id, [tomate.id]);
    const atualizada: any = await CompositionService.atualizarReceitaDePreparado(
      storeId,
      receita.id,
      {
        items: [{ inventoryItemId: sal.id, quantity: 2, unitId: unitKg, sortOrder: 0 }],
        yieldQuantity: 6,
      },
    );

    expect(atualizada.id).toBe(receita.id); // mesma versão, editada no lugar
    expect(atualizada.yieldQuantity).toBe(6);
    expect(atualizada.items).toHaveLength(1);
    expect(atualizada.items[0].inventoryItemId).toBe(sal.id);
  });

  it("15 · a atualização também confere o ciclo, com os insumos NOVOS", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const molho = await criarItem("Molho", "PREPARED");
    const base = await criarItem("Base", "PREPARED");

    const doMolho: any = await receitaDe(molho.id, [tomate.id]);
    await receitaDe(base.id, [molho.id]);

    /*
     * Conferir só na criação deixaria a porta dos fundos aberta: bastava criar
     * limpo e depois editar para fechar o ciclo.
     */
    await expect(
      CompositionService.atualizarReceitaDePreparado(storeId, doMolho.id, {
        items: [{ inventoryItemId: base.id, quantity: 1, unitId: unitKg, sortOrder: 0 }],
      }),
    ).rejects.toThrow(/ciclo/i);

    // E os insumos antigos continuam lá.
    const itens = await prisma.compositionItem.findMany({ where: { compositionId: doMolho.id } });
    expect(itens).toHaveLength(1);
    expect(itens[0].inventoryItemId).toBe(tomate.id);
  });

  it("16 · não aceita editar ficha de produto por este caminho", async () => {
    const categoria = await prisma.category.create({
      data: { storeId, name: "Pizzas", slug: `p-${Date.now()}`, kind: "PIZZA" },
    });
    const pizza = await prisma.product.create({
      data: {
        storeId, categoryId: categoria.id, name: "Margherita",
        slug: `m-${Date.now()}`, description: "", basePrice: 50,
      },
    });
    const fichaDaPizza = await prisma.productComposition.create({
      data: { storeId, productId: pizza.id, version: 1 },
    });

    await expect(
      CompositionService.atualizarReceitaDePreparado(storeId, fichaDaPizza.id, {
        yieldQuantity: 4,
      }),
    ).rejects.toThrow(/produto do cardápio/i);
  });
});

describe("regressão: activateVersion escopado pelo dono", () => {
  it("17 · ativar uma versão de molho NÃO desativa a receita de outro preparado", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const molho = await criarItem("Molho", "PREPARED");
    const massa = await criarItem("Massa", "PREPARED");

    const molhoV1: any = await receitaDe(molho.id, [tomate.id]);
    await receitaDe(molho.id, [tomate.id]); // v2, ativa
    const daMassa: any = await receitaDe(massa.id, [tomate.id]);

    await CompositionService.activateVersion(storeId, molhoV1.id);

    /*
     * O defeito que isto trava: enquanto `productId` era NOT NULL, filtrar por
     * ele escopava sozinho. Com receita de preparado, `productId` é nulo e
     * `WHERE "productId" IS NULL` casa TODAS as receitas de preparado do
     * banco — ativar uma versão de molho desativaria a massa junto, e a de
     * todas as outras lojas.
     */
    const massaDepois = await prisma.productComposition.findUnique({ where: { id: daMassa.id } });
    expect(massaDepois!.isActive, "a receita da massa foi desativada junto").toBe(true);

    // E o versionamento do molho funcionou: a v1 ativa, a v2 não.
    const doMolho = await prisma.productComposition.findMany({
      where: { inventoryItemId: molho.id },
      orderBy: { version: "asc" },
    });
    expect(doMolho.map((r) => r.isActive)).toEqual([true, false]);
  });

  it("18 · e não atravessa lojas", async () => {
    const tomate = await criarItem("Tomate", "INGREDIENT");
    const molho = await criarItem("Molho", "PREPARED");
    const molhoV1: any = await receitaDe(molho.id, [tomate.id]);
    await receitaDe(molho.id, [tomate.id]);

    // Uma receita de preparado da OUTRA loja, montada direto.
    const alheio = await criarItem("Molho alheio", "PREPARED", outraLojaId);
    const daOutraLoja = await prisma.productComposition.create({
      data: {
        storeId: outraLojaId, inventoryItemId: alheio.id, version: 1,
        isActive: true, yieldQuantity: 4, yieldUnitId: unitKg,
      },
    });

    await CompositionService.activateVersion(storeId, molhoV1.id);

    const depois = await prisma.productComposition.findUnique({ where: { id: daOutraLoja.id } });
    expect(depois!.isActive, "a receita da outra loja foi desativada").toBe(true);
  });
});
