import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import {
  addRestaurantPhoto,
  deleteRestaurantPhoto,
  getStoreSettings,
  replaceOpeningHours,
  updateStoreSettings,
} from "../repositories/store-settings-repository";

const weekday = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

/** Empty strings from the form become null so optional columns stay clean. */
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

const settingsSchema = z.object({
  storeName: z.string().trim().min(1, "Informe o nome da loja."),
  tagline: optionalText,
  description: optionalText,
  logoUrl: optionalText,
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB."),
  colorMode: z.enum(["SOLID", "GRADIENT"]),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  tertiaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  whatsappNumber: z.string().trim().min(1, "Informe o WhatsApp."),
  email: optionalText,
  instagramUrl: optionalText,
  facebookUrl: optionalText,
  tiktokUrl: optionalText,
  addressStreet: optionalText,
  addressNumber: optionalText,
  addressComplement: optionalText,
  addressNeighborhood: optionalText,
  addressCity: optionalText,
  addressState: optionalText,
  addressZipCode: optionalText,
  deliveryFee: z.number().min(0),
  freeDeliveryMinOrder: z.number().min(0).nullish(),
  minOrderValue: z.number().min(0),
  estimatedDeliveryMinMin: z.number().int().min(0),
  estimatedDeliveryMinMax: z.number().int().min(0),
  estimatedPickupMinMin: z.number().int().min(0),
  estimatedPickupMinMax: z.number().int().min(0),
  acceptsDelivery: z.boolean(),
  acceptsPickup: z.boolean(),
  acceptedPaymentMethods: z
    .array(z.enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "CASH"]))
    .min(1, "Selecione ao menos uma forma de pagamento."),
});

const openingHoursSchema = z.array(
  z.object({
    weekday,
    isOpen: z.boolean(),
    opensAt: z.string().regex(/^\d{2}:\d{2}$/, "Use o formato HH:MM."),
    closesAt: z.string().regex(/^\d{2}:\d{2}$/, "Use o formato HH:MM."),
  }),
);

export const getStoreSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return getStoreSettings(storeId);
});

export const saveStoreSettingsFn = createServerFn({ method: "POST" })
  .validator(settingsSchema)
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    // Ranges are validated here rather than in the schema so the message can
    // name the offending pair instead of a generic field error.
    if (data.estimatedDeliveryMinMax < data.estimatedDeliveryMinMin) {
      return { ok: false as const, error: "O tempo máximo de entrega não pode ser menor que o mínimo." };
    }
    if (data.estimatedPickupMinMax < data.estimatedPickupMinMin) {
      return { ok: false as const, error: "O tempo máximo de retirada não pode ser menor que o mínimo." };
    }
    if (!data.acceptsDelivery && !data.acceptsPickup) {
      return { ok: false as const, error: "A loja precisa aceitar entrega ou retirada." };
    }
    const settings = await updateStoreSettings(storeId, data);
    return { ok: true as const, settings };
  });

export const saveOpeningHoursFn = createServerFn({ method: "POST" })
  .validator(openingHoursSchema)
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const invalid = data.find((h) => h.isOpen && h.closesAt <= h.opensAt);
    if (invalid) {
      return {
        ok: false as const,
        error: "O horário de fechamento precisa ser depois do de abertura.",
      };
    }
    await replaceOpeningHours(storeId, data);
    return { ok: true as const };
  });

export const addRestaurantPhotoFn = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().min(1), caption: z.string().nullish() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const photo = await addRestaurantPhoto(storeId, data);
    return { ok: true as const, photo };
  });

export const deleteRestaurantPhotoFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    await deleteRestaurantPhoto(storeId, data.id);
    return { ok: true as const };
  });
