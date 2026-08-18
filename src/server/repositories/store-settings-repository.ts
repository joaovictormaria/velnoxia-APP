import type { PaymentMethod, Weekday } from "@prisma/client";
import { prisma } from "../db/client";




export const WEEKDAYS: Weekday[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

export type StoreSettingsInput = {
  storeName: string;
  tagline?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  primaryColor: string;
  whatsappNumber: string;
  email?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZipCode?: string | null;
  deliveryFee: number;
  freeDeliveryMinOrder?: number | null;
  minOrderValue: number;
  estimatedDeliveryMinMin: number;
  estimatedDeliveryMinMax: number;
  estimatedPickupMinMin: number;
  estimatedPickupMinMax: number;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  acceptedPaymentMethods: PaymentMethod[];
};

export type OpeningHourInput = {
  weekday: Weekday;
  isOpen: boolean;
  opensAt: string;
  closesAt: string;
};

/**
 * Reads this store's settings, creating the row (and a full week of opening
 * hours) on first access — so a store that just signed up opens the admin with
 * a usable form instead of an empty screen.
 */
export async function getStoreSettings(storeId: string) {
  const existing = await prisma.storeSettings.findUnique({
    where: { storeId },
    include: {
      openingHours: true,
      restaurantPhotos: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (existing) return existing;

  return prisma.storeSettings.create({
    data: {
      storeId,
      whatsappNumber: "",
      openingHours: { create: WEEKDAYS.map((weekday) => ({ weekday })) },
    },
    include: {
      openingHours: true,
      restaurantPhotos: { orderBy: { sortOrder: "asc" } },
    },
  });
}

/**
 * Customer-facing subset. Selected explicitly so internal flags (auto-print,
 * notification toggles) never reach the public page.
 */
export async function getPublicStoreSettings(storeId: string) {
  const settings = await getStoreSettings(storeId);
  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { businessType: true },
  });
  return {
    /** Chooses the hero photo and its rotating cravings on the storefront. */
    businessType: store.businessType,
    storeName: settings.storeName,
    tagline: settings.tagline,
    description: settings.description,
    logoUrl: settings.logoUrl,
    primaryColor: settings.primaryColor,
    whatsappNumber: settings.whatsappNumber,
    email: settings.email,
    instagramUrl: settings.instagramUrl,
    facebookUrl: settings.facebookUrl,
    tiktokUrl: settings.tiktokUrl,
    addressStreet: settings.addressStreet,
    addressNumber: settings.addressNumber,
    addressComplement: settings.addressComplement,
    addressNeighborhood: settings.addressNeighborhood,
    addressCity: settings.addressCity,
    addressState: settings.addressState,
    addressZipCode: settings.addressZipCode,
    deliveryFee: settings.deliveryFee,
    freeDeliveryMinOrder: settings.freeDeliveryMinOrder,
    minOrderValue: settings.minOrderValue,
    estimatedDeliveryMinMin: settings.estimatedDeliveryMinMin,
    estimatedDeliveryMinMax: settings.estimatedDeliveryMinMax,
    estimatedPickupMinMin: settings.estimatedPickupMinMin,
    estimatedPickupMinMax: settings.estimatedPickupMinMax,
    acceptsDelivery: settings.acceptsDelivery,
    acceptsPickup: settings.acceptsPickup,
    acceptedPaymentMethods: settings.acceptedPaymentMethods,
    openingHours: [...settings.openingHours]
      .sort((a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday))
      .map((h) => ({
        weekday: h.weekday,
        isOpen: h.isOpen,
        opensAt: h.opensAt,
        closesAt: h.closesAt,
      })),
    restaurantPhotos: settings.restaurantPhotos.map((p) => ({
      id: p.id,
      url: p.url,
      caption: p.caption,
    })),
  };
}

export async function updateStoreSettings(storeId: string, data: StoreSettingsInput) {
  const settings = await getStoreSettings(storeId);
  return prisma.storeSettings.update({ where: { id: settings.id }, data });
}

/** Upserts one row per weekday so the unique (store, weekday) pair is preserved. */
export async function replaceOpeningHours(storeId: string, hours: OpeningHourInput[]) {
  const settings = await getStoreSettings(storeId);
  await prisma.$transaction(
    hours.map((h) =>
      prisma.openingHour.upsert({
        where: {
          storeSettingsId_weekday: { storeSettingsId: settings.id, weekday: h.weekday },
        },
        create: { storeSettingsId: settings.id, ...h },
        update: { isOpen: h.isOpen, opensAt: h.opensAt, closesAt: h.closesAt },
      }),
    ),
  );
}

export async function addRestaurantPhoto(
  storeId: string,
  data: { url: string; caption?: string | null },
) {
  const settings = await getStoreSettings(storeId);
  return prisma.restaurantPhoto.create({
    data: { storeSettingsId: settings.id, url: data.url, caption: data.caption ?? null },
  });
}

/** Deletes through the settings row so a photo id from another store is a no-op. */
export async function deleteRestaurantPhoto(storeId: string, id: string) {
  const settings = await getStoreSettings(storeId);
  await prisma.restaurantPhoto.deleteMany({
    where: { id, storeSettingsId: settings.id },
  });
}
