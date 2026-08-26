-- Corrige timestamps dos pedidos antigos com offset -3 horas
-- Todos os pedidos até agora foram criados com: createdAt = new Date(Date.now() - 3 horas)
-- Solução: adiciona 3 horas a todos para corrigir

UPDATE "Order"
SET "createdAt" = "createdAt" + INTERVAL '3 hours';
