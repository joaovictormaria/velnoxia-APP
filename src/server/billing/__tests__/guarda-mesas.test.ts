import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { garantirRecurso, RecursoIndisponivelError } from "../guarda-de-recurso";
import { recursoNoEstado } from "@/lib/planos/resolucao";
import { RECURSO_DA_ROTA } from "@/lib/planos/navegacao";
import { getStoreBySlug } from "@/server/repositories/store-repository";
import type { CurrentAdmin } from "@/server/auth/session";

/*
 * O ENFORCEMENT DO SALÃO.
 *
 * A dificuldade desta fase não é a regra — é ONDE aplicá-la. O módulo tem duas
 * portas com naturezas opostas:
 *
 *   · o painel do dono, com sessão administrativa;
 *   · o QR Code, usado por um CLIENTE que não tem conta nenhuma.
 *
 * `exigirRecurso` não serve na segunda: ela passa por `requireAdminSession` e
 * recusaria qualquer pessoa comum. Metade deste arquivo prova que a segunda
 * porta foi fechada pelo caminho certo — e que ela não pode ser contornada
 * trocando o `storeSlug` da URL.
 */

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-08-31T12:00:00.000Z");
const futuro = (d: number) => new Date(AGORA.getTime() + d * DIA);

function sessao(dados: Partial<LojaParaPlano>): CurrentAdmin {
  const registro: LojaParaPlano = {
    status: "TRIAL",
    trialEndsAt: futuro(7),
    paidUntil: null,
    subscriptionStatus: null,
    plan: null,
    ...dados,
  };
  return { store: { plano: estadoComercialDaLoja(registro, AGORA) } } as unknown as CurrentAdmin;
}

const PAGO = { status: "ACTIVE" as const, trialEndsAt: null, paidUntil: futuro(20) };
const BASIC = sessao({ ...PAGO, plan: "BASIC" });
const PREMIUM = sessao({ ...PAGO, plan: "PREMIUM" });
const EM_TESTE = sessao({ status: "TRIAL", trialEndsAt: futuro(7), plan: null });
const TESTE_COM_BASIC = sessao({ status: "TRIAL", trialEndsAt: futuro(7), plan: "BASIC" });
const LEGADA = sessao({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });

describe("BASIC — o salão é recusado", () => {
  it("lança o erro de domínio, com o rótulo do módulo", () => {
    try {
      garantirRecurso(BASIC, "MESAS");
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const e = erro as RecursoIndisponivelError;
      expect(e).toBeInstanceOf(RecursoIndisponivelError);
      expect(e.recurso).toBe("MESAS");
      expect(e.rotulo).toBe("Mesas com QR Code");
      expect(e.message).toBe("Este recurso está disponível no plano Premium.");
    }
  });

  for (const operacao of [
    "criar mesa",
    "editar mesa",
    "listar mesas",
    "gerar QR",
    "abrir sessão",
    "usar PIN",
    "painel de mesas",
    "fechar conta da mesa",
  ]) {
    it(`${operacao} → bloqueado`, () => {
      expect(() => garantirRecurso(BASIC, "MESAS")).toThrow(RecursoIndisponivelError);
    });
  }
});

describe("BASIC — vender continua liberado", () => {
  for (const recurso of [
    "PEDIDOS",
    "BALCAO",
    "CARDAPIO",
    "CLIENTES",
    "DASHBOARD",
  ] as const) {
    it(`${recurso} passa`, () => {
      expect(() => garantirRecurso(BASIC, recurso)).not.toThrow();
    });
  }
});

describe("PREMIUM, TRIAL e LEGADO", () => {
  it("PREMIUM passa", () => {
    expect(() => garantirRecurso(PREMIUM, "MESAS")).not.toThrow();
  });

  it("TRIAL passa, inclusive com BASIC contratado", () => {
    expect(() => garantirRecurso(EM_TESTE, "MESAS")).not.toThrow();
    expect(() => garantirRecurso(TESTE_COM_BASIC, "MESAS")).not.toThrow();
    expect(TESTE_COM_BASIC.store.plano.armazenado).toBe("BASIC");
  });

  it("LEGADO passa, e segue sem classificação", () => {
    expect(() => garantirRecurso(LEGADA, "MESAS")).not.toThrow();
    expect(LEGADA.store.plano.legado).toBe(true);
    expect(LEGADA.store.plano.armazenado).toBeNull();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O CLIENTE PÚBLICO NÃO CONTORNA O PLANO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Com lojas reais no banco, pelo mesmo caminho que as funções do QR usam:
 * o cliente manda um `storeSlug`, e quem resolve a loja é o BANCO.
 */
describe("com o banco — o QR decide pelo plano da loja resolvida", () => {
  async function limpar() {
    await prisma.store.deleteMany({});
  }
  beforeEach(limpar);
  afterAll(limpar);

  async function criarLoja(slug: string, plan: "BASIC" | "PREMIUM" | null) {
    await prisma.store.create({
      data: {
        slug,
        name: `Loja ${slug}`,
        status: "ACTIVE",
        paidUntil: futuro(20),
        plan,
      },
    });
  }

  /** A mesma decisão que as três funções públicas tomam. */
  async function mesasLiberadasPara(slug: string): Promise<boolean> {
    const store = await getStoreBySlug(slug);
    if (!store) return false;
    return recursoNoEstado(estadoComercialDaLoja(store), "MESAS") !== "BLOQUEADO";
  }

  it("loja BASIC → QR recusado", async () => {
    await criarLoja("basica", "BASIC");
    expect(await mesasLiberadasPara("basica")).toBe(false);
  });

  it("loja PREMIUM → QR liberado", async () => {
    await criarLoja("premium", "PREMIUM");
    expect(await mesasLiberadasPara("premium")).toBe(true);
  });

  it("loja legada → QR liberado, transitoriamente", async () => {
    await prisma.store.create({
      data: { slug: "legada", name: "Legada", status: "ACTIVE", plan: null },
    });
    expect(await mesasLiberadasPara("legada")).toBe(true);
  });

  /*
   * TROCAR O SLUG NÃO CONTORNA NADA. O parâmetro escolhe QUAL loja responde;
   * o plano vem do banco daquela loja. Não existe valor de URL que faça uma
   * loja BASIC virar Premium.
   */
  it("trocar o storeSlug leva a outra loja — com o plano DELA", async () => {
    await criarLoja("basica", "BASIC");
    await criarLoja("premium", "PREMIUM");
    expect(await mesasLiberadasPara("basica")).toBe(false);
    expect(await mesasLiberadasPara("premium")).toBe(true);
    expect(await mesasLiberadasPara("inexistente")).toBe(false);
  });

  it("`getStoreBySlug` já traz o plano — sem consulta a mais", async () => {
    await criarLoja("premium", "PREMIUM");
    const store = await getStoreBySlug("premium");
    expect(store).not.toBeNull();
    for (const campo of ["status", "trialEndsAt", "paidUntil", "subscriptionStatus", "plan"]) {
      expect(store, campo).toHaveProperty(campo);
    }
  });
});

describe("cobertura do backend", () => {
  const raiz = resolve(__dirname, "../../functions");
  const fonte = (a: string) => readFileSync(resolve(raiz, a), "utf8");

  function blocoDa(codigo: string, nome: string): string {
    const i = codigo.indexOf(`export const ${nome} = createServerFn`);
    expect(i, `${nome} não encontrada`).toBeGreaterThan(-1);
    const fim = codigo.indexOf("export const ", i + 10);
    return fim < 0 ? codigo.slice(i) : codigo.slice(i, fim);
  }

  /* O salão dentro do painel. */
  for (const nome of [
    "listMesasAbertasFn",
    "getTableOrderCountsFn",
    "getNextTableNumberFn",
    "listTablesFn",
    "deleteTableFn",
  ]) {
    it(`orders.fn.ts · ${nome} exige MESAS`, () => {
      const bloco = blocoDa(fonte("orders.fn.ts"), nome);
      expect(bloco).toContain('exigirRecurso("MESAS")');
      expect(bloco).not.toContain("requireAdminSession()");
    });
  }

  it("dashboard-table-sessions: as três exigem MESAS", () => {
    const codigo = fonte("dashboard-table-sessions.fn.ts");
    expect(codigo.split('garantirRecurso(admin, "MESAS")').length - 1).toBe(3);
    for (const nome of [
      "listOpenTableSessionsFn",
      "getTableSessionDetailsFn",
      "closeTableSessionFn",
    ]) {
      expect(blocoDa(codigo, nome), nome).toContain('garantirRecurso(admin, "MESAS")');
    }
  });

  /*
   * As três funções públicas do QR. `exigirRecurso` NÃO pode aparecer aqui:
   * ela exige sessão de painel e trancaria o cliente por não ter conta.
   */
  it("table-session.fn: as três públicas decidem pela loja, não por sessão", () => {
    const codigo = fonte("table-session.fn.ts");
    expect(codigo).not.toContain("exigirRecurso(");

    /*
      A asserção olha os IMPORTS e a CHAMADA, e não o texto cru: os comentários
      do arquivo citam `requireAdminSession` justamente para explicar por que
      ela NÃO é usada ali. Procurar a palavra reprovaria a documentação.
    */
    const imports = [...codigo.matchAll(/^import .*$/gm)].map((m) => m[0]).join("\n");
    expect(imports).not.toContain("requireAdminSession");
    expect(codigo).not.toContain("await requireAdminSession()");
    expect(
      codigo.split('recursoNoEstado(estadoComercialDaLoja(store), "MESAS")').length - 1,
    ).toBe(3);
    for (const nome of [
      "validateTableSessionPinFn",
      "orchestrateTableSessionFn",
      "getSessionPinHintFn",
    ]) {
      expect(blocoDa(codigo, nome), nome).toContain('"MESAS"');
    }
  });

  /*
   * A recusa é a MESMA de loja inexistente: dizer "esta loja não tem mesas no
   * plano" contaria a um estranho o que a loja contratou.
   */
  it("a recusa pública não revela o plano da loja", () => {
    const codigo = fonte("table-session.fn.ts");
    expect(codigo).not.toMatch(/Premium.*mesas|mesas.*Premium/i);
    expect(codigo).not.toContain("disponível no plano");
  });

  /* O resto do quadro é BASIC e não pode ganhar guarda. */
  for (const nome of [
    "listKanbanOrdersFn",
    "updateOrderStatusFn",
    "confirmPaymentFn",
    "getOrderFn",
    "updateOrderNotesFn",
  ]) {
    it(`orders.fn.ts · ${nome} continua BASIC`, () => {
      expect(blocoDa(fonte("orders.fn.ts"), nome)).not.toContain("Recurso(");
    });
  }

  it("checkout e balcão não conhecem MESAS", () => {
    for (const arquivo of ["storefront-checkout.fn.ts", "balcao.fn.ts"]) {
      expect(fonte(arquivo), arquivo).not.toContain('"MESAS"');
    }
  });

  it("nenhuma guarda específica de mesas foi criada", () => {
    for (const arquivo of [
      "orders.fn.ts",
      "table-session.fn.ts",
      "dashboard-table-sessions.fn.ts",
    ]) {
      const codigo = fonte(arquivo);
      expect(codigo).not.toMatch(/exigirMesas|guardaMesa|requireTable/);
      expect(codigo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
    }
  });
});

describe("rota, menu e quadro", () => {
  it("a rota do salão exige MESAS", () => {
    const rota = readFileSync(
      resolve(__dirname, "../../../routes/admin/mesas/index.tsx"),
      "utf8",
    );
    expect(rota).toContain('rotaPremium("MESAS"');
    expect(rota).not.toMatch(/createFileRoute\([^)]*\)\(\{\s*component:/);
  });

  it("sidebar, rota e backend usam o mesmo recurso", () => {
    expect(RECURSO_DA_ROTA["/admin/mesas"]).toBe("MESAS");
  });

  it("o painel de mesas do quadro não consulta sem o recurso", () => {
    const pedidos = readFileSync(
      resolve(__dirname, "../../../routes/admin/pedidos/index.tsx"),
      "utf8",
    );
    expect(pedidos).toContain("enabled: temMesas");
    expect(pedidos).toContain('recursoNoEstado(admin.store.plano, "MESAS")');
    expect(pedidos).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
  });
});
