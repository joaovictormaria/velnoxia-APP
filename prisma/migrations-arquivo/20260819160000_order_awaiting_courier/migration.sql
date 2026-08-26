-- Pedido pronto que nao pode sair: entrega exige entregador, e sem um o pedido
-- fica parado. Sem esta marca, "esperando alguem levar" e "ainda sendo feito"
-- seriam o mesmo estado no quadro.
ALTER TABLE "Order" ADD COLUMN "awaitingCourierSince" TIMESTAMP(3);
CREATE INDEX "Order_courierId_status_idx" ON "Order"("courierId", "status");

-- Quem fechou a entrega foi o proprio entregador, nao o balcao.
ALTER TYPE "StatusAuthorType" ADD VALUE 'COURIER';
