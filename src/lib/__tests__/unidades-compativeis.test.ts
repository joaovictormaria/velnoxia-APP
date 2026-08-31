import { describe, it, expect } from "vitest";
import {
  unidadesCompativeis,
  unidadeEhCompativel,
  type UnidadeConhecida,
} from "@/lib/unidades-compativeis";
import { gerarSlugDeProduto, mensagemDeSlugDuplicado, slugVazio } from "@/lib/slug-de-produto";

/*
 * AS CINCO UNIDADES QUE EXISTEM, com os ids da migration que as semeia.
 * Nao e uma amostra inventada: e o conteudo real de `InventoryUnit`, conferido
 * em producao durante a auditoria.
 */
const UNIDADES: UnidadeConhecida[] = [
  { id: "unit_kg", code: "kg", system: "WEIGHT" },
  { id: "unit_g", code: "g", system: "WEIGHT" },
  { id: "unit_l", code: "L", system: "VOLUME" },
  { id: "unit_ml", code: "ml", system: "VOLUME" },
  { id: "unit_un", code: "un", system: "COUNT" },
];

const codigos = (baseUnitId: string, conteudo?: { contentSize: number; contentUnit: string }) =>
  unidadesCompativeis({ baseUnitId, ...conteudo }, UNIDADES).map((u) => u.code);

describe("unidadesCompativeis", () => {
  it("peso oferece kg e g, nos dois sentidos", () => {
    expect(codigos("unit_kg").sort()).toEqual(["g", "kg"]);
    expect(codigos("unit_g").sort()).toEqual(["g", "kg"]);
  });

  it("volume oferece L e ml, nos dois sentidos", () => {
    expect(codigos("unit_l").sort()).toEqual(["L", "ml"]);
    expect(codigos("unit_ml").sort()).toEqual(["L", "ml"]);
  });

  it("contagem oferece apenas un", () => {
    expect(codigos("unit_un")).toEqual(["un"]);
  });

  /*
   * A unidade base abre a lista. Na duvida ela e a resposta certa — e o saldo
   * e contado nela —, entao nao pode ficar em segundo por acaso alfabetico.
   */
  it("a unidade base vem primeiro", () => {
    expect(codigos("unit_kg")[0]).toBe("kg");
    expect(codigos("unit_g")[0]).toBe("g");
    expect(codigos("unit_ml")[0]).toBe("ml");
  });

  it("sem conteudo declarado, NUNCA mistura sistemas", () => {
    for (const base of UNIDADES) {
      const sistemas = new Set(
        unidadesCompativeis({ baseUnitId: base.id }, UNIDADES).map((u) => u.system),
      );
      expect([...sistemas]).toEqual([base.system]);
    }
  });

  /*
   * Lista vazia, e nao um palpite. Inventar uma lista aqui esconderia um dado
   * faltando atras de um `<select>` plausivel.
   */
  it("unidade base desconhecida devolve lista vazia", () => {
    expect(unidadesCompativeis({ baseUnitId: "unit_inexistente" }, UNIDADES)).toEqual([]);
    expect(unidadesCompativeis({ baseUnitId: "unit_kg" }, [])).toEqual([]);
  });
});

/*
 * A SEGUNDA PORTA: o conteudo declarado da embalagem.
 *
 * Oleo contado em `un`, cada garrafa com 900 ml. Ninguem escreve "1 un de
 * oleo" numa receita de salgado — escreve "40 ml". Enquanto a regra era so
 * `system`, `un` (COUNT) e `ml` (VOLUME) nao se falavam e a ficha era recusada,
 * obrigando a lancar uma garrafa inteira por salgado: 22,5x o consumo real.
 */
describe("conteudo da embalagem abre as unidades do conteudo", () => {
  const OLEO = { contentSize: 900, contentUnit: "unit_ml" };
  const CAIXA = { contentSize: 6, contentUnit: "unit_l" };

  it("un + 900 ml oferece un, ml e L", () => {
    expect(codigos("unit_un", OLEO)).toEqual(["un", "ml", "L"]);
  });

  it("un + 6 L oferece un, L e ml", () => {
    expect(codigos("unit_un", CAIXA)).toEqual(["un", "L", "ml"]);
  });

  it("a base abre a lista e a unidade do conteudo vem logo atras", () => {
    const l = codigos("unit_un", OLEO);
    expect(l[0]).toBe("un");
    expect(l[1]).toBe("ml");
  });

  /*
   * O QUE CONTINUA IMPOSSIVEL. Nao existe fator entre g e ml sem densidade, e
   * inventar um daria um numero plausivel e errado.
   */
  it("conteudo em ml NAO abre g nem kg", () => {
    const l = codigos("unit_un", OLEO);
    expect(l).not.toContain("g");
    expect(l).not.toContain("kg");
  });

  it("conteudo em g abre g e kg, e nao ml nem L", () => {
    const l = codigos("unit_un", { contentSize: 1000, contentUnit: "unit_g" });
    expect(l.sort()).toEqual(["g", "kg", "un"]);
  });

  /* Conteudo invalido nao abre porta nenhuma: e o mesmo que nao ter conteudo. */
  it("contentSize zero, negativo ou sem unidade nao vale", () => {
    expect(codigos("unit_un", { contentSize: 0, contentUnit: "unit_ml" })).toEqual(["un"]);
    expect(codigos("unit_un", { contentSize: -5, contentUnit: "unit_ml" })).toEqual(["un"]);
    expect(unidadesCompativeis({ baseUnitId: "unit_un", contentSize: 900 }, UNIDADES).map((u) => u.code)).toEqual(["un"]);
    expect(unidadesCompativeis({ baseUnitId: "unit_un", contentUnit: "unit_ml" }, UNIDADES).map((u) => u.code)).toEqual(["un"]);
  });

  it("conteudo apontando para unidade inexistente nao abre porta", () => {
    expect(codigos("unit_un", { contentSize: 900, contentUnit: "unit_fantasma" })).toEqual(["un"]);
  });

  /* Um item por MEDIDA nao ganha nada com conteudo: kg ja fala com g. */
  it("base kg com conteudo em g continua oferecendo kg e g", () => {
    expect(codigos("unit_kg", { contentSize: 1000, contentUnit: "unit_g" }).sort()).toEqual(["g", "kg"]);
  });

  it("unidadeEhCompativel enxerga o conteudo", () => {
    const oleo = { baseUnitId: "unit_un", ...OLEO };
    expect(unidadeEhCompativel("unit_ml", oleo, UNIDADES)).toBe(true);
    expect(unidadeEhCompativel("unit_l", oleo, UNIDADES)).toBe(true);
    expect(unidadeEhCompativel("unit_un", oleo, UNIDADES)).toBe(true);
    expect(unidadeEhCompativel("unit_g", oleo, UNIDADES)).toBe(false);
    expect(unidadeEhCompativel("unit_kg", oleo, UNIDADES)).toBe(false);
  });

  it("ovos (un, sem conteudo) continuam so com un", () => {
    const ovos = { baseUnitId: "unit_un" };
    expect(unidadeEhCompativel("unit_un", ovos, UNIDADES)).toBe(true);
    expect(unidadeEhCompativel("unit_ml", ovos, UNIDADES)).toBe(false);
    expect(unidadeEhCompativel("unit_kg", ovos, UNIDADES)).toBe(false);
  });
});

describe("unidadeEhCompativel — a pergunta que o servidor faz", () => {
  const casos: Array<[string, string, boolean]> = [
    ["unit_g", "unit_kg", true],
    ["unit_kg", "unit_kg", true],
    ["unit_kg", "unit_g", true],
    ["unit_ml", "unit_l", true],
    ["unit_l", "unit_l", true],
    ["unit_l", "unit_ml", true],
    ["unit_un", "unit_un", true],
    // As combinacoes que precisam ser impossiveis.
    ["unit_ml", "unit_kg", false],
    ["unit_un", "unit_kg", false],
    ["unit_g", "unit_l", false],
    ["unit_un", "unit_l", false],
    ["unit_kg", "unit_un", false],
    ["unit_l", "unit_un", false],
  ];

  for (const [ficha, base, esperado] of casos) {
    it(`${ficha} numa base ${base} → ${esperado ? "aceito" : "recusado"}`, () => {
      expect(unidadeEhCompativel(ficha, { baseUnitId: base }, UNIDADES)).toBe(esperado);
    });
  }
});

describe("gerarSlugDeProduto — uma formula so", () => {
  it("tira acento e troca o resto por hifen", () => {
    expect(gerarSlugDeProduto("Pão de Açúcar")).toBe("pao-de-acucar");
    expect(gerarSlugDeProduto("Açaí 500ml")).toBe("acai-500ml");
    expect(gerarSlugDeProduto("X-Búrguer  Especial")).toBe("x-burguer-especial");
  });

  it("nao deixa hifen sobrando nas pontas", () => {
    expect(gerarSlugDeProduto("  Coxinha!  ")).toBe("coxinha");
    expect(gerarSlugDeProduto("--Pizza--")).toBe("pizza");
  });

  /*
   * Nome so de simbolos nao produz endereco. Quem chama precisa recusar antes
   * de gravar, apontando para o campo que a pessoa consegue editar.
   */
  it("nome sem letra nem numero produz slug vazio, e isso e detectavel", () => {
    expect(gerarSlugDeProduto("★★★")).toBe("");
    expect(slugVazio(gerarSlugDeProduto("★★★"))).toBe(true);
    expect(slugVazio(gerarSlugDeProduto("Pizza"))).toBe(false);
  });

  it("e estavel: o mesmo nome sempre da o mesmo endereco", () => {
    expect(gerarSlugDeProduto("Pão de Açúcar")).toBe(gerarSlugDeProduto("PÃO DE AÇÚCAR"));
  });
});

describe("mensagemDeSlugDuplicado", () => {
  it("traduz o P2002 no formato classico (meta.target)", () => {
    const erro = { code: "P2002", meta: { target: ["storeId", "slug"] } };
    expect(mensagemDeSlugDuplicado(erro)).toMatch(/já existe um produto com esse nome/i);
  });

  /*
   * A FORMA QUE ESTE PROJETO REALMENTE PRODUZ.
   *
   * Com o adaptador `pg`, o Prisma nao preenche `meta.target`: manda
   * `meta.driverAdapterError.cause`. A primeira versao da funcao olhava so
   * `target`, devolvia null para toda colisao real, e o erro cru continuava
   * vazando — o oposto do que ela existe para fazer. Quem mostrou foi o teste
   * de integracao; ler o codigo nao mostraria.
   */
  it("traduz o P2002 no formato do adaptador de driver", () => {
    const erro = {
      code: "P2002",
      meta: {
        modelName: "Product",
        driverAdapterError: {
          cause: {
            originalMessage:
              'duplicate key value violates unique constraint "Product_storeId_slug_key"',
            constraint: { fields: ['"storeId"', "slug"] },
          },
        },
      },
    };
    expect(mensagemDeSlugDuplicado(erro)).toMatch(/já existe um produto com esse nome/i);
  });

  it("nao sequestra a violacao de outro indice no formato do adaptador", () => {
    const erro = {
      code: "P2002",
      meta: {
        driverAdapterError: {
          cause: {
            originalMessage:
              'duplicate key value violates unique constraint "InventoryItem_storeId_sku_key"',
            constraint: { fields: ['"storeId"', "sku"] },
          },
        },
      },
    };
    expect(mensagemDeSlugDuplicado(erro)).toBeNull();
  });

  /*
   * A mesma tabela tem outras uniques. Responder "ja existe um produto com esse
   * nome" para a violacao de outra delas mandaria a lojista renomear um produto
   * cujo nome esta certo.
   */
  it("nao sequestra outras violacoes de unicidade", () => {
    expect(mensagemDeSlugDuplicado({ code: "P2002", meta: { target: ["sku"] } })).toBeNull();
  });

  it("ignora erros que nao sao P2002", () => {
    expect(mensagemDeSlugDuplicado(new Error("qualquer outra coisa"))).toBeNull();
    expect(mensagemDeSlugDuplicado({ code: "P2025" })).toBeNull();
  });
});
