-- Corrige os timestamps dos pedidos que foram criados com offset de timezone
-- Todos os pedidos foram criados com createdAt - 3 horas (UTC-3)
-- Adiciona 3 horas para corrigir para UTC verdadeiro

UPDATE "Order"
SET "createdAt" = "createdAt" + INTERVAL '3 hours';
