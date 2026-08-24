import { Decimal } from "@prisma/client/runtime/library";

/**
 * PRIORIDADE 4: DINHEIRO EM DECIMAL
 *
 * Nunca Float para dinheiro — imprecisão mata.
 * Sempre usar Decimal(centavos) ou centavos como inteiro.
 *
 * Exemplos de ERRO com Float:
 * 0.1 + 0.2 = 0.30000000000000004 ❌
 * 99.99 * 0.05 = 4.999499999999999 ❌
 *
 * Com Decimal:
 * new Decimal('0.1').plus(new Decimal('0.2')) = 0.3 ✅
 * new Decimal('99.99').times(new Decimal('0.05')) = 4.9995 ✅
 */

/**
 * Converter centavos (inteiro) para reais (Decimal)
 * Uso: 2790 centavos → R$ 27,90
 */
export function centavosToReais(centavos: number): Decimal {
  return new Decimal(centavos).dividedBy(100);
}

/**
 * Converter reais (número/string) para centavos (inteiro)
 * Uso: 27.90 ou "27.90" → 2790 centavos
 */
export function reaisToCentavos(reais: number | string): number {
  return Math.round(new Decimal(reais).times(100).toNumber());
}

/**
 * Trabalhar com Decimal diretamente
 * Melhor opção para cálculos complexos
 */
export class MoneyCalculator {
  /**
   * Somar valores de Decimal
   */
  static sum(...values: (Decimal | number)[]): Decimal {
    return values.reduce((acc, val) => {
      const d = val instanceof Decimal ? val : new Decimal(val);
      return acc.plus(d);
    }, new Decimal(0));
  }

  /**
   * Multiplicar (ex: desconto de 10%)
   */
  static multiply(value: Decimal | number, factor: Decimal | number): Decimal {
    const v = value instanceof Decimal ? value : new Decimal(value);
    const f = factor instanceof Decimal ? factor : new Decimal(factor);
    return v.times(f);
  }

  /**
   * Dividir com arredondamento para centavos
   */
  static divide(value: Decimal | number, divisor: Decimal | number): Decimal {
    const v = value instanceof Decimal ? value : new Decimal(value);
    const d = divisor instanceof Decimal ? divisor : new Decimal(divisor);
    return v.dividedBy(d).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  /**
   * Aplicar desconto em percentual
   * Exemplo: desconto(100, 10) = 90 (100 - 10%)
   */
  static applyDiscount(value: Decimal | number, percentOff: Decimal | number): Decimal {
    const v = value instanceof Decimal ? value : new Decimal(value);
    const p = percentOff instanceof Decimal ? percentOff : new Decimal(percentOff);
    const discountAmount = v.times(p).dividedBy(100);
    return v.minus(discountAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  /**
   * Aplicar taxa/acréscimo em percentual
   * Exemplo: addFee(100, 10) = 110 (100 + 10%)
   */
  static addFee(value: Decimal | number, percentAdd: Decimal | number): Decimal {
    const v = value instanceof Decimal ? value : new Decimal(value);
    const p = percentAdd instanceof Decimal ? percentAdd : new Decimal(percentAdd);
    const feeAmount = v.times(p).dividedBy(100);
    return v.plus(feeAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  /**
   * Garantir que é Decimal com 2 casas decimais
   */
  static normalize(value: Decimal | number): Decimal {
    const d = value instanceof Decimal ? value : new Decimal(value);
    return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  /**
   * Comparar valores com tolerância
   * Útil para testes
   */
  static areEqual(a: Decimal | number, b: Decimal | number, tolerance = 0.01): boolean {
    const da = a instanceof Decimal ? a : new Decimal(a);
    const db = b instanceof Decimal ? b : new Decimal(b);
    return da.minus(db).abs().lessThanOrEqualTo(tolerance);
  }

  /**
   * Formatar para exibição em PT-BR
   * Exemplo: Decimal(27.90) → "R$ 27,90"
   */
  static formatBRL(value: Decimal | number): string {
    const d = value instanceof Decimal ? value : new Decimal(value);
    const normalized = d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(normalized.toNumber());
  }
}

/**
 * PADRÃO DE USO:
 *
 * // No banco (Prisma schema):
 * model Order {
 *   id String @id
 *   subtotal Decimal @db.Decimal(10, 2)
 *   deliveryFee Decimal @db.Decimal(10, 2)
 *   discount Decimal @db.Decimal(10, 2)
 *   total Decimal @db.Decimal(10, 2)
 * }
 *
 * // Ao criar pedido:
 * const subtotal = new Decimal(order.subtotal);
 * const deliveryFee = new Decimal(order.deliveryFee);
 * const discount = order.couponCode
 *   ? MoneyCalculator.applyDiscount(subtotal, 10) // 10% off
 *   : new Decimal(0);
 * const total = MoneyCalculator.sum(subtotal, deliveryFee, discount.negated());
 *
 * // Formato para exibição:
 * console.log(MoneyCalculator.formatBRL(total)); // "R$ 127,90"
 *
 * // Em testes:
 * expect(MoneyCalculator.areEqual(result, expected, 0.01)).toBe(true);
 */

/**
 * TIPOS AUXILIARES
 */

export interface MoneyValue {
  centavos: number; // Armazenar internamente em centavos (inteiro)
}

export interface PricedItem {
  price: Decimal;
  quantity: number;
}

/**
 * CONVERSÃO SEGURA
 */

export function toMoneyValue(reais: number | string): MoneyValue {
  return {
    centavos: reaisToCentavos(reais),
  };
}

export function fromMoneyValue(money: MoneyValue): Decimal {
  return centavosToReais(money.centavos);
}
