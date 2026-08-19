-- Assinatura mensal no Stripe.
--
-- Ate aqui o SaaS era de aluguel mas so tinha o teste de 14 dias: vencido, a
-- loja caia e nao existia caminho para pagar. O dono tinha que chamar no
-- WhatsApp e alguem liberava na mao.
--
-- O corte passa a sair de paidUntil, e nao do status. Loja liberada na mao
-- fica com paidUntil nulo e nao expira -- e o que mantem as lojas de hoje
-- funcionando sem ninguem precisar assinar nada.

ALTER TABLE "Store" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Store" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Store" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "Store" ADD COLUMN "paidUntil" TIMESTAMP(3);
ALTER TABLE "Store" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

-- Unicos: um cliente do Stripe pertence a uma loja so, e uma assinatura
-- tambem. Sem isso um webhook repetido poderia pagar a loja errada.
CREATE UNIQUE INDEX "Store_stripeCustomerId_key" ON "Store"("stripeCustomerId");
CREATE UNIQUE INDEX "Store_stripeSubscriptionId_key" ON "Store"("stripeSubscriptionId");
