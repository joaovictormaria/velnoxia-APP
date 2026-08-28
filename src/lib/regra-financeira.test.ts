import { describe, it, expect } from "vitest";
import {
  apurarPedido,
  coberturaDeApuracao,
  dataDeCompetencia,
  margemApurada,
  receitaDoPedido,
  ticketMedio,
} from "./regra-financeira";

/*
 * As regras financeiras, testadas sem banco.
 *
 * É de propósito que este arquivo não importe Prisma: a regra tem de valer por
 * si, e um teste que precisa de um pedido de verdade para dizer se a margem
 * está certa é um teste que ninguém roda.
 *
 * O fio que liga quase tudo aqui: AUSÊNCIA DE CUSTO NÃO É CUSTO ZERO. Era essa
 * confusão que fazia a tela anunciar lucro de 100% em produto que nunca foi
 * ligado ao estoque.
 */

const linha = (receita: number, ...itens: string[]) => ({
  receita,
  insumos: itens.map((inventoryItemId) => ({ inventoryItemId })),
});
const mov = (inventoryItemId: string, quantidade: number, custoUnitario: number | null) => ({
  inventoryItemId,
  quantidade,
  custoUnitario,
});

describe("apuração linha a linha", () => {
  it("01 · pedido inteiro apurado", () => {
    const r = apurarPedido({
      linhas: [linha(100, "molho")],
      movimentos: [mov("molho", -2, 20)],
    });
    expect(r.apuracao).toBe("APURADO");
    expect(r.receitaApurada).toBe(100);
    expect(r.custoApurado).toBeCloseTo(40, 6);
  });

  it("02 · APURADA + SEM_VINCULO: o pedido NÃO é descartado", () => {
    /*
     * O CENÁRIO QUE DEFINE A REGRA.
     *
     * Produto A R$ 100 com custo R$ 40; produto B R$ 20 sem vínculo de estoque.
     * Descartar o pedido inteiro jogaria fora custo real e afundaria a cobertura
     * sem motivo: a pizza FOI medida. O que sai da margem são os R$ 20 do B.
     *
     * Não é preciso dividir nada para chegar aqui: uma linha sem vínculo não
     * gera movimento nenhum, então todo o custo do pedido já é do A.
     */
    const r = apurarPedido({
      linhas: [linha(100, "molho"), linha(20)],
      movimentos: [mov("molho", -2, 20)],
    });

    expect(r.linhas).toEqual(["APURADO", "SEM_VINCULO"]);
    expect(r.apuracao).toBe("PARCIAL");
    expect(r.receitaDasLinhas).toBe(120);
    expect(r.receitaApurada).toBe(100);
    expect(r.custoApurado).toBeCloseTo(40, 6);
    expect(margemApurada({ receitaApurada: 100, custoApurado: 40 })).toBeCloseTo(60, 6);
    expect(
      coberturaDeApuracao({ receitaApurada: 100, receitaTotal: 120 }),
    ).toBeCloseTo(83.3333, 3);
  });

  it("03 · APURADA + SEM_CUSTO: a linha sem custo sai da receita apurada", () => {
    const r = apurarPedido({
      linhas: [linha(100, "molho"), linha(60, "trufa")],
      movimentos: [mov("molho", -2, 20), mov("trufa", -1, null)],
    });

    expect(r.linhas).toEqual(["APURADO", "SEM_CUSTO"]);
    expect(r.receitaApurada).toBe(100);
    // A trufa não tem custo conhecido: não entra nem no CMV nem na receita.
    expect(r.custoApurado).toBeCloseTo(40, 6);
    expect(r.custoConhecido).toBeCloseTo(40, 6);
  });

  it("04 · insumo COMPARTILHADO entre linha apurada e não apurada entra INTEIRO", () => {
    /*
     * O CASO IMPOSSÍVEL DE DIVIDIR, E A ESCOLHA CONSERVADORA.
     *
     * As duas linhas usam molho. O razão gravou UM movimento de molho, com as
     * quantidades já somadas — não há como saber quanto era de cada linha.
     *
     * O molho entra inteiro (R$ 60) contra a receita de R$ 100 da linha
     * apurada. A margem sai menor do que a real. O erro aponta para o lado
     * seguro: melhor subestimar a margem do que anunciar uma margem alta que
     * não se sustenta.
     */
    const r = apurarPedido({
      linhas: [linha(100, "molho", "queijo"), linha(80, "molho", "trufa")],
      movimentos: [mov("molho", -3, 20), mov("queijo", -1, 10), mov("trufa", -1, null)],
    });

    expect(r.linhas).toEqual(["APURADO", "SEM_CUSTO"]);
    expect(r.receitaApurada).toBe(100);
    expect(r.custoApurado).toBeCloseTo(70, 6); // molho 60 INTEIRO + queijo 10
  });

  it("05 · não há rateio: o custo não é dividido pelo preço nem pela quantidade", () => {
    /*
     * A prova negativa. Se houvesse rateio proporcional ao preço, o molho de
     * R$ 60 se dividiria 100/180 e 80/180, e o custo apurado seria ~43,33.
     * Se fosse por número de linhas, seria 30. O valor tem de ser 60.
     */
    const r = apurarPedido({
      linhas: [linha(100, "molho"), linha(80, "molho", "trufa")],
      movimentos: [mov("molho", -3, 20), mov("trufa", -1, null)],
    });

    const rateioPorPreco = 60 * (100 / 180);
    const rateioPorLinha = 60 / 2;
    expect(r.custoApurado).toBeCloseTo(60, 6);
    expect(r.custoApurado).not.toBeCloseTo(rateioPorPreco, 2);
    expect(r.custoApurado).not.toBeCloseTo(rateioPorLinha, 2);
  });

  it("06 · item usado SÓ por linha não apurada não gera custo", () => {
    // A receita daquela linha ficou de fora; o custo dela tem de ficar junto.
    const r = apurarPedido({
      linhas: [linha(100, "molho"), linha(80, "queijo", "trufa")],
      movimentos: [
        mov("molho", -2, 20),
        mov("queijo", -1, 15),
        mov("trufa", -1, null),
      ],
    });

    expect(r.linhas).toEqual(["APURADO", "SEM_CUSTO"]);
    expect(r.custoApurado).toBeCloseTo(40, 6); // o queijo de R$ 15 NÃO entra
    // Mas o CMV do pedido continua registrando o que saiu de fato.
    expect(r.custoConhecido).toBeCloseTo(55, 6);
  });

  it("07 · as três situações no mesmo pedido", () => {
    const r = apurarPedido({
      linhas: [linha(100, "molho"), linha(50, "trufa"), linha(20)],
      movimentos: [mov("molho", -2, 20), mov("trufa", -1, null)],
    });
    expect(r.linhas).toEqual(["APURADO", "SEM_CUSTO", "SEM_VINCULO"]);
    expect(r.apuracao).toBe("PARCIAL");
    expect(r.receitaDasLinhas).toBe(170);
    expect(r.receitaApurada).toBe(100);
  });

  it("08 · insumo com vínculo mas sem movimento nenhum é SEM_CUSTO", () => {
    // Não é custo zero: é custo que não foi apurado.
    const r = apurarPedido({ linhas: [linha(100, "molho")], movimentos: [] });
    expect(r.linhas).toEqual(["SEM_CUSTO"]);
    expect(r.receitaApurada).toBe(0);
  });

  it("09 · nenhuma linha apurada: o rótulo aponta o problema a resolver primeiro", () => {
    /*
     * Falta de vínculo vence falta de custo. Ligar o produto ao estoque vem
     * antes de precificar o insumo, e é isso que a tela precisa dizer.
     */
    const semVinculo = apurarPedido({
      linhas: [linha(20), linha(50, "trufa")],
      movimentos: [mov("trufa", -1, null)],
    });
    expect(semVinculo.apuracao).toBe("SEM_VINCULO");

    const semCusto = apurarPedido({
      linhas: [linha(50, "trufa")],
      movimentos: [mov("trufa", -1, null)],
    });
    expect(semCusto.apuracao).toBe("SEM_CUSTO");
  });

  it("10 · pedido sem linhas não é venda de nada", () => {
    const r = apurarPedido({ linhas: [], movimentos: [] });
    expect(r.apuracao).toBe("SEM_VINCULO");
    expect(r.receitaApurada).toBe(0);
  });

  it("11 · o sinal do razão não importa para o custo", () => {
    // CONSUMPTION é gravado negativo; o custo não fica negativo por isso.
    const r = apurarPedido({
      linhas: [linha(100, "molho")],
      movimentos: [mov("molho", -2, 5)],
    });
    expect(r.custoApurado).toBeCloseTo(10, 6);
  });

  it("12 · um movimento sem custo contamina o item inteiro", () => {
    /*
     * Somar só a parte conhecida e apresentar como total seria pior do que
     * admitir a ignorância: o número pareceria completo e não estaria.
     */
    const r = apurarPedido({
      linhas: [linha(100, "molho")],
      movimentos: [mov("molho", -2, 5), mov("molho", -3, null)],
    });
    expect(r.linhas).toEqual(["SEM_CUSTO"]);
    expect(r.custoConhecido).toBe(0);
  });
});

describe("receita do pedido", () => {
  it("12 · usa Order.total, que já está líquido de desconto", () => {
    // total = subtotal + deliveryFee − discount, feito em createOrderFromCheckout.
    expect(receitaDoPedido({ total: 47.5 })).toBe(47.5);
  });

  it("13 · estorno é redutor da receita", () => {
    expect(receitaDoPedido({ total: 50, refund: 20 })).toBe(30);
  });

  it("14 · estorno integral zera a receita", () => {
    expect(receitaDoPedido({ total: 50, refund: 50 })).toBe(0);
  });

  it("15 · refund nulo não muda nada", () => {
    expect(receitaDoPedido({ total: 50, refund: null })).toBe(50);
  });
});

describe("margem e cobertura", () => {
  it("16 · margem sobre a receita apurada", () => {
    expect(margemApurada({ receitaApurada: 100, custoApurado: 40 })).toBeCloseTo(60, 6);
  });

  it("17 · margem negativa é possível e não é escondida", () => {
    expect(margemApurada({ receitaApurada: 100, custoApurado: 130 })).toBeCloseTo(-30, 6);
  });

  it("18 · sem receita apurada não há margem — null, não zero", () => {
    /*
     * Zero diria "essa loja não tem margem". Null diz "não dá para saber", que
     * é o que a tela precisa exibir como travessão em vez de 0%.
     */
    expect(margemApurada({ receitaApurada: 0, custoApurado: 0 })).toBeNull();
  });

  it("19 · o denominador é a receita apurada, não a total", () => {
    /*
     * O ERRO QUE ESTE TESTE IMPEDE. Faturou 1000, mas só 100 têm custo medido,
     * e esses 100 custaram 40. A margem é 60% sobre o que se mediu. Dividir por
     * 1000 daria 6% — um número que piora sozinho conforme o cadastro fica
     * incompleto, sem que nada tenha mudado no negócio.
     */
    expect(margemApurada({ receitaApurada: 100, custoApurado: 40 })).toBeCloseTo(60, 6);
    expect(coberturaDeApuracao({ receitaApurada: 100, receitaTotal: 1000 })).toBeCloseTo(10, 6);
  });

  it("20 · cobertura total é 100%", () => {
    expect(coberturaDeApuracao({ receitaApurada: 250, receitaTotal: 250 })).toBeCloseTo(100, 6);
  });

  it("21 · sem faturamento a cobertura é zero, não divisão por zero", () => {
    expect(coberturaDeApuracao({ receitaApurada: 0, receitaTotal: 0 })).toBe(0);
  });
});

describe("ticket médio", () => {
  it("22 · receita dividida por pedidos", () => {
    expect(ticketMedio({ receita: 300, pedidos: 4 })).toBeCloseTo(75, 6);
  });

  it("23 · sem pedidos é zero, sem estourar", () => {
    expect(ticketMedio({ receita: 0, pedidos: 0 })).toBe(0);
  });

  it("24 · é receita por pedido, nunca custo por pedido", () => {
    /*
     * O defeito que originou esta função: o KPI preenchia `averageOrderValue`
     * com `averageCostPerOrder` e a tela exibia isso como "Ticket médio". Numa
     * loja com margem saudável os dois números são muito diferentes, e ninguém
     * percebia porque ambos são "um dinheiro por pedido".
     */
    const receita = 1000;
    const custo = 300;
    const pedidos = 10;
    expect(ticketMedio({ receita, pedidos })).toBe(100);
    expect(ticketMedio({ receita, pedidos })).not.toBe(custo / pedidos);
  });
});

describe("data de competência", () => {
  const criado = new Date("2026-03-31T23:50:00Z");
  const concluido = new Date("2026-04-01T00:10:00Z");

  it("25 · a venda pertence ao dia em que foi concluída", () => {
    expect(dataDeCompetencia({ concluidoEm: concluido, criadoEm: criado })).toBe(concluido);
  });

  it("26 · pedido legado sem histórico cai na data de criação", () => {
    // Só para dados anteriores ao histórico de status. Descartá-los apagaria
    // vendas reais do passado.
    expect(dataDeCompetencia({ concluidoEm: null, criadoEm: criado })).toBe(criado);
  });

  it("27 · o fallback não é o padrão: havendo conclusão, ela vence", () => {
    /*
     * A virada do mês é onde a diferença aparece: por `createdAt` esta venda
     * seria de março, e o fechamento de março mudaria depois de fechado.
     */
    const escolhida = dataDeCompetencia({ concluidoEm: concluido, criadoEm: criado });
    expect(escolhida.getUTCMonth()).toBe(3); // abril
  });
});

describe("produto apagado depois da venda", () => {
  /*
   * O CADASTRO SOME, O HISTÓRICO NÃO PODE SUMIR JUNTO.
   *
   * `prisma.product.delete()` é exclusão de verdade, e é o que o botão do
   * cardápio chama. Ela leva embora os DOIS sinais de vínculo da linha:
   * `productId` vira null, e a ficha técnica é apagada em cascata, deixando
   * `compositionVersionId` null também.
   *
   * Sem tratamento, toda venda passada daquele produto viraria SEM_VINCULO e
   * sairia da margem — a cobertura erodindo sozinha a cada item removido do
   * cardápio, sem nada ter mudado no negócio.
   *
   * O que sobrevive é o razão: se o pedido tem consumo `ORDER` com custo
   * conhecido, alguma coisa dele saiu do estoque. Isso é prova suficiente para
   * UMA linha órfã — e insuficiente para duas, porque aí não há como saber qual
   * delas gastou. Nesse caso não se reconhece nenhuma: é melhor perder
   * cobertura do que fabricar margem.
   */

  const orfa = (receita: number) => ({ receita, insumos: [], orfa: true });

  it("28 · uma linha órfã com consumo custeado é reconhecida", async () => {
    const r = apurarPedido({
      linhas: [orfa(100)],
      movimentos: [mov("molho", -2, 20)],
    });
    expect(r.linhas).toEqual(["APURADO"]);
    expect(r.receitaApurada).toBe(100);
    expect(r.custoApurado).toBeCloseTo(40, 6);
  });

  it("29 · linha órfã SEM consumo nenhum continua sem vínculo", async () => {
    // Nada saiu do estoque: não há o que reconhecer, e inventar custo zero
    // devolveria a margem de 100% pela porta dos fundos.
    const r = apurarPedido({ linhas: [orfa(100)], movimentos: [] });
    expect(r.linhas).toEqual(["SEM_VINCULO"]);
    expect(r.receitaApurada).toBe(0);
  });

  it("30 · linha órfã com consumo de custo DESCONHECIDO não é reconhecida", async () => {
    // Existe consumo, mas ninguém sabe quanto custou. Reconhecer a receita
    // contra custo zero seria exatamente a margem fabricada.
    const r = apurarPedido({
      linhas: [orfa(100)],
      movimentos: [mov("molho", -2, null)],
    });
    expect(r.linhas).toEqual(["SEM_VINCULO"]);
    expect(r.receitaApurada).toBe(0);
  });

  it("31 · DUAS linhas órfãs: nenhuma é reconhecida", async () => {
    /*
     * A TRAVA. Há um consumo de R$ 40 e duas linhas órfãs. Uma delas gastou;
     * a outra talvez nunca tivesse vínculo. Atribuir a ambas infla a margem;
     * atribuir a uma exigiria escolher por preço, quantidade ou posição — e
     * qualquer um desses critérios é invenção.
     *
     * Então nenhuma entra. O pedido perde cobertura, e é esse o preço aceito.
     */
    const r = apurarPedido({
      linhas: [orfa(100), orfa(80)],
      movimentos: [mov("molho", -2, 20)],
    });
    expect(r.linhas).toEqual(["SEM_VINCULO", "SEM_VINCULO"]);
    expect(r.receitaApurada).toBe(0);
    expect(r.custoApurado).toBe(0);
    // O CMV do pedido continua registrando o que de fato saiu.
    expect(r.custoConhecido).toBeCloseTo(40, 6);
  });

  it("32 · TRÊS linhas órfãs também não são reconhecidas", async () => {
    const r = apurarPedido({
      linhas: [orfa(30), orfa(30), orfa(40)],
      movimentos: [mov("molho", -1, 20)],
    });
    expect(r.linhas).toEqual(["SEM_VINCULO", "SEM_VINCULO", "SEM_VINCULO"]);
    expect(r.receitaApurada).toBe(0);
  });

  it("33 · nenhuma heurística de preço, quantidade ou posição", async () => {
    /*
     * A prova negativa da trava. Se houvesse escolha por maior preço, a linha
     * de 100 seria reconhecida; por posição, a primeira. Nenhuma das duas pode
     * acontecer.
     */
    const r = apurarPedido({
      linhas: [orfa(100), orfa(1)],
      movimentos: [mov("molho", -2, 20)],
    });
    expect(r.receitaApurada).not.toBe(100);
    expect(r.receitaApurada).not.toBe(1);
    expect(r.receitaApurada).toBe(0);
  });

  it("34 · uma órfã ao lado de uma linha vinculada normal", async () => {
    // A vinculada segue a regra de sempre; a órfã, sendo única, é reconhecida.
    const r = apurarPedido({
      linhas: [linha(100, "molho"), orfa(50)],
      movimentos: [mov("molho", -2, 20)],
    });
    expect(r.linhas).toEqual(["APURADO", "APURADO"]);
    expect(r.receitaApurada).toBe(150);
  });

  it("35 · uma órfã ao lado de produto VIVO sem vínculo", async () => {
    /*
     * A linha do produto vivo sem `inventoryItemId` não é órfã — o cadastro
     * está lá e diz que ela nunca desceu ao estoque. Ela segue SEM_VINCULO, e
     * isso não impede a órfã de ser reconhecida: continua havendo uma só.
     */
    const r = apurarPedido({
      linhas: [orfa(100), linha(40)],
      movimentos: [mov("molho", -2, 20)],
    });
    expect(r.linhas).toEqual(["APURADO", "SEM_VINCULO"]);
    expect(r.receitaApurada).toBe(100);
  });

  it("36 · produto VIVO sem vínculo continua SEM_VINCULO", async () => {
    // A regra do caso A não afrouxa: aqui não há órfã nenhuma.
    const r = apurarPedido({ linhas: [linha(100)], movimentos: [mov("molho", -2, 20)] });
    expect(r.linhas).toEqual(["SEM_VINCULO"]);
    expect(r.receitaApurada).toBe(0);
  });

  it("37 · linha vinculada com custo nulo segue SEM_CUSTO, não vira órfã", async () => {
    const r = apurarPedido({
      linhas: [linha(100, "trufa")],
      movimentos: [mov("trufa", -1, null)],
    });
    expect(r.linhas).toEqual(["SEM_CUSTO"]);
  });
});
