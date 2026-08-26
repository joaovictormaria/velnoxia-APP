-- Guarda no pedido o nome de quem levou.
--
-- A conta do entregador pode ser apagada, e a relacao usa SetNull -- tem de
-- usar, senao o banco impediria a exclusao de qualquer um que ja tivesse
-- entregue. Sem esta copia, apagar um entregador faria todos os pedidos dele
-- passarem a dizer que ninguem levou: o historico de entregas sumiria em
-- silencio, sem ninguem perceber ate procurar.

ALTER TABLE "Order" ADD COLUMN "courierNameSnapshot" TEXT;

-- Preenche o que ja existe, enquanto os entregadores ainda estao la.
UPDATE "Order" AS o
SET "courierNameSnapshot" = a."name"
FROM "AdminUser" AS a
WHERE a."id" = o."courierId"
  AND o."courierNameSnapshot" IS NULL;
