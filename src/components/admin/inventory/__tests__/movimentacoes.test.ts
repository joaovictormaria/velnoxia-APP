import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * A ABA DE MOVIMENTAÇÕES.
 *
 * O formulário ocupava um terço da largura — cerca de 250px numa tela comum —,
 * e ali seis campos empilhados apertavam a ponto de o próprio botão de enviar
 * quebrar em duas linhas. O painel ao lado ficava vazio, com uma moldura
 * tracejada e uma frase.
 *
 * Isto é mudança de APRESENTAÇÃO: nenhum estado, handler ou validação mudou.
 * Os testes travam as duas coisas que costumam se perder numa remodelagem —
 * o comportamento e a acessibilidade.
 */

const form = readFileSync(resolve(__dirname, "../MovementForm.tsx"), "utf8");
const tela = readFileSync(
  resolve(__dirname, "../../../../routes/admin/estoque/index.tsx"),
  "utf8",
);
/*
 * 31/08/2026: a classe dos campos saiu daqui para `campos.ts`.
 *
 * Quatro telas do estoque pediam o mesmo campo e cada uma escrevia a própria
 * string — foi assim que divergiram, e por que só esta tinha anel de foco. As
 * asserções abaixo seguem provando o foco visível; mudou onde ele mora.
 */
const estilos = readFileSync(resolve(__dirname, "../campos.ts"), "utf8");

describe("o formulário mantém o que fazia", () => {
  /*
   * OS SEIS CAMPOS CONTINUAM LÁ, ligados ao mesmo estado. Uma remodelagem que
   * derrubasse um campo passaria despercebida até alguém precisar dele.
   */
  it("todos os campos continuam ligados ao mesmo estado", () => {
    for (const campo of [
      "formData.itemId",
      "formData.type",
      "formData.quantity",
      "formData.totalPaid",
      "formData.reference",
      "formData.note",
      "formData.emEmbalagens",
    ]) {
      expect(form, campo).toContain(campo);
    }
  });

  it("o item escolhido continua avisando a tela de fora", () => {
    expect(form).toContain("props.onItemSelected?.(e.target.value)");
  });

  it("as regras condicionais continuam", () => {
    // Valor pago só na compra: perda e ajuste não têm preço.
    expect(form).toContain('formData.type === "PURCHASE" && (');
    // A caixinha de embalagem só quando o item tem embalagem cadastrada.
    expect(form).toContain("podeComprarEmEmbalagens && (");
    // E o botão só habilita com item escolhido.
    expect(form).toContain("disabled={submitting || loading || !formData.itemId}");
  });

  it("a prévia do custo unitário continua sendo mostrada", () => {
    expect(form).toContain("custoUnitario !== null");
    expect(form).toContain("passa a ser o custo");
  });
});

describe("o que a remodelagem corrigiu", () => {
  /*
   * O FOCO VISÍVEL ERA O QUE FALTAVA. Seis campos repetiam a mesma string de
   * classe, e nenhum deles tinha anel de foco — quem navega por teclado não
   * sabia onde estava. Uma classe só, e a correção vale para todos.
   */
  it("os campos compartilham uma classe, com foco visível", () => {
    expect(estilos).toContain("export const campo =");
    expect(estilos).toContain("focus:border-neutral-900");
    expect(form).toContain('} from "./campos"');
    // Nenhum campo carregando a classe antiga solta.
    expect(form).not.toContain('className="w-full px-3 py-2 border rounded bg-white text-foreground"');
  });

  it("o botão de enviar tem foco visível", () => {
    const botao = form.slice(form.lastIndexOf('type="submit"'));
    expect(botao).toContain("focus-visible:outline");
  });

  /*
   * DOIS QUINTOS, e não um terço: era a largura que fazia o rótulo e o botão
   * quebrarem em duas linhas.
   */
  it("o formulário ganhou largura na aba", () => {
    expect(tela).toContain("lg:grid-cols-5");
    expect(tela).toContain('className="lg:col-span-2"');
    expect(tela).toContain('className="lg:relative lg:col-span-3"');
    expect(tela).not.toContain("lg:grid-cols-3 gap-6");
  });

  /*
   * O HISTÓRICO NÃO PASSA DA ALTURA DO FORMULÁRIO.
   *
   * Com 50 movimentos ele descia muito além da coluna da esquerda. O truque é
   * tirar o histórico do fluxo: fora dele, quem define a altura da linha do
   * grid é só o formulário, e o `max-h-full` lê exatamente essa altura — sem
   * número mágico, e sem `items-start`, que era o que deixava ele crescer.
   */
  it("o histórico é limitado à altura do formulário", () => {
    expect(tela).toContain("lg:absolute lg:inset-x-0 lg:top-0 lg:flex lg:max-h-full");
    expect(tela).not.toContain("grid grid-cols-1 items-start gap-6 lg:grid-cols-5");
  });

  it("os campos curtos passaram a dividir a linha", () => {
    expect(form).toContain('className="grid gap-4 sm:grid-cols-2"');
  });

  /*
   * O VAZIO DIZ O QUE FAZER, e não só o que falta.
   */
  it("o painel vazio explica o que aparece ali", () => {
    expect(tela).toContain("Escolha um item ao lado");
    expect(tela).toContain("O histórico dele aparece aqui");
    expect(tela).not.toContain("Selecione um item para ver o histórico");
  });
});

describe("as abas do estoque", () => {
  /*
   * Emoji muda de desenho e de tamanho em cada sistema, e era o único ponto
   * do painel que não usava o mesmo conjunto de ícones do resto.
   */
  it("usam ícones de traço, não emoji", () => {
    expect(tela).toContain("icon: LucideIcon");
    expect(tela).toContain("icon: LayoutDashboard");
    expect(tela).toContain("icon: ArrowLeftRight");
    expect(tela).not.toMatch(/icon: "[^\w\s]/u);
  });

  /*
   * E o cadeado continua vindo do plano — a remodelagem não podia destrancar
   * Preparados nem Receitas de lado nenhum.
   */
  it("a aba paga continua com cadeado, e visível", () => {
    expect(tela).toContain("const trancada = bloqueada(tab.recurso);");
    expect(tela).toContain("const Icone = trancada ? Lock : tab.icon;");
    expect(tela).toContain('{ id: "preparados", label: "Preparados", icon: Soup, recurso: "PRODUCAO" }');
    expect(tela).toContain('{ id: "compositions", label: "Receitas", icon: FlaskConical, recurso: "RECEITAS" }');
  });
});
