import { prisma } from "../db/client";
import { Redis } from "ioredis";

/**
 * PRIORIDADE 16: MONITORAMENTO
 *
 * SaÃºde da aplicaÃ§Ã£o, mÃ©tricas de negÃ³cio, alertas de anomalias,
 * e preparaÃ§Ã£o para dashboards (Grafana).
 *
 * MÃ©todos de coleta:
 * - Health checks (BD, Redis, APIs externas)
 * - Application metrics (requisiÃ§Ãµes, erros, latÃªncia)
 * - Business metrics (pedidos, receita, taxa ocupaÃ§Ã£o)
 * - Anomaly detection (picos, quedas, padrÃµes suspeitos)
 *
 * Armazenamento: Redis (time-series) + Prometheus format
 * IntegraÃ§Ã£o: Grafana, New Relic, Datadog, CloudWatch
 *
 * Endpoints:
 * GET /health â†’ Health check bÃ¡sico (200 OK ou 503)
 * GET /health/detailed â†’ Status completo (BD, cache, APIs)
 * GET /metrics â†’ MÃ©tricas Prometheus
 * GET /metrics/business â†’ MÃ©tricas de negÃ³cio
 */

export enum HealthStatus {
  HEALTHY = "HEALTHY",
  DEGRADED = "DEGRADED",
  UNHEALTHY = "UNHEALTHY",
}

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  responseTime: number; // ms
  details?: string;
  lastChecked: Date;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: Date;
  services: Record<string, ServiceHealth>;
  uptime: number; // segundos
}

export interface ApplicationMetrics {
  requestsTotal: number;
  requestsPerMinute: number;
  errorsTotal: number;
  errorRate: number; // %
  averageLatency: number; // ms
  p95Latency: number; // ms
  p99Latency: number; // ms
  activeConnections: number;
  memoryUsageMB: number;
  cpuUsagePercent: number;
}

export interface BusinessMetrics {
  ordersToday: number;
  revenueToday: number; // BRL
  averageOrderValue: number; // BRL
  customersToday: number;
  conversionRate: number; // %
  averageTableOccupancyTime: number; // minutos
  tableOccupancyRate: number; // %
  lowStockProducts: number;
  failedPayments: number;
}

export interface Alert {
  id: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  title: string;
  message: string;
  metric: string;
  threshold: number;
  currentValue: number;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export class MonitoringService {
  private redis: Redis;
  private startTime = Date.now();

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Health check completo
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const services: Record<string, ServiceHealth> = {};

    // Verificar PostgreSQL
    services["PostgreSQL"] = await this.checkPostgreSQL();

    // Verificar Redis
    services["Redis"] = await this.checkRedis();

    // Verificar Stripe (opcional)
    services["Stripe"] = await this.checkStripe();

    // Determinar status geral
    const statuses = Object.values(services).map((s) => s.status);
    let overallStatus = HealthStatus.HEALTHY;

    if (statuses.includes(HealthStatus.UNHEALTHY)) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (statuses.includes(HealthStatus.DEGRADED)) {
      overallStatus = HealthStatus.DEGRADED;
    }

    return {
      status: overallStatus,
      timestamp: new Date(),
      services,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Verificar PostgreSQL
   */
  private async checkPostgreSQL(): Promise<ServiceHealth> {
    const start = performance.now();

    try {
      await prisma.$queryRaw`SELECT 1`;

      return {
        name: "PostgreSQL",
        status: HealthStatus.HEALTHY,
        responseTime: Math.round(performance.now() - start),
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        name: "PostgreSQL",
        status: HealthStatus.UNHEALTHY,
        responseTime: Math.round(performance.now() - start),
        details: String(error),
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Verificar Redis
   */
  private async checkRedis(): Promise<ServiceHealth> {
    const start = performance.now();

    try {
      await this.redis.ping();

      return {
        name: "Redis",
        status: HealthStatus.HEALTHY,
        responseTime: Math.round(performance.now() - start),
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        name: "Redis",
        status: HealthStatus.UNHEALTHY,
        responseTime: Math.round(performance.now() - start),
        details: String(error),
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Verificar Stripe (placeholder)
   */
  private async checkStripe(): Promise<ServiceHealth> {
    // Verificar Ãºltimas requisiÃ§Ãµes Stripe bem-sucedidas
    const lastSuccess = await this.redis.get("stripe:last_success");

    if (!lastSuccess) {
      return {
        name: "Stripe",
        status: HealthStatus.DEGRADED,
        responseTime: 0,
        details: "Nenhuma requisiÃ§Ã£o Stripe registrada",
        lastChecked: new Date(),
      };
    }

    const minutesAgo = (Date.now() - parseInt(lastSuccess)) / 60000;

    if (minutesAgo > 60) {
      return {
        name: "Stripe",
        status: HealthStatus.DEGRADED,
        responseTime: 0,
        details: `Ãšltimo sucesso ${Math.round(minutesAgo)} min atrÃ¡s`,
        lastChecked: new Date(),
      };
    }

    return {
      name: "Stripe",
      status: HealthStatus.HEALTHY,
      responseTime: 0,
      lastChecked: new Date(),
    };
  }

  /**
   * Coletar mÃ©tricas de aplicaÃ§Ã£o
   */
  async getApplicationMetrics(): Promise<ApplicationMetrics> {
    // Obter dados do Redis
    const requestsTotal = parseInt(await this.redis.get("metrics:requests:total") || "0");
    const errorsTotal = parseInt(await this.redis.get("metrics:errors:total") || "0");
    const latencies = (await this.redis.lrange("metrics:latencies", 0, -1)).map(Number);

    const requestsPerMinute = parseInt(
      await this.redis.get("metrics:requests:per_minute") || "0",
    );

    const errorRate = requestsTotal > 0 ? (errorsTotal / requestsTotal) * 100 : 0;
    const averageLatency = latencies.length > 0
      ? latencies.reduce((a: any, b: any) => a + b, 0) / latencies.length
      : 0;

    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    return {
      requestsTotal,
      requestsPerMinute,
      errorsTotal,
      errorRate: Math.round(errorRate * 100) / 100,
      averageLatency: Math.round(averageLatency),
      p95Latency: sortedLatencies[p95Index] || 0,
      p99Latency: sortedLatencies[p99Index] || 0,
      activeConnections: 0, // Placeholder
      memoryUsageMB: 0, // Placeholder
      cpuUsagePercent: 0, // Placeholder
    };
  }

  /**
   * Coletar mÃ©tricas de negÃ³cio
   */
  async getBusinessMetrics(storeId?: string): Promise<BusinessMetrics> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const whereClause = storeId ? { storeId, createdAt: { gte: today } } : { createdAt: { gte: today } };

    // Pedidos de hoje
    const orders = await prisma.order.findMany({
      where: whereClause,
      select: { total: true },
    });

    const ordersToday = orders.length;
    const revenueToday = orders.reduce((sum: any, o: any) => sum + Number(o.total), 0);
    const averageOrderValue = ordersToday > 0 ? revenueToday / ordersToday : 0;

    // Clientes novos hoje
    const customersToday = await prisma.customer.count({
      where: storeId
        ? { storeId, createdAt: { gte: today } }
        : { createdAt: { gte: today } },
    });

    // Mesas ocupadas
    let tableOccupancyRate = 0;
    let averageTableOccupancyTime = 0;

    if (storeId) {
      const tables = await prisma.table.findMany({
        where: { storeId, deletedAt: null },
      });

      const occupiedCount = tables.filter((t) => t.status === "OCCUPIED").length;
      tableOccupancyRate = tables.length > 0 ? (occupiedCount / tables.length) * 100 : 0;

      const occupancies = await (prisma as any).tableOccupancy.findMany({
        where: { storeId, checkOutAt: { not: null } },
      });

      const totalDuration = occupancies.reduce((sum: any, o: any) => sum + (o.durationMinutes || 0), 0);
      averageTableOccupancyTime = occupancies.length > 0
        ? totalDuration / occupancies.length
        : 0;
    }

    // Estoque baixo
    const lowStockCount = await (prisma as any).productInventory.count({
      where: storeId
        ? {
            storeId,
            quantity: { lt: (prisma as any).raw("low_stock_threshold") },
          }
        : undefined,
    });

    // Pagamentos falhados (placeholder)
    const failedPayments = 0;

    return {
      ordersToday,
      revenueToday,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      customersToday,
      conversionRate: 0, // Placeholder
      averageTableOccupancyTime: Math.round(averageTableOccupancyTime * 10) / 10,
      tableOccupancyRate: Math.round(tableOccupancyRate * 100) / 100,
      lowStockProducts: lowStockCount,
      failedPayments,
    };
  }

  /**
   * Registrar mÃ©trica de requisiÃ§Ã£o
   */
  async recordRequest(
    method: string,
    path: string,
    statusCode: number,
    latency: number,
  ): Promise<void> {
    // Incrementar totais
    await this.redis.incr("metrics:requests:total");

    if (statusCode >= 400) {
      await this.redis.incr("metrics:errors:total");
    }

    // Guardar latÃªncia (manter Ãºltimos 1000)
    await this.redis.lpush("metrics:latencies", latency.toString());
    await this.redis.ltrim("metrics:latencies", 0, 999);

    // Atualizar per-minute (TTL 60s)
    await this.redis.incr("metrics:requests:per_minute");
    await this.redis.expire("metrics:requests:per_minute", 60);
  }

  /**
   * Registrar evento de alerta
   */
  async createAlert(
    severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL",
    title: string,
    message: string,
    metric: string,
    threshold: number,
    currentValue: number,
  ): Promise<Alert> {
    const alert: Alert = {
      id: `alert-${Date.now()}`,
      severity,
      title,
      message,
      metric,
      threshold,
      currentValue,
      timestamp: new Date(),
      resolved: false,
    };

    // Armazenar em Redis
    await this.redis.lpush(
      "monitoring:alerts",
      JSON.stringify(alert),
    );

    // Manter Ãºltimos 1000 alertas
    await this.redis.ltrim("monitoring:alerts", 0, 999);

    // Log para auditoria
    console.warn(`[ALERT] ${severity}: ${title} (${metric}: ${currentValue}/${threshold})`);

    return alert;
  }

  /**
   * Detectar anomalias
   */
  async detectAnomalies(storeId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const metrics = await this.getBusinessMetrics(storeId);
    const appMetrics = await this.getApplicationMetrics();
    const health = await this.getSystemHealth();

    // Anomalia 1: Taxa de erro alta
    if (appMetrics.errorRate > 5) {
      alerts.push(
        await this.createAlert(
          "WARNING",
          "Taxa de erro elevada",
          `Error rate em ${appMetrics.errorRate.toFixed(2)}%`,
          "error_rate",
          5,
          appMetrics.errorRate,
        ),
      );
    }

    // Anomalia 2: LatÃªncia alta
    if (appMetrics.averageLatency > 500) {
      alerts.push(
        await this.createAlert(
          "WARNING",
          "LatÃªncia elevada",
          `LatÃªncia mÃ©dia: ${appMetrics.averageLatency}ms`,
          "average_latency",
          500,
          appMetrics.averageLatency,
        ),
      );
    }

    // Anomalia 3: Muitos produtos com estoque baixo
    if (metrics.lowStockProducts > 10) {
      alerts.push(
        await this.createAlert(
          "INFO",
          "Alerta de estoque",
          `${metrics.lowStockProducts} produtos com estoque baixo`,
          "low_stock_products",
          10,
          metrics.lowStockProducts,
        ),
      );
    }

    // Anomalia 4: ServiÃ§o degradado
    if (health.status === HealthStatus.DEGRADED) {
      alerts.push(
        await this.createAlert(
          "ERROR",
          "Sistema degradado",
          `Status geral: ${health.status}`,
          "system_health",
          0,
          1,
        ),
      );
    }

    // Anomalia 5: Sem pedidos por muito tempo
    if (metrics.ordersToday === 0) {
      const lastOrder = await this.redis.get(`store:${storeId}:last_order`);
      if (lastOrder) {
        const hoursSince = (Date.now() - parseInt(lastOrder)) / 3600000;
        if (hoursSince > 3) {
          alerts.push(
            await this.createAlert(
              "INFO",
              "Sem pedidos",
              `Sem pedidos hÃ¡ ${Math.round(hoursSince)} horas`,
              "orders_today",
              1,
              metrics.ordersToday,
            ),
          );
        }
      }
    }

    return alerts;
  }

  /**
   * Listar alertas nÃ£o resolvidos
   */
  async listOpenAlerts(): Promise<Alert[]> {
    const alertStrings = await this.redis.lrange("monitoring:alerts", 0, -1);
    const alerts = alertStrings.map((s: any) => JSON.parse(s) as Alert);

    return alerts.filter((a: any) => !a.resolved);
  }

  /**
   * Formatar mÃ©tricas em formato Prometheus
   */
  formatPrometheusMetrics(appMetrics: ApplicationMetrics): string {
    return `# HELP requests_total Total de requisiÃ§Ãµes
# TYPE requests_total counter
requests_total{} ${appMetrics.requestsTotal}

# HELP errors_total Total de erros
# TYPE errors_total counter
errors_total{} ${appMetrics.errorsTotal}

# HELP error_rate Taxa de erro (%)
# TYPE error_rate gauge
error_rate{} ${appMetrics.errorRate}

# HELP latency_average_ms LatÃªncia mÃ©dia (ms)
# TYPE latency_average_ms gauge
latency_average_ms{} ${appMetrics.averageLatency}

# HELP latency_p95_ms LatÃªncia P95 (ms)
# TYPE latency_p95_ms gauge
latency_p95_ms{} ${appMetrics.p95Latency}

# HELP latency_p99_ms LatÃªncia P99 (ms)
# TYPE latency_p99_ms gauge
latency_p99_ms{} ${appMetrics.p99Latency}

# HELP requests_per_minute RequisiÃ§Ãµes por minuto
# TYPE requests_per_minute gauge
requests_per_minute{} ${appMetrics.requestsPerMinute}
`;
  }

  /**
   * Obter histÃ³rico de alertas (Ãºltimos N)
   */
  async getAlertHistory(limit: number = 100): Promise<Alert[]> {
    const alertStrings = await this.redis.lrange("monitoring:alerts", 0, limit - 1);
    return alertStrings.map((s: any) => JSON.parse(s) as Alert);
  }

  /**
   * Limpar alertas antigos
   */
  async cleanupOldAlerts(olderThanHours: number = 24): Promise<number> {
    const allAlerts = await this.getAlertHistory(1000);
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;

    const toDelete = allAlerts.filter((a) => new Date(a.timestamp).getTime() < cutoff).length;

    if (toDelete > 0) {
      // Remover e reconstruir lista
      await this.redis.del("monitoring:alerts");
      for (const alert of allAlerts) {
        if (new Date(alert.timestamp).getTime() >= cutoff) {
          await this.redis.lpush("monitoring:alerts", JSON.stringify(alert));
        }
      }
    }

    return toDelete;
  }
}

/**
 * PADRÃ•ES DE INTEGRAÃ‡ÃƒO:
 *
 * 1. GRAFANA:
 *    - Data source: Prometheus
 *    - URL: http://localhost:9090
 *    - Scrape config: GET /metrics a cada 15s
 *
 * 2. ALERT MANAGER:
 *    - Webhook em /monitoring/alerts
 *    - EscalaÃ§Ã£o: INFO â†’ WARNING â†’ ERROR â†’ CRITICAL
 *    - NotificaÃ§Ãµes: Slack, Email, PagerDuty
 *
 * 3. DASHBOARD:
 *    GET /health â†’ Health page
 *    GET /metrics â†’ Prometheus format
 *    GET /metrics/business â†’ JSON para BI
 *
 * 4. SLO TRACKING:
 *    - Uptime: > 99.9%
 *    - Error rate: < 0.5%
 *    - P95 latency: < 500ms
 *    - Availability: > 99.5%
 */

/**
 * ALERTAS PREDEFINIDOS:
 *
 * - Error rate > 5%
 * - P95 latency > 500ms
 * - Database offline
 * - Redis offline
 * - Memory > 80%
 * - CPU > 90%
 * - Low stock (> 10 produtos)
 * - No orders (> 3 horas)
 * - Failed payments
 * - System health degraded
 */

