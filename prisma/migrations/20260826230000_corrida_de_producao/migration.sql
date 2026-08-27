-- M2 -- A corrida de producao.
--
-- Uma panela, uma fornada, um lote. Existe uma TABELA para isto, e nao apenas
-- movimentos amarrados por uma string de referencia, porque a corrida e a
-- unidade auditavel: "produzi 3,8 kg de molho as 14h, gastei 5,2 kg de tomate,
-- custou R$ 41,60, deu R$ 10,95/kg" e UM fato. Reconstrui-lo a partir de sete
-- movimentos soltos e possivel e fragil; a reversao precisa de uma alca unica;
-- o historico precisa de algo para listar; e o custo precisa de um lugar para
-- ser congelado.
--
-- ESTA MIGRATION CRIA SO A ESTRUTURA. Nada escreve na tabela ainda -- o motor
-- de producao e a Etapa 5. Ela nasce vazia, e e por isso que este passo e
-- reversivel sem perda de dado.
--
-- ESCRITA A MAO e idempotente pelo mesmo motivo das anteriores: em producao o
-- `0_init` foi baselined sem executar, e tres tabelas do modulo nao tem chave
-- estrangeira nenhuma embora o schema declare. Nao da para assumir que o
-- estado seja o que o schema.prisma diz, entao cada passo confere antes de agir.
--
-- NAO faz parte desta migration: o motor de producao, consumo, reversao,
-- calculo de custo, ciclo de receitas, alteracao no pedido ou UI.

-- 1. A tabela.
CREATE TABLE IF NOT EXISTS "ProductionRun" (
  "id"                      TEXT NOT NULL,
  "storeId"                 TEXT NOT NULL,

  -- A versao CONGELADA da receita, fixada quando a corrida comeca. Mesma
  -- disciplina que OrderItem.compositionVersionId aplica ao pedido: publicar a
  -- v4 no meio da producao nao muda o que esta corrida gastou.
  "compositionId"           TEXT NOT NULL,

  -- O que se pretendia, segundo o rendimento da receita.
  "plannedQuantity"         DECIMAL(15,4) NOT NULL,
  -- O que de fato saiu da balanca, informado pelo operador. A distancia entre
  -- os dois e o numero que mede a cozinha.
  "producedQuantity"        DECIMAL(15,4) NOT NULL,
  -- Perda DECLARADA. A merma nao declarada nao vem para ca: aparece sozinha na
  -- diferenca entre entrada e saida, e e absorvida pelo custo unitario.
  "lossQuantity"            DECIMAL(15,4),
  "unitId"                  TEXT NOT NULL,

  -- Custo congelado. Nulos ate a Etapa 5 preenche-los.
  "totalInputCost"          DECIMAL(12,4),
  "unitCost"                DECIMAL(12,4),

  -- COMPLETED | REVERSED. String livre por ora, como itemType; a promocao a
  -- enum e a Etapa 10 e vale para os dois juntos.
  "status"                  TEXT NOT NULL DEFAULT 'COMPLETED',

  -- A garantia real contra producao dupla. Deriva de um token que o navegador
  -- gera UMA vez por clique em "Produzir": reenviar o mesmo token e a mesma
  -- corrida repetida; um token novo e uma segunda panela, de proposito. Nenhum
  -- valor derivavel no servidor separa esses dois casos -- foi exatamente isso
  -- que o default "AVULSO" da versao antiga destruia.
  "idempotencyKey"          TEXT NOT NULL,

  -- Reverter uma corrida cujo produto ja foi vendido leva o saldo a negativo.
  -- Em vez de recusar, registra-se. Mesmo padrao que a Fase 1 usa em Order --
  -- os campos de la nao serviam aqui porque reversao de producao nao tem pedido.
  "inventoryInconsistentAt" TIMESTAMP(3),
  "inventoryInconsistency"  TEXT,

  "note"                    TEXT,
  "authorType"              TEXT,
  "authorId"                TEXT,
  "authorName"              TEXT,

  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"             TIMESTAMP(3),

  -- Quem reverteu, como texto -- mesmo padrao de authorId. Nao e FK para outra
  -- corrida porque reverter NAO cria corrida nova: a reversao grava movimentos
  -- REVERSAL, como no resto do motor.
  "reversedAt"              TIMESTAMP(3),
  "reversedById"            TEXT,

  CONSTRAINT "ProductionRun_pkey" PRIMARY KEY ("id")
);

-- 2. O vinculo do movimento com a corrida.
--
-- E o que separa as duas origens do saldo de um preparado sem campo novo em
-- lugar nenhum: PRODUCTION com productionRunId veio da cozinha; PURCHASE com
-- productionRunId nulo veio comprado pronto.
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "productionRunId" TEXT;

-- 3. O campo reservado do custo medio.
--
-- Nulo e sem uso. Existe para que a evolucao de "custo da ultima aquisicao"
-- para "media ponderada" nao exija migration destrutiva depois, quando ja
-- houver saldo e historico para preservar.
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "averageCost" DECIMAL(12,4);

-- 4. Indices.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductionRun_idempotencyKey_key"
  ON "ProductionRun"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "ProductionRun_storeId_createdAt_idx"
  ON "ProductionRun"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductionRun_storeId_status_idx"
  ON "ProductionRun"("storeId", "status");
CREATE INDEX IF NOT EXISTS "ProductionRun_compositionId_idx"
  ON "ProductionRun"("compositionId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_productionRunId_idx"
  ON "InventoryMovement"("productionRunId");

-- 5. Chaves estrangeiras.
DO $$
BEGIN
  -- SetNull: apagar a corrida NAO pode apagar o movimento. O razao e imutavel;
  -- e dele que o saldo e derivado.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_productionRunId_fkey') THEN
    ALTER TABLE "InventoryMovement"
      ADD CONSTRAINT "InventoryMovement_productionRunId_fkey"
      FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductionRun_storeId_fkey') THEN
    ALTER TABLE "ProductionRun"
      ADD CONSTRAINT "ProductionRun_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- Restrict: a corrida sempre sabe qual receita usou. Impede apagar uma versao
  -- de receita que ja produziu -- o que e correto -- e nao cria bloqueio novo,
  -- porque um preparado que ja produziu tem movimentos e InventoryMovement.itemId
  -- ja e Restrict. Verificado que nao atrapalha a cascata de Store: o Postgres
  -- remove as corridas na mesma passada, antes de checar o Restrict.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductionRun_compositionId_fkey') THEN
    ALTER TABLE "ProductionRun"
      ADD CONSTRAINT "ProductionRun_compositionId_fkey"
      FOREIGN KEY ("compositionId") REFERENCES "ProductComposition"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- Restrict, como todo mundo que referencia InventoryUnit: apagar "kg"
  -- tornaria a quantidade produzida ilegivel.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductionRun_unitId_fkey') THEN
    ALTER TABLE "ProductionRun"
      ADD CONSTRAINT "ProductionRun_unitId_fkey"
      FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
