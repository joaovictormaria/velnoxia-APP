-- M1 -- A ficha tecnica ganha um segundo dono possivel.
--
-- Ate aqui uma ProductComposition pertencia sempre a um Product. Um preparado
-- -- molho, massa, recheio -- nao e um produto: nao esta no cardapio, nao tem
-- preco, nao e vendido. Ele e um InventoryItem que por acaso tem receita.
--
-- Depois desta migration, uma composicao produz OU um Product OU um
-- InventoryItem. Nunca os dois, nunca nenhum. Quem garante e o CHECK, nao a
-- aplicacao: uma regra que so vive no codigo e uma regra que o proximo INSERT
-- de outro caminho ignora.
--
-- ESCRITA A MAO, e nao gerada, por dois motivos:
--   1. O Prisma nao expressa CHECK. Mesmo padrao de `Store_document_coerente`.
--   2. Idempotencia. O banco de producao foi construido por `db push` e teve o
--      `0_init` baselined sem executar -- ProductComposition la nao tem FK
--      nenhuma, embora o schema declare duas. Nao da para assumir que o estado
--      seja o que o schema diz, entao cada passo verifica antes de agir.
--
-- NAO faz parte desta migration: ProductionRun, movimentos de producao,
-- alteracao de itemType, ou qualquer coisa no caminho do pedido.

-- 1. O dono passa a ser opcional dos DOIS lados.
ALTER TABLE "ProductComposition" ALTER COLUMN "productId" DROP NOT NULL;

-- 2. O segundo dono possivel, e o rendimento da receita.
ALTER TABLE "ProductComposition" ADD COLUMN IF NOT EXISTS "inventoryItemId" TEXT;
ALTER TABLE "ProductComposition" ADD COLUMN IF NOT EXISTS "yieldQuantity" DECIMAL(15,4);
ALTER TABLE "ProductComposition" ADD COLUMN IF NOT EXISTS "yieldUnitId" TEXT;

-- 3. Indices.
--
-- O unique de (inventoryItemId, version) e o par do que ja existe para
-- (productId, version). Nao precisam ser PARCIAIS: como o CHECK abaixo garante
-- exatamente um dono nao nulo por linha, cada linha e restringida por
-- exatamente um dos dois, e o lado nulo nao restringe nada -- que e justamente
-- o comportamento desejado, porque NULLs sao distintos entre si em Postgres.
CREATE INDEX IF NOT EXISTS "ProductComposition_inventoryItemId_isActive_idx"
  ON "ProductComposition"("inventoryItemId", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "ProductComposition_inventoryItemId_version_key"
  ON "ProductComposition"("inventoryItemId", "version");

-- 4. Chaves estrangeiras.
--
-- inventoryItemId e CASCADE, nao SET NULL. SET NULL deixaria a linha com os
-- dois donos nulos e o CHECK abaixo abortaria o DELETE -- na pratica um
-- RESTRICT, mas com mensagem de erro enganosa. CASCADE e simetrico ao que
-- productId ja faz: apagar o dono apaga as fichas dele.
--
-- Um preparado usado como insumo de outra receita continua indeletavel, porque
-- CompositionItem.inventoryItemId e RESTRICT. A cascata so alcanca a ficha que
-- o proprio item produz.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductComposition_inventoryItemId_fkey'
  ) THEN
    ALTER TABLE "ProductComposition"
      ADD CONSTRAINT "ProductComposition_inventoryItemId_fkey"
      FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- yieldUnitId e RESTRICT: a unidade e global e compartilhada. Apagar "kg"
-- enquanto uma receita rende em kg tornaria o rendimento ilegivel.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductComposition_yieldUnitId_fkey'
  ) THEN
    ALTER TABLE "ProductComposition"
      ADD CONSTRAINT "ProductComposition_yieldUnitId_fkey"
      FOREIGN KEY ("yieldUnitId") REFERENCES "InventoryUnit"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. O CHECK do dono exclusivo.
--
-- `num_nonnulls` conta argumentos nao nulos e NUNCA devolve NULL. Isso importa:
-- a Fase 1 levou um CHECK que aceitava metade dos casos em silencio porque
-- avaliava para NULL, e Postgres aceita CHECK que da NULL -- so FALSE recusa.
-- Aqui os tres casos sao decididos sem ambiguidade:
--
--   ambos nulos      num_nonnulls = 0  ->  recusa
--   um dono          num_nonnulls = 1  ->  aceita
--   os dois donos    num_nonnulls = 2  ->  recusa
--
-- As linhas existentes tem productId preenchido e inventoryItemId nulo, entao
-- passam sem tratamento de dados.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductComposition_dono_exclusivo'
  ) THEN
    ALTER TABLE "ProductComposition"
      ADD CONSTRAINT "ProductComposition_dono_exclusivo"
      CHECK (num_nonnulls("productId", "inventoryItemId") = 1);
  END IF;
END $$;
