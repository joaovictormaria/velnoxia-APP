export interface UnitConversion {
  conversionFactor: number;
}

export class UnitConverter {
  private conversions: Map<string, UnitConversion> = new Map();

  constructor(conversions: Record<string, UnitConversion> = {}) {
    Object.entries(conversions).forEach(([key, value]) => {
      this.conversions.set(key, value);
    });
  }

  convert(
    amount: number,
    fromUnitId: string,
    toUnitId: string,
    conversions: Record<string, number> = {}
  ): number {
    if (fromUnitId === toUnitId) {
      return amount;
    }

    const key = `${fromUnitId}→${toUnitId}`;
    if (conversions[key]) {
      return amount * conversions[key];
    }

    return amount;
  }

  canConvert(fromUnitId: string, toUnitId: string, conversions: Record<string, number>): boolean {
    if (fromUnitId === toUnitId) return true;
    const key = `${fromUnitId}→${toUnitId}`;
    return !!conversions[key];
  }
}

export const commonConversions: Record<string, Record<string, number>> = {
  weight: {
    'g→kg': 0.001,
    'kg→g': 1000,
    'mg→g': 0.001,
    'g→mg': 1000,
  },
  volume: {
    'ml→l': 0.001,
    'l→ml': 1000,
    'ml→gal': 0.000264172,
    'gal→ml': 3785.41,
  },
};
