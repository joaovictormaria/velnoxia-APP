-- CLASSIFICACAO DO ITEM DE ESTOQUE, COBRADA PELO BANCO
--
-- `InventoryItem.itemType` e TEXT livre desde a fundacao do modulo. Os quatro
-- valores que o sistema conhece — INGREDIENT, RESALE, PREPARED, PACKAGING —
-- sao validados por Zod na porta do formulario e por mais nada. Prisma direto,
-- script de manutencao e import nao passam por aquele parse.
--
-- ISTO DEIXOU DE SER TEORICO NESTA FASE. A regra nova depende do tipo para
-- decidir coisas que mudam saldo: REVENDA so aceita RESALE ou INGREDIENT,
-- PRODUCAO com preparado so aceita PREPARED, e PACKAGING e proibido dentro de
-- receita. Um itemType invalido nao cai em nenhuma dessas regras e passa por
-- todas elas.
--
-- CHECK, E NAO ENUM, E A ESCOLHA IMPORTA. Converter a coluna para um tipo
-- enumerado exige `USING "itemType"::"NovoTipo"`, que FALHA a migration inteira
-- se existir uma unica linha com valor fora da lista. O banco local foi
-- conferido (so INGREDIENT e PREPARED), mas producao nao pode ser consultada
-- aqui — e uma migration que pode derrubar o deploy por causa de um dado que
-- ninguem viu nao vale a economia.
--
-- NOT VALID e o que torna isto seguro: a constraint passa a valer para todo
-- INSERT e UPDATE daqui em diante, e NAO varre as linhas que ja existem. Se
-- houver lixo antigo em algum banco, ele fica onde esta, visivel, em vez de
-- impedir o deploy. A validacao retroativa e uma decisao separada:
--
--   ALTER TABLE "InventoryItem" VALIDATE CONSTRAINT "InventoryItem_itemType_valido";
--
-- e so deve ser rodada depois de um SELECT DISTINCT confirmar que nao ha o que
-- consertar.
--
-- INTEIRAMENTE ADITIVA. Nenhuma coluna criada, removida ou alterada de tipo.
-- Nenhuma linha reescrita. Nenhum UPDATE, DELETE ou DROP.
--
-- ROLLBACK:
--   ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_itemType_valido";

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_itemType_valido"
  CHECK ("itemType" IN ('INGREDIENT', 'RESALE', 'PREPARED', 'PACKAGING'))
  NOT VALID;
