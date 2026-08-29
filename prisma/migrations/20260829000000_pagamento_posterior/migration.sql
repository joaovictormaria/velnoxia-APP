-- PAGAMENTO POSTERIOR (fiado)
--
-- Separa VENDA de RECEBIMENTO. A venda continua pertencendo à data do pedido;
-- o dinheiro passa a ter data própria em `OrderPayment.paidAt`.
--
-- NADA AQUI TOCA ESTOQUE. Não há coluna, índice ou gatilho que alcance
-- InventoryMovement, ProductComposition ou ProductionRun: o razão de estoque é
-- dirigido por `Order.status`, e este arquivo não encosta nele.
--
-- NENHUMA DATA HISTÓRICA É REESCRITA. `Order.createdAt` e o
-- `OrderStatusHistory` ficam como estão — é o que garante que a venda de 28/08
-- continue sendo de 28/08 depois de paga em 31/08.

-- AlterEnum
--
-- OPEN é a venda a prazo. Fica ao lado de PENDING em vez de substituí-lo
-- porque as duas coisas são diferentes: PENDING é um pagamento que ainda vai
-- acontecer agora; OPEN é a decisão de deixar para depois.
--
-- Adicionar valor a enum não reescreve linha nenhuma: todo pedido existente
-- continua PENDING ou PAID, exatamente como estava.
ALTER TYPE "PaymentStatus" ADD VALUE 'OPEN';

-- AlterTable
--
-- Todas as colunas são NULLABLE e sem default. Pedido antigo não é tocado, e a
-- ausência de valor significa "não é fiado" — que é a verdade para 100% do
-- histórico.
ALTER TABLE "Order" ADD COLUMN     "openNote" TEXT,
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "openedById" TEXT,
ADD COLUMN     "openedByName" TEXT,
ADD COLUMN     "paymentDueAt" TIMESTAMP(3);

-- CreateTable
--
-- UMA LINHA POR RECEBIMENTO, não uma por pedido: três parcelas são três
-- linhas, e o pagamento parcial sai de graça.
--
-- NÃO HÁ COLUNA DE SALDO. O saldo é derivado de
--   total − refund − Σ(amount onde reversedAt IS NULL)
-- e por isso não existe o estado em que ele discorda dos pagamentos.
CREATE TABLE "OrderPayment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    -- A data REAL do dinheiro. É ela que define a competência do recebimento.
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "receivedByName" TEXT,
    "note" TEXT,
    -- Estorno marca, nunca apaga: o dinheiro que entrou e voltou continua
    -- visível e sai do saldo por este campo.
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
--
-- A TRAVA CONTRA O CLIQUE DUPLO, e ela é do banco — não da tela. Duas
-- requisições simultâneas disputam este índice e a segunda perde, em vez de
-- gravar o mesmo dinheiro duas vezes.
CREATE UNIQUE INDEX "OrderPayment_idempotencyKey_key" ON "OrderPayment"("idempotencyKey");

-- CreateIndex
-- A série de recebimentos por loja e data: é a consulta do relatório.
CREATE INDEX "OrderPayment_storeId_paidAt_idx" ON "OrderPayment"("storeId", "paidAt");

-- CreateIndex
CREATE INDEX "OrderPayment_orderId_idx" ON "OrderPayment"("orderId");

-- CreateIndex
CREATE INDEX "OrderPayment_storeId_reversedAt_idx" ON "OrderPayment"("storeId", "reversedAt");

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
