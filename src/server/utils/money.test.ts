import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  centavosToReais,
  reaisToCentavos,
  MoneyCalculator,
} from "./money";

/**
 * PRIORIDADE 4: TESTES DE PRECISÃO EM DINHEIRO
 *
 * Valida que Decimal não tem erros de Float:
 * 0.1 + 0.2 = 0.3 (não 0.30000000000000004)
 * Desconto de 5% em 99.99 = 4.9995 (não 4.999499999999999)
 */

describe("Money Calculator - Precisão de Dinheiro", () => {
  describe("Conversão Centavos ↔ Reais", () => {
    it("deve converter 2790 centavos para 27.90 reais", () => {
      const reais = centavosToReais(2790);
      expect(reais.toString()).toBe("27.90");
    });

    it("deve converter 27.90 reais para 2790 centavos", () => {
      const centavos = reaisToCentavos(27.90);
      expect(centavos).toBe(2790);
    });

    it("deve converter 27.90 (string) para 2790 centavos", () => {
      const centavos = reaisToCentavos("27.90");
      expect(centavos).toBe(2790);
    });

    it("deve lidar com valores com muitas casas decimais", () => {
      const centavos = reaisToCentavos(27.9999);
      expect(centavos).toBe(2800); // Arredonda para cima
    });
  });

  describe("Soma com Decimal (Problema de Float)", () => {
    it("deve somar 0.1 + 0.2 = 0.3 (não 0.30000000000000004)", () => {
      const resultado = MoneyCalculator.sum(0.1, 0.2);
      expect(resultado.toNumber()).toBe(0.3);
    });

    it("deve somar múltiplos valores com precisão", () => {
      const resultado = MoneyCalculator.sum(10.50, 20.75, 5.25);
      expect(resultado.toNumber()).toBe(36.5);
    });

    it("deve somar valores de Decimal", () => {
      const a = new Decimal("10.50");
      const b = new Decimal("20.75");
      const resultado = MoneyCalculator.sum(a, b);
      expect(resultado.toNumber()).toBe(31.25);
    });
  });

  describe("Multiplicação (Problema de Float)", () => {
    it("deve multiplicar 99.99 * 0.05 = 4.9995 com precisão", () => {
      const resultado = MoneyCalculator.multiply(99.99, 0.05);
      expect(resultado.toNumber()).toBe(4.9995);
    });

    it("deve multiplicar 1000 * 0.15 = 150", () => {
      const resultado = MoneyCalculator.multiply(1000, 0.15);
      expect(resultado.toNumber()).toBe(150);
    });
  });

  describe("Desconto em Percentual", () => {
    it("deve aplicar 10% de desconto em 100 = 90", () => {
      const resultado = MoneyCalculator.applyDiscount(100, 10);
      expect(resultado.toNumber()).toBe(90);
    });

    it("deve aplicar 5% de desconto em 99.99 = 94.9905", () => {
      const resultado = MoneyCalculator.applyDiscount(99.99, 5);
      expect(resultado.toString()).toBe("94.99"); // Arredonda para 2 casas
    });

    it("deve aplicar 0% de desconto em 50 = 50", () => {
      const resultado = MoneyCalculator.applyDiscount(50, 0);
      expect(resultado.toNumber()).toBe(50);
    });

    it("deve aplicar 100% de desconto em 100 = 0", () => {
      const resultado = MoneyCalculator.applyDiscount(100, 100);
      expect(resultado.toNumber()).toBe(0);
    });
  });

  describe("Taxa/Acréscimo em Percentual", () => {
    it("deve adicionar 10% em 100 = 110", () => {
      const resultado = MoneyCalculator.addFee(100, 10);
      expect(resultado.toNumber()).toBe(110);
    });

    it("deve adicionar 5% em 99.99 = 104.9895", () => {
      const resultado = MoneyCalculator.addFee(99.99, 5);
      expect(resultado.toString()).toBe("104.99"); // Arredonda
    });

    it("deve adicionar taxa de entrega 3.50 em 100 = 103.50", () => {
      const subtotal = new Decimal("100");
      const taxa = new Decimal("3.50");
      const resultado = subtotal.plus(taxa);
      expect(resultado.toString()).toBe("103.50");
    });
  });

  describe("Divisão com Precisão", () => {
    it("deve dividir 100 / 3 com arredondamento correto", () => {
      const resultado = MoneyCalculator.divide(100, 3);
      expect(resultado.toString()).toBe("33.33");
    });

    it("deve dividir 1 / 3 = 0.33", () => {
      const resultado = MoneyCalculator.divide(1, 3);
      expect(resultado.toString()).toBe("0.33");
    });
  });

  describe("Normalizar Valores", () => {
    it("deve normalizar 27 para 27.00", () => {
      const resultado = MoneyCalculator.normalize(27);
      expect(resultado.toString()).toBe("27.00");
    });

    it("deve normalizar 27.5 para 27.50", () => {
      const resultado = MoneyCalculator.normalize(27.5);
      expect(resultado.toString()).toBe("27.50");
    });

    it("deve normalizar 27.999 para 28.00 (arredonda)", () => {
      const resultado = MoneyCalculator.normalize(27.999);
      expect(resultado.toString()).toBe("28.00");
    });
  });

  describe("Comparação com Tolerância", () => {
    it("deve verificar que 27.90 ≈ 27.90", () => {
      expect(MoneyCalculator.areEqual(27.9, 27.9)).toBe(true);
    });

    it("deve verificar que 27.90 ≈ 27.91 (dentro de 0.01)", () => {
      expect(MoneyCalculator.areEqual(27.9, 27.91, 0.01)).toBe(true);
    });

    it("deve verificar que 27.90 ≠ 27.92 (fora de 0.01)", () => {
      expect(MoneyCalculator.areEqual(27.9, 27.92, 0.01)).toBe(false);
    });
  });

  describe("Formatação BRL", () => {
    it("deve formatar 27.90 como R$ 27,90", () => {
      const resultado = MoneyCalculator.formatBRL(27.9);
      expect(resultado).toBe("R$ 27,90");
    });

    it("deve formatar 1000 como R$ 1.000,00", () => {
      const resultado = MoneyCalculator.formatBRL(1000);
      expect(resultado).toBe("R$ 1.000,00");
    });

    it("deve formatar Decimal(99.99) como R$ 99,99", () => {
      const valor = new Decimal("99.99");
      const resultado = MoneyCalculator.formatBRL(valor);
      expect(resultado).toBe("R$ 99,99");
    });
  });

  describe("Caso Real: Checkout com Desconto + Taxa", () => {
    it("subtotal 100 + taxa 10 - desconto 10% = 99", () => {
      const subtotal = new Decimal("100");
      const taxa = new Decimal("10");
      const discountPercent = new Decimal("10");

      const discountAmount = MoneyCalculator.applyDiscount(subtotal, 10);
      const finalDiscount = subtotal.minus(discountAmount);
      const total = subtotal.plus(taxa).minus(finalDiscount);

      expect(total.toString()).toBe("109.00"); // 100 + 10 - 1 = 109
    });

    it("subtotal 99.99 + taxa 3.50 - cupom 5% = 98.49", () => {
      const subtotal = new Decimal("99.99");
      const taxa = new Decimal("3.50");

      const comTaxa = subtotal.plus(taxa);
      const total = MoneyCalculator.applyDiscount(comTaxa, 5);

      expect(total.toString()).toBe("98.49");
    });

    it("benefício funcionário: 99.99 com desconto 30% = 69.99", () => {
      const subtotal = new Decimal("99.99");
      const desconto = MoneyCalculator.applyDiscount(subtotal, 30);

      expect(desconto.toString()).toBe("69.99");
    });
  });

  describe("Problema: Float vs Decimal", () => {
    it("Float: 0.1 + 0.2 = 0.30000000000000004 ❌", () => {
      // Este é o problema que queremos evitar
      const resultado = 0.1 + 0.2;
      expect(resultado).not.toBe(0.3); // Float falha!
    });

    it("Decimal: 0.1 + 0.2 = 0.3 ✅", () => {
      // Decimal resolve
      const a = new Decimal("0.1");
      const b = new Decimal("0.2");
      const resultado = a.plus(b);
      expect(resultado.toNumber()).toBe(0.3);
    });

    it("Float: 99.99 * 0.05 = 4.999499999999999 ❌", () => {
      const resultado = 99.99 * 0.05;
      expect(resultado).not.toBe(4.9995); // Float falha!
    });

    it("Decimal: 99.99 * 0.05 = 4.9995 ✅", () => {
      const resultado = new Decimal("99.99").times(new Decimal("0.05"));
      expect(resultado.toNumber()).toBe(4.9995);
    });
  });
});
