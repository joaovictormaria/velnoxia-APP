import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { AuditService } from "@/server/audit/audit-service";
import { estadoComercialDaLoja, type LojaParaPlano } from "../plano-da-loja";
import { garantirRecurso, RecursoIndisponivelError } from "../guarda-de-recurso";
import { RECURSO_DA_ROTA } from "@/lib/planos/navegacao";
import { TODOS_OS_RECURSOS } from "@/lib/planos/catalogo";
import type { CurrentAdmin } from "@/server/auth/session";

/*
 * AUDITORIA — o módulo que se divide em duas metades opostas.
 *
 *   CONSULTAR  → "quem mudou o quê, quando, e o valor antes e depois". Isto é
 *                 o que se vende, e é o que o BASIC não pode ter.
 *   REGISTRAR  → o sistema anotando o que aconteceu. Isto NÃO pode depender de
 *                 plano: um registro que só existe para quem paga é um registro
 *                 em que não se pode confiar, e some justamente na conta onde
 *                 uma investigação seria mais provável.
 *
 * O achado desta fase é que a primeira metade NÃO EXISTE no produto — não há
 * server function, rota nem tela que leia `AuditLog`. Este arquivo trava as
 * duas coisas: que a gravação segue livre, e que nada ganhou guarda de
 * AUDITORIA só por gerar log.
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

describe("a regra comercial de AUDITORIA", () => {
  it("BASIC é recusado, com o rótulo do módulo", () => {
    try {
      garantirRecurso(BASIC, "AUDITORIA");
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const e = erro as RecursoIndisponivelError;
      expect(e).toBeInstanceOf(RecursoIndisponivelError);
      expect(e.recurso).toBe("AUDITORIA");
      expect(e.rotulo).toBe("Auditoria");
      expect(e.message).toBe("Este recurso está disponível no plano Premium.");
    }
  });

  for (const operacao of ["listar", "consultar evento", "filtrar", "ver detalhe"]) {
    it(`${operacao} → bloqueado no BASIC`, () => {
      expect(() => garantirRecurso(BASIC, "AUDITORIA")).toThrow(RecursoIndisponivelError);
    });
  }

  it("PREMIUM e TRIAL passam", () => {
    expect(() => garantirRecurso(PREMIUM, "AUDITORIA")).not.toThrow();
    expect(() => garantirRecurso(EM_TESTE, "AUDITORIA")).not.toThrow();
    expect(() => garantirRecurso(TESTE_COM_BASIC, "AUDITORIA")).not.toThrow();
    expect(TESTE_COM_BASIC.store.plano.armazenado).toBe("BASIC");
  });

  it("LEGADO passa temporariamente, e segue sem classificação", () => {
    expect(() => garantirRecurso(LEGADA, "AUDITORIA")).not.toThrow();
    expect(LEGADA.store.plano.legado).toBe(true);
    expect(LEGADA.store.plano.armazenado).toBeNull();
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  A METADE QUE NÃO PODE DEPENDER DE PLANO — teste obrigatório
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("com o banco — a gravação interna independe do plano", () => {
  async function limpar() {
    await prisma.auditLog.deleteMany({});
    await prisma.store.deleteMany({});
  }
  beforeEach(limpar);
  afterAll(limpar);

  async function criarLoja(slug: string, plan: "BASIC" | "PREMIUM" | null) {
    const l = await prisma.store.create({
      data: { slug, name: `Loja ${slug}`, status: "ACTIVE", paidUntil: futuro(20), plan },
      select: { id: true },
    });
    return l.id;
  }

  /** Uma anotação como as que o estoque e os recebimentos fazem hoje. */
  async function anotar(storeId: string) {
    await AuditService.log({
      storeId,
      userEmail: "dona@loja.com",
      action: "UPDATE",
      resource: "InventoryItem",
      resourceId: "item-1",
      oldValue: { quantityOnHand: 10 },
      newValue: { quantityOnHand: 4 },
      reason: "baixa por venda",
    });
  }

  for (const plan of ["BASIC", "PREMIUM", null] as const) {
    it(`loja com plan = ${plan} continua registrando eventos`, async () => {
      const storeId = await criarLoja(`auditoria-${plan ?? "legada"}`, plan);
      await anotar(storeId);

      const linhas = await prisma.auditLog.findMany({ where: { storeId } });
      expect(linhas, `plan=${plan}`).toHaveLength(1);
      expect(linhas[0].action).toBe("UPDATE");
      expect(linhas[0].resource).toBe("InventoryItem");
      expect(linhas[0].userEmail).toBe("dona@loja.com");
    });
  }

  /*
   * O ANTES E DEPOIS SOBREVIVE INTEIRO NA LOJA BASIC. É o dado que dá valor à
   * auditoria, e ele não pode ser o que se corta de quem não paga: cortá-lo
   * apagaria o rastro justamente onde uma investigação seria mais provável.
   */
  it("o antes/depois é gravado igual numa loja BASIC", async () => {
    const storeId = await criarLoja("auditoria-antes-depois", "BASIC");
    await anotar(storeId);

    const linha = await prisma.auditLog.findFirstOrThrow({ where: { storeId } });
    expect(linha.oldValue).toContain("quantityOnHand");
    expect(linha.newValue).toContain("quantityOnHand");
    expect(linha.reason).toBe("baixa por venda");
  });

  it("a loja BASIC não vira Premium por ter registrado", async () => {
    const storeId = await criarLoja("auditoria-sem-promover", "BASIC");
    await anotar(storeId);
    const loja = await prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { plan: true },
    });
    expect(loja.plan).toBe("BASIC");
  });
});

describe("contrato do código", () => {
  const raiz = resolve(__dirname, "../../functions");
  const fn = (a: string) => readFileSync(resolve(raiz, a), "utf8");

  /*
   * O SERVIÇO DE AUDITORIA NÃO CONHECE PLANO — e não pode passar a conhecer.
   * Ele roda dentro de outras operações, sem sessão em mãos; consultar
   * entitlement ali seria pedir plano no meio de uma transação de estoque.
   */
  it("audit-service não sabe o que é plano", () => {
    const servico = readFileSync(
      resolve(__dirname, "../../audit/audit-service.ts"),
      "utf8",
    );
    expect(servico).not.toContain("exigirRecurso");
    expect(servico).not.toContain("garantirRecurso");
    expect(servico).not.toContain("recursoNoEstado");
    expect(servico).not.toContain("AUDITORIA");
    expect(servico).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
  });

  /*
   * NENHUMA FUNÇÃO GANHOU GUARDA DE AUDITORIA POR GERAR LOG.
   *
   * `adminUpdateInventoryItem` continua ESTOQUE; `receberPagamentoFn` continua
   * FIADO. Gerar um registro não muda a que módulo a operação pertence.
   */
  it("só a consulta exige AUDITORIA — nenhuma outra função", () => {
    const arquivos = readdirSync(raiz)
      .filter((f) => f.endsWith(".fn.ts"))
      // A porta da consulta é a ÚNICA que pode exigir o recurso, e é ela que a
      // suíte `consulta-de-auditoria.test.ts` cobre por dentro.
      .filter((f) => f !== "auditoria.fn.ts");

    for (const arquivo of arquivos) {
      expect(fn(arquivo), arquivo).not.toContain('exigirRecurso("AUDITORIA")');
      expect(fn(arquivo), arquivo).not.toContain('garantirRecurso(admin, "AUDITORIA")');
    }
  });

  it("as operações que geram log seguem no módulo delas", () => {
    const bloco = (codigo: string, nome: string) => {
      const i = codigo.indexOf(`export const ${nome} = createServerFn`);
      const f = codigo.indexOf("export const ", i + 10);
      return f < 0 ? codigo.slice(i) : codigo.slice(i, f);
    };
    expect(bloco(fn("inventory.fn.ts"), "adminUpdateInventoryItem")).toContain(
      'exigirRecurso("ESTOQUE")',
    );
    expect(bloco(fn("recebimentos.fn.ts"), "receberPagamentoFn")).toContain(
      'exigirRecurso("FIADO")',
    );
  });

  /*
   * A ABA "AUDITORIA" DE `/admin/estoque` NÃO É ESTE MÓDULO.
   *
   * Ela mostra o HISTÓRICO DE MOVIMENTAÇÃO do estoque — entradas, saídas,
   * ajustes —, e lê `adminGetMovementHistory`, que é `InventoryMovement`, não
   * `AuditLog`. O nome da aba coincide; o conteúdo não.
   *
   * Desde 31/08/2026 isso tem uma consequência comercial: ESTOQUE virou
   * essencial, então essa aba é do BASIC — enquanto a auditoria de verdade,
   * em `/admin/auditoria`, segue paga. Duas telas com o mesmo nome e planos
   * diferentes, e é a classificação por CONTEÚDO que mantém as duas certas.
   */
  it("a aba do estoque é ESTOQUE, e não ganhou guarda de AUDITORIA", () => {
    const componente = readFileSync(
      resolve(__dirname, "../../../components/admin/inventory/AuditLog.tsx"),
      "utf8",
    );
    expect(componente).toContain("adminGetMovementHistory");
    expect(componente).not.toContain("AuditService");
    expect(componente).not.toContain("auditLog");

    const rota = readFileSync(
      resolve(__dirname, "../../../routes/admin/estoque/index.tsx"),
      "utf8",
    );
    // A página abriu: nenhuma guarda de rota, e nenhuma delas é AUDITORIA.
    expect(rota).not.toContain('rotaPremium("AUDITORIA"');
    expect(rota).not.toMatch(/rotaPremium\(/);
    expect(rota).toMatch(/id: "audit".*recurso: "ESTOQUE"/);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O RECURSO É VENDIDO — E AGORA TEM ONDE SER USADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Até a fase anterior, `AUDITORIA` estava na matriz comercial sem nenhuma tela
 * que consultasse o `AuditLog`: vendia-se uma resposta que o produto gravava e
 * não mostrava. A superfície foi construída, e este bloco trava as três pontas
 * ficando de acordo — catálogo, mapa de navegação e rota.
 */
describe("AUDITORIA é vendida e tem tela", () => {
  it("é um recurso da matriz", () => {
    expect(TODOS_OS_RECURSOS).toContain("AUDITORIA");
  });

  it("a rota está mapeada, e só uma", () => {
    expect(RECURSO_DA_ROTA["/admin/auditoria"]).toBe("AUDITORIA");
    const mapeadas = Object.entries(RECURSO_DA_ROTA)
      .filter(([, r]) => r === "AUDITORIA")
      .map(([rota]) => rota);
    expect(mapeadas).toEqual(["/admin/auditoria"]);
  });

  it("a tela existe no painel", () => {
    const rotas = readdirSync(resolve(__dirname, "../../../routes/admin"));
    expect(rotas).toContain("auditoria");
  });

  /*
   * `query` é a única das cinco consultas do serviço que ganhou consumidor. As
   * outras quatro continuam sem chamador, e continuam existindo: se alguma for
   * exposta um dia, a guarda tem de vir junto.
   */
  it("as cinco consultas do serviço seguem existindo", () => {
    const servico = readFileSync(
      resolve(__dirname, "../../audit/audit-service.ts"),
      "utf8",
    );
    for (const metodo of [
      "static async query",
      "static async getDayReport",
      "static async getResourceHistory",
      "static async getUserActivity",
      "static async detectAnomalies",
    ]) {
      expect(servico, metodo).toContain(metodo);
    }
  });
});
