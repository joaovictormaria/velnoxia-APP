import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";
import { exigirRecurso } from "@/server/billing/guarda-de-recurso";
import { getStoreBySlug, isStoreServable } from "../repositories/store-repository";
import {
  createReview,
  findReviewByVisitor,
  listPublicReviews,
  listReviewsForAdmin,
  ratingSummary,
  respondToReview,
  setReviewHidden,
  toggleLike,
} from "../repositories/review-repository";
import { permitido } from "../security/rate-limit";

/** The visitor id is a random string the browser keeps; it identifies a device,
 *  never a person, and is only used to stop double voting. */
const visitorId = z.string().trim().min(8).max(64);

async function servableStore(slug: string) {
  const store = await getStoreBySlug(slug);
  if (!store || !isStoreServable(store)) throw notFound();
  return store;
}

export const listReviewsFn = createServerFn({ method: "GET" })
  .validator(z.object({ storeSlug: z.string().min(1), visitorId: z.string().nullish() }))
  .handler(async ({ data }) => {
    const store = await servableStore(data.storeSlug);
    const [reviews, summary] = await Promise.all([
      listPublicReviews(store.id, data.visitorId ?? null),
      ratingSummary(store.id),
    ]);
    return { reviews, summary };
  });

export const submitReviewFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      storeSlug: z.string().min(1),
      visitorId,
      name: z.string().trim().min(2, "Informe seu nome.").max(60),
      rating: z.number().int().min(1, "Escolha de 1 a 5 estrelas.").max(5),
      comment: z.string().trim().min(3, "Escreva sua avaliação.").max(1000),
    }),
  )
  .handler(async ({ data }) => {
    // Uma avaliação por aparelho já é a regra; o teto por origem barra o
    // script que forja avaliação com visitorId novo a cada chamada.
    if (!permitido("review", { max: 5, janelaMs: 60_000 })) {
      return { ok: false as const, error: "Muitas tentativas. Aguarde um instante." };
    }
    const store = await servableStore(data.storeSlug);
    if (await findReviewByVisitor(store.id, data.visitorId)) {
      return { ok: false as const, error: "Você já avaliou esta loja neste aparelho." };
    }
    await createReview(store.id, {
      customerNameSnapshot: data.name,
      rating: data.rating,
      comment: data.comment,
      visitorId: data.visitorId,
    });
    return { ok: true as const };
  });

export const toggleReviewLikeFn = createServerFn({ method: "POST" })
  .validator(z.object({ storeSlug: z.string().min(1), reviewId: z.string(), visitorId }))
  .handler(async ({ data }) => {
    // Mesmo motivo do like de publicação: o visitorId é do cliente, então o
    // teto por origem é o que segura a inflação de curtidas.
    if (!permitido("review-like", { max: 15, janelaMs: 60_000 })) {
      return { ok: false as const, error: "Muitas tentativas. Aguarde um instante." };
    }
    const store = await servableStore(data.storeSlug);
    const result = await toggleLike(store.id, data.reviewId, data.visitorId);
    if (!result) return { ok: false as const, error: "Avaliação não encontrada." };
    return { ok: true as const, ...result };
  });

/* ---- admin: read, answer, hide. Never edit. ---- */

export const listReviewsForAdminFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await exigirRecurso("MARKETING");
  const [reviews, summary] = await Promise.all([
    listReviewsForAdmin(storeId),
    ratingSummary(storeId),
  ]);
  return { reviews, summary };
});

export const respondToReviewFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), response: z.string().trim().min(1).max(1000) }))
  .handler(async ({ data }) => {
    const { storeId, id: adminId } = await exigirRecurso("MARKETING");
    await respondToReview(storeId, data.id, adminId, data.response);
    return { ok: true as const };
  });

export const setReviewHiddenFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), isHidden: z.boolean() }))
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("MARKETING");
    await setReviewHidden(storeId, data.id, data.isHidden);
    return { ok: true as const };
  });
