-- O nome da loja vivia em dois lugares que so nasciam iguais: Store.name, que
-- identifica a loja no sistema, e StoreSettings.storeName, que a tela de
-- Configuracoes edita. Renomear a loja mexia so no segundo, e Store.name
-- ficava congelado no nome do dia do cadastro -- inclusive na legenda do QR
-- Code que o dono imprime e cola na porta.
--
-- Daqui em diante o repositorio grava os dois juntos. Esta migracao acerta as
-- lojas que ja tinham divergido: vale o nome que o dono editou por ultimo.

UPDATE "Store" AS s
SET "name" = c."storeName"
FROM "StoreSettings" AS c
WHERE c."storeId" = s."id"
  AND c."storeName" <> s."name"
  AND length(trim(c."storeName")) > 0;
