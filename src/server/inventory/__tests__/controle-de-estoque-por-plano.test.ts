import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import {
  controleDeEstoqueAtivo,
  estoqueDisponivelNoPlano,
  exigirConfiguracaoDeEstoque,
} from "@/server/inventory/guarda-de-receita";

/*
 * O PLANO DESLIGA O CONTROLE DE ESTOQUE — e é isso que destrava o cadastro
 * BASIC.
 *
 * A flag `inventoryControlEnabled` sempre respondeu "o dono QUER controlar
 * estoque?". Ela nunca respondeu "o plano dele PERMITE?", e usá-la como se
 * respondesse era o nó: uma loja BASIC nascia com a flag ligada, e a partir daí
 * cadastrar um refrigerante exigia tipo de controle, vínculo de estoque e ficha
 * técnica — tudo Premium.
 *
 * `controleDeEstoqueAtivo` passou a exigir as duas respostas. O teste mais
 * importante deste arquivo é o do LEGADO: uma loja com `plan = null` e a flag
 * ligada tem de continuar EXATAMENTE como estava, sem nada gravado.
 */

const DIA = 24 * 60 * 60 * 1000;
const futuro = (dias: number) => new Date(Date.now() + dias * DIA);
const passado = (dias: number) => new Date(Date.now() - dias * DIA);

async function limpar() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(limpar);
afterAll(limpar);

/** Cria uma loja com o plano e a preferência de estoque que o caso pede. */
async function loja(dados: {
  plan?: "BASIC" | "PREMIUM" | null;
  status?: "TRIAL" | "ACTIVE";
  trialEndsAt?: Date | null;
  paidUntil?: Date | null;
  controle: boolean;
}): Promise<string> {
  const criada = await prisma.store.create({
    data: {
      slug: `plano-estoque-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "Loja de teste",
      status: dados.status ?? "ACTIVE",
      trialEndsAt: dados.trialEndsAt ?? null,
      paidUntil: dados.paidUntil ?? null,
      plan: dados.plan ?? null,
      settings: {
        create: {
          storeName: "Loja de teste",
          whatsappNumber: "11999999999",
          inventoryControlEnabled: dados.controle,
        },
      },
    },
    select: { id: true },
  });
  return criada.id;
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  BASIC — a flag manda, porque o plano agora inclui o estoque
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este arquivo nasceu provando o OPOSTO: até 31/08/2026 o BASIC não tinha
 * ESTOQUE, e o plano desligava o controle mesmo com a flag ligada. Com o
 * recurso movido para o plano básico, a assimetria acabou e sobrou a regra
 * simples: quem decide é o dono, pela flag.
 *
 * DISPONÍVEL NO PLANO ≠ ATIVADO PELA LOJA continua valendo, e continua sendo
 * o motivo de as duas funções existirem separadas — o que mudou é que a
 * primeira resposta passou a ser "sim" para todo mundo que não é legado.
 */
describe("BASIC — a flag manda, porque o plano inclui o estoque", () => {
  it("plano inclui e flag ligada → controle ativo", async () => {
    const id = await loja({ plan: "BASIC", paidUntil: futuro(20), controle: true });
    expect(await estoqueDisponivelNoPlano(id)).toBe(true);
    expect(await controleDeEstoqueAtivo(id)).toBe(true);
  });

  it("plano inclui e flag desligada → controle inativo", async () => {
    const id = await loja({ plan: "BASIC", paidUntil: futuro(20), controle: false });
    expect(await estoqueDisponivelNoPlano(id)).toBe(true);
    expect(await controleDeEstoqueAtivo(id)).toBe(false);
  });

  /** Um produto qualquer da loja, para a guarda julgar. */
  async function produtoDe(
    storeId: string,
    tipoDeControle: "NAO_CONTROLA" | null,
    sufixo: string,
  ) {
    const categoria = await prisma.category.create({
      data: { storeId, name: "Bebidas", slug: `bebidas-${sufixo}`, kind: "SIMPLE" },
    });
    const produto = await prisma.product.create({
      data: {
        storeId,
        categoryId: categoria.id,
        name: "Refrigerante",
        slug: `refrigerante-${sufixo}`,
        description: "",
        basePrice: 8,
        controlaEstoque: true,
        tipoDeControle,
        isActive: true,
      },
      select: { id: true },
    });
    return produto.id;
  }

  /*
   * O PRODUTO DO DIA A DIA PASSA. "Não controlar estoque" é a escolha que o
   * BASIC sempre pôde fazer, e ela continua não pedindo ficha nem vínculo.
   */
  it("a guarda aceita o produto marcado como fora do controle", async () => {
    const id = await loja({ plan: "BASIC", paidUntil: futuro(20), controle: true });
    const produtoId = await produtoDe(id, "NAO_CONTROLA", "livre");

    await expect(exigirConfiguracaoDeEstoque(id, produtoId, {})).resolves.toBeUndefined();
  });

  /*
   * ⚠️ A MUDANÇA DE COMPORTAMENTO DESTA FASE, escrita de propósito.
   *
   * Com o controle LIGADO e o estoque agora disponível, um produto que
   * controla estoque e não diz DE ONDE tira o que vende volta a ser recusado
   * no BASIC — como já era no Premium. Não é regra de plano: é a mesma
   * cobrança de dado incompleto, e a prova é que a loja Premium é recusada
   * exatamente igual.
   *
   * Ninguém fica preso: `saveProductFn` exige o tipo na criação, e o BASIC
   * tem duas saídas — NAO_CONTROLA ou REVENDA com item vinculado. O que ele
   * não tem é PRODUCAO, que é Premium.
   */
  it("produto que controla estoque sem origem é recusado — nos dois planos", async () => {
    const basica = await loja({ plan: "BASIC", paidUntil: futuro(20), controle: true });
    const doBasic = await produtoDe(basica, null, "basic");
    await expect(exigirConfiguracaoDeEstoque(basica, doBasic, {})).rejects.toThrow();

    const premium = await loja({ plan: "PREMIUM", paidUntil: futuro(20), controle: true });
    const doPremium = await produtoDe(premium, null, "premium");
    await expect(exigirConfiguracaoDeEstoque(premium, doPremium, {})).rejects.toThrow();
  });

  it("a flag no banco NÃO foi alterada — nada é gravado", async () => {
    const id = await loja({ plan: "BASIC", paidUntil: futuro(20), controle: true });
    await controleDeEstoqueAtivo(id);
    // Nenhum backfill, nenhuma migração de dado: só leitura.
    const s = await prisma.storeSettings.findUniqueOrThrow({
      where: { storeId: id },
      select: { inventoryControlEnabled: true },
    });
    expect(s.inventoryControlEnabled).toBe(true);
  });
});

describe("PREMIUM — a flag volta a mandar sozinha", () => {
  it("plano inclui e flag ligada → controle ativo", async () => {
    const id = await loja({ plan: "PREMIUM", paidUntil: futuro(20), controle: true });
    expect(await estoqueDisponivelNoPlano(id)).toBe(true);
    expect(await controleDeEstoqueAtivo(id)).toBe(true);
  });

  /*
   * O caso que a distinção entre `disponivel` e `ativo` existe para preservar:
   * a loja Premium que simplesmente desligou o controle continua com o módulo
   * disponível — a seção do formulário segue aparecendo, convidando.
   */
  it("plano inclui e flag desligada → disponível, mas inativo", async () => {
    const id = await loja({ plan: "PREMIUM", paidUntil: futuro(20), controle: false });
    expect(await estoqueDisponivelNoPlano(id)).toBe(true);
    expect(await controleDeEstoqueAtivo(id)).toBe(false);
  });
});

describe("TRIAL — igual ao Premium pelos 14 dias", () => {
  it("loja nova em teste, sem plano, com a flag ligada → controle ativo", async () => {
    const id = await loja({ status: "TRIAL", trialEndsAt: futuro(14), plan: null, controle: true });
    expect(await estoqueDisponivelNoPlano(id)).toBe(true);
    expect(await controleDeEstoqueAtivo(id)).toBe(true);
  });

  it("em teste com BASIC contratado, o controle também fica ativo", async () => {
    const id = await loja({
      status: "TRIAL",
      trialEndsAt: futuro(3),
      plan: "BASIC",
      controle: true,
    });
    expect(await controleDeEstoqueAtivo(id)).toBe(true);
  });

  /*
   * O teste vencido devolve a loja ao plano CONTRATADO — e o BASIC agora tem
   * estoque, então o controle NÃO cai mais. O que cai são produção e receitas,
   * que continuam no Premium.
   */
  it("teste VENCIDO com BASIC contratado → o estoque continua de pé", async () => {
    const id = await loja({
      status: "TRIAL",
      trialEndsAt: passado(1),
      plan: "BASIC",
      controle: true,
    });
    expect(await estoqueDisponivelNoPlano(id)).toBe(true);
    expect(await controleDeEstoqueAtivo(id)).toBe(true);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LEGADO — nada muda, e nada é gravado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * É a trava desta fase. Se alguém trocar o `!== "BLOQUEADO"` por
 * `=== "PERMITIDO"`, a loja legada perde o controle de estoque da noite para o
 * dia — e é aqui que o projeto reclama.
 */
describe("LEGADO — plan nulo e flag ligada continuam como estavam", () => {
  it("o controle segue ATIVO", async () => {
    const id = await loja({ plan: null, status: "ACTIVE", trialEndsAt: null, controle: true });
    expect(await estoqueDisponivelNoPlano(id)).toBe(true);
    expect(await controleDeEstoqueAtivo(id)).toBe(true);
  });

  it("a loja legada com a flag desligada continua desligada", async () => {
    const id = await loja({ plan: null, status: "ACTIVE", trialEndsAt: null, controle: false });
    expect(await estoqueDisponivelNoPlano(id)).toBe(true);
    expect(await controleDeEstoqueAtivo(id)).toBe(false);
  });

  it("nenhum plano foi gravado ao consultar", async () => {
    const id = await loja({ plan: null, status: "ACTIVE", trialEndsAt: null, controle: true });
    await controleDeEstoqueAtivo(id);
    await estoqueDisponivelNoPlano(id);
    const l = await prisma.store.findUniqueOrThrow({
      where: { id },
      select: { plan: true },
    });
    expect(l.plan).toBeNull();
  });
});

describe("loja sem linha de settings", () => {
  it("continua sendo ausência de exigência", async () => {
    const criada = await prisma.store.create({
      data: {
        slug: `sem-settings-${Date.now()}`,
        name: "Sem settings",
        status: "ACTIVE",
        plan: "PREMIUM",
        paidUntil: futuro(20),
      },
      select: { id: true },
    });
    expect(await controleDeEstoqueAtivo(criada.id)).toBe(false);
  });
});
