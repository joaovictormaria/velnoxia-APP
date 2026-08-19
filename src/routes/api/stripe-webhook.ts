import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import { segredoDoWebhook, stripe } from "@/server/billing/stripe";
import { aplicarAssinatura, aplicarCheckout } from "@/server/billing/subscription-service";

/**
 * O único lugar que libera uma loja.
 *
 * A tela de sucesso do checkout não serve para isso: ela é só uma URL, e
 * qualquer pessoa pode abri-la. Quem diz que o dinheiro entrou é o Stripe,
 * assinando o evento com um segredo que só nós dois conhecemos.
 *
 * Por isso o corpo é lido como texto puro: a conferência da assinatura é feita
 * sobre os bytes exatos que o Stripe enviou, e qualquer reserialização em JSON
 * mudaria esses bytes e invalidaria a conta.
 */
export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const assinatura = request.headers.get("stripe-signature");
        if (!assinatura) {
          return new Response("Sem assinatura.", { status: 400 });
        }

        const corpo = await request.text();

        let evento: Stripe.Event;
        try {
          evento = stripe().webhooks.constructEvent(corpo, assinatura, segredoDoWebhook());
        } catch (erro) {
          // Assinatura inválida é tentativa de forjar pagamento, ou segredo
          // errado na configuração. Nos dois casos não se processa nada.
          console.error("[stripe] assinatura do webhook recusada:", erro);
          return new Response("Assinatura inválida.", { status: 400 });
        }

        try {
          switch (evento.type) {
            case "checkout.session.completed":
              await aplicarCheckout(evento.data.object);
              break;

            // Criada, renovada, cartão falhou, cancelada: todos trazem a
            // assinatura inteira, e gravar o estado final cobre os quatro.
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
              await aplicarAssinatura(evento.data.object);
              break;

            // A renovação mensal chega como fatura paga; a assinatura ligada a
            // ela é relida para pegar o novo fim de período.
            case "invoice.paid":
            case "invoice.payment_failed": {
              const fatura = evento.data.object as Stripe.Invoice & {
                subscription?: string | Stripe.Subscription | null;
              };
              const subId =
                typeof fatura.subscription === "string"
                  ? fatura.subscription
                  : fatura.subscription?.id;
              if (subId) {
                await aplicarAssinatura(await stripe().subscriptions.retrieve(subId));
              }
              break;
            }

            default:
              // Os outros eventos não mudam acesso; devolver 200 evita que o
              // Stripe fique reenviando o que a gente escolheu ignorar.
              break;
          }
        } catch (erro) {
          // 500 faz o Stripe tentar de novo, que é o que se quer numa falha
          // nossa: o evento não se perde.
          console.error(`[stripe] falha ao processar ${evento.type}:`, erro);
          return new Response("Erro ao processar.", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
