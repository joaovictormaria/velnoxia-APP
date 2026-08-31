import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { crossSerializeAsync } from "seroval";
import { prisma } from "@/server/db/client";
import { reportRepository } from "@/server/repositories/report-repository";
import { numeros } from "@/server/functions/serializar";

/*
 * O CONTADOR "ALERTAS DE ESTOQUE" DO PAINEL, DA CONSULTA ATÉ A FRONTEIRA.
 *
 * O painel mostrava ZERO com itens claramente em falta na aba ao lado. Não era
 * a regra: `statusDoEstoque` respondia certo, e a aba Itens — que a chama no
 * navegador — pintava o item. Era o RETORNO da server function.
 *
 * `adminGetLowStockAlerts` devolvia os itens crus do Prisma, com `Decimal` em
 * `quantityOnHand`, `quantityReserved`, `minimumThreshold` e `cost`. O seroval
 * do TanStack Start não serializa `Decimal`: a chamada morria na fronteira, o
 * `Promise.all` do painel rejeitava e o `catch` deixava a tela com os DOIS
 * cartões zerados — inclusive o "Valor Total em Estoque", que nem vem daqui.
 * Era esse o sintoma completo, e é por isso que o zero parecia regra errada.
 *
 * A regra em si tem teste próprio e puro em
 * `src/lib/__tests__/status-do-estoque.test.ts`. O que se prova AQUI é o que
 * aquele arquivo não alcança: que a consulta que alimenta o painel seleciona os
 * itens certos do BANCO, e que o valor devolvido chega inteiro do outro lado.
 */

let storeId = "";
let outraLoja = "";
let un = "";
let kg = "";

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

/** Um item de estoque com o estado que o caso pede. */
async function item(
  loja: string,
  nome: string,
  dados: {
    unidade: string;
    onHand: number;
    reservado?: number;
    minimo?: number | null;
    ativo?: boolean;
  },
) {
  return prisma.inventoryItem.create({
    data: {
      storeId: loja,
      name: nome,
      itemType: "INGREDIENT",
      baseUnitId: dados.unidade,
      quantityOnHand: dados.onHand,
      quantityReserved: dados.reservado ?? 0,
      minimumThreshold: dados.minimo ?? null,
      cost: 42,
      isActive: dados.ativo ?? true,
    },
  });
}

/** Percorre o objeto e denuncia qualquer Decimal que tenha sobrado. */
function decimaisRestantes(valor: unknown, caminho = "raiz"): string[] {
  if (valor === null || valor === undefined) return [];
  if (typeof valor !== "object") return [];
  if (valor instanceof Date) return [];
  if (typeof (valor as any).toNumber === "function") return [caminho];
  if (Array.isArray(valor)) {
    return valor.flatMap((v, i) => decimaisRestantes(v, `${caminho}[${i}]`));
  }
  return Object.entries(valor).flatMap(([k, v]) => decimaisRestantes(v, `${caminho}.${k}`));
}

/** O mesmo serializador que o TanStack Start usa no retorno do handler. */
async function atravessaAFronteira(valor: unknown): Promise<boolean> {
  try {
    await crossSerializeAsync([valor], { scopeId: "teste" });
    return true;
  } catch {
    return false;
  }
}

const nomes = (lista: Array<{ name: string }>) => lista.map((i) => i.name).sort();

beforeEach(async () => {
  await limparBanco();

  const u = await prisma.inventoryUnit.create({
    data: { code: "un", name: "Unidade", system: "COUNT", isBuiltIn: true },
  });
  un = u.id;
  const k = await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  });
  kg = k.id;

  const loja = await prisma.store.create({
    data: { slug: `alerta-${Date.now()}`, name: "Pizzaria" },
  });
  storeId = loja.id;

  const vizinha = await prisma.store.create({
    data: { slug: `vizinha-${Date.now()}`, name: "Padaria da esquina" },
  });
  outraLoja = vizinha.id;
});
afterAll(limparBanco);

describe("quais itens o painel deve contar", () => {
  it("A · saldo zerado entra no alerta", async () => {
    await item(storeId, "Bolo de Chocolate", { unidade: un, onHand: 0 });
    const alertas = await reportRepository.getLowStockItems(storeId);
    expect(nomes(alertas)).toEqual(["Bolo de Chocolate"]);
  });

  it("B · abaixo do mínimo entra no alerta", async () => {
    await item(storeId, "Farinha", { unidade: kg, onHand: 1.88, minimo: 6 });
    const alertas = await reportRepository.getLowStockItems(storeId);
    expect(nomes(alertas)).toEqual(["Farinha"]);
  });

  it("C · exatamente no mínimo entra no alerta — o piso não é para furar", async () => {
    await item(storeId, "Fermento", { unidade: kg, onHand: 6, minimo: 6 });
    const alertas = await reportRepository.getLowStockItems(storeId);
    expect(nomes(alertas)).toEqual(["Fermento"]);
  });

  it("D · acima do mínimo fica de fora", async () => {
    await item(storeId, "Açúcar", { unidade: kg, onHand: 10, minimo: 6 });
    const alertas = await reportRepository.getLowStockItems(storeId);
    expect(alertas).toEqual([]);
  });

  it("E · sem mínimo configurado só alerta quando não há disponível", async () => {
    await item(storeId, "Orégano", { unidade: un, onHand: 5, minimo: null });
    await item(storeId, "Manjericão", { unidade: un, onHand: 0, minimo: null });
    const alertas = await reportRepository.getLowStockItems(storeId);
    // Mínimo nulo é "sem alerta configurado", e não "mínimo zero": o Orégano
    // com 5 livres não vira alarme só por nunca ter sido configurado.
    expect(nomes(alertas)).toEqual(["Manjericão"]);
  });

  it("F · o reservado conta — 10 no físico com 8 prometidos são 2 livres", async () => {
    await item(storeId, "Muçarela", { unidade: kg, onHand: 10, reservado: 8, minimo: 3 });
    const alertas = await reportRepository.getLowStockItems(storeId);
    expect(nomes(alertas)).toEqual(["Muçarela"]);
  });

  it("disponível NEGATIVO é alerta — o caso real da tela", async () => {
    // Queijo muçarela: -0,2 un no saldo, nada reservado, sem mínimo.
    await item(storeId, "Queijo muçarela", { unidade: un, onHand: -0.2 });
    const alertas = await reportRepository.getLowStockItems(storeId);
    expect(nomes(alertas)).toEqual(["Queijo muçarela"]);
  });

  it("item inativo não entra, e loja vizinha também não", async () => {
    await item(storeId, "Arquivado", { unidade: un, onHand: 0, ativo: false });
    await item(outraLoja, "Da padaria", { unidade: un, onHand: 0 });
    expect(await reportRepository.getLowStockItems(storeId)).toEqual([]);
  });

  it("o contador do painel é o tamanho da lista — três itens, três alertas", async () => {
    await item(storeId, "Sem estoque", { unidade: un, onHand: 0 });
    await item(storeId, "Abaixo do mínimo", { unidade: kg, onHand: 1.88, minimo: 6 });
    await item(storeId, "Tudo reservado", { unidade: un, onHand: 4, reservado: 4 });
    await item(storeId, "Folgado", { unidade: kg, onHand: 20, minimo: 6 });

    const alertas = await reportRepository.getLowStockItems(storeId);
    expect(alertas).toHaveLength(3);
    expect(nomes(alertas)).toEqual(["Abaixo do mínimo", "Sem estoque", "Tudo reservado"]);
  });
});

describe("o retorno tem de atravessar a fronteira da server function", () => {
  /*
   * ESTES DOIS SÃO O DEFEITO E A CORREÇÃO, LADO A LADO.
   *
   * O primeiro prova a causa em vez de afirmá-la: se um dia o repositório
   * passar a devolver número, ele falha e avisa que o `numeros()` do handler
   * virou redundante — não que algo quebrou.
   *
   * O segundo é o teste que falharia contra o código anterior: o handler
   * devolvia exatamente o valor cru do primeiro, sem passar por `numeros()`.
   */
  it("o valor CRU do repositório ainda carrega Decimal, e o seroval o recusa", async () => {
    await item(storeId, "Queijo muçarela", { unidade: un, onHand: -0.2 });
    const cru = await reportRepository.getLowStockItems(storeId);

    expect(cru).toHaveLength(1);
    expect(decimaisRestantes(cru).length).toBeGreaterThan(0);
    expect(await atravessaAFronteira(cru)).toBe(false);
  });

  it("passado por numeros(), o mesmo valor atravessa inteiro", async () => {
    await item(storeId, "Queijo muçarela", { unidade: un, onHand: -0.2, minimo: null });
    await item(storeId, "Farinha", { unidade: kg, onHand: 1.88, reservado: 0.5, minimo: 6 });

    const resposta = numeros(await reportRepository.getLowStockItems(storeId));

    expect(await atravessaAFronteira(resposta)).toBe(true);
    expect(decimaisRestantes(resposta)).toEqual([]);
    // E o contador que o painel exibe sai correto do outro lado.
    expect(resposta).toHaveLength(2);

    // Os números chegam como números, que é o que a tela formata.
    const farinha = resposta.find((i: any) => i.name === "Farinha") as any;
    expect(farinha.quantityOnHand).toBe(1.88);
    expect(farinha.quantityReserved).toBe(0.5);
    expect(farinha.minimumThreshold).toBe(6);
    expect(farinha.baseUnit.code).toBe("kg");
  });
});
