// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import {
  checkInventoryHealth,
  getInventoryMetrics,
  getPerformanceAnalytics,
  checkThresholds,
} from "@/server/utils/health-check";

/**
 * Endpoint: GET /api/health/inventory
 * Retorna status de saÃºde do sistema de estoque
 */
export const getInventoryHealth = createServerFn({ method: "GET" }).handler(
  async () => {
    return await checkInventoryHealth();
  }
);

/**
 * Endpoint: GET /api/health/metrics
 * Retorna mÃ©tricas detalhadas do inventÃ¡rio
 */
export const getInventoryMetricsEndpoint = createServerFn({
  method: "GET",
}).handler(async () => {
  return await getInventoryMetrics();
});

/**
 * Endpoint: GET /api/health/performance
 * Retorna anÃ¡lise de performance
 */
export const getPerformanceMetrics = createServerFn({ method: "GET" }).handler(
  async () => {
    return getPerformanceAnalytics();
  }
);

/**
 * Endpoint: GET /api/health/alerts
 * Verifica thresholds e retorna alertas
 */
export const checkHealthAlerts = createServerFn({ method: "GET" }).handler(
  async () => {
    return await checkThresholds();
  }
);

/**
 * Endpoint: GET /api/health/status
 * Status simplificado (UP/DEGRADED/DOWN)
 */
export const getHealthStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const health = await checkInventoryHealth();
    return {
      status: health.status,
      timestamp: health.timestamp,
      message:
        health.status === "UP"
          ? "Sistema operacional normalmente"
          : health.status === "DEGRADED"
            ? "Sistema funcionando com limitaÃ§Ãµes"
            : "Sistema indisponÃ­vel",
    };
  }
);

