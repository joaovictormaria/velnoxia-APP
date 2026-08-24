import { prisma } from "@/server/db/client";

export const unitConversionRepository = {
  async getConversions(_storeId: string): Promise<Record<string, number>> {
    const conversions = await prisma.inventoryUnitConversion.findMany({
      include: {
        fromUnit: true,
        toUnit: true,
      },
    });

    const result: Record<string, number> = {};
    conversions.forEach((c: any) => {
      const key = `${c.fromUnitId}→${c.toUnitId}`;
      result[key] = Number(c.conversionFactor);
    });

    return result;
  },

  async getConversionFactor(_storeId: string, fromUnitId: string, toUnitId: string): Promise<number | null> {
    if (fromUnitId === toUnitId) return 1;

    const conversion = await prisma.inventoryUnitConversion.findUnique({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId,
          toUnitId,
        },
      },
    });

    return conversion ? Number(conversion.conversionFactor) : null;
  },

  async createConversion(
    _storeId: string,
    fromUnitId: string,
    toUnitId: string,
    conversionFactor: number
  ) {
    return prisma.inventoryUnitConversion.upsert({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId,
          toUnitId,
        },
      },
      update: { conversionFactor },
      create: {
        fromUnitId,
        toUnitId,
        conversionFactor,
      },
    });
  },
};
