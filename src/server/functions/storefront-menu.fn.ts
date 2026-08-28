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
      products: cat.products?.map(({ inventoryItem, ...p }: any) => ({
        ...p,
        /*
         * ESGOTADO É DERIVADO, e some daqui para baixo só como sim ou não.
         *
         * `disponível = quantityOnHand − quantityReserved` é a mesma conta que
         * a reserva usa no checkout — uma regra, um lugar. Nada é gravado: um
         * campo persistido precisaria ser mantido em sincronia a cada
         * movimento, e uma segunda fonte de verdade diverge.
         *
         * Produto sem vínculo nunca esgota: a maioria do cardápio não controla
         * estoque, e tratar ausência de vínculo como zero esvaziaria a loja.
         *
         * Item de estoque INATIVO também não esgota. Inativar é tirar o item
         * da gestão, não declarar que o produto acabou — quem quer parar de
         * vender desativa o produto, que é outra coisa e já existe.
         *
         * O `inventoryItem` é desestruturado para FORA: os saldos não podem
         * vazar para a vitrine pública.
         */
        esgotado:
          inventoryItem != null && inventoryItem.isActive === true
            ? Number(inventoryItem.quantityOnHand) -
                Number(inventoryItem.quantityReserved) <=
              0
            : false,
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

