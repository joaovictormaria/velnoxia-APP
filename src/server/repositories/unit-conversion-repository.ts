import { prisma } from "@/server/db/client";

export const unitConversionRepository = {
  async getConversions(storeId: string): Promise<Record<string, number>> {
    const conversions = await (prisma as any).unitConversion.findMany({
      where: { storeId },
      include: {
        fromUnit: true,
        toUnit: true,
      },
    });

    const result: Record<string, number> = {};
    conversions.forEach((c: any) => {
      const key = `${c.fromUnitId}â†’${c.toUnitId}`;
      result[key] = Number(c.conversionFactor);
    });

    return result;
  },

  async getConversionFactor(storeId: string, fromUnitId: string, toUnitId: string): Promise<number | null> {
    if (fromUnitId === toUnitId) return 1;

    const conversion = await prisma.unitConversion.findUnique({
      where: {
        unique_from_to_store: {
          fromUnitId,
          toUnitId,
          storeId,
        },
      },
    });

    return conversion ? Number(conversion.conversionFactor) : null;
  },

  async createConversion(
    storeId: string,
    fromUnitId: string,
    toUnitId: string,
    conversionFactor: number
  ) {
    return prisma.unitConversion.upsert({
      where: {
        unique_from_to_store: {
          fromUnitId,
          toUnitId,
          storeId,
        },
      },
      update: { conversionFactor },
      create: {
        fromUnitId,
        toUnitId,
        conversionFactor,
        storeId,
      },
    });
  },
};

