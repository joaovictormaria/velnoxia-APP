import type { EmployeeBenefitType, EmployeeLimitMode } from "@prisma/client";

/**
 * O cálculo do benefício do funcionário, sem banco nenhum.
 *
 * Puro de propósito: a prévia do carrinho e o pedido de verdade precisam
 * chegar ao mesmo número, e a única forma de garantir isso é os dois chamarem
 * esta função com os mesmos dados. Se a conta morasse dentro do checkout, a
 * prévia teria de reimplementá-la, e as duas divergiriam no primeiro ajuste de
 * regra — o funcionário veria um desconto na tela e pagaria outro.
 */

export type RegraDeBeneficio = {
  categoryId: string | null;
  productId: string | null;
  type: EmployeeBenefitType;
  value: number;
  dailyLimit: number | null;
};

export type PlanoDeBeneficio = {
  name: string;
  defaultType: EmployeeBenefitType;
  defaultValue: number;
  limitMode: EmployeeLimitMode;
  limitValue: number | null;
  rules: RegraDeBeneficio[];
};

export type LinhaParaBeneficio = {
  productId: string;
  categoryId: string;
  /**
   * Preço cheio de uma unidade, sem adicionais. O benefício não toca nos
   * adicionais: bacon e borda recheada são escolha de quem pede, não refeição
   * da casa, e um preço de funcionário só faz sentido sobre o item em si.
   */
  unitPrice: number;
  quantity: number;
};

/** O que o funcionário já gastou da cota hoje, lido dos pedidos dele. */
export type UsoDoDia = {
  /** Unidades que entraram na cota. */
  itens: number;
  /** Valor de cardápio (preço cheio) já consumido com benefício. */
  valor: number;
  /** Unidades por categoria, para o limite por categoria. */
  porCategoria: Record<string, number>;
};

export const USO_ZERADO: UsoDoDia = { itens: 0, valor: 0, porCategoria: {} };

export type BeneficioDaLinha = {
  /** Desconto da linha inteira, já multiplicado pelas unidades beneficiadas. */
  desconto: number;
  /** Quantas unidades da linha couberam na cota. */
  quantidade: number;
};

export type ResultadoDoBeneficio = {
  /** Um item por linha de entrada, na mesma ordem. */
  porLinha: BeneficioDaLinha[];
  descontoTotal: number;
  /** Unidades que teriam desconto mas ficaram de fora por a cota ter acabado. */
  foraDaCota: number;
  cota: {
    modo: EmployeeLimitMode;
    limite: number | null;
    usado: number;
    /** Null quando não há um número único a mostrar (sem limite, ou por categoria). */
    restante: number | null;
  };
  /** Frase curta para o pedido e para a tela, já em português. */
  nota: string;
};

/** A regra que vale para um item: a dele, a da categoria dele, ou o padrão. */
function regraDoItem(
  plano: PlanoDeBeneficio,
  linha: LinhaParaBeneficio,
): { type: EmployeeBenefitType; value: number } {
  const doProduto = plano.rules.find((r) => r.productId === linha.productId);
  if (doProduto) return doProduto;
  const daCategoria = plano.rules.find((r) => r.categoryId === linha.categoryId);
  if (daCategoria) return daCategoria;
  return { type: plano.defaultType, value: plano.defaultValue };
}

/**
 * Quanto sai do preço de UMA unidade.
 *
 * Nunca passa do próprio preço nem sobe o valor: um percentual mal digitado
 * (120%) ou um "preço de funcionário" maior que o de cardápio não podem virar
 * dinheiro devolvido nem um item mais caro para quem trabalha ali.
 */
function descontoUnitario(unitPrice: number, regra: { type: EmployeeBenefitType; value: number }) {
  const bruto =
    regra.type === "PERCENTAGE"
      ? (unitPrice * regra.value) / 100
      : regra.type === "FIXED_AMOUNT"
        ? regra.value
        : regra.type === "FIXED_PRICE"
          ? unitPrice - regra.value
          : 0;
  return Math.min(Math.max(bruto, 0), unitPrice);
}

/** O teto diário daquela categoria, quando o plano conta a cota por categoria. */
function limiteDaCategoria(plano: PlanoDeBeneficio, categoryId: string): number | null {
  return plano.rules.find((r) => r.categoryId === categoryId)?.dailyLimit ?? null;
}

const dinheiro = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const centavos = (v: number) => Math.round(v * 100) / 100;

export function calcularBeneficio(
  plano: PlanoDeBeneficio,
  linhas: LinhaParaBeneficio[],
  uso: UsoDoDia,
): ResultadoDoBeneficio {
  const porLinha: BeneficioDaLinha[] = linhas.map(() => ({ desconto: 0, quantidade: 0 }));

  let itensUsados = uso.itens;
  let valorUsado = uso.valor;
  const porCategoria = { ...uso.porCategoria };

  /*
   * Da maior economia para a menor. Quando a cota não cobre o carrinho inteiro,
   * ela tem de valer onde rende mais para o funcionário — pela ordem do
   * carrinho, um refrigerante colocado primeiro comeria a cota que faria falta
   * no prato. O índice desempata para o resultado não depender da ordenação.
   */
  const candidatos = linhas
    .map((linha, index) => ({
      index,
      linha,
      porUnidade: descontoUnitario(linha.unitPrice, regraDoItem(plano, linha)),
    }))
    .filter((c) => c.porUnidade > 0)
    .sort((a, b) => b.porUnidade - a.porUnidade || a.index - b.index);

  let foraDaCota = 0;

  for (const { index, linha, porUnidade } of candidatos) {
    const tetoCategoria = limiteDaCategoria(plano, linha.categoryId);

    for (let unidade = 0; unidade < linha.quantity; unidade++) {
      const cabe =
        plano.limitMode === "NONE"
          ? true
          : plano.limitMode === "ITEMS_PER_DAY"
            ? plano.limitValue === null || itensUsados < plano.limitValue
            : plano.limitMode === "AMOUNT_PER_DAY"
              ? plano.limitValue === null || valorUsado + linha.unitPrice <= plano.limitValue
              : // PER_CATEGORY: sem regra de categoria, aquela categoria não tem teto.
                tetoCategoria === null || (porCategoria[linha.categoryId] ?? 0) < tetoCategoria;

      if (!cabe) {
        // As unidades restantes desta linha custam o mesmo, então nenhuma
        // caberia: o resto da linha vai por preço cheio.
        foraDaCota += linha.quantity - unidade;
        break;
      }

      itensUsados += 1;
      valorUsado += linha.unitPrice;
      porCategoria[linha.categoryId] = (porCategoria[linha.categoryId] ?? 0) + 1;

      porLinha[index]!.desconto += porUnidade;
      porLinha[index]!.quantidade += 1;
    }
  }

  for (const l of porLinha) l.desconto = centavos(l.desconto);
  const descontoTotal = centavos(porLinha.reduce((s, l) => s + l.desconto, 0));

  const usado = plano.limitMode === "AMOUNT_PER_DAY" ? centavos(valorUsado) : itensUsados;
  const restante =
    plano.limitValue === null || plano.limitMode === "NONE" || plano.limitMode === "PER_CATEGORY"
      ? null
      : Math.max(centavos(plano.limitValue - usado), 0);

  const partes = [`Plano ${plano.name}`];
  if (descontoTotal > 0) {
    const unidades = porLinha.reduce((s, l) => s + l.quantidade, 0);
    partes.push(`${dinheiro(descontoTotal)} em ${unidades} ${unidades === 1 ? "item" : "itens"}`);
  }
  if (foraDaCota > 0) {
    partes.push(
      `${foraDaCota} ${foraDaCota === 1 ? "item ficou" : "itens ficaram"} fora da cota do dia`,
    );
  }

  return {
    porLinha,
    descontoTotal,
    foraDaCota,
    cota: { modo: plano.limitMode, limite: plano.limitValue, usado, restante },
    nota: partes.join(" — "),
  };
}

/** Como a cota aparece na tela do funcionário, em uma linha. */
export function descreverCota(cota: ResultadoDoBeneficio["cota"]): string | null {
  if (cota.modo === "NONE" || cota.limite === null) return null;
  if (cota.modo === "AMOUNT_PER_DAY") {
    return `Cota de hoje: ${dinheiro(cota.usado)} de ${dinheiro(cota.limite)}.`;
  }
  if (cota.modo === "ITEMS_PER_DAY") {
    return `Cota de hoje: ${cota.usado} de ${cota.limite} ${cota.limite === 1 ? "item" : "itens"}.`;
  }
  return null;
}
