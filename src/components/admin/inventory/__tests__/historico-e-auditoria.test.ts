import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GRAVADO_POSITIVO_MAS_E_SAIDA,
  quantidadeComSinal,
} from "../sinal-do-movimento";

/*
 * O HISTÓRICO DE MOVIMENTAÇÃO — as duas telas que o mesmo componente serve.
 *
 * A primeira parte é o BUG: a tela mostrava "Consumo +0,1" para uma saída de
 * estoque. Isso é teste de verdade, com a função pura. A segunda é a
 * remodelagem, e lê a fonte — o projeto não tem jsdom.
 */

const tela = readFileSync(resolve(__dirname, "../AuditLog.tsx"), "utf8");
const servico = readFileSync(
  resolve(__dirname, "../../../../server/services/inventory-service.ts"),
  "utf8",
);

const semComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("o sinal que a pessoa lê", () => {
  /*
   * O BUG, NA FORMA EXATA EM QUE APARECIA NA TELA.
   *
   * CONSUMPTION é gravado NEGATIVO por quem dá baixa na venda. A tela negava
   * de novo, e a saída virava entrada. Um consumo NUNCA pode ser lido como
   * positivo — é este o teste que a versão anterior falharia.
   */
  it("consumo é saída, e não vira entrada", () => {
    expect(quantidadeComSinal("CONSUMPTION", -0.1)).toBe(-0.1);
    expect(quantidadeComSinal("CONSUMPTION", -7)).toBe(-7);
  });

  /*
   * LOSS É O CONTRÁRIO: gravado POSITIVO, e o serviço é quem aplica o menos.
   * Ler `quantity` cru aqui mostraria "Perda +2".
   */
  it("perda é saída, mesmo gravada positiva", () => {
    expect(quantidadeComSinal("LOSS", 2)).toBe(-2);
    // E não inverte duas vezes se um dia vier já negativa.
    expect(quantidadeComSinal("LOSS", -2)).toBe(-2);
  });

  it("compra, devolução e produção entram", () => {
    expect(quantidadeComSinal("PURCHASE", 30)).toBe(30);
    expect(quantidadeComSinal("RETURN", 3)).toBe(3);
    expect(quantidadeComSinal("PRODUCTION", 8)).toBe(8);
  });

  it("reversão mantém o sinal com que foi gravada", () => {
    expect(quantidadeComSinal("REVERSAL", -7)).toBe(-7);
  });

  /*
   * AJUSTE É O ÚNICO DOS DOIS LADOS: o operador escolhe se soma ou subtrai, e
   * a tela não pode ter opinião sobre isso.
   */
  it("ajuste respeita o sinal do operador", () => {
    expect(quantidadeComSinal("ADJUSTMENT", 5)).toBe(5);
    expect(quantidadeComSinal("ADJUSTMENT", -5)).toBe(-5);
  });

  it("um tipo desconhecido é lido como veio, sem inventar sinal", () => {
    expect(quantidadeComSinal("TIPO_NOVO", 4)).toBe(4);
    expect(quantidadeComSinal("TIPO_NOVO", -4)).toBe(-4);
  });

  it("nulo e lixo não viram NaN na tela", () => {
    expect(quantidadeComSinal("PURCHASE", null)).toBe(0);
    expect(quantidadeComSinal("PURCHASE", undefined)).toBe(0);
    expect(quantidadeComSinal("PURCHASE", "abc")).toBe(0);
  });

  /*
   * ═════════════════════════════════════════════════════════════════════════
   * A ÂNCORA NO SERVIÇO.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Este conjunto existe por causa de UMA linha em `calcularDelta`: LOSS é o
   * único tipo que sai do estoque guardando um número positivo, porque o
   * serviço aplica `-Math.abs(quantity)` na hora de somar.
   *
   * Se alguém uniformizar o serviço — LOSS passando a ser gravado negativo
   * como CONSUMPTION —, esta tela passa a negar uma perda que já é negativa, e
   * "Perda +2" volta pela outra ponta. O teste falha ali, e não seis meses
   * depois, num print.
   */
  it("LOSS ainda é o único que o serviço nega ao aplicar", () => {
    const codigo = semComentarios(servico);
    expect(codigo).toMatch(/case "LOSS":[\s\S]{0,120}-Math\.abs\(quantity\)/);
    expect(GRAVADO_POSITIVO_MAS_E_SAIDA).toEqual(new Set(["LOSS"]));
  });

  it("CONSUMPTION continua sendo aplicado como veio", () => {
    const codigo = semComentarios(servico);
    // Sem `Math.abs` nem menos: o negativo já chega pronto de quem dá a baixa.
    expect(codigo).toMatch(/case "CONSUMPTION":\s*return \{ onHand: quantity \}/);
  });

  /*
   * E a tela não pode ter a regra escrita de novo. Foi assim que ela divergiu:
   * um `["LOSS", "CONSUMPTION"]` digitado à mão, longe do serviço.
   */
  it("a tela não mantém a própria lista de saídas", () => {
    const codigo = semComentarios(tela);
    expect(codigo).toContain('from "./sinal-do-movimento"');
    expect(codigo).not.toMatch(/\["LOSS",\s*"CONSUMPTION"\]/);
    expect(codigo).not.toContain("const isDecrease");
  });
});

describe("a remodelagem das duas telas", () => {
  /*
   * A COLUNA "ITEM" REPETIA O MESMO NOME. Filtrando por um item, a coluna mais
   * larga da tabela — num painel que ocupa dois quintos da largura — carregava
   * vinte vezes o nome que a pessoa acabou de escolher no seletor ao lado.
   */
  it("a coluna do item some quando há só um item", () => {
    expect(tela).toContain("const mostrarItem = !props.itemId;");
    expect(tela).toContain("{mostrarItem && (");
  });

  /*
   * DUAS COLUNAS VIRARAM UMA. "Referência" e "Notas" quase nunca vinham
   * preenchidas juntas, e a tabela gastava duas colunas para exibir dois "—".
   */
  it("referência e nota dividem a coluna de origem", () => {
    expect(tela).toContain(">\n                    Origem\n");
    expect(tela).not.toContain(">Notas<");
  });

  /*
   * RESPONSIVO DE VERDADE, e não `overflow-x` empurrando a tabela para fora.
   * Cinco colunas em 360px quebram o texto em duas letras por linha.
   */
  it("vira lista no celular e tabela a partir de 640px", () => {
    expect(tela).toContain('className="divide-y divide-neutral-100 sm:hidden"');
    expect(tela).toContain('className="hidden sm:block"');
  });

  it("o id longo é truncado, mas continua inteiro no title", () => {
    expect(tela).toContain("truncate font-mono");
    expect(tela).toContain("title={mov.reference}");
  });

  /*
   * Ícone de traço no lugar do emoji — o mesmo conjunto do resto do painel.
   * Emoji muda de desenho em cada sistema e não carrega cor semântica.
   */
  it("não usa mais emoji para o tipo", () => {
    // Sem os comentários: o de cima CITA os emoji que saíram, para explicar
    // por que saíram. A pergunta é sobre o que renderiza.
    expect(semComentarios(tela)).not.toMatch(/🛒|❌|🍽️|📌|↩️/u);
    expect(tela).toContain("icone: ShoppingCart");
    expect(tela).toContain("type LucideIcon");
  });

  /*
   * UM TIPO NOVO NÃO PODE SUMIR DA TELA. O mapa de aparência é uma tabela de
   * apresentação, não a lista de tipos que existem — se o schema ganhar um
   * `TRANSFER`, ele aparece com o próprio nome, e não como linha em branco.
   */
  it("um tipo fora do mapa ainda é exibido", () => {
    expect(tela).toContain("APARENCIA[tipo] ??");
  });

  it("tem estado vazio e esqueleto de carregamento", () => {
    expect(tela).toContain("Nenhuma movimentação ainda");
    expect(tela).toContain("animate-pulse");
  });
});
