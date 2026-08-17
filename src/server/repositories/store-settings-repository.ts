import type { PaymentMethod, Weekday } from "@prisma/client";
import { prisma } from "../db/client";

/** The settings row is a singleton — the schema pins its id to this value. */
const SINGLETON_ID = "singleton";

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
 * Reads the singleton, creating it on first access so a fresh database (or one
 * migrated before the seed ran) never leaves the admin screen without a row.
 */
export async function getStoreSettings() {
  const existing = await prisma.storeSettings.findUnique({
    where: { id: SINGLETON_ID },
    include: {
      openingHours: true,
      restaurantPhotos: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (existing) return existing;

  return prisma.storeSettings.create({
    data: {
      id: SINGLETON_ID,
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
export async function getPublicStoreSettings() {
  const settings = await getStoreSettings();
  return {
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

export async function updateStoreSettings(data: StoreSettingsInput) {
  await getStoreSettings();
  return prisma.storeSettings.update({ where: { id: SINGLETON_ID }, data });
}

/** Upserts one row per weekday so the unique (store, weekday) pair is preserved. */
export async function replaceOpeningHours(hours: OpeningHourInput[]) {
  await getStoreSettings();
  await prisma.$transaction(
    hours.map((h) =>
      prisma.openingHour.upsert({
        where: {
          storeSettingsId_weekday: { storeSettingsId: SINGLETON_ID, weekday: h.weekday },
        },
        create: { storeSettingsId: SINGLETON_ID, ...h },
        update: { isOpen: h.isOpen, opensAt: h.opensAt, closesAt: h.closesAt },
      }),
    ),
  );
}

export function addRestaurantPhoto(data: { url: string; caption?: string | null }) {
  return prisma.restaurantPhoto.create({
    data: { storeSettingsId: SINGLETON_ID, url: data.url, caption: data.caption ?? null },
  });
}

export function deleteRestaurantPhoto(id: string) {
  return prisma.restaurantPhoto.delete({ where: { id } });
}
