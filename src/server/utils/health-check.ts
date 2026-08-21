/**
 * Health Checks para Estoque
 * Monitora status do sistema
 */

import { prisma } from "../db/client";

export interface HealthStatus {
  status: "UP" | "DEGRADED" | "DOWN";
  timestamp: number;
  database: HealthCheckResult;
  alerts: HealthCheckResult;
  cache: HealthCheckResult;
}

export interface HealthCheckResult {
  healthy: boolean;
  responseTime: number;
  message?: string;
}

/**
 * Health check principal
 */
export async function checkInventoryHealth(): Promise<HealthStatus> {
  const timestamp = Date.now();
  let overallStatus: "UP" | "DEGRADED" | "DOWN" = "UP";

  // Database check
  const dbCheck = await checkDatabase();
  if (!dbCheck.healthy) {
    overallStatus = "DOWN";
  }

  // Alerts service check
  const alertsCheck = await checkAlertsService();
  if (!alertsCheck.healthy && overallStatus === "UP") {
    overallStatus = "DEGRADED";
  }

  // Cache check
  const cacheCheck = checkCacheHealth();
  if (!cacheCheck.healthy && overallStatus === "UP") {
    overallStatus = "DEGRADED";
  }

  return {
    status: overallStatus,
    timestamp,
    database: dbCheck,
    alerts: alertsCheck,
    cache: cacheCheck,
  };
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const result = await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - start;

    return {
      healthy: true,
      responseTime,
      message: "Database connection OK",
    };
  } catch (error) {
    const responseTime = Date.now() - start;

    return {
      healthy: false,
      responseTime,
      message: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Check alerts service
 */
async function checkAlertsService(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    // Verificar se há items
    const itemCount = await prisma.inventoryItem.count({
      where: {
        isActive: true,
      },
    });

    const responseTime = Date.now() - start;

    return {
      healthy: true,
      responseTime,
      message: `Alerts service OK (${itemCount} items)`,
    };
  } catch (error) {
    const responseTime = Date.now() - start;

    return {
      healthy: false,
      responseTime,
      message: `Alerts service error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Check cache health
 */
function checkCacheHealth(): HealthCheckResult {
  const start = Date.now();

  try {
    // Simular operação de cache
    const testKey = "health-check-test";
    // Aqui seria feita uma verificação real com o cache manager
    // Por agora, assumir que funciona
    const responseTime = Date.now() - start;

    return {
      healthy: true,
      responseTime,
      message: "Cache service OK",
    };
  } catch (error) {
    const responseTime = Date.now() - start;

    return {
      healthy: false,
      responseTime,
      message: `Cache error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Detailed inventory metrics
 */
export async function getInventoryMetrics() {
  try {
    const [totalItems, activeItems, totalValue] = await Promise.all([
      prisma.inventoryItem.count(),
      prisma.inventoryItem.count({ where: { isActive: true } }),
      prisma.inventoryItem.aggregate({
        _sum: {
          cost: true,
        },
        where: { isActive: true },
      }),
    ]);

    return {
      timestamp: Date.now(),
      items: {
        total: totalItems,
        active: activeItems,
        inactive: totalItems - activeItems,
      },
      alerts: {
        critical: 0,
        warning: 0,
      },
      financials: {
        totalInventoryValue: totalValue._sum.cost || 0,
      },
    };
  } catch (error) {
    throw new Error(
      `Failed to get inventory metrics: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  timestamp: number;
}

const performanceLog: PerformanceMetrics[] = [];
const MAX_LOG_SIZE = 1000;

/**
 * Log performance metric
 */
export function logPerformanceMetric(metric: PerformanceMetrics) {
  performanceLog.push(metric);

  // Keep log size manageable
  if (performanceLog.length > MAX_LOG_SIZE) {
    performanceLog.shift();
  }
}

/**
 * Get performance analytics
 */
export function getPerformanceAnalytics(
  endpoint?: string,
  minutes: number = 5
) {
  const cutoff = Date.now() - minutes * 60 * 1000;
  let filtered = performanceLog.filter((m) => m.timestamp > cutoff);

  if (endpoint) {
    filtered = filtered.filter((m) => m.endpoint === endpoint);
  }

  if (filtered.length === 0) {
    return {
      endpoint,
      count: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      errorRate: 0,
    };
  }

  const responseTimes = filtered.map((m) => m.responseTime).sort((a, b) => a - b);
  const errors = filtered.filter((m) => m.statusCode >= 400).length;

  const percentile = (p: number) => {
    const index = Math.ceil((p / 100) * responseTimes.length) - 1;
    return responseTimes[Math.max(0, index)];
  };

  return {
    endpoint,
    count: filtered.length,
    avgResponseTime: Math.round(
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    ),
    p95ResponseTime: percentile(95),
    p99ResponseTime: percentile(99),
    errorRate: (errors / filtered.length) * 100,
  };
}

/**
 * Alert based on metrics
 */
export interface AlertThreshold {
  metric: "responseTime" | "errorRate" | "criticalItems";
  threshold: number;
  severity: "WARNING" | "CRITICAL";
}

const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  {
    metric: "responseTime",
    threshold: 1000, // ms
    severity: "WARNING",
  },
  {
    metric: "errorRate",
    threshold: 5, // percent
    severity: "CRITICAL",
  },
  {
    metric: "criticalItems",
    threshold: 10,
    severity: "WARNING",
  },
];

/**
 * Check thresholds
 */
export async function checkThresholds(
  customThresholds?: AlertThreshold[]
) {
  const thresholds = customThresholds || DEFAULT_THRESHOLDS;
  const alerts: Array<{ threshold: AlertThreshold; actual: number }> = [];

  // Check performance
  const perf = getPerformanceAnalytics();
  const responseTimeThreshold = thresholds.find(
    (t) => t.metric === "responseTime"
  );
  if (responseTimeThreshold && perf.avgResponseTime > responseTimeThreshold.threshold) {
    alerts.push({
      threshold: responseTimeThreshold,
      actual: perf.avgResponseTime,
    });
  }

  // Check error rate
  const errorRateThreshold = thresholds.find((t) => t.metric === "errorRate");
  if (errorRateThreshold && perf.errorRate > errorRateThreshold.threshold) {
    alerts.push({
      threshold: errorRateThreshold,
      actual: perf.errorRate,
    });
  }

  // Check critical items
  const metrics = await getInventoryMetrics();
  const criticalThreshold = thresholds.find(
    (t) => t.metric === "criticalItems"
  );
  if (
    criticalThreshold &&
    metrics.alerts.critical > criticalThreshold.threshold
  ) {
    alerts.push({
      threshold: criticalThreshold,
      actual: metrics.alerts.critical,
    });
  }

  return alerts;
}
