// @ts-nocheck
// ⚠️ CARDÁPIO TRAVADO: Nenhuma alteração neste arquivo sem autorização prévia do João
// Qualquer mudança em fluxo, código ou lógica requer coordenação com João antes
import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";
import { listActiveExtras } from "../repositories/extra-repository";
import { listMenuForStorefront } from "../repositories/product-repository";
import { getPublicStoreSettings } from "../repositories/store-settings-repository";
import { getStoreBySlug, isStoreServable } from "../repositories/store-repository";
import { listActivePromotions } from "../repositories/promotion-repository";
import { listPublishedPosts } from "../repositories/post-repository";
import { convertExtrasForServal, convertStoreSettingsForClient, decimalToNumber } from "../utils/decimal-converter";

/**
 * Public â€” no admin session. The tenant comes from the URL segment, so an
 * unknown, suspended or expired store is a 404 rather than an empty menu.
 */
export const getStorefrontMenuFn = createServerFn({ method: "GET" })
  .validator(z.object({ storeSlug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const store = await getStoreBySlug(data.storeSlug);
    if (!store || !isStoreServable(store)) throw notFound();

    const [categories, extras, settings, promotions, posts] = await Promise.all([
      listMenuForStorefront(store.id),
      listActiveExtras(store.id),
      getPublicStoreSettings(store.id),
      listActivePromotions(store.id),
      listPublishedPosts(store.id),
    ]);

    // Convert Decimal fields for Seroval serialization
    const convertedCategories = categories.map((cat) => ({
      ...cat,
      optionGroups: cat.optionGroups?.map((g) => ({
        ...g,
        options: g.options?.map((o) => ({ ...o, price: decimalToNumber(o.price) })),
      })),
      products: cat.products?.map((p: any) => ({
        ...p,
        /*
         * ESTOQUE NÃO DECIDE O QUE ESTÁ À VENDA.
         *
         * Isto derivava `esgotado` de `quantityOnHand − quantityReserved`, e o
         * produto sumia da vitrine quando o saldo zerava. Era controle interno
         * da casa decidindo o que o cliente pode comprar — e o saldo quase
         * nunca reflete a prateleira: sobra do dia anterior, entrega que
         * chegou e ninguém lançou, contagem atrasada.
         *
         * Perder a venda por causa de um número que a cozinha resolveria em
         * dois minutos é o pior desfecho possível. O estoque continua inteiro
         * onde importa — alerta, reposição, CMV, relatório —, mas não autoriza
         * nem recusa compra.
         *
         * O campo permanece no contrato porque a vitrine ainda o consome, e
         * porque quem decide parar de vender continua tendo como: desativar o
         * produto, que é `isActive` e é outra coisa.
         */
        esgotado: false,
        basePrice: decimalToNumber(p.basePrice),
        sizes: p.sizes?.map((s) => ({ ...s, price: decimalToNumber(s.price) })),
        optionGroups: p.optionGroups?.map((g) => ({
          ...g,
          options: g.options?.map((o) => ({ ...o, price: decimalToNumber(o.price) })),
        })),
      })),
    }));

    return {
      categories: convertedCategories,
      extras: convertExtrasForServal(extras),
      promotions: promotions.map((p) => ({
        ...p,
        price: p.price ? decimalToNumber(p.price) : null,
        originalPrice: p.originalPrice ? decimalToNumber(p.originalPrice) : null,
      })),
      posts,
      store: { ...convertStoreSettingsForClient(settings), slug: store.slug },
    } as any;
  });

