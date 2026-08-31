import { describe, it, expect } from "vitest";
import { quantidade, moeda, custoPorUnidade } from "./formato";

/*
 * A tela de estoque mostrava `10.00 un`, `1.00 kg` e `R$ 6.00`: `toFixed(2)`
 * cru, com ponto no lugar da vírgula e duas casas obrigatórias.
 *
 * O risco ao consertar isso é arredondar cedo demais. O óleo custa R$ 0,008889
 * por ml; duas casas o transformariam em R$ 0,01 — os mesmos 12% de erro que a
 * migration de precisão consertou no banco. Formatar não pode desfazer na tela
 * o que se corrigiu na coluna.
 */

/** O espaço do pt-BR em moeda é NBSP, não espaço comum. */
const normal = (s: string) => s.replace(/ /g, " ");

describe("quantidade", () => {
  it("01 · inteiro não ganha casas decimais", () => {
    expect(quantidade(10)).toBe("10");
    expect(quantidade(1)).toBe("1");
    // Era isto que a tela mostrava: "10.00 un".
    expect(quantidade(10)).not.toBe("10.00");
  });

  it("02 · fração usa vírgula, não ponto", () => {
    expect(quantidade(1.5)).toBe("1,5");
    expect(quantidade(0.24)).toBe("0,24");
  });

  it("03 · até quatro casas, que é a precisão do saldo", () => {
    expect(quantidade(0.1222)).toBe("0,1222");
    expect(quantidade(9.7)).toBe("9,7");
  });

  it("04 · milhar com separador brasileiro", () => {
    expect(quantidade(1500)).toBe("1.500");
  });

  it("05 · zero, nulo e lixo não quebram a tela", () => {
    expect(quantidade(0)).toBe("0");
    expect(quantidade(null)).toBe("0");
    expect(quantidade(undefined)).toBe("0");
    expect(quantidade(NaN)).toBe("0");
  });

  /*
   * AS OITO CASAS DO SALDO, E QUANDO ELAS APARECEM.
   *
   * O saldo é gravado em DECIMAL(19,8) porque o estoque por conteúdo de
   * embalagem produz dízima. Mostrar oito casas sempre encheria a lista de
   * `1.500,12345678`; mostrar quatro sempre tinha um caso pior que feio, e é o
   * do teste 5.4.
   */
  it("5.1 · saldo com dízima continua legível em quatro casas", () => {
    // 6 garrafas menos 40/900: a distorção de exibir 5,9556 é de 0,0000001%.
    expect(quantidade(5.95555556)).toBe("5,9556");
    expect(quantidade(1500.12345678)).toBe("1.500,1235");
  });

  it("5.2 · consumo de 40 ml numa garrafa de 900 ml", () => {
    // 0,0444 distorce 0,1% — abaixo do limiar, então as quatro bastam.
    expect(quantidade(0.04444444)).toBe("0,0444");
  });

  it("5.3 · consumo de 1 ml abre as oito casas", () => {
    // 0,0011 distorceria 1%: acima do limiar de meio por cento.
    expect(quantidade(0.00111111)).toBe("0,00111111");
    expect(quantidade(0.00111111)).not.toBe("0,0011");
  });

  /*
   * O caso que motivou a mudança: a tela dizia que o estoque tinha acabado
   * quando ainda havia saldo. Um número que existe nunca pode virar "0".
   */
  it("5.4 · saldo minúsculo NUNCA aparece como zero", () => {
    expect(quantidade(0.00000556)).toBe("0,00000556");
    expect(quantidade(0.00000556)).not.toBe("0");
    expect(quantidade(0.00000001)).not.toBe("0");
  });

  it("5.5 · negativo também não é engolido", () => {
    expect(quantidade(-0.00000556)).toBe("-0,00000556");
    expect(quantidade(-2.5)).toBe("-2,5");
  });

  it("5.6 · zeros à direita continuam aparados", () => {
    expect(quantidade(0.1)).toBe("0,1");
    expect(quantidade(0.10000000)).toBe("0,1");
    expect(quantidade(2.5000)).toBe("2,5");
    expect(quantidade(6.0)).toBe("6");
  });

  /*
   * Oito é o teto porque é a escala da coluna. O que vem depois é ruído de
   * ponto flutuante, e mostrá-lo seria inventar precisão que o banco não tem.
   */
  it("5.7 · nunca passa de oito casas", () => {
    const texto = quantidade(1 / 3);
    const casas = texto.split(",")[1]?.length ?? 0;
    expect(casas).toBeLessThanOrEqual(8);
  });
});

describe("moeda", () => {
  it("06 · valor comum tem duas casas", () => {
    expect(normal(moeda(6))).toBe("R$ 6,00");
    expect(normal(moeda(9.71))).toBe("R$ 9,71");
  });

  it("07 · custo abaixo de um centavo NÃO é arredondado", () => {
    // O óleo: R$ 8,00 a garrafa de 900 ml.
    const texto = normal(moeda(8 / 900));
    expect(texto).toBe("R$ 0,008889");
    // O erro que este teste existe para impedir:
    expect(texto).not.toBe("R$ 0,01");
  });

  it("08 · chocolate: R$ 8,00 ÷ 700 g", () => {
    expect(normal(moeda(8 / 700))).toBe("R$ 0,011429");
  });

  it("09 · abaixo da precisão da coluna, o valor é zero mesmo", () => {
    /*
     * `cost` é DECIMAL(15,6): um centésimo de milionésimo não existe no banco.
     * O Intl não enche de zeros até o máximo — cai para o mínimo — e "R$ 0,00"
     * é a leitura honesta de algo que a coluna nem consegue guardar.
     */
    expect(normal(moeda(0.0000001))).toBe("R$ 0,00");
    // Mas o que a coluna GUARDA continua aparecendo inteiro:
    expect(normal(moeda(0.000001))).toBe("R$ 0,000001");
  });

  it("10 · acima de um centavo, duas casas bastam", () => {
    // R$ 4,166667/L aparece como R$ 4,17; o número cheio fica no banco.
    expect(normal(moeda(25 / 6))).toBe("R$ 4,17");
  });

  it("11 · zero é zero, não travessão", () => {
    expect(normal(moeda(0))).toBe("R$ 0,00");
  });

  it("12 · valor ausente vira travessão", () => {
    expect(moeda(NaN)).toBe("—");
    expect(moeda("abc")).toBe("—");
  });
});

describe("custoPorUnidade", () => {
  it("13 · junta o valor com a unidade que ele mede", () => {
    expect(normal(custoPorUnidade(6, "kg"))).toBe("R$ 6,00 / kg");
    expect(normal(custoPorUnidade(9.71, "un"))).toBe("R$ 9,71 / un");
  });

  it("14 · preserva a precisão do custo pequeno", () => {
    expect(normal(custoPorUnidade(8 / 900, "ml"))).toBe("R$ 0,008889 / ml");
  });

  it("15 · sem custo, travessão — e não R$ 0,00", () => {
    /*
     * A diferença importa: "não sei quanto custa" e "custa zero" são coisas
     * diferentes, e o custo da ficha já trata a primeira deixando o insumo
     * fora da soma em vez de somar zero.
     */
    expect(custoPorUnidade(null, "kg")).toBe("—");
    expect(custoPorUnidade(undefined, "kg")).toBe("—");
  });

  it("16 · sem unidade, mostra só o valor", () => {
    expect(normal(custoPorUnidade(6, null))).toBe("R$ 6,00");
  });
});
