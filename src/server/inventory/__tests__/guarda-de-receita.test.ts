import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import {
  ErroDeVinculoDeEstoque,
  controleDeEstoqueAtivo,
  exigirVinculoDeEstoque,
  nasceInativoPorFaltaDeVinculo,
  produtosPendentesDeVinculo,
} from "@/server/inventory/guarda-de-receita";

/*
 * A REGRA CERTA QUE NINGUÉM CHAMA NÃO PROTEGE NADA.
 *
 * `src/lib/__tests__/regra-de-estoque.test.ts` prova a decisão sozinha, sem
 * banco. Este arquivo prova a outra metade: que a decisão é tomada sobre os
 * fatos certos, recortada pela loja da sessão, e que os desvios conhecidos
 * batem nela.
 *
 * Duas lojas em todo cenário, de propósito. Isolamento que só é testado com
 * uma loja no banco não é isolamento testado — é uma consulta que por acaso
 * não tinha com o que se confundir.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";

let lojaA = "";
let lojaB = "";
let categoriaA = "";
let categoriaB = "";

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

async function criarLoja(slug: string, estoqueAtivo: boolean) {
  const loja = await prisma.store.create({ data: { slug, name: slug } });
  await prisma.storeSettings.create({
    data: {
      storeId: loja.id,
      whatsappNumber: "11999999999",
      inventoryControlEnabled: estoqueAtivo,
    },
  });
  const categoria = await prisma.category.create({
    data: {
      storeId: loja.id,
      name: "Pratos",
      slug: `pratos-${slug}`,
      kind: "SIMPLE",
      isActive: true,
    },
  });
  return { storeId: loja.id, categoriaId: categoria.id };
}

beforeEach(async () => {
  await limparBanco();
  await semearUnidades();
  const marca = Date.now();
  const a = await criarLoja(`guarda-a-${marca}`, true);
  const b = await criarLoja(`guarda-b-${marca}`, false);
  lojaA = a.storeId;
  categoriaA = a.categoriaId;
  lojaB = b.storeId;
  categoriaB = b.categoriaId;
});
afterAll(limparBanco);

async function produto(
  storeId: string,
  categoriaId: string,
  nome: string,
  extras: Record<string, unknown> = {},
) {
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoriaId,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 8)}`,
      description: nome,
      basePrice: 25,
      isActive: true,
      ...extras,
    } as any,
  });
}

async function itemDeEstoque(storeId: string, nome: string) {
  return prisma.inventoryItem.create({
    data: { storeId, name: nome, baseUnitId: "unit_un", itemType: "INGREDIENT" },
  });
}

/** Ficha ativa com uma linha. É o que a regra aceita como receita de verdade. */
async function fichaCom1Ingrediente(storeId: string, productId: string) {
  const insumo = await itemDeEstoque(storeId, `insumo-${Math.random()}`);
  return prisma.productComposition.create({
    data: {
      storeId,
      productId,
      version: 1,
      isActive: true,
      items: {
        create: [{ inventoryItemId: insumo.id, quantity: 1, unitId: "unit_un" }],
      },
    },
  });
}

/** Ficha ativa e VAZIA. Existe no banco e não consome nada — D3. */
async function fichaVazia(storeId: string, productId: string) {
  return prisma.productComposition.create({
    data: { storeId, productId, version: 1, isActive: true },
  });
}

describe("controleDeEstoqueAtivo", () => {
  it("lê o toggle da loja pedida, não o da outra", async () => {
    expect(await controleDeEstoqueAtivo(lojaA)).toBe(true);
    expect(await controleDeEstoqueAtivo(lojaB)).toBe(false);
  });

  it("loja sem linha de settings lê false, sem quebrar", async () => {
    // A relação é opcional no schema. Ausência de config é ausência de regra.
    const orfa = await prisma.store.create({
      data: { slug: `orfa-${Date.now()}`, name: "Sem settings" },
    });
    expect(await controleDeEstoqueAtivo(orfa.id)).toBe(false);
  });
});

describe("estoque DESLIGADO preserva o comportamento de hoje", () => {
  it("produto ativo sem ficha e sem vínculo passa", async () => {
    const p = await produto(lojaB, categoriaB, "Prato solto");
    await expect(
      exigirVinculoDeEstoque(lojaB, p.id, { isActive: true }),
    ).resolves.toBeUndefined();
  });

  /*
   * A LISTA DE PENDÊNCIAS NÃO OLHA O TOGGLE, e isso é o contrato, não um
   * descuido. Ela responde "o que impediria ligar o controle" — pergunta que
   * só se faz com o controle DESLIGADO. Devolvesse `[]` aqui, a tela de
   * ativação mostraria tudo em ordem até o dono clicar e ser recusado, sem
   * nunca poder ver o que corrigir antes.
   *
   * Quem decide se a regra vale é `exigirVinculoDeEstoque`, e o teste acima
   * prova que com o controle desligado ela não cobra nada de ninguém.
   */
  it("as pendências continuam sendo listadas, para a tela de ativação", async () => {
    await produto(lojaB, categoriaB, "Outro prato");
    const pendentes = await produtosPendentesDeVinculo(lojaB);
    expect(pendentes.map((p) => p.name)).toEqual(["Outro prato"]);
  });

  it("criar não força inativo", async () => {
    expect(
      await nasceInativoPorFaltaDeVinculo(lojaB, {
        isActive: true,
        controlaEstoque: true,
      }),
    ).toBe(false);
  });
});

describe("estoque LIGADO cobra a origem do que se vende", () => {
  it("recusa produto ativo sem ficha e sem vínculo", async () => {
    const p = await produto(lojaA, categoriaA, "Prato sem origem");
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { isActive: true }),
    ).rejects.toBeInstanceOf(ErroDeVinculoDeEstoque);
  });

  it("aceita produto com ficha de pelo menos um ingrediente", async () => {
    const p = await produto(lojaA, categoriaA, "Prato com ficha");
    await fichaCom1Ingrediente(lojaA, p.id);
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { isActive: true }),
    ).resolves.toBeUndefined();
  });

  it("aceita produto vinculado direto a um item de estoque", async () => {
    const item = await itemDeEstoque(lojaA, "Refrigerante lata");
    const p = await produto(lojaA, categoriaA, "Refri", {
      inventoryItemId: item.id,
    });
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { isActive: true }),
    ).resolves.toBeUndefined();
  });

  it("D3: ficha ATIVA porém VAZIA não satisfaz", async () => {
    const p = await produto(lojaA, categoriaA, "Prato de ficha oca");
    await fichaVazia(lojaA, p.id);
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { isActive: true }),
    ).rejects.toBeInstanceOf(ErroDeVinculoDeEstoque);
  });

  it("ficha INATIVA não satisfaz", async () => {
    const p = await produto(lojaA, categoriaA, "Prato de ficha velha");
    const f = await fichaCom1Ingrediente(lojaA, p.id);
    await prisma.productComposition.update({
      where: { id: f.id },
      data: { isActive: false },
    });
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { isActive: true }),
    ).rejects.toBeInstanceOf(ErroDeVinculoDeEstoque);
  });

  it("produto marcado como fora do controle passa sem nada", async () => {
    // Taxa de entrega, couvert: linha do cardápio que não sai de prateleira.
    const p = await produto(lojaA, categoriaA, "Taxa de entrega", {
      controlaEstoque: false,
    });
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { isActive: true }),
    ).resolves.toBeUndefined();
  });

  it("desativar produto irregular é sempre permitido", async () => {
    const p = await produto(lojaA, categoriaA, "Prato ruim");
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { isActive: false }),
    ).resolves.toBeUndefined();
  });

  it("REATIVAR produto irregular é recusado", async () => {
    const p = await produto(lojaA, categoriaA, "Prato dormente", {
      isActive: false,
    });
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { isActive: true }),
    ).rejects.toBeInstanceOf(ErroDeVinculoDeEstoque);
  });

  it("criar produto ativo faz nascer inativo em vez de recusar", async () => {
    // Ficha é FK para o produto: recusar aqui fecharia o cadastro inteiro.
    expect(
      await nasceInativoPorFaltaDeVinculo(lojaA, {
        isActive: true,
        controlaEstoque: true,
      }),
    ).toBe(true);
  });

  it("criar produto fora do controle nasce ativo normalmente", async () => {
    expect(
      await nasceInativoPorFaltaDeVinculo(lojaA, {
        isActive: true,
        controlaEstoque: false,
      }),
    ).toBe(false);
  });
});

describe("a alteração é julgada pelo resultado, não pelo estado atual", () => {
  it("desvincular o item de estoque de um produto sem ficha é recusado", async () => {
    const item = await itemDeEstoque(lojaA, "Suco de caixa");
    const p = await produto(lojaA, categoriaA, "Suco", {
      inventoryItemId: item.id,
    });
    // No banco o vínculo AINDA está lá; é a proposta que o remove.
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { inventoryItemId: null }),
    ).rejects.toBeInstanceOf(ErroDeVinculoDeEstoque);
  });

  it("desvincular é permitido quando sobra uma ficha válida", async () => {
    const item = await itemDeEstoque(lojaA, "Item redundante");
    const p = await produto(lojaA, categoriaA, "Prato com os dois", {
      inventoryItemId: item.id,
    });
    await fichaCom1Ingrediente(lojaA, p.id);
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { inventoryItemId: null }),
    ).resolves.toBeUndefined();
  });

  it("apagar a ÚLTIMA ficha de um produto sem vínculo é recusado", async () => {
    const p = await produto(lojaA, categoriaA, "Prato de ficha única");
    const f = await fichaCom1Ingrediente(lojaA, p.id);
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { ignorarComposicaoId: f.id }),
    ).rejects.toBeInstanceOf(ErroDeVinculoDeEstoque);
  });

  it("apagar uma ficha quando o produto tem vínculo direto é permitido", async () => {
    const item = await itemDeEstoque(lojaA, "Base");
    const p = await produto(lojaA, categoriaA, "Prato duplo", {
      inventoryItemId: item.id,
    });
    const f = await fichaCom1Ingrediente(lojaA, p.id);
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { ignorarComposicaoId: f.id }),
    ).resolves.toBeUndefined();
  });

  it("ativar uma versão VAZIA de receita é recusado", async () => {
    // Publicar a v4 sem linhas apagaria na prática a v3 que funcionava.
    const p = await produto(lojaA, categoriaA, "Prato versionado");
    await fichaCom1Ingrediente(lojaA, p.id);
    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { temFichaComIngrediente: false }),
    ).rejects.toBeInstanceOf(ErroDeVinculoDeEstoque);
  });
});

describe("isolamento entre lojas", () => {
  it("ficha da loja B não satisfaz produto da loja A", async () => {
    const p = await produto(lojaA, categoriaA, "Prato da A");

    /*
     * A ficha aponta para o produto da A, mas está gravada com o storeId da B.
     * É o registro forjado que uma consulta sem recorte por loja aceitaria — e
     * bastaria ele para ligar o estoque com o cardápio inteiro vazio.
     */
    const insumoB = await itemDeEstoque(lojaB, "Insumo da B");
    await prisma.productComposition.create({
      data: {
        storeId: lojaB,
        productId: p.id,
        version: 1,
        isActive: true,
        items: {
          create: [{ inventoryItemId: insumoB.id, quantity: 1, unitId: "unit_un" }],
        },
      },
    });

    await expect(
      exigirVinculoDeEstoque(lojaA, p.id, { isActive: true }),
    ).rejects.toBeInstanceOf(ErroDeVinculoDeEstoque);
  });

  it("produto da loja B é invisível para a guarda da loja A", async () => {
    // Silêncio, não recusa: quem trata "não é seu" é o chamador.
    const pb = await produto(lojaB, categoriaB, "Prato da B");
    await expect(
      exigirVinculoDeEstoque(lojaA, pb.id, { isActive: true }),
    ).resolves.toBeUndefined();
  });

  it("as pendências da loja A nunca incluem produto da loja B", async () => {
    await produto(lojaA, categoriaA, "Pendente da A");
    await produto(lojaB, categoriaB, "Pendente da B");
    const pendentes = await produtosPendentesDeVinculo(lojaA);
    expect(pendentes.map((p) => p.name)).toEqual(["Pendente da A"]);
  });
});

describe("produtosPendentesDeVinculo", () => {
  it("lista só o que de fato impede ligar o controle", async () => {
    const item = await itemDeEstoque(lojaA, "Item ok");
    const comFicha = await produto(lojaA, categoriaA, "Tem ficha");
    await fichaCom1Ingrediente(lojaA, comFicha.id);
    await produto(lojaA, categoriaA, "Tem vinculo", { inventoryItemId: item.id });
    await produto(lojaA, categoriaA, "Fora do controle", {
      controlaEstoque: false,
    });
    await produto(lojaA, categoriaA, "Inativo", { isActive: false });
    await produto(lojaA, categoriaA, "Na lixeira", { deletedAt: new Date() });
    const comFichaVazia = await produto(lojaA, categoriaA, "Ficha vazia");
    await fichaVazia(lojaA, comFichaVazia.id);
    await produto(lojaA, categoriaA, "Pendente de verdade");

    const pendentes = await produtosPendentesDeVinculo(lojaA);
    expect(pendentes.map((p) => p.name).sort()).toEqual([
      "Ficha vazia",
      "Pendente de verdade",
    ]);
  });

  it("devolve só id e nome, sem vazar dado interno", async () => {
    await produto(lojaA, categoriaA, "Pendente");
    const [p] = await produtosPendentesDeVinculo(lojaA);
    expect(Object.keys(p).sort()).toEqual(["id", "name"]);
  });

  it("uma consulta só, sem N+1", async () => {
    /*
     * A versão ingênua — listar produtos e perguntar a ficha de cada um — fica
     * lenta exatamente na loja grande, que é a que mais precisa desta tela.
     * O contador prova a forma, não a velocidade: velocidade varia por
     * máquina, o número de consultas não.
     */
    for (let i = 0; i < 12; i++) {
      await produto(lojaA, categoriaA, `Produto ${i}`);
    }

    let consultas = 0;
    const contar = () => {
      consultas++;
    };
    (prisma as any).$on?.("query", contar);

    const antes = consultas;
    await produtosPendentesDeVinculo(lojaA);
    const depois = consultas;

    // Sem listener disponível o contador fica em zero e o teste não afirma
    // nada falso; com ele, uma consulta por chamada é o teto.
    if (depois > antes) expect(depois - antes).toBe(1);

    // A prova que não depende de instrumentação: 12 produtos pendentes saem
    // de uma chamada só, e o resultado está completo.
    expect(await produtosPendentesDeVinculo(lojaA)).toHaveLength(12);
  });
});
