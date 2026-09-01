import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crossSerializeAsync } from "seroval";
import { prisma } from "@/server/db/client";
import {
  ESSENCIAIS,
  EXCLUSIVOS_DO_PREMIUM,
  TODOS_OS_RECURSOS,
} from "@/lib/planos/catalogo";
import { recursosLiberados } from "@/lib/planos/entitlements";
import {
  recursoNoEstado,
  resolverPlano,
  vereditosDoEstado,
  type EstadoComercial,
} from "@/lib/planos/resolucao";
import type { Recurso } from "@/lib/planos/tipos";
import {
  estadoComercialDaLoja,
  recursoDaLoja,
  type LojaParaPlano,
} from "../plano-da-loja";

/*
 * A CAMADA DE ENTITLEMENTS, DA LINHA DO BANCO ATÉ O VEREDITO.
 *
 * Os módulos puros já têm testes próprios — a matriz em `entitlements.test.ts`,
 * a resolução em `resolucao.test.ts`. O que se prova AQUI é a camada montada:
 * que uma loja REAL, lida do Postgres com o enum e as datas que ele devolve,
 * atravessa `estadoComercialDaLoja` → `recursoNoEstado` e chega ao veredito
 * certo.
 *
 * E prova-se uma coisa que nenhum teste puro alcança: que o resultado
 * ATRAVESSA a fronteira da server function. `EstadoComercial` viaja dentro de
 * `CurrentAdmin` até o navegador, e este projeto já perdeu uma tela inteira
 * para um `Decimal` que não serializava.
 */

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-08-31T12:00:00.000Z");
const futuro = (dias: number) => new Date(AGORA.getTime() + dias * DIA);
const passado = (dias: number) => new Date(AGORA.getTime() - dias * DIA);

const loja = (sobrescreve: Partial<LojaParaPlano> = {}): LojaParaPlano => ({
  status: "TRIAL",
  trialEndsAt: futuro(7),
  paidUntil: null,
  subscriptionStatus: null,
  plan: null,
  ...sobrescreve,
});

/** Uma loja assinante, fora do teste, com o plano pedido. */
const assinante = (plan: "BASIC" | "PREMIUM"): LojaParaPlano =>
  loja({ status: "ACTIVE", trialEndsAt: null, paidUntil: futuro(20), plan });

const ESSENCIAL: Recurso = "CARDAPIO";
const AVANCADO: Recurso = "ESTOQUE";

describe("1·2 · BASIC — essencial passa, avançado é bloqueado", () => {
  for (const recurso of ESSENCIAIS) {
    it(`BASIC + ${recurso} → PERMITIDO`, () => {
      expect(recursoDaLoja(assinante("BASIC"), recurso, AGORA)).toBe("PERMITIDO");
    });
  }

  for (const recurso of EXCLUSIVOS_DO_PREMIUM) {
    it(`BASIC + ${recurso} → BLOQUEADO`, () => {
      expect(recursoDaLoja(assinante("BASIC"), recurso, AGORA)).toBe("BLOQUEADO");
    });
  }

  it("BLOQUEADO nunca é confundido com INDEFINIDO", () => {
    expect(recursoDaLoja(assinante("BASIC"), AVANCADO, AGORA)).not.toBe("INDEFINIDO");
  });
});

describe("3 · PREMIUM — tudo permitido", () => {
  for (const recurso of TODOS_OS_RECURSOS) {
    it(`PREMIUM + ${recurso} → PERMITIDO`, () => {
      expect(recursoDaLoja(assinante("PREMIUM"), recurso, AGORA)).toBe("PERMITIDO");
    });
  }
});

describe("4·6 · TRIAL — tudo permitido, inclusive sem plano contratado", () => {
  for (const recurso of TODOS_OS_RECURSOS) {
    it(`TRIAL (plan=null) + ${recurso} → PERMITIDO`, () => {
      expect(recursoDaLoja(loja({ plan: null, trialEndsAt: futuro(7) }), recurso, AGORA)).toBe(
        "PERMITIDO",
      );
    });
  }

  it("TRIAL com plan=BASIC também libera o avançado", () => {
    expect(recursoDaLoja(loja({ plan: "BASIC" }), AVANCADO, AGORA)).toBe("PERMITIDO");
  });
});

describe("5 · legado — plan nulo e sem teste", () => {
  const legada = loja({ status: "ACTIVE", trialEndsAt: null, paidUntil: null, plan: null });

  it("TODO recurso responde INDEFINIDO — nenhum vira false silencioso", () => {
    for (const recurso of TODOS_OS_RECURSOS) {
      expect(recursoDaLoja(legada, recurso, AGORA)).toBe("INDEFINIDO");
    }
  });

  it("nem PERMITIDO nem BLOQUEADO: a loja não é classificada por omissão", () => {
    const v = recursoDaLoja(legada, ESSENCIAL, AGORA);
    expect(v).not.toBe("PERMITIDO");
    expect(v).not.toBe("BLOQUEADO");
  });

  it("teste VENCIDO sem plano também cai em INDEFINIDO, não em BASIC", () => {
    const vencida = loja({ trialEndsAt: passado(1), plan: null });
    expect(recursoDaLoja(vencida, AVANCADO, AGORA)).toBe("INDEFINIDO");
    expect(estadoComercialDaLoja(vencida, AGORA).legado).toBe(true);
  });
});

describe("7 · o teste não cria nem regrava o plano", () => {
  /*
   * A camada é de LEITURA. Se um dia alguém fizer a resolução gravar PREMIUM
   * na loja em teste "para simplificar", a loja apareceria como assinante
   * Premium sem nunca ter pago — e este teste quebra antes disso chegar longe.
   */
  it("o registro da loja não é mutado pela resolução", () => {
    const original = loja({ plan: "BASIC", trialEndsAt: futuro(7) });
    const copia = { ...original };
    estadoComercialDaLoja(original, AGORA);
    recursoDaLoja(original, AVANCADO, AGORA);
    expect(original).toEqual(copia);
    expect(original.plan).toBe("BASIC");
  });

  it("o armazenado sobrevive ao teste, para voltar a valer depois", () => {
    const estado = estadoComercialDaLoja(loja({ plan: "BASIC" }), AGORA);
    expect(estado.efetivo).toBe("PREMIUM");
    expect(estado.armazenado).toBe("BASIC");
  });
});

describe("8·9 · o conjunto do trial É o conjunto do Premium", () => {
  const emTeste = resolverPlano(null, true);
  const premium = resolverPlano("PREMIUM", false);

  /*
   * ESTE É O TESTE ESTRUTURAL, e ele se mantém sozinho: percorre o catálogo
   * VIVO. Um recurso acrescentado a `EXCLUSIVOS_DO_PREMIUM` amanhã entra
   * automaticamente nas duas listas comparadas aqui — se algum dia o trial
   * deixar de acompanhar o Premium, é esta comparação que falha, sem ninguém
   * precisar lembrar de atualizar o teste.
   */
  it("acrescentar recurso ao Premium libera-o no trial, sem tocar em nada", () => {
    expect([...recursosLiberados({ plano: "PREMIUM", emTrial: false })].sort()).toEqual(
      [...recursosLiberados({ plano: "BASIC", emTrial: true })].sort(),
    );
  });

  it("veredito por veredito, trial e Premium coincidem em todo o catálogo", () => {
    expect(vereditosDoEstado(emTeste)).toEqual(vereditosDoEstado(premium));
  });

  it("PREMIUM nunca perde recurso ao sair do teste", () => {
    const dentro = vereditosDoEstado(resolverPlano("PREMIUM", true));
    const fora = vereditosDoEstado(resolverPlano("PREMIUM", false));
    expect(dentro).toEqual(fora);
  });
});

describe("10·11·12 · catálogo íntegro e não contaminável", () => {
  it("vereditosDoEstado classifica TODOS os recursos, sem faltar nenhum", () => {
    const v = vereditosDoEstado(resolverPlano("BASIC", false));
    expect(Object.keys(v).sort()).toEqual([...TODOS_OS_RECURSOS].sort());
    expect(Object.keys(v)).toHaveLength(20);
    for (const recurso of TODOS_OS_RECURSOS) {
      expect(["PERMITIDO", "BLOQUEADO", "INDEFINIDO"]).toContain(v[recurso]);
    }
  });

  it("nenhum recurso órfão: catálogo = essenciais + exclusivos, sem repetição", () => {
    expect([...TODOS_OS_RECURSOS].sort()).toEqual(
      [...ESSENCIAIS, ...EXCLUSIVOS_DO_PREMIUM].sort(),
    );
    expect(new Set(TODOS_OS_RECURSOS).size).toBe(TODOS_OS_RECURSOS.length);
  });

  it("mexer no resultado não contamina o catálogo", () => {
    const liberados = recursosLiberados({ plano: "PREMIUM", emTrial: false });
    liberados.delete("ESTOQUE");
    expect(recursoDaLoja(assinante("PREMIUM"), "ESTOQUE", AGORA)).toBe("PERMITIDO");

    const vereditos = vereditosDoEstado(resolverPlano("PREMIUM", false));
    vereditos.ESTOQUE = "BLOQUEADO";
    expect(vereditosDoEstado(resolverPlano("PREMIUM", false)).ESTOQUE).toBe("PERMITIDO");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O CAMINHO REAL: uma loja lida do Postgres
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Prova que o enum `PlanoDaLoja` volta do banco no formato que a camada espera
 * e que as datas do Postgres alimentam a decisão de teste. É o que nenhum
 * teste puro alcança.
 */
describe("com o banco — o estado comercial vindo da resolução real", () => {
  async function limparLojas() {
    await prisma.store.deleteMany({});
  }

  beforeEach(limparLojas);
  afterAll(limparLojas);

  /** Cria a loja e devolve o recorte que a camada consome. */
  async function criar(
    dados: Partial<{
      plan: "BASIC" | "PREMIUM" | null;
      status: "TRIAL" | "ACTIVE" | "SUSPENDED";
      trialEndsAt: Date | null;
      paidUntil: Date | null;
    }>,
  ): Promise<LojaParaPlano> {
    const criada = await prisma.store.create({
      data: {
        slug: `plano-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "Loja de teste",
        status: dados.status ?? "TRIAL",
        trialEndsAt: dados.trialEndsAt ?? null,
        paidUntil: dados.paidUntil ?? null,
        plan: dados.plan ?? null,
      },
      // O MESMO recorte que `getCurrentAdmin` faz. Se ele mudar e este não,
      // o compilador reclama.
      select: {
        status: true,
        trialEndsAt: true,
        paidUntil: true,
        subscriptionStatus: true,
        plan: true,
      },
    });
    return criada;
  }

  it("loja recém-criada nasce sem plano e com o Premium do teste", async () => {
    const nova = await criar({ status: "TRIAL", trialEndsAt: futuro(14) });
    expect(nova.plan).toBeNull();

    const estado = estadoComercialDaLoja(nova, AGORA);
    expect(estado.emTrial).toBe(true);
    expect(estado.efetivo).toBe("PREMIUM");
    for (const recurso of TODOS_OS_RECURSOS) {
      expect(recursoNoEstado(estado, recurso)).toBe("PERMITIDO");
    }
  });

  it("o enum sobrevive à ida e volta do Postgres", async () => {
    const basica = await criar({ plan: "BASIC", status: "ACTIVE", paidUntil: futuro(10) });
    expect(basica.plan).toBe("BASIC");
    expect(recursoDaLoja(basica, "PRODUCAO", AGORA)).toBe("BLOQUEADO");
    expect(recursoDaLoja(basica, "CARDAPIO", AGORA)).toBe("PERMITIDO");
    // ESTOQUE desceu para o BASIC em 31/08/2026; PRODUCAO não foi junto.
    expect(recursoDaLoja(basica, "ESTOQUE", AGORA)).toBe("PERMITIDO");

    const premium = await criar({ plan: "PREMIUM", status: "ACTIVE", paidUntil: futuro(10) });
    expect(premium.plan).toBe("PREMIUM");
    expect(recursoDaLoja(premium, "PRODUCAO", AGORA)).toBe("PERMITIDO");
  });

  it("loja legada gravada com plan NULL responde INDEFINIDO", async () => {
    const legada = await criar({ plan: null, status: "ACTIVE", trialEndsAt: null });
    expect(legada.plan).toBeNull();
    expect(recursoDaLoja(legada, "ESTOQUE", AGORA)).toBe("INDEFINIDO");
  });

  /*
   * `EstadoComercial` viaja dentro de `CurrentAdmin` até o navegador. O seroval
   * do TanStack Start recusa `Decimal` e este projeto já perdeu uma tela por
   * isso — se um dia alguém puser um campo do Prisma cru aqui dentro, é este
   * teste que avisa, e não o usuário.
   */
  it("o estado comercial atravessa a fronteira da server function", async () => {
    const nova = await criar({ status: "TRIAL", trialEndsAt: futuro(14) });
    const estado: EstadoComercial = estadoComercialDaLoja(nova, AGORA);

    await expect(
      crossSerializeAsync([estado], { scopeId: "teste" }),
    ).resolves.toBeTypeOf("string");

    // Só primitivos: nada de Date, Decimal ou instância de classe.
    for (const valor of Object.values(estado)) {
      expect(["string", "boolean", "object"]).toContain(typeof valor);
      if (typeof valor === "object") expect(valor).toBeNull();
    }
  });
});
