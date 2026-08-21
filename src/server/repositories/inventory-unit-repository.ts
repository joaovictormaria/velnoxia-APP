import { prisma } from "@/server/db/client";

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
  ): Promise<number | null> {
    if (fromUnitId === toUnitId) {
      return 1;
    }

    const conversion = await prisma.inventoryUnitConversion.findUnique({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId,
          toUnitId,
        },
      },
    });

    return conversion?.conversionFactor ? Number(conversion.conversionFactor) : null;
  },

  /**
   * Convert quantity from one unit to another
   * Returns null if conversion is not possible
   */
  async convertQuantity(
    fromUnitId: string,
    toUnitId: string,
    quantity: number
  ): Promise<number | null> {
    const factor = await this.getConversionFactor(fromUnitId, toUnitId);
    if (factor === null) {
      return null;
    }

    return quantity * factor;
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

  /**
   * Deactivate a unit (logical delete)
   * Protects built-in units from being deactivated
   */
  async deactivateUnit(unitId: string) {
    const unit = await this.findById(unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }

    if (unit.isBuiltIn) {
      throw new Error("Cannot deactivate built-in unit");
    }

    return prisma.inventoryUnit.update({
      where: { id: unitId },
      data: { isBuiltIn: false }, // Mark as deactivated
    });
  },

  /**
   * Create a conversion with validation
   * Ensures:
   * - fromUnitId !== toUnitId
   * - Both units exist
   * - Both units in same system
   */
  async createConversion(
    fromUnitId: string,
    toUnitId: string,
    conversionFactor: number
  ) {
    // Validação 1: Unidades diferentes
    if (fromUnitId === toUnitId) {
      throw new Error("Cannot create conversion from a unit to itself");
    }

    // Validação 2: Unidades existem
    const [fromUnit, toUnit] = await Promise.all([
      this.findById(fromUnitId),
      this.findById(toUnitId),
    ]);

    if (!fromUnit) {
      throw new Error(`fromUnit not found: ${fromUnitId}`);
    }
    if (!toUnit) {
      throw new Error(`toUnit not found: ${toUnitId}`);
    }

    // Validação 3: Mesmo sistema
    if (fromUnit.system !== toUnit.system) {
      throw new Error(
        `Cannot convert between different systems: ${fromUnit.system} and ${toUnit.system}`
      );
    }

    // Verificar conversão inversa já existe (evitar duplicação)
    const existingReverse = await prisma.inventoryUnitConversion.findUnique({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId: toUnitId,
          toUnitId: fromUnitId,
        },
      },
    });

    if (existingReverse) {
      throw new Error("Reverse conversion already exists");
    }

    // Criar conversão
    return prisma.inventoryUnitConversion.create({
      data: {
        fromUnitId,
        toUnitId,
        conversionFactor,
      },
      include: { fromUnit: true, toUnit: true },
    });
  },
};
