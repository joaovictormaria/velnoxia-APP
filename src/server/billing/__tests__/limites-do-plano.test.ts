import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { SoftDeleteService } from "@/server/audit/soft-delete-service";
import { criarContaDeLoja, type DadosDoCadastro } from "@/server/services/signup-service";
import { STARTER_CATALOGS } from "@/server/catalog/starter-catalogs";
import { updateProduct } from "@/server/repositories/product-repository";
import {
  cabeNoLimite,
  TETOS_DO_PLANO,
  TODOS_OS_LIMITES,
  tetoDoEstado,
  type Limite,
} from "@/lib/planos/limites";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { garantirLimite, LimiteDoPlanoError, usoDoLimite } from "../guarda-de-limite";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  OS LIMITES COMERCIAIS — 50 produtos e 10 categorias no BASIC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * LIMITE NÃO É RECURSO, e a diferença é o que este arquivo protege. O BASIC
 * TEM cardápio — ele o vende, o edita e o publica. O que ele não tem é o 51º
 * produto. Uma suíte que confundisse as duas coisas acabaria testando que o
 * BASIC não tem cardápio, que é falso.
 *
 * A fronteira testada é sempre a mesma: com 49 cabe, com 50 não cabe mais. É o
 * 51º que é recusado, nunca o 50º.
 */

const DIA = 24 * 60 * 60 * 1000;
const futuro = (dias: number) => new Date(Date.now() + dias * DIA);

async function limpar() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  if (t.length === 0) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. OS NÚMEROS — o contrato, sem banco
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("os números comerciais", () => {
  it("BASIC: 50 produtos e 10 categorias", () => {
    expect(TETOS_DO_PLANO.BASIC.MAX_PRODUTOS).toBe(50);
    expect(TETOS_DO_PLANO.BASIC.MAX_CATEGORIAS).toBe(10);
  });

  it("PREMIUM: ilimitado nos dois", () => {
    expect(TETOS_DO_PLANO.PREMIUM.MAX_PRODUTOS).toBeNull();
    expect(TETOS_DO_PLANO.PREMIUM.MAX_CATEGORIAS).toBeNull();
  });

  it("não sobrou nenhum A_DEFINIR", () => {
    for (const plano of ["BASIC", "PREMIUM"] as const) {
      for (const limite of TODOS_OS_LIMITES) {
        expect(TETOS_DO_PLANO[plano][limite], `${plano}.${limite}`).not.toBe("A_DEFINIR");
      }
    }
  });

  it("continuam sendo só estes dois limites", () => {
    expect([...TODOS_OS_LIMITES].sort()).toEqual(["MAX_CATEGORIAS", "MAX_PRODUTOS"]);
  });

  /*
   * A FRONTEIRA. Com 49 cabe o 50º; com 50 o próximo é recusado. Um `<=` no
   * lugar do `<` deslocaria a régua inteira em um, e o lojista do BASIC teria
   * 49 produtos vendidos como 50.
   */
  it("a régua: 0 e 49 cabem, 50 e 51 não", () => {
    expect(cabeNoLimite(50, 0)).toBe("CABE");
    expect(cabeNoLimite(50, 49)).toBe("CABE");
    expect(cabeNoLimite(50, 50)).toBe("ESTOUROU");
    expect(cabeNoLimite(50, 51)).toBe("ESTOUROU");

    expect(cabeNoLimite(10, 9)).toBe("CABE");
    expect(cabeNoLimite(10, 10)).toBe("ESTOUROU");
    expect(cabeNoLimite(10, 11)).toBe("ESTOUROU");
  });

  it("ilimitado nunca estoura", () => {
    expect(cabeNoLimite(null, 0)).toBe("CABE");
    expect(cabeNoLimite(null, 100_000)).toBe("CABE");
  });
});

describe("o teto que cada estado comercial lê", () => {
  const estado = (dados: Partial<LojaParaPlano>) =>
    estadoComercialDaLoja({
      status: "ACTIVE",
      trialEndsAt: null,
      paidUntil: futuro(20),
      subscriptionStatus: null,
      plan: null,
      ...dados,
    } as LojaParaPlano);

  it("BASIC lê 50 e 10", () => {
    const e = estado({ plan: "BASIC" });
    expect(tetoDoEstado(e, "MAX_PRODUTOS")).toBe(50);
    expect(tetoDoEstado(e, "MAX_CATEGORIAS")).toBe(10);
  });

  it("PREMIUM lê ilimitado", () => {
    const e = estado({ plan: "PREMIUM" });
    expect(tetoDoEstado(e, "MAX_PRODUTOS")).toBeNull();
    expect(tetoDoEstado(e, "MAX_CATEGORIAS")).toBeNull();
  });

  /*
   * TRIAL NÃO TEM TABELA PRÓPRIA. Uma loja em teste com `plan = "BASIC"`
   * gravado lê os tetos do Premium porque `efetivo` já é PREMIUM — o mesmo
   * mecanismo das features, sem um segundo contador de trial.
   */
  it("TRIAL lê exatamente o Premium, inclusive com plan = BASIC gravado", () => {
    for (const plan of [null, "BASIC"] as const) {
      const e = estado({ status: "TRIAL", trialEndsAt: futuro(7), paidUntil: null, plan });
      expect(e.emTrial, `plan=${plan}`).toBe(true);
      expect(tetoDoEstado(e, "MAX_PRODUTOS"), `plan=${plan}`).toBeNull();
      expect(tetoDoEstado(e, "MAX_CATEGORIAS"), `plan=${plan}`).toBeNull();
    }
  });

  it("LEGADO é INDEFINIDO, e não vira BASIC", () => {
    const e = estado({ paidUntil: null, plan: null });
    expect(e.legado).toBe(true);
    expect(tetoDoEstado(e, "MAX_PRODUTOS")).toBe("INDEFINIDO");
    expect(cabeNoLimite(tetoDoEstado(e, "MAX_PRODUTOS"), 9_999)).toBe("INDEFINIDO");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  2. O ENFORCEMENT — com banco
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("com o banco — a guarda de quantidade", () => {
  beforeEach(limpar);
  afterAll(limpar);

  type Perfil = { plan?: "BASIC" | "PREMIUM" | null; status?: "TRIAL" | "ACTIVE" };

  const PERFIS: Record<string, Perfil & { trial?: boolean; legado?: boolean }> = {
    BASIC: { plan: "BASIC" },
    PREMIUM: { plan: "PREMIUM" },
    TRIAL: { plan: null, status: "TRIAL", trial: true },
    TRIAL_COM_BASIC: { plan: "BASIC", status: "TRIAL", trial: true },
    LEGADO: { plan: null, legado: true },
  };

  async function loja(perfil: keyof typeof PERFIS): Promise<string> {
    const p = PERFIS[perfil];
    const criada = await prisma.store.create({
      data: {
        slug: `limites-${perfil.toLowerCase()}-${Math.random().toString(36).slice(2, 9)}`,
        name: `Loja ${perfil}`,
        status: p.status ?? "ACTIVE",
        trialEndsAt: p.trial ? futuro(7) : null,
        // A loja legada é a que não tem plano NEM validade paga: é o estado
        // que produz INDEFINIDO, e não um Premium disfarçado.
        paidUntil: p.trial || p.legado ? null : futuro(20),
        plan: p.plan ?? null,
      },
      select: { id: true },
    });
    return criada.id;
  }

  async function categoria(storeId: string, n = 0) {
    const c = await prisma.category.create({
      data: { storeId, name: `Cat ${n}`, slug: `cat-${n}-${Math.random().toString(36).slice(2, 7)}`, kind: "SIMPLE" },
      select: { id: true },
    });
    return c.id;
  }

  /** Enche a loja com N produtos, direto no banco — sem passar pela guarda. */
  async function encher(storeId: string, quantos: number): Promise<string[]> {
    const categoryId = await categoria(storeId, 0);
    const ids: string[] = [];
    for (let i = 0; i < quantos; i++) {
      const p = await prisma.product.create({
        data: {
          storeId,
          categoryId,
          name: `Produto ${i}`,
          slug: `produto-${i}`,
          description: "",
          basePrice: 10,
        },
        select: { id: true },
      });
      ids.push(p.id);
    }
    return ids;
  }

  async function encherCategorias(storeId: string, quantas: number) {
    for (let i = 0; i < quantas; i++) await categoria(storeId, i);
  }

  /** A guarda como ela é usada em produção: dentro de uma transação. */
  const perguntar = (storeId: string, limite: Limite) =>
    prisma.$transaction((tx) => garantirLimite(tx, storeId, limite));

  // ─── BASIC ───────────────────────────────────────────────────────────────

  it("BASIC com 0 produtos: cabe", async () => {
    const id = await loja("BASIC");
    await expect(perguntar(id, "MAX_PRODUTOS")).resolves.toBeUndefined();
  });

  it("BASIC com 49 produtos: o 50º ainda cabe", async () => {
    const id = await loja("BASIC");
    await encher(id, 49);
    await expect(perguntar(id, "MAX_PRODUTOS")).resolves.toBeUndefined();
  });

  it("BASIC com 50 produtos: o 51º é recusado", async () => {
    const id = await loja("BASIC");
    await encher(id, 50);
    await expect(perguntar(id, "MAX_PRODUTOS")).rejects.toBeInstanceOf(LimiteDoPlanoError);
  });

  /*
   * A MENSAGEM É DE PRODUTO, e é ela que o formulário mostra: `ProductForm` e
   * a tela de categorias fazem `onError: (e) => setError(e.message)`. Nada de
   * Prisma, SQL, nome de coluna ou stack.
   */
  it("a recusa explica o plano e o teto, sem falar de banco", async () => {
    const id = await loja("BASIC");
    await encher(id, 50);

    await expect(perguntar(id, "MAX_PRODUTOS")).rejects.toThrow(
      "Seu plano Básico permite até 50 produtos.",
    );

    const outra = await loja("BASIC");
    await encherCategorias(outra, 10);
    await expect(perguntar(outra, "MAX_CATEGORIAS")).rejects.toThrow(
      "Seu plano Básico permite até 10 categorias.",
    );

    try {
      await perguntar(id, "MAX_PRODUTOS");
    } catch (erro) {
      const e = erro as LimiteDoPlanoError;
      expect(e.name).toBe("LimiteDoPlanoError");
      expect(e.limite).toBe("MAX_PRODUTOS");
      expect(e.teto).toBe(50);
      expect(e.message).not.toMatch(/prisma|SQL|storeId|deletedAt|Invalid/i);
    }
  });

  it("BASIC com 9 categorias: a 10ª cabe; com 10, a 11ª não", async () => {
    const cabe = await loja("BASIC");
    await encherCategorias(cabe, 9);
    await expect(perguntar(cabe, "MAX_CATEGORIAS")).resolves.toBeUndefined();

    const cheia = await loja("BASIC");
    await encherCategorias(cheia, 10);
    await expect(perguntar(cheia, "MAX_CATEGORIAS")).rejects.toBeInstanceOf(LimiteDoPlanoError);
  });

  /*
   * A LOJA QUE JÁ PASSOU DO TETO POR LEGADO. Ela é recusada na PRÓXIMA criação
   * — e nada do que ela já tem é apagado, desativado ou tocado. O limite
   * governa o que entra, nunca o que já está lá.
   */
  it("BASIC com 51 produtos: recusa o próximo e não mexe em nada", async () => {
    const id = await loja("BASIC");
    await encher(id, 51);

    await expect(perguntar(id, "MAX_PRODUTOS")).rejects.toBeInstanceOf(LimiteDoPlanoError);

    const depois = await prisma.product.findMany({
      where: { storeId: id },
      select: { id: true, isActive: true, deletedAt: true },
    });
    expect(depois).toHaveLength(51);
    expect(depois.every((p) => p.isActive)).toBe(true);
    expect(depois.every((p) => p.deletedAt === null)).toBe(true);
  });

  // ─── PREMIUM, TRIAL, LEGADO ──────────────────────────────────────────────

  for (const perfil of ["PREMIUM", "TRIAL", "TRIAL_COM_BASIC", "LEGADO"] as const) {
    it(`${perfil} com 60 produtos e 12 categorias: nunca é recusado`, async () => {
      const id = await loja(perfil);
      await encher(id, 60);
      await encherCategorias(id, 12);

      await expect(perguntar(id, "MAX_PRODUTOS")).resolves.toBeUndefined();
      await expect(perguntar(id, "MAX_CATEGORIAS")).resolves.toBeUndefined();
    });
  }

  it("a loja legada segue sem classificação depois de passar", async () => {
    const id = await loja("LEGADO");
    await encher(id, 60);
    await perguntar(id, "MAX_PRODUTOS");

    const depois = await prisma.store.findUniqueOrThrow({
      where: { id },
      select: { plan: true },
    });
    expect(depois.plan).toBeNull();
  });

  // ─── EDIÇÃO, EXCLUSÃO, RESTAURAÇÃO ───────────────────────────────────────

  /*
   * EDITAR NÃO CONSOME COTA. A loja está no teto e o dono ainda precisa poder
   * arrumar preço, foto e nome do que já vendeu — travar isso seria congelar
   * um cardápio inteiro por causa de uma cota de CRIAÇÃO.
   */
  it("editar um produto com a loja no teto continua funcionando", async () => {
    const id = await loja("BASIC");
    const ids = await encher(id, 50);
    const alvo = await prisma.product.findUniqueOrThrow({ where: { id: ids[0] } });

    const atualizado = await updateProduct(id, ids[0], {
      categoryId: alvo.categoryId,
      name: "Nome novo",
      slug: alvo.slug,
      description: "",
      basePrice: 99,
      isActive: true,
      sizes: [],
    } as never);

    expect(atualizado.name).toBe("Nome novo");
    expect(await prisma.product.count({ where: { storeId: id } })).toBe(50);
  });

  it("excluir libera vaga", async () => {
    const id = await loja("BASIC");
    const ids = await encher(id, 50);
    await expect(perguntar(id, "MAX_PRODUTOS")).rejects.toBeInstanceOf(LimiteDoPlanoError);

    // `deleteProductFn` apaga de verdade — é o caminho vivo hoje.
    await prisma.product.delete({ where: { id: ids[0] } });
    await expect(perguntar(id, "MAX_PRODUTOS")).resolves.toBeUndefined();
  });

  /*
   * A CONTAGEM SEGUE `deletedAt`. Hoje nada preenche a coluna — a exclusão
   * viva é física —, mas se o soft delete for ligado, a vaga liberada e a
   * restauração precisam falar a mesma língua que este teste.
   */
  it("um produto marcado como excluído não ocupa vaga", async () => {
    const id = await loja("BASIC");
    const ids = await encher(id, 50);

    await prisma.product.update({
      where: { id: ids[0] },
      data: { deletedAt: new Date() },
    });

    expect((await usoDoLimite(id, "MAX_PRODUTOS")).uso).toBe(49);
    await expect(perguntar(id, "MAX_PRODUTOS")).resolves.toBeUndefined();
  });

  it("restaurar respeita o teto", async () => {
    const id = await loja("BASIC");
    const ids = await encher(id, 51);
    await prisma.product.update({
      where: { id: ids[0] },
      data: { deletedAt: new Date(), deletedBy: "admin" },
    });

    // 50 ativos + 1 excluído: restaurar faria 51.
    await expect(SoftDeleteService.restoreProduct(id, ids[0], "admin")).rejects.toBeInstanceOf(
      LimiteDoPlanoError,
    );
    const aindaExcluido = await prisma.product.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(aindaExcluido.deletedAt).not.toBeNull();
  });

  it("restaurar cabendo no teto funciona", async () => {
    const id = await loja("BASIC");
    const ids = await encher(id, 50);
    await prisma.product.update({
      where: { id: ids[0] },
      data: { deletedAt: new Date(), deletedBy: "admin" },
    });

    await SoftDeleteService.restoreProduct(id, ids[0], "admin");
    const restaurado = await prisma.product.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(restaurado.deletedAt).toBeNull();
  });

  // ─── LEITURA PARA TELA ───────────────────────────────────────────────────

  it("usoDoLimite responde quanto foi usado e quanto cabe", async () => {
    const basic = await loja("BASIC");
    await encher(basic, 12);
    expect(await usoDoLimite(basic, "MAX_PRODUTOS")).toEqual({
      uso: 12,
      teto: 50,
      veredito: "CABE",
    });

    const premium = await loja("PREMIUM");
    await encher(premium, 3);
    expect(await usoDoLimite(premium, "MAX_PRODUTOS")).toEqual({
      uso: 3,
      teto: null,
      veredito: "CABE",
    });
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  3. CORRIDA — duas criações ao mesmo tempo
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Contar e depois inserir são dois momentos. Sem trava, duas requisições
 * simultâneas leem 49, ambas concluem que cabe, e a loja termina com 51 — um
 * limite que se burla com dois cliques.
 *
 * A trava é `pg_advisory_xact_lock`, presa à transação: a segunda requisição
 * espera a primeira COMMITAR e só então conta, já vendo 50.
 */
describe("com o banco — duas criações simultâneas", () => {
  beforeEach(limpar);
  afterAll(limpar);

  async function lojaCheia(quantos: number) {
    const store = await prisma.store.create({
      data: {
        slug: `corrida-${Math.random().toString(36).slice(2, 9)}`,
        name: "Loja da corrida",
        status: "ACTIVE",
        paidUntil: futuro(20),
        plan: "BASIC",
      },
      select: { id: true },
    });
    const cat = await prisma.category.create({
      data: { storeId: store.id, name: "Cat", slug: "cat", kind: "SIMPLE" },
      select: { id: true },
    });
    for (let i = 0; i < quantos; i++) {
      await prisma.product.create({
        data: {
          storeId: store.id,
          categoryId: cat.id,
          name: `P${i}`,
          slug: `p-${i}`,
          description: "",
          basePrice: 10,
        },
      });
    }
    return { storeId: store.id, categoryId: cat.id };
  }

  /** Exatamente o que `saveProductFn` faz: guarda e criação, uma transação. */
  const criar = (storeId: string, categoryId: string, sufixo: string) =>
    prisma.$transaction(async (tx) => {
      await garantirLimite(tx, storeId, "MAX_PRODUTOS");
      await tx.product.create({
        data: {
          storeId,
          categoryId,
          name: `Simultâneo ${sufixo}`,
          slug: `simultaneo-${sufixo}`,
          description: "",
          basePrice: 10,
        },
      });
    });

  it("com 49 produtos e duas criações ao mesmo tempo, só uma entra", async () => {
    const { storeId, categoryId } = await lojaCheia(49);

    const resultados = await Promise.allSettled([
      criar(storeId, categoryId, "a"),
      criar(storeId, categoryId, "b"),
    ]);

    const ok = resultados.filter((r) => r.status === "fulfilled");
    const recusadas = resultados.filter((r) => r.status === "rejected");

    expect(ok).toHaveLength(1);
    expect(recusadas).toHaveLength(1);
    expect((recusadas[0] as PromiseRejectedResult).reason).toBeInstanceOf(LimiteDoPlanoError);

    // O que importa de verdade: o banco terminou EXATAMENTE no teto.
    expect(await prisma.product.count({ where: { storeId } })).toBe(50);
  });

  it("cinco criações ao mesmo tempo com 48 produtos: entram duas, e só duas", async () => {
    const { storeId, categoryId } = await lojaCheia(48);

    const resultados = await Promise.allSettled(
      ["a", "b", "c", "d", "e"].map((s) => criar(storeId, categoryId, s)),
    );

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await prisma.product.count({ where: { storeId } })).toBe(50);
  });

  it("PREMIUM não é serializado a ponto de recusar nada", async () => {
    const { storeId, categoryId } = await lojaCheia(49);
    await prisma.store.update({ where: { id: storeId }, data: { plan: "PREMIUM" } });

    const resultados = await Promise.allSettled(
      ["a", "b", "c"].map((s) => criar(storeId, categoryId, s)),
    );

    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await prisma.product.count({ where: { storeId } })).toBe(52);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  4. CADASTRO INICIAL — o limite não pode quebrar o signup
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("com o banco — o cardápio inicial do cadastro", () => {
  beforeEach(limpar);
  afterAll(limpar);

  const dados = (): DadosDoCadastro => ({
    storeName: "Lanchonete de Teste",
    businessType: "pizzaria",
    adminName: "Dono de Teste",
    email: `dono${Math.random().toString(36).slice(2)}@teste.com`,
    password: "senha-de-teste",
    whatsappNumber: "11999999999",
    document: "11144477735",
  });

  /*
   * UMA LOJA NOVA NASCE EM TRIAL, e TRIAL é Premium — o cardápio inicial não
   * tem teto para estourar. Este teste roda o cadastro DE VERDADE.
   *
   * O CADASTRO NÃO CRIA PRODUTO NENHUM, e isso não é falha deste teste: o
   * `getStarterCatalog` passa por `semCardapioInicial`, que esvazia produtos,
   * extras e promoções de propósito. O que nasce são as CATEGORIAS do ramo,
   * com os tamanhos delas. Logo o limite de produtos nem chega a ser
   * consultado no cadastro.
   */
  it("o cadastro cria a loja e as categorias iniciais sem esbarrar em limite", async () => {
    const r = await criarContaDeLoja(dados());
    expect(r.ok).toBe(true);

    const loja = await prisma.store.findFirstOrThrow({
      select: { id: true, plan: true, status: true },
    });

    expect(loja.status).toBe("TRIAL");
    expect(loja.plan).toBeNull();

    const categorias = await prisma.category.count({ where: { storeId: loja.id } });
    expect(categorias).toBeGreaterThan(0);
    expect(await prisma.product.count({ where: { storeId: loja.id } })).toBe(0);
  });

  /*
   * A REDE DE SEGURANÇA PARA O FUTURO: hoje o cadastro nasce em TRIAL e nada
   * o limita, mas um cardápio inicial com onze categorias estouraria o teto
   * do BASIC no dia em que uma loja nascesse já classificada. Nenhum ramo
   * chega perto — e é isso que este teste segura.
   */
  it("nenhum cardápio inicial passa do teto de categorias do BASIC", () => {
    const teto = TETOS_DO_PLANO.BASIC.MAX_CATEGORIAS as number;
    for (const [ramo, catalogo] of Object.entries(STARTER_CATALOGS)) {
      expect(catalogo.categories.length, ramo).toBeLessThanOrEqual(teto);
    }
  });

  it("a loja recém-criada lê teto ilimitado nos dois limites", async () => {
    await criarContaDeLoja(dados());
    const loja = await prisma.store.findFirstOrThrow({ select: { id: true } });

    for (const limite of TODOS_OS_LIMITES) {
      const { teto, veredito } = await usoDoLimite(loja.id, limite);
      expect(teto, limite).toBeNull();
      expect(veredito, limite).toBe("CABE");
    }

    await expect(
      prisma.$transaction((tx) => garantirLimite(tx, loja.id, "MAX_PRODUTOS")),
    ).resolves.toBeUndefined();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  5. CONTRATO DO CÓDIGO — a fonte, lida
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("contrato do enforcement", () => {
  const raiz = resolve(__dirname, "../..");
  const fonte = (caminho: string) => readFileSync(resolve(raiz, caminho), "utf8");

  /*
   * ⚠️ CÓDIGO SEM OS COMENTÁRIOS — e este projeto obriga a isso.
   *
   * Os comentários daqui CITAM o que o código não faz: "não há
   * `if (plano === "BASIC")`", "`AuditService.log` NÃO é chamado aqui". Uma
   * asserção sobre o texto cru reprova exatamente a linha que documenta a
   * regra, e a "correção" seria apagar a explicação. Quem procura ausência de
   * padrão procura aqui dentro.
   */
  const semComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  const produtos = fonte("functions/products.fn.ts");
  const categorias = fonte("functions/categories.fn.ts");
  const guarda = fonte("billing/guarda-de-limite.ts");

  function bloco(codigo: string, nome: string) {
    const i = codigo.indexOf(`export const ${nome} = createServerFn`);
    expect(i, nome).toBeGreaterThan(-1);
    const f = codigo.indexOf("export const ", i + 10);
    return f < 0 ? codigo.slice(i) : codigo.slice(i, f);
  }

  it("as três criações passam pela guarda", () => {
    expect(bloco(produtos, "saveProductFn")).toContain('garantirLimite(tx, storeId, "MAX_PRODUTOS")');
    expect(bloco(produtos, "adminCreateCategoryFn")).toContain(
      'garantirLimite(tx, storeId, "MAX_CATEGORIAS")',
    );
    expect(bloco(categorias, "saveCategoryFn")).toContain(
      'garantirLimite(tx, storeId, "MAX_CATEGORIAS")',
    );
  });

  /*
   * A GUARDA MORA DENTRO DA TRANSAÇÃO. Chamá-la com `prisma` solto daria uma
   * trava que se solta no instante seguinte — a aparência da proteção. O tipo
   * do parâmetro já recusa, e esta asserção documenta o porquê.
   */
  it("a guarda recebe a transação, nunca o cliente solto", () => {
    for (const [nome, codigo] of [
      ["products.fn.ts", produtos],
      ["categories.fn.ts", categorias],
    ] as const) {
      expect(semComentarios(codigo), nome).not.toMatch(/garantirLimite\(\s*prisma\b/);
    }
    expect(guarda).toContain("Prisma.TransactionClient");
    expect(guarda).toContain("pg_advisory_xact_lock");
  });

  it("a exclusão e a edição não chamam a guarda", () => {
    for (const nome of ["deleteProductFn", "setProductActiveFn", "adminDeleteCategoryFn"]) {
      expect(semComentarios(bloco(produtos, nome)), nome).not.toContain("garantirLimite");
    }
    expect(semComentarios(bloco(categorias, "deleteCategoryFn"))).not.toContain("garantirLimite");
  });

  /*
   * O CADASTRO NÃO GANHOU GUARDA. Ele nasce em TRIAL, então não haveria o que
   * recusar — e uma guarda ali seria uma forma de o cadastro inteiro falhar
   * por um número que não se aplica a ele.
   */
  it("o signup segue sem guarda de limite", () => {
    expect(semComentarios(fonte("services/signup-service.ts"))).not.toContain("garantirLimite");
  });

  /*
   * NENHUM NÚMERO MÁGICO. `50` e `10` existem em `limites.ts` e em lugar
   * nenhum mais — nem no servidor, nem na tela, nem na mensagem.
   */
  it("os números só existem no catálogo de limites", () => {
    const suspeitos = [
      "functions/products.fn.ts",
      "functions/categories.fn.ts",
      "billing/guarda-de-limite.ts",
      "repositories/product-repository.ts",
      "repositories/category-repository.ts",
      "audit/soft-delete-service.ts",
    ];
    for (const arquivo of suspeitos) {
      const codigo = semComentarios(fonte(arquivo));
      expect(codigo, arquivo).not.toMatch(/\b(count|uso|total)\w*\s*[<>=]+\s*(50|10)\b/);
      expect(codigo, arquivo).not.toMatch(/MAX_PRODUTOS\s*[:=]\s*\d/);
      expect(codigo, arquivo).not.toMatch(/MAX_CATEGORIAS\s*[:=]\s*\d/);
    }
  });

  it("nenhum lugar do enforcement compara plano na mão", () => {
    const arquivos = readdirSync(resolve(raiz, "functions")).filter((f) => f.endsWith(".fn.ts"));
    for (const arquivo of [...arquivos.map((a) => `functions/${a}`), "billing/guarda-de-limite.ts"]) {
      expect(semComentarios(fonte(arquivo)), arquivo).not.toMatch(
        /plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/,
      );
    }
  });

  /*
   * O CARDÁPIO NÃO VIROU MÓDULO PAGO. Um `exigirRecurso("CARDAPIO")` numa
   * destas funções tiraria do BASIC o cardápio inteiro — que é exatamente o
   * que um LIMITE existe para não fazer.
   */
  it("cadastrar produto e categoria continua liberado no BASIC", () => {
    for (const codigo of [produtos, categorias]) {
      expect(codigo).not.toContain('exigirRecurso("CARDAPIO")');
      expect(codigo).not.toContain('garantirRecurso(admin, "CARDAPIO")');
    }
  });
});
