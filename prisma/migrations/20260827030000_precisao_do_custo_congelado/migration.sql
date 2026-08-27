-- Precisao do custo congelado no movimento: DECIMAL(10,2) -> DECIMAL(15,6).
--
-- MESMA COLUNA, OUTRO NOME. `InventoryItem.cost` e `InventoryMovement.costAtTime`
-- sao o mesmo conceito: quantos reais vale UMA unidade de estoque. O primeiro
-- diz quanto vale hoje; o segundo diz quanto valia no instante da compra, e nao
-- muda nunca mais. Precisao diferente entre os dois produz um sistema que
-- concorda consigo mesmo no presente e discorda no passado.
--
-- A migration anterior alargou `cost` e deixou este para tras. Sem esta, comprar
-- oleo gravaria R$ 0,008889 no item e R$ 0,01 no movimento -- o item certo, o
-- historico da compra errado, e a diferenca crescendo a cada litro.
--
-- ALARGAR E OPERACAO SEM PERDA, e e a UNICA coisa que acontece aqui. Postgres
-- reescreve a coluna preservando cada valor: R$ 5,00 continua R$ 5,00. Nenhum
-- UPDATE, nenhum recalculo, nenhum backfill. Custo congelado permanece
-- congelado -- e a razao de ele existir.
--
-- ESCOPO: uma coluna. Nao toca em quantidade, saldo, data, nota, chave de
-- idempotencia, OrderItem.unitCost nem em preco de venda nenhum.

ALTER TABLE "InventoryMovement"
  ALTER COLUMN "costAtTime" TYPE DECIMAL(15,6);
