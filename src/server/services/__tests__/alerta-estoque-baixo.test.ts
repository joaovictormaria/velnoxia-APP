import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { ProductionService } from "@/server/services/production-service";

/*
 * O alerta de estoque baixo, contra o Postgres local.
 *
 * Este teste existe por uma falha que passou despercebida por meses: o filtro
 * comparava `quantityOnHand` com `item.minimumStock`, campo que não existe no
 * schema — o real é `minimumThreshold`. Sob `@ts-nocheck` isso compilava, e em
 * execução `undefined || 0` transformava toda comparação em
 * `quantityOnHand < 0`. A lista voltava sempre vazia.
 *
 * O que torna esse tipo de erro caro é que a saída errada é indistinguível da
 * saída certa: uma lista vazia é exatamente o que se espera quando não há
 * nada em falta. Só um teste com um item deliberadamente abaixo do limite
 * separa "nada em falta" de "ninguém está olhando".
 */

let storeId = "";
let unitId = "";

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
    data: { slug: `alerta-${Date.now()}`, name: "Cozinha de Teste" },
  });
  storeId = loja.id;
  const kg = await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  });
  unitId = kg.id;
}

async function criarItem(opcoes: {
  nome: string;
  saldo: number;
  limite?: number | null;
  ativo?: boolean;
}) {
  return prisma.inventoryItem.create({
    data: {
      storeId,
      name: opcoes.nome,
      itemType: "INGREDIENT",
      baseUnitId: unitId,
      quantityOnHand: opcoes.saldo,
      minimumThreshold: opcoes.limite ?? null,
      isActive: opcoes.ativo ?? true,
    },
  });
}

async function nomesEmAlerta() {
  const itens = await ProductionService.getLowStockItems(storeId);
  return itens.map((i) => i.name).sort();
}

beforeEach(semear);
afterAll(limparBanco);

describe("alerta de estoque baixo", () => {
  it("1 · aponta o item que está abaixo do limite mínimo", async () => {
    await criarItem({ nome: "Tomate", saldo: 2, limite: 10 });

    /*
     * A asserção que a versão antiga reprovava. Com `minimumStock`, o filtro
     * virava `2 < 0` e devolvia lista vazia — sem erro, sem log, sem sintoma.
     */
    expect(await nomesEmAlerta()).toEqual(["Tomate"]);
  });

  it("2 · não aponta item com saldo acima do limite", async () => {
    await criarItem({ nome: "Cebola", saldo: 50, limite: 10 });
    expect(await nomesEmAlerta()).toEqual([]);
  });

  /*
   * A REGRA VIROU `<=`, e este teste afirmava o contrário.
   *
   * Ele fixava `saldo == limite` como "não é alerta", que era o comportamento
   * de `quantityOnHand < minimumThreshold`. A unificação em `statusDoEstoque`
   * adotou `<=`: o mínimo é o piso que não se quer furar, não o ponto a partir
   * do qual se começa a pensar. Estar exatamente nele já é hora de comprar.
   */
  it("3 · saldo exatamente no limite JÁ é alerta", async () => {
    await criarItem({ nome: "Alho", saldo: 10, limite: 10 });
    expect(await nomesEmAlerta()).toEqual(["Alho"]);

    // E um décimo abaixo, com mais razão ainda.
    await criarItem({ nome: "Sal", saldo: 9.9, limite: 10 });
    expect(await nomesEmAlerta()).toEqual(["Alho", "Sal"]);
  });

  it("3.1 · um décimo ACIMA do limite não é alerta", async () => {
    await criarItem({ nome: "Folgado", saldo: 10.1, limite: 10 });
    expect(await nomesEmAlerta()).toEqual([]);
  });

  it("4 · item sem limite não é ESTOQUE BAIXO, mas pode estar SEM ESTOQUE", async () => {
    /*
     * `minimumThreshold` é opcional, e continua sendo: item sem limite não é
     * item abaixo do mínimo — é item sem alerta configurado. Tratá-lo como
     * limite zero faria todo insumo nunca configurado virar alarme.
     *
     * O QUE MUDOU: sem disponível, ele aparece assim mesmo. Antes as consultas
     * filtravam `minimumThreshold: { not: null }` no SQL, e um item ZERADO
     * ficava invisível por não ter alerta configurado — o pior dos dois mundos,
     * porque zerado é justamente o que a produção precisa saber.
     */
    await criarItem({ nome: "Sem limite", saldo: 0, limite: null });
    await criarItem({ nome: "Sem limite negativo", saldo: -5, limite: null });
    await criarItem({ nome: "Com folga", saldo: 50, limite: null });

    // Os dois sem disponível aparecem; o que tem folga, não.
    expect(await nomesEmAlerta()).toEqual(["Sem limite", "Sem limite negativo"]);
  });

  it("5 · item inativo não gera alerta", async () => {
    await criarItem({ nome: "Aposentado", saldo: 0, limite: 10, ativo: false });
    expect(await nomesEmAlerta()).toEqual([]);
  });

  it("6 · separa vários itens corretamente, e não devolve tudo nem nada", async () => {
    await criarItem({ nome: "Abaixo A", saldo: 1, limite: 10 });
    await criarItem({ nome: "Acima B", saldo: 99, limite: 10 });
    await criarItem({ nome: "Abaixo C", saldo: 0, limite: 5 });
    await criarItem({ nome: "Sem limite D", saldo: 0, limite: null });
    await criarItem({ nome: "Inativo E", saldo: 0, limite: 5, ativo: false });

    /*
     * Autoauditoria: um filtro quebrado tende a errar para um dos extremos —
     * devolve vazio (o bug antigo) ou devolve tudo. Este cenário só passa com
     * a seleção exata, o que exclui os dois modos de falha.
     */
    /*
     * "Sem limite D" entrou na lista, e é a mudança da unificação: saldo zero
     * é OUT_OF_STOCK independentemente de haver mínimo configurado. "Inativo E"
     * continua fora, e "Acima B" também.
     */
    const alerta = await nomesEmAlerta();
    expect(alerta).toEqual(["Abaixo A", "Abaixo C", "Sem limite D"]);
    expect(alerta.length).toBeGreaterThan(0);
    expect(alerta.length).toBeLessThan(5);
  });

  it("7 · não vaza itens de outra loja", async () => {
    await criarItem({ nome: "Meu tomate", saldo: 1, limite: 10 });

    const outra = await prisma.store.create({
      data: { slug: `outra-${Date.now()}`, name: "Outra Cozinha" },
    });
    await prisma.inventoryItem.create({
      data: {
        storeId: outra.id,
        name: "Tomate alheio",
        itemType: "INGREDIENT",
        baseUnitId: unitId,
        quantityOnHand: 0,
        minimumThreshold: 10,
      },
    });

    expect(await nomesEmAlerta()).toEqual(["Meu tomate"]);
  });
});
