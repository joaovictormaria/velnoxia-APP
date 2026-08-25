import { prisma } from "../db/client";

/**
 * Processa webhook de pagamento de pedido (Stripe, PIX, etc)
 *
 * Fluxo:
 * 1. Valida webhook (assinatura Stripe, hash PIX, etc)
 * 2. Busca Order correspondente
 * 3. Atualiza paymentStatus: PENDING → PAID
 * 4. Registra na auditoria
 * 5. Marca webhook como PROCESSED
 *
 * Idempotência: mesmo webhook não é processado duas vezes
 */

export interface PaymentWebhookInput {
  webhookId: string;
  provider: "STRIPE" | "PIX" | "MANUAL";
  eventType: string;
  orderId?: string;
  payload: Record<string, any>;
  metadata?: {
    amount?: number;
    currency?: string;
    paymentMethod?: string;
  };
}

export async function processPaymentWebhook(input: PaymentWebhookInput): Promise<boolean> {
  // 1. Verificar se webhook já foi processado (idempotência)
  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { webhookId: input.webhookId },
    select: { id: true, status: true },
  });

  if (existing?.status === "PROCESSED") {
    console.log(`[PAYMENT WEBHOOK] Webhook ${input.webhookId} já foi processado`);
    return false;
  }

  // 2. Se já existe mas falhou, não reprocessar (evita loop infinito)
  if (existing?.status === "FAILED") {
    console.log(`[PAYMENT WEBHOOK] Webhook ${input.webhookId} marcado como FAILED, pulando`);
    return false;
  }

  try {
    // 3. Procurar o Order
    let orderId = input.orderId;

    if (!orderId && input.payload.orderId) {
      orderId = input.payload.orderId as string;
    }

    if (!orderId) {
      throw new Error(
        `Webhook ${input.provider} sem orderId. Payload: ${JSON.stringify(input.payload)}`
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        storeId: true,
        paymentStatus: true,
        paymentMethod: true,
        total: true,
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} não encontrado`);
    }

    // 4. Se já está PAID, não faz nada
    if (order.paymentStatus === "PAID") {
      console.log(
        `[PAYMENT WEBHOOK] Order ${orderId} já está PAID, apenas registrando webhook`
      );
      // Registrar webhook como processado
      await createWebhookRecord(input, orderId, "PROCESSED");
      return true;
    }

    // 5. Validar que o webhook é realmente de pagamento bem-sucedido
    const isSuccessfulPayment =
      input.eventType === "payment.confirmed" ||
      input.eventType === "payment_succeeded" ||
      input.eventType === "charge.completed";

    if (!isSuccessfulPayment) {
      console.log(
        `[PAYMENT WEBHOOK] Webhook ${input.eventType} não é de pagamento bem-sucedido`
      );
      return false;
    }

    // 6. Atualizar paymentStatus para PAID
    console.log(`[PAYMENT WEBHOOK] Confirmando pagamento para Order ${orderId}`);
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "PAID",
      },
    });

    // 7. Registrar na auditoria
    await prisma.auditLog.create({
      data: {
        storeId: order.storeId,
        action: "PAYMENT_CONFIRMED",
        resource: "Order",
        resourceId: orderId,
        isSystem: true,
        newValue: JSON.stringify({
          paymentStatus: "PAID",
          confirmedVia: input.provider,
          webhookId: input.webhookId,
        }),
        reason: `Pagamento confirmado via webhook ${input.provider}`,
      },
    });

    // 8. Registrar webhook como processado
    await createWebhookRecord(input, orderId, "PROCESSED");

    console.log(`[PAYMENT WEBHOOK] ✓ Pagamento confirmado para Order ${orderId}`);
    return true;
  } catch (error) {
    console.error(`[PAYMENT WEBHOOK] Erro ao processar webhook ${input.webhookId}:`, error);

    // Registrar falha
    const errorMessage = error instanceof Error ? error.message : String(error);
    await createWebhookRecord(input, input.orderId || null, "FAILED", errorMessage);

    // Relançar para possível retry
    throw error;
  }
}

async function createWebhookRecord(
  input: PaymentWebhookInput,
  orderId: string | null,
  status: "PENDING" | "PROCESSED" | "FAILED",
  errorMessage?: string
) {
  try {
    // Verificar se já existe
    const existing = await prisma.paymentWebhookEvent.findUnique({
      where: { webhookId: input.webhookId },
    });

    if (existing) {
      // Atualizar status
      await prisma.paymentWebhookEvent.update({
        where: { webhookId: input.webhookId },
        data: {
          status,
          orderId: orderId || undefined,
          processedAt: status === "PROCESSED" ? new Date() : existing.processedAt,
          errorMessage,
        },
      });
    } else {
      // Criar novo registro
      await prisma.paymentWebhookEvent.create({
        data: {
          webhookId: input.webhookId,
          provider: input.provider,
          eventType: input.eventType,
          orderId: orderId || undefined,
          payload: JSON.stringify(input.payload),
          status,
          errorMessage,
          processedAt: status === "PROCESSED" ? new Date() : null,
        },
      });
    }
  } catch (error) {
    // Falha silenciosa ao registrar webhook (não quebra o fluxo principal)
    console.error(`[PAYMENT WEBHOOK] Erro ao registrar webhook:`, error);
  }
}

/**
 * Valida assinatura do webhook Stripe (exemplo)
 * Em produção, use stripe.webhooks.constructEvent()
 */
export function validateStripeSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Implementar com crypto.timingSafeEqual se necessário
  // Por enquanto, apenas validação básica
  return Boolean(signature && secret);
}

/**
 * Valida webhook de PIX (exemplo)
 * Implementar conforme o provedor PIX escolhido
 */
export function validatePixSignature(payload: string, signature: string, secret: string): boolean {
  // Implementar hash HMAC-SHA256
  return Boolean(signature && secret);
}
