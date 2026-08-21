-- Migration: 20260821000000_inventory_foundation
-- Fase 1: Modelagem e Unidades de Medida para Estoque & Produção
--
-- Cria estrutura base de estoque imutável com histórico completo
-- Implementa princípio: saldo atual é estado derivado de movimentações

-- ============================================================================
-- LIMPAR TABELAS EXISTENTES (se houver residuo de tentativa anterior)
-- ============================================================================

DROP TABLE IF EXISTS "CompositionItem" CASCADE;
DROP TABLE IF EXISTS "InventoryMovement" CASCADE;
DROP TABLE IF EXISTS "ProductComposition" CASCADE;
DROP TABLE IF EXISTS "InventoryItem" CASCADE;
DROP TABLE IF EXISTS "InventoryUnitConversion" CASCADE;
DROP TABLE IF EXISTS "InventoryUnit" CASCADE;

DROP TYPE IF EXISTS "InventoryMovementType";
DROP TYPE IF EXISTS "InventoryUnitSystem";

-- ============================================================================
-- CRIAR ENUMS
-- ============================================================================

CREATE TYPE "InventoryUnitSystem" AS ENUM ('WEIGHT', 'VOLUME', 'COUNT', 'LENGTH', 'CUSTOM');

CREATE TYPE "InventoryMovementType" AS ENUM (
  'PURCHASE',
  'RESERVATION',
  'CONSUMPTION',
  'PRODUCTION',
  'LOSS',
  'ADJUSTMENT',
  'RETURN',
  'REVERSAL'
);

-- ============================================================================
-- TABELA: InventoryUnit
-- ============================================================================

CREATE TABLE "InventoryUnit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "system" "InventoryUnitSystem" NOT NULL,
  "description" TEXT,
  "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "InventoryUnit_system_idx" ON "InventoryUnit"("system");

-- ============================================================================
-- TABELA: InventoryUnitConversion
-- ============================================================================

CREATE TABLE "InventoryUnitConversion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fromUnitId" TEXT NOT NULL,
  "toUnitId" TEXT NOT NULL,
  "conversionFactor" NUMERIC(15, 6) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryUnitConversion_fromUnitId_fkey"
    FOREIGN KEY ("fromUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT,
  CONSTRAINT "InventoryUnitConversion_toUnitId_fkey"
    FOREIGN KEY ("toUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT,
  UNIQUE("fromUnitId", "toUnitId")
);

CREATE INDEX "InventoryUnitConversion_fromUnitId_idx" ON "InventoryUnitConversion"("fromUnitId");
CREATE INDEX "InventoryUnitConversion_toUnitId_idx" ON "InventoryUnitConversion"("toUnitId");

-- ============================================================================
-- TABELA: InventoryItem
-- ============================================================================

CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "barcode" TEXT,
  "itemType" TEXT NOT NULL DEFAULT 'INGREDIENT',
  "baseUnitId" TEXT NOT NULL,

  -- Estado derivado: CACHE de movimentações
  "quantityOnHand" NUMERIC(15, 4) NOT NULL DEFAULT 0,
  "quantityReserved" NUMERIC(15, 4) NOT NULL DEFAULT 0,

  -- Custo unitário
  "cost" NUMERIC(10, 2),

  -- Limites (futuras fases)
  "minimumThreshold" NUMERIC(15, 4),
  "idealQuantity" NUMERIC(15, 4),
  "maximumCapacity" NUMERIC(15, 4),

  -- Status
  "isActive" BOOLEAN NOT NULL DEFAULT true,

  -- Auditoria
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryItem_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE,
  CONSTRAINT "InventoryItem_baseUnitId_fkey"
    FOREIGN KEY ("baseUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT,
  UNIQUE("storeId", "sku"),
  UNIQUE("storeId", "barcode")
);

CREATE INDEX "InventoryItem_storeId_itemType_idx" ON "InventoryItem"("storeId", "itemType");
CREATE INDEX "InventoryItem_storeId_isActive_idx" ON "InventoryItem"("storeId", "isActive");
CREATE INDEX "InventoryItem_storeId_createdAt_idx" ON "InventoryItem"("storeId", "createdAt");

-- ============================================================================
-- TABELA: ProductComposition (RECEITAS VERSIONADAS)
-- ============================================================================

CREATE TABLE "ProductComposition" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,

  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,

  -- Fonte de verdade: quando foi usada primeira vez
  "firstUsedAt" TIMESTAMP(3),

  -- Auxiliar: cache de uso
  "usageCount" INTEGER NOT NULL DEFAULT 0,

  -- Auditoria
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductComposition_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE,
  CONSTRAINT "ProductComposition_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE,
  UNIQUE("productId", "version")
);

CREATE INDEX "ProductComposition_productId_isActive_idx" ON "ProductComposition"("productId", "isActive");
CREATE INDEX "ProductComposition_storeId_createdAt_idx" ON "ProductComposition"("storeId", "createdAt");

-- Partial unique index: apenas uma composição ativa por produto
CREATE UNIQUE INDEX "idx_product_composition_active"
ON "ProductComposition" ("productId")
WHERE "isActive" = true;

-- ============================================================================
-- TABELA: CompositionItem (COMPONENTES DE RECEITAS)
-- ============================================================================

CREATE TABLE "CompositionItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "compositionId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,

  "quantity" NUMERIC(15, 4) NOT NULL,
  "unitId" TEXT NOT NULL,

  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompositionItem_compositionId_fkey"
    FOREIGN KEY ("compositionId") REFERENCES "ProductComposition"("id") ON DELETE CASCADE,
  CONSTRAINT "CompositionItem_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT,
  CONSTRAINT "CompositionItem_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT
);

CREATE INDEX "CompositionItem_compositionId_idx" ON "CompositionItem"("compositionId");
CREATE INDEX "CompositionItem_inventoryItemId_idx" ON "CompositionItem"("inventoryItemId");

-- ============================================================================
-- TABELA: InventoryMovement (HISTÓRICO IMUTÁVEL)
-- ============================================================================

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,

  -- Idempotência
  "idempotencyKey" TEXT NOT NULL UNIQUE,

  -- Item e quantidade
  "itemId" TEXT NOT NULL,
  "type" "InventoryMovementType" NOT NULL,
  "quantity" NUMERIC(15, 4) NOT NULL,
  "unitId" TEXT NOT NULL,

  -- Referência externa
  "reference" TEXT,
  "referenceType" TEXT,

  -- Reversão
  "originalMovementId" TEXT UNIQUE,

  -- Composição (qual receita foi usada)
  "compositionId" TEXT,

  -- Custo histórico
  "costAtTime" NUMERIC(10, 2),

  -- Notas
  "note" TEXT,

  -- Auditoria
  "authorType" TEXT,
  "authorId" TEXT,
  "authorName" TEXT,

  -- Timestamps (SEM updatedAt — nunca é editada)
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryMovement_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE,
  CONSTRAINT "InventoryMovement_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT,
  CONSTRAINT "InventoryMovement_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT,
  CONSTRAINT "InventoryMovement_originalMovementId_fkey"
    FOREIGN KEY ("originalMovementId") REFERENCES "InventoryMovement"("id") ON DELETE SET NULL,
  CONSTRAINT "InventoryMovement_compositionId_fkey"
    FOREIGN KEY ("compositionId") REFERENCES "ProductComposition"("id") ON DELETE SET NULL
);

CREATE INDEX "InventoryMovement_storeId_createdAt_idx" ON "InventoryMovement"("storeId", "createdAt");
CREATE INDEX "InventoryMovement_storeId_itemId_idx" ON "InventoryMovement"("storeId", "itemId");
CREATE INDEX "InventoryMovement_storeId_type_idx" ON "InventoryMovement"("storeId", "type");
CREATE INDEX "InventoryMovement_reference_idx" ON "InventoryMovement"("reference");
CREATE INDEX "InventoryMovement_compositionId_idx" ON "InventoryMovement"("compositionId");
CREATE INDEX "InventoryMovement_originalMovementId_idx" ON "InventoryMovement"("originalMovementId");

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
