import { prisma } from "@/server/db/client";
import { Decimal } from "@prisma/client/runtime/library";

export const inventoryUnitRepository = {
  /**
   * Get all units (global, not store-scoped)
   */
  async findAll() {
    return prisma.inventoryUnit.findMany({
      orderBy: [{ system: "asc" }, { code: "asc" }],
    });
  },

  /**
   * Find unit by code (e.g., "kg", "ml", "un")
   */
  async findByCode(code: string) {
    return prisma.inventoryUnit.findUnique({
      where: { code },
    });
  },

  /**
   * Find unit by ID
   */
  async findById(id: string) {
    return prisma.inventoryUnit.findUnique({
      where: { id },
    });
  },

  /**
   * Get all units in a system (WEIGHT, VOLUME, COUNT, LENGTH)
   */
  async findBySystem(system: string) {
    return prisma.inventoryUnit.findMany({
      where: { system },
      orderBy: { code: "asc" },
    });
  },

  /**
   * Find conversion factor between two units
   * Returns factor to convert FROM unit TO unit
   * E.g., convertFactor("kg", "g") returns 1000
   */
  async getConversionFactor(
    fromUnitId: string,
    toUnitId: string
  ): Promise<Decimal | null> {
    if (fromUnitId === toUnitId) {
      return new Decimal(1);
    }

    const conversion = await prisma.inventoryUnitConversion.findUnique({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId,
          toUnitId,
        },
      },
    });

    return conversion?.conversionFactor ?? null;
  },

  /**
   * Convert quantity from one unit to another
   * Returns null if conversion is not possible
   */
  async convertQuantity(
    fromUnitId: string,
    toUnitId: string,
    quantity: Decimal | number
  ): Promise<Decimal | null> {
    const factor = await this.getConversionFactor(fromUnitId, toUnitId);
    if (factor === null) {
      return null;
    }

    const decimalQty =
      quantity instanceof Decimal ? quantity : new Decimal(quantity);
    return decimalQty.mul(factor);
  },

  /**
   * Get all conversions from a unit
   */
  async findConversionsFrom(fromUnitId: string) {
    return prisma.inventoryUnitConversion.findMany({
      where: { fromUnitId },
      include: { toUnit: true },
    });
  },

  /**
   * Get all conversions to a unit
   */
  async findConversionsTo(toUnitId: string) {
    return prisma.inventoryUnitConversion.findMany({
      where: { toUnitId },
      include: { fromUnit: true },
    });
  },
};
