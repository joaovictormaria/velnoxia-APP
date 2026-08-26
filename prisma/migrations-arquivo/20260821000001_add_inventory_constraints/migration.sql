-- Migration: 20260821000001_add_inventory_constraints
-- Adiciona constraints de integridade para proteção de dados críticos

-- ============================================================================
-- CONSTRAINT: originalMovementId apenas para REVERSAL
-- ============================================================================

-- Adiciona check: se originalMovementId não é NULL, type deve ser REVERSAL
ALTER TABLE "InventoryMovement"
ADD CONSTRAINT chk_original_movement_only_reversal
CHECK (
  ("originalMovementId" IS NULL) OR ("type" = 'REVERSAL')
);

-- ============================================================================
-- CONSTRAINT: fromUnitId != toUnitId em conversão
-- ============================================================================

ALTER TABLE "InventoryUnitConversion"
ADD CONSTRAINT chk_different_units
CHECK ("fromUnitId" != "toUnitId");

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
