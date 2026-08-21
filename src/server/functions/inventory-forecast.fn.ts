import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getStoreFromSession } from "@/server/auth/session";
import { InventoryForecastService } from "@/server/services/inventory-forecast-service";

/**
 * Forecast item consumption
 * Prevê consumo futuro de um item
 */
export const forecastItemConsumption = createServerFn({ method: "POST" })
  .validator(
    z.object({
      itemId: z.string().cuid(),
      historicalDays: z.number().int().positive().optional(),
      forecastDays: z.number().int().positive().optional(),
    })
  )
  .handler(async ({ data }) => {
    const store = await getStoreFromSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryForecastService.forecastItemConsumption(
      store.id,
      data.itemId,
      data.historicalDays || 30,
      data.forecastDays || 7
    );
  });

/**
 * Forecast store consumption
 * Prevê consumo de todos os items
 */
export const forecastStoreConsumption = createServerFn({ method: "POST" })
  .validator(
    z.object({
      historicalDays: z.number().int().positive().optional(),
      forecastDays: z.number().int().positive().optional(),
    })
  )
  .handler(async ({ data }) => {
    const store = await getStoreFromSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryForecastService.forecastStoreConsumption(
      store.id,
      data.historicalDays || 30,
      data.forecastDays || 7
    );
  });

/**
 * Get purchase recommendations
 * Recomendações de compra baseadas em forecast
 */
export const getPurchaseRecommendations = createServerFn({
  method: "POST",
})
  .validator(
    z.object({
      forecastDays: z.number().int().positive().optional(),
    })
  )
  .handler(async ({ data }) => {
    const store = await getStoreFromSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryForecastService.getPurchaseRecommendations(
      store.id,
      data.forecastDays || 7
    );
  });

/**
 * Get demand trend
 * Análise de tendência de demanda
 */
export const getDemandTrend = createServerFn({ method: "POST" })
  .validator(
    z.object({
      days: z.number().int().positive().optional(),
    })
  )
  .handler(async ({ data }) => {
    const store = await getStoreFromSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryForecastService.getDemandTrend(store.id, data.days || 30);
  });
