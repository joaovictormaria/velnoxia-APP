-- Fase 1 do motor de estoque: congelar a receita no pedido, marcar
-- inconsistencia de baixa e proteger a reserva no banco.
--
-- Idempotente pelo mesmo motivo da migration anterior: producao foi baselined
-- como tendo a 0_init sem te-la executado, enquanto uma instalacao nova a
-- executa de verdade. A mesma migration precisa servir aos dois casos.

-- ---------------------------------------------------------------------------
-- 1. A versao da ficha tecnica, congelada no item do pedido.
--
-- Sem isto, publicar uma receita nova entre o pedido e o preparo faz a baixa
-- sair por uma quantidade diferente da que foi reservada — e a diferenca fica
-- reservada para sempre, sem nada que a libere.
-- ---------------------------------------------------------------------------
ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "compositionVersionId" TEXT;

CREATE INDEX IF NOT EXISTS "OrderItem_compositionVersionId_idx"
  ON "OrderItem"("compositionVersionId");

DO $$
BEGIN
  ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_compositionVersionId_fkey"
    FOREIGN KEY ("compositionVersionId") REFERENCES "ProductComposition"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. A marca de inconsistencia de estoque.
--
-- O consumo nao recusa quando falta saldo: o prato ja foi vendido, e a cozinha
-- vai monta-lo de qualquer jeito. Recusar so faria o sistema perder o registro
-- do que aconteceu de verdade. Em vez disso a baixa e gravada, o saldo pode
-- ficar negativo, e fica esta marca para a contagem fisica resolver.
-- ---------------------------------------------------------------------------
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "inventoryInconsistentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inventoryInconsistency"  TEXT;

-- ---------------------------------------------------------------------------
-- 3. A protecao no banco, deliberadamente assimetrica.
--
-- `quantityReserved` NUNCA pode ser negativo: reserva negativa nao significa
-- nada, e so aparece quando uma reversao roda duas vezes. E erro, e o banco
-- recusa.
--
-- `quantityOnHand` PODE ficar negativo, e de proposito. E o registro honesto de
-- que a cozinha usou o que o sistema achava que nao tinha. Bloquear aqui faria
-- a baixa falhar e o estoque parar de refletir a realidade — o pior dos dois
-- mundos. O negativo fica visivel e a contagem fisica acerta.
--
-- Nao existia CHECK nenhum nesta tabela ate aqui, embora o painel ja anuncie
-- "Protecao Automatica": a protecao era so codigo de aplicacao, e uma corrida
-- entre dois pedidos a contornava.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE "InventoryItem"
    ADD CONSTRAINT "InventoryItem_reserva_nao_negativa"
    CHECK ("quantityReserved" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
