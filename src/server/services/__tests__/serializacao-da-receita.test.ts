import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { CompositionService } from "@/server/services/composition-service";
import { numeros } from "@/server/functions/serializar";

/*
 * DECIMAL NÃO ATRAVESSA A FRONTEIRA DA SERVER FUNCTION.
 *
 * Salvar uma receita devolvia 500 com "[object Decimal] cannot be
 * parsed/serialized": o seroval do TanStack Start não sabe serializar o Decimal
 * do Prisma, e o retorno de `createComposition` carrega o `InventoryItem`
 * inteiro de cada linha — dez campos Decimal.
 *
 * A serialização manual do serviço convertia CINCO deles. Bastava um insumo
 * comprado em embalagem — com `purchasePackSize` preenchido — para o sexto
 * escapar e derrubar o POST.
 *
 * Este arquivo reproduz a receita da tela onde o erro apareceu.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";
let productId = "";

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  await limparBanco();
  const sql = readFileSync(
    resolve(__dirname, `../../../../prisma/migrations/${SEED_UNIDADES}/migration.sql`),
    "utf8",
  )
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);

  const loja = await prisma.store.create({
    data: { slug: `rec-${Date.now()}`, name: "Cafeteria" },
  });
  storeId = loja.id;
  const categoria = await prisma.category.create({
    data: { storeId, name: "Cafés", slug: `cafes-${Date.now()}`, kind: "SIMPLE" },
  });
  const produto = await prisma.product.create({
    data: {
      storeId,
      categoryId: categoria.id,
      name: "Misto Quente",
      slug: `misto-${Date.now()}`,
      description: "",
      basePrice: 0,
    },
  });
  productId = produto.id;
});
afterAll(limparBanco);

/**
 * Um insumo com custo. `embalagem` preenche `purchasePackSize` e `contentSize`
 * — os campos que a serialização manual esquecia, e que o leite da tela tinha.
 */
async function insumo(
  nome: string,
  unitId: string,
  custo: number,
  embalagem?: { pacote: number; conteudo: number },
) {
  return prisma.inventoryItem.create({
    data: {
      storeId,
      name: nome,
      itemType: "INGREDIENT",
      baseUnitId: unitId,
      quantityOnHand: 100,
      cost: custo,
      ...(embalagem
        ? {
            purchasePackSize: embalagem.pacote,
            contentSize: embalagem.conteudo,
            // Os outros Decimal que também escapavam.
            minimumThreshold: 5,
            idealQuantity: 50,
            maximumCapacity: 200,
            averageCost: custo,
          }
        : {}),
    },
  });
}

/** Percorre o objeto e denuncia qualquer Decimal que tenha sobrado. */
function decimaisRestantes(valor: unknown, caminho = "raiz"): string[] {
  if (valor === null || valor === undefined) return [];
  if (typeof valor !== "object") return [];
  if (valor instanceof Date) return [];
  if (typeof (valor as any).toNumber === "function") return [caminho];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => decimaisRestantes(v, `${caminho}[${i}]`));
  return Object.entries(valor).flatMap(([k, v]) => decimaisRestantes(v, `${caminho}.${k}`));
}

describe("salvar receita — o retorno tem de atravessar para o cliente", () => {
  it("01 · o retorno CRU ainda contém Decimal — é a origem do 500", async () => {
    /*
     * Prova a causa em vez de afirmá-la. Se um dia o serviço passar a serializar
     * tudo sozinho, este teste falha e avisa que o `numeros()` da fronteira
     * virou redundante — não que algo quebrou.
     */
    const litro = "unit_l";
    // COM embalagem: é o insumo comprado em pacote que carrega os Decimal que
    // a serialização manual do serviço não cobre.
    const leite = await insumo("Leite Líquido", litro, 4.17, { pacote: 1, conteudo: 1 });

    const cru = await CompositionService.createComposition(storeId, productId, {
      productId,
      items: [{ inventoryItemId: leite.id, quantity: 1, unitId: litro, sortOrder: 0 }],
      isActive: true,
    } as any);

    expect(decimaisRestantes(cru).length).toBeGreaterThan(0);
  });

  it("02 · a receita da tela salva e o retorno serializa por completo", async () => {
    // Os três itens exatos: Açúcar 4,50 · Fermento 4,00 · Leite 4,17 (em litro,
    // comprado em embalagem — é ele que carrega os Decimal esquecidos).
    const un = "unit_un";
    const litro = "unit_l";
    const acucar = await insumo("Açúcar", un, 4.5);
    const fermento = await insumo("Fermento em Pó", un, 4.0);
    const leite = await insumo("Leite Líquido", litro, 4.17, { pacote: 1, conteudo: 1 });

    const bruto = await CompositionService.createComposition(storeId, productId, {
      productId,
      items: [
        { inventoryItemId: acucar.id, quantity: 1, unitId: un, sortOrder: 0 },
        { inventoryItemId: fermento.id, quantity: 1, unitId: un, sortOrder: 1 },
        { inventoryItemId: leite.id, quantity: 1, unitId: litro, sortOrder: 2 },
      ],
      isActive: true,
    } as any);

    const resposta = numeros(bruto);

    // Nenhum Decimal sobrou em nenhuma profundidade.
    expect(decimaisRestantes(resposta)).toEqual([]);
    // E o resultado é de fato serializável — é o que o seroval precisa.
    expect(() => structuredClone(resposta)).not.toThrow();

    // A receita foi mesmo persistida, com as três linhas.
    const salva = await prisma.productComposition.findUniqueOrThrow({
      where: { id: (bruto as any).id },
      include: { items: true },
    });
    expect(salva.isActive).toBe(true);
    expect(salva.items).toHaveLength(3);
  });

  it("03 · o custo total continua R$ 12,67", async () => {
    // A regra de custo não muda com a serialização: 4,50 + 4,00 + 4,17.
    const un = "unit_un";
    const litro = "unit_l";
    const acucar = await insumo("Açúcar", un, 4.5);
    const fermento = await insumo("Fermento em Pó", un, 4.0);
    const leite = await insumo("Leite Líquido", litro, 4.17, { pacote: 1, conteudo: 1 });

    const comp: any = await CompositionService.createComposition(storeId, productId, {
      productId,
      items: [
        { inventoryItemId: acucar.id, quantity: 1, unitId: un, sortOrder: 0 },
        { inventoryItemId: fermento.id, quantity: 1, unitId: un, sortOrder: 1 },
        { inventoryItemId: leite.id, quantity: 1, unitId: litro, sortOrder: 2 },
      ],
      isActive: true,
    } as any);

    const custo = await CompositionService.calculateCost(storeId, comp.id);

    expect(custo.total).toBeCloseTo(12.67, 2);
    expect(Number(custo.linhasSemCusto)).toBe(0);
    expect(decimaisRestantes(numeros(custo))).toEqual([]);
  });
});
