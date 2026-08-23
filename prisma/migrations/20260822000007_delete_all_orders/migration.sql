-- ⚠️  OPERAÇÃO IRREVERSÍVEL: Deleta TODOS os pedidos de TODAS as contas
-- Remove todas as dependências primeiro (por causa de foreign keys)

DELETE FROM "OrderItem";
DELETE FROM "OrderStatusHistory";
DELETE FROM "Order";

-- Reset das sequências para começar do 1
ALTER SEQUENCE "Order_number_seq" RESTART WITH 1;
