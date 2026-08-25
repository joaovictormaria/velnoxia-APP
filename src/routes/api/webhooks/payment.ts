import type { H3Event } from "h3";
import { readBody } from "h3";
import { processPaymentWebhook, validateStripeSignature } from "~/server/billing/payment-webhook-handler";

/**
 * POST /api/webhooks/payment
 *
 * Recebe webhooks de pagamento de diferentes provedores (Stripe, PIX, etc)
 * e atualiza o status de pagamento do pedido.
 *
 * Body:
 * {
 *   "webhookId": "...",
 *   "provider": "STRIPE" | "PIX" | "MANUAL",
 *   "eventType": "payment.confirmed",
 *   "orderId": "...",
 *   "payload": { ... },
 *   "signature": "..."
 * }
 */
export default defineEventHandler(async (event: H3Event) => {
  // Apenas POST é permitido
  if (event.method !== "POST") {
    throw createError({
      statusCode: 405,
      statusMessage: "Method not allowed",
    });
  }

  try {
    const body = await readBody(event);

    const { webhookId, provider, eventType, orderId, payload, signature } = body;

    // Validar campos obrigatórios
    if (!webhookId || !provider || !eventType || !payload) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing required fields: webhookId, provider, eventType, payload",
      });
    }

    // Validar assinatura conforme o provedor
    const secret = process.env[`WEBHOOK_SECRET_${provider}`];
    if (!secret) {
      console.warn(`[WEBHOOK] Secret não configurado para ${provider}`);
    } else {
      if (provider === "STRIPE") {
        if (!validateStripeSignature(JSON.stringify(payload), signature, secret)) {
          throw createError({
            statusCode: 401,
            statusMessage: "Invalid webhook signature",
          });
        }
      }
      // Adicionar validação para outros provedores (PIX, etc)
    }

    // Processar webhook
    const processed = await processPaymentWebhook({
      webhookId,
      provider: provider as "STRIPE" | "PIX" | "MANUAL",
      eventType,
      orderId,
      payload,
      metadata: body.metadata,
    });

    return {
      ok: true,
      processed,
      message: processed ? "Webhook processado com sucesso" : "Webhook já foi processado",
    };
  } catch (error) {
    console.error("[WEBHOOK] Erro ao processar webhook:", error);

    // Stripe requer 200 OK mesmo em erro (para não re-enviar)
    // Mas retornamos um erro para logging
    if (error instanceof Error && error.message.includes("Invalid webhook signature")) {
      throw createError({
        statusCode: 401,
        statusMessage: error.message,
      });
    }

    throw createError({
      statusCode: 500,
      statusMessage: "Erro ao processar webhook",
    });
  }
});
