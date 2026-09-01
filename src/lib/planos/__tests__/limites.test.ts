import { describe, expect, it } from "vitest";
import { TODOS_OS_RECURSOS } from "../catalogo";
import { recursoNoEstado, resolverPlano } from "../resolucao";
import {
  cabeNoLimite,
  planoDosLimites,
  RECURSO_DO_LIMITE,
  ROTULO_DO_LIMITE,
  TETOS_DO_PLANO,
  TODOS_OS_LIMITES,
  tetoDoEstado,
  tetoDoPlano,
  type Limite,
} from "../limites";

/*
 * O CONTRATO DE LIMITES — "quanto", separado de "se".
 *
 * Nenhum número comercial foi decidido, e o teste mais importante deste
 * arquivo é justamente o que prova isso: um `"A_DEFINIR"` que virasse `50` sem
 * autorização faria a suíte falhar.
 *
 * Nada aqui é aplicado a operação nenhuma. A Fase 4 audita, define e testa; o
 * enforcement vem depois, e só depois de os números existirem.
 */

const BASIC = resolverPlano("BASIC", false);
const PREMIUM = resolverPlano("PREMIUM", false);
const EM_TESTE = resolverPlano("BASIC", true);
const TESTE_SEM_PLANO = resolverPlano(null, true);
const LEGADA = resolverPlano(null, false);

describe("1·2 · os dois planos têm estrutura de limites", () => {
  it("BASIC tem entrada para todos os limites", () => {
    expect(Object.keys(TETOS_DO_PLANO.BASIC).sort()).toEqual([...TODOS_OS_LIMITES].sort());
  });

  it("PREMIUM tem entrada para todos os limites", () => {
    expect(Object.keys(TETOS_DO_PLANO.PREMIUM).sort()).toEqual([...TODOS_OS_LIMITES].sort());
  });

  it("os dois planos declaram exatamente o mesmo conjunto de limites", () => {
    expect(Object.keys(TETOS_DO_PLANO.BASIC).sort()).toEqual(
      Object.keys(TETOS_DO_PLANO.PREMIUM).sort(),
    );
  });
});

describe("3·4 · TRIAL usa os limites do Premium, sem tabela própria", () => {
  it("o catálogo não tem entrada para trial — só os dois planos", () => {
    expect(Object.keys(TETOS_DO_PLANO).sort()).toEqual(["BASIC", "PREMIUM"]);
    expect(TETOS_DO_PLANO).not.toHaveProperty("TRIAL");
  });

  for (const limite of TODOS_OS_LIMITES) {
    it(`${limite}: em teste, o teto é o do Premium`, () => {
      expect(tetoDoEstado(EM_TESTE, limite)).toEqual(tetoDoPlano("PREMIUM", limite));
      expect(tetoDoEstado(TESTE_SEM_PLANO, limite)).toEqual(tetoDoPlano("PREMIUM", limite));
    });
  }

  /*
   * ESTRUTURAL, e se mantém sozinho: percorre o catálogo vivo. Mudar o teto do
   * Premium amanhã muda o do trial junto, sem ninguém atualizar este teste.
   */
  it("todo teto do trial é idêntico ao do Premium, limite a limite", () => {
    for (const limite of TODOS_OS_LIMITES) {
      expect(tetoDoEstado(EM_TESTE, limite)).toEqual(tetoDoEstado(PREMIUM, limite));
    }
  });

  it("o plano dos limites em teste é PREMIUM, mesmo com BASIC contratado", () => {
    expect(planoDosLimites(EM_TESTE)).toBe("PREMIUM");
    expect(planoDosLimites(TESTE_SEM_PLANO)).toBe("PREMIUM");
    expect(EM_TESTE.armazenado).toBe("BASIC");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  5 · OS NÚMEROS COMERCIAIS — decididos por João em 31/08/2026
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Até esta data os quatro tetos eram `"A_DEFINIR"`, e este bloco cobrava que
 * continuassem assim — a trava contra copiar os 50/100/500 do
 * `EntitlementsService` morto, que pertencem a uma matriz
 * Trial/Starter/Business/Enterprise que nunca foi vendida.
 *
 * Os números agora existem, e a trava mudou de lado: ela cobra ESTES valores.
 * O enforcement mora em `@/server/billing/guarda-de-limite` e é testado em
 * `server/billing/__tests__/limites-do-plano.test.ts`.
 */
describe("5 · os tetos decididos", () => {
  const DECIDIDOS = {
    BASIC: { MAX_PRODUTOS: 50, MAX_CATEGORIAS: 10 },
    PREMIUM: { MAX_PRODUTOS: null, MAX_CATEGORIAS: null },
  } as const;

  for (const plano of ["BASIC", "PREMIUM"] as const) {
    for (const limite of TODOS_OS_LIMITES) {
      it(`${plano}.${limite} = ${String(DECIDIDOS[plano][limite])}`, () => {
        expect(tetoDoPlano(plano, limite)).toBe(DECIDIDOS[plano][limite]);
      });
    }
  }

  it("nenhum teto ficou por decidir", () => {
    for (const plano of ["BASIC", "PREMIUM"] as const) {
      for (const limite of TODOS_OS_LIMITES) {
        expect(tetoDoPlano(plano, limite), `${plano}.${limite}`).not.toBe("A_DEFINIR");
      }
    }
  });

  /*
   * ILIMITADO É `null`, E NÃO UM NÚMERO GRANDE. Escrever 999999 no Premium
   * faria a tela prometer um teto que não existe, e um dia alguém bateria
   * nele.
   */
  it("o Premium é ilimitado de verdade", () => {
    for (const limite of TODOS_OS_LIMITES) {
      expect(tetoDoPlano("PREMIUM", limite), limite).toBeNull();
      expect(cabeNoLimite(tetoDoPlano("PREMIUM", limite), 10_000), limite).toBe("CABE");
    }
  });

  it("`A_DEFINIR` não é confundido com ilimitado nem com zero", () => {
    // Ilimitado é `null` e deixa passar; A_DEFINIR não decide nada.
    expect(cabeNoLimite(null, 999_999)).toBe("CABE");
    expect(cabeNoLimite("A_DEFINIR", 0)).toBe("INDEFINIDO");
    expect(cabeNoLimite("A_DEFINIR", 999_999)).toBe("INDEFINIDO");
    // Zero é um teto legítimo e diferente dos dois.
    expect(cabeNoLimite(0, 0)).toBe("ESTOUROU");
  });
});

describe("6 · loja legada não vira BASIC", () => {
  for (const limite of TODOS_OS_LIMITES) {
    it(`${limite}: legada responde INDEFINIDO`, () => {
      expect(tetoDoEstado(LEGADA, limite)).toBe("INDEFINIDO");
    });
  }

  it("o teto da legada não é o do BASIC nem o do PREMIUM", () => {
    for (const limite of TODOS_OS_LIMITES) {
      const teto = tetoDoEstado(LEGADA, limite);
      expect(teto).toBe("INDEFINIDO");
      expect(planoDosLimites(LEGADA)).toBeNull();
    }
  });

  it("`cabeNoLimite` da legada é INDEFINIDO, nunca ESTOUROU", () => {
    for (const limite of TODOS_OS_LIMITES) {
      expect(cabeNoLimite(tetoDoEstado(LEGADA, limite), 10_000)).toBe("INDEFINIDO");
    }
  });
});

describe("7 · feature e limite continuam conceitos separados", () => {
  /*
   * O erro que este bloco previne é `ESTOQUE = 100`: um recurso virando número
   * e um número virando recurso. As duas listas não se cruzam.
   */
  it("nenhum limite é um recurso, e nenhum recurso é um limite", () => {
    for (const limite of TODOS_OS_LIMITES) {
      expect(TODOS_OS_RECURSOS).not.toContain(limite as unknown as string);
    }
    for (const recurso of TODOS_OS_RECURSOS) {
      expect(TODOS_OS_LIMITES).not.toContain(recurso as unknown as Limite);
    }
  });

  it("o mesmo estado responde às duas perguntas por caminhos diferentes", () => {
    // "tem Cardápio?" — sim, nos dois planos.
    expect(recursoNoEstado(BASIC, "CARDAPIO")).toBe("PERMITIDO");
    expect(recursoNoEstado(PREMIUM, "CARDAPIO")).toBe("PERMITIDO");
    /*
     * "quantos produtos?" — a MESMA pergunta, com respostas diferentes. É
     * exatamente por isso que os dois conceitos são separados: o BASIC TEM
     * cardápio e ainda assim tem teto, e nenhuma resposta de feature
     * conseguiria dizer as duas coisas.
     */
    expect(tetoDoEstado(BASIC, "MAX_PRODUTOS")).toBe(50);
    expect(tetoDoEstado(PREMIUM, "MAX_PRODUTOS")).toBeNull();
  });

  it("ter o recurso não implica teto, e não ter recurso não vira teto zero", () => {
    // BASIC não tem Produção — e isso é a resposta de FEATURE, não um limite 0.
    expect(recursoNoEstado(BASIC, "PRODUCAO")).toBe("BLOQUEADO");
    // E não existe limite nenhum medindo Produção nem Estoque: ter o recurso
    // (ESTOQUE, desde 31/08/2026 no BASIC) tampouco cria um teto.
    expect(recursoNoEstado(BASIC, "ESTOQUE")).toBe("PERMITIDO");
    expect(Object.values(RECURSO_DO_LIMITE)).not.toContain("PRODUCAO");
    expect(Object.values(RECURSO_DO_LIMITE)).not.toContain("ESTOQUE");
  });
});

describe("8·9 · catálogo de limites íntegro", () => {
  it("todo limite tem rótulo escrito", () => {
    expect(Object.keys(ROTULO_DO_LIMITE).sort()).toEqual([...TODOS_OS_LIMITES].sort());
    for (const limite of TODOS_OS_LIMITES) {
      expect(ROTULO_DO_LIMITE[limite].trim().length).toBeGreaterThan(0);
    }
  });

  it("todo limite pertence a um recurso que existe no catálogo", () => {
    expect(Object.keys(RECURSO_DO_LIMITE).sort()).toEqual([...TODOS_OS_LIMITES].sort());
    for (const limite of TODOS_OS_LIMITES) {
      expect(TODOS_OS_RECURSOS).toContain(RECURSO_DO_LIMITE[limite]);
    }
  });

  /*
   * ÓRFÃO SERIA UM TETO SOBRE ALGO QUE O PLANO NÃO POSSUI — "até 100 cupons"
   * num plano sem Marketing. Nenhum limite pode medir um recurso que o próprio
   * plano bloqueia.
   */
  it("nenhum limite mede recurso que o plano não tem", () => {
    for (const plano of [BASIC, PREMIUM]) {
      for (const limite of TODOS_OS_LIMITES) {
        expect(recursoNoEstado(plano, RECURSO_DO_LIMITE[limite])).toBe("PERMITIDO");
      }
    }
  });

  it("sem limites repetidos", () => {
    expect(new Set(TODOS_OS_LIMITES).size).toBe(TODOS_OS_LIMITES.length);
  });
});

describe("cabeNoLimite — a contagem, quando os números existirem", () => {
  it("abaixo do teto cabe; no teto e acima, estourou", () => {
    expect(cabeNoLimite(10, 9)).toBe("CABE");
    expect(cabeNoLimite(10, 10)).toBe("ESTOUROU");
    expect(cabeNoLimite(10, 11)).toBe("ESTOUROU");
  });

  it("ilimitado sempre cabe", () => {
    expect(cabeNoLimite(null, 0)).toBe("CABE");
    expect(cabeNoLimite(null, 1_000_000)).toBe("CABE");
  });
});
