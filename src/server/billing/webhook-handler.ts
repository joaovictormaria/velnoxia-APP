import type Stripe from "stripe";
import { prisma } from "../db/client";
import { stripe } from "./stripe";

/**
 * PRIORIDADE 1: BILLING - Webhook Handler
 *
 * Processa eventos do Stripe de forma robusta e idempotente.
 * Stripe é a FONTE DE VERDADE — banco só guarda cópia do que ele disse.
 *
 * Eventos processados:
 * - checkout.session.completed: Primeira compra (criar customer + subscription)
 * - customer.subscription.updated: Upgrade, downgrade, cancelamento
 * - customer.subscription.deleted: Assinatura cancelada permanentemente
 * - invoice.payment_succeeded: Pagamento bem-sucedido
 * - invoice.payment_failed: Pagamento falhou (past_due)
 */

export interface WebhookPayload {
  id: string; // Event ID (idempotência)
  type: string;
  data: { object: unknown };
  created: number;
}

/**
 * Processa webhook do Stripe e atualiza o banco.
 * Retorna true se processou, false se já foi processado (idempotência).
 */
export async function handleStripeWebhook(payload: WebhookPayload): Promise<boolean> {
  // Verificar se evento já foi processado (idempotência)
  const existente = await prisma.stripeWebhookEvent.findUnique({
    where: { eventId: payload.id },
    select: { id: true },
  });

  if (existente) {
    // Já processamos — evita duplicação
    return false;
  }

  try {
    switch (payload.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(payload.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(payload.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(payload.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(payload.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(payload.data.object as Stripe.Invoice);
        break;
    }

    // Registrar como processado
    await prisma.stripeWebhookEvent.create({
      data: {
        eventId: payload.id,
        eventType: payload.type,
        processedAt: new Date(),
      },
    });

    return true;
  } catch (error) {
    console.error(`Erro ao processar webhook ${payload.id}:`, error);
    // Relança para Stripe reenviar
    throw error;
  }
}

/**
 * 1. CHECKOUT CONCLUÍDO — Primeira compra
 * Cria subscription e atualiza store com status ACTIVE
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  if (session.subscription_data?.metadata?.storeId) {
    const storeId = session.subscription_data.metadata.storeId as string;

    // Subscription já foi criada pelo Stripe na sessão
    const subscription = await stripe().subscriptions.retrieve(session.subscription as string);

    await updateStoreSubscription(storeId, subscription);
  }
}

/**
 * 2. SUBSCRIPTION ATUALIZADA — Upgrade, downgrade, cancelamento agendado
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const storeId = subscription.metadata?.storeId as string | undefined;
  if (!storeId) return;

  await updateStoreSubscription(storeId, subscription);
}

/**
 * 3. SUBSCRIPTION DELETADA — Cancelamento efetivado
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const storeId = subscription.metadata?.storeId as string | undefined;
  if (!storeId) return;

  // Marcar como SUSPENDED imediatamente
  await prisma.store.update({
    where: { id: storeId },
    data: {
      status: "SUSPENDED",
      subscriptionStatus: "canceled",
      paidUntil: new Date(), // Já venceu
    },
  });
}

/**
 * 4. PAGAMENTO BEM-SUCEDIDO — Renovação ou primeiro pagamento
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const subscription = await stripe().subscriptions.retrieve(invoice.subscription as string);
  const storeId = subscription.metadata?.storeId as string | undefined;

  if (storeId) {
    await updateStoreSubscription(storeId, subscription);
  }
}

/**
 * 5. PAGAMENTO FALHOU — Cartão recusado, limite atingido
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const subscription = await stripe().subscriptions.retrieve(invoice.subscription as string);
  const storeId = subscription.metadata?.storeId as string | undefined;

  if (storeId) {
    // Marcar como PAST_DUE para o painel mostrar alerta
    await prisma.store.update({
      where: { id: storeId },
      data: {
        subscriptionStatus: "past_due",
      },
    });
  }
}

/**
 * Função central que sincroniza estado do Stripe com o banco
 * Extrai a verdade do Stripe e copia para Store
 */
async function updateStoreSubscription(storeId: string, subscription: Stripe.Subscription) {
  // Extrair estado do Stripe (fonte de verdade)
  const stripeStatus = subscription.status as "active" | "past_due" | "canceled" | "trialing";
  const paidUntil = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date();

  // Decidir status da loja baseado no Stripe
  let storeStatus: "TRIAL" | "ACTIVE" | "SUSPENDED";
  if (stripeStatus === "trialing") {
    storeStatus = "TRIAL";
  } else if (["active", "past_due"].includes(stripeStatus)) {
    storeStatus = "ACTIVE";
  } else {
    storeStatus = "SUSPENDED";
  }

  // Atualizar banco (cópia do Stripe)
  await prisma.store.update({
    where: { id: storeId },
    data: {
      status: storeStatus,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: stripeStatus,
      paidUntil,
      // Se foi agendado cancelamento no fim do período
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    },
  });
}

/**
 * Modelo para rastrear eventos processados (evitar duplicação)
 * Precisa estar no schema.prisma:
 *
 * model StripeWebhookEvent {
 *   id String @id @default(cuid())
 *   eventId String @unique // Do Stripe
 *   eventType String
 *   processedAt DateTime @default(now())
 * }
 */
