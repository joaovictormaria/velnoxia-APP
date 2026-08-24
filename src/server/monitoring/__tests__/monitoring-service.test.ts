import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Redis } from "ioredis";
import { prisma } from "../../db/client";
import { MonitoringService, HealthStatus } from "../monitoring-service";

/**
 * PRIORIDADE 16: TESTES DE MONITORAMENTO
 *
 * Valida health checks, coleta de métricas,
 * detecção de anomalias e geração de alertas.
 */

describe("MonitoringService: Health Checks", () => {
  let monitoringService: MonitoringService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    monitoringService = new MonitoringService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve fazer health check do PostgreSQL", async () => {
    const health = await monitoringService.getSystemHealth();

    expect(health.services.PostgreSQL).toBeDefined();
    expect(health.services.PostgreSQL.name).toBe("PostgreSQL");
    expect(health.services.PostgreSQL.status).toBe(HealthStatus.HEALTHY);
    expect(health.services.PostgreSQL.responseTime).toBeGreaterThan(0);
  });

  it("deve fazer health check do Redis", async () => {
    const health = await monitoringService.getSystemHealth();

    expect(health.services.Redis).toBeDefined();
    expect(health.services.Redis.status).toBe(HealthStatus.HEALTHY);
    expect(health.services.Redis.responseTime).toBeGreaterThan(0);
  });

  it("deve fazer health check do Stripe", async () => {
    const health = await monitoringService.getSystemHealth();

    expect(health.services.Stripe).toBeDefined();
  });

  it("deve determinar status geral como HEALTHY se todos saudáveis", async () => {
    const health = await monitoringService.getSystemHealth();

    expect(health.status).toBe(HealthStatus.HEALTHY);
  });

  it("deve retornar uptime em segundos", async () => {
    const health = await monitoringService.getSystemHealth();

    expect(health.uptime).toBeGreaterThanOrEqual(0);
    expect(typeof health.uptime).toBe("number");
  });

  it("deve incluir timestamp do check", async () => {
    const health = await monitoringService.getSystemHealth();

    expect(health.timestamp).toBeInstanceOf(Date);
  });
});

describe("MonitoringService: Application Metrics", () => {
  let monitoringService: MonitoringService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    monitoringService = new MonitoringService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve coletar zero requisições inicialmente", async () => {
    const metrics = await monitoringService.getApplicationMetrics();

    expect(metrics.requestsTotal).toBe(0);
    expect(metrics.errorsTotal).toBe(0);
  });

  it("deve registrar requisição", async () => {
    await monitoringService.recordRequest("GET", "/api/products", 200, 45);

    const metrics = await monitoringService.getApplicationMetrics();

    expect(metrics.requestsTotal).toBe(1);
    expect(metrics.errorsTotal).toBe(0);
  });

  it("deve contar requisições com erro", async () => {
    await monitoringService.recordRequest("GET", "/api/products", 200, 45);
    await monitoringService.recordRequest("POST", "/api/orders", 500, 120);

    const metrics = await monitoringService.getApplicationMetrics();

    expect(metrics.requestsTotal).toBe(2);
    expect(metrics.errorsTotal).toBe(1);
    expect(metrics.errorRate).toBe(50);
  });

  it("deve calcular latência média", async () => {
    await monitoringService.recordRequest("GET", "/api/1", 200, 100);
    await monitoringService.recordRequest("GET", "/api/2", 200, 200);
    await monitoringService.recordRequest("GET", "/api/3", 200, 300);

    const metrics = await monitoringService.getApplicationMetrics();

    expect(metrics.averageLatency).toBe(200);
  });

  it("deve calcular P95 e P99 latência", async () => {
    for (let i = 0; i < 100; i++) {
      await monitoringService.recordRequest("GET", "/api", 200, i * 10);
    }

    const metrics = await monitoringService.getApplicationMetrics();

    expect(metrics.p95Latency).toBeGreaterThan(0);
    expect(metrics.p99Latency).toBeGreaterThan(0);
    expect(metrics.p99Latency).toBeGreaterThanOrEqual(metrics.p95Latency);
  });

  it("deve manter requisições por minuto", async () => {
    await monitoringService.recordRequest("GET", "/api", 200, 50);
    await monitoringService.recordRequest("GET", "/api", 200, 50);
    await monitoringService.recordRequest("GET", "/api", 200, 50);

    const metrics = await monitoringService.getApplicationMetrics();

    expect(metrics.requestsPerMinute).toBe(3);
  });
});

describe("MonitoringService: Business Metrics", () => {
  let monitoringService: MonitoringService;
  let redis: Redis;
  let storeId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    monitoringService = new MonitoringService(redis);
    storeId = "test-store-monitoring";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" },
    });
  });

  afterEach(async () => {
    await prisma.order.deleteMany({ where: { storeId } });
    await prisma.customer.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve contar zero pedidos inicialmente", async () => {
    const metrics = await monitoringService.getBusinessMetrics(storeId);

    expect(metrics.ordersToday).toBe(0);
    expect(metrics.revenueToday).toBe(0);
  });

  it("deve contar pedidos de hoje", async () => {
    await prisma.order.create({
      data: {
        storeId,
        number: 1,
        status: "COMPLETED",
        subtotal: 100,
        total: 100,
      },
    });

    const metrics = await monitoringService.getBusinessMetrics(storeId);

    expect(metrics.ordersToday).toBe(1);
    expect(metrics.revenueToday).toBe(100);
  });

  it("deve calcular valor médio de pedido", async () => {
    await prisma.order.create({
      data: {
        storeId,
        number: 1,
        status: "COMPLETED",
        subtotal: 50,
        total: 50,
      },
    });

    await prisma.order.create({
      data: {
        storeId,
        number: 2,
        status: "COMPLETED",
        subtotal: 150,
        total: 150,
      },
    });

    const metrics = await monitoringService.getBusinessMetrics(storeId);

    expect(metrics.averageOrderValue).toBe(100);
  });

  it("deve contar clientes novos", async () => {
    await prisma.customer.create({
      data: { storeId, name: "Customer 1", phone: "11999999999" },
    });

    await prisma.customer.create({
      data: { storeId, name: "Customer 2", phone: "11888888888" },
    });

    const metrics = await monitoringService.getBusinessMetrics(storeId);

    expect(metrics.customersToday).toBe(2);
  });
});

describe("MonitoringService: Alerts", () => {
  let monitoringService: MonitoringService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    monitoringService = new MonitoringService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve criar alerta", async () => {
    const alert = await monitoringService.createAlert(
      "WARNING",
      "Taxa de erro elevada",
      "Error rate > 5%",
      "error_rate",
      5,
      7.5,
    );

    expect(alert.severity).toBe("WARNING");
    expect(alert.title).toBe("Taxa de erro elevada");
    expect(alert.currentValue).toBe(7.5);
    expect(alert.resolved).toBe(false);
  });

  it("deve incluir timestamp no alerta", async () => {
    const alert = await monitoringService.createAlert(
      "INFO",
      "Test",
      "Test alert",
      "test_metric",
      10,
      5,
    );

    expect(alert.timestamp).toBeInstanceOf(Date);
  });

  it("deve gerar ID único para alerta", async () => {
    const alert1 = await monitoringService.createAlert(
      "INFO",
      "Test 1",
      "Test",
      "metric1",
      10,
      5,
    );

    const alert2 = await monitoringService.createAlert(
      "INFO",
      "Test 2",
      "Test",
      "metric2",
      10,
      5,
    );

    expect(alert1.id).not.toBe(alert2.id);
  });

  it("deve listar alertas não resolvidos", async () => {
    await monitoringService.createAlert("WARNING", "Alert 1", "Test", "m1", 5, 7);
    await monitoringService.createAlert("ERROR", "Alert 2", "Test", "m2", 10, 15);

    const alerts = await monitoringService.listOpenAlerts();

    expect(alerts.length).toBe(2);
    expect(alerts[0].resolved).toBe(false);
  });

  it("deve manter histórico de alertas", async () => {
    for (let i = 0; i < 5; i++) {
      await monitoringService.createAlert(
        "INFO",
        `Alert ${i}`,
        "Test",
        "metric",
        10,
        i,
      );
    }

    const history = await monitoringService.getAlertHistory(100);

    expect(history.length).toBe(5);
  });
});

describe("MonitoringService: Anomaly Detection", () => {
  let monitoringService: MonitoringService;
  let redis: Redis;
  let storeId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    monitoringService = new MonitoringService(redis);
    storeId = "test-store-anomaly";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" },
    });
  });

  afterEach(async () => {
    await prisma.order.deleteMany({ where: { storeId } });
    await prisma.productInventory.deleteMany();
    await prisma.product.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve detectar taxa de erro alta", async () => {
    // Simular alta taxa de erro
    for (let i = 0; i < 10; i++) {
      await monitoringService.recordRequest("GET", "/api", i % 2 === 0 ? 500 : 200, 50);
    }

    const alerts = await monitoringService.detectAnomalies(storeId);

    const errorRateAlert = alerts.find((a) => a.metric === "error_rate");
    expect(errorRateAlert).toBeDefined();
  });

  it("deve detectar latência elevada", async () => {
    // Simular latência alta
    for (let i = 0; i < 5; i++) {
      await monitoringService.recordRequest("GET", "/api", 200, 600);
    }

    const alerts = await monitoringService.detectAnomalies(storeId);

    const latencyAlert = alerts.find((a) => a.metric === "average_latency");
    expect(latencyAlert).toBeDefined();
  });

  it("deve detectar estoque baixo", async () => {
    // Criar produto com estoque baixo
    const product = await prisma.product.create({
      data: {
        storeId,
        name: "Low Stock Product",
        slug: "low-stock",
        basePrice: 25.0,
      },
    });

    await prisma.productInventory.create({
      data: {
        productId: product.id,
        storeId,
        quantity: 5,
        lowStockThreshold: 10,
        lastRestocked: new Date(),
      },
    });

    // Criar múltiplos produtos com estoque baixo
    for (let i = 0; i < 11; i++) {
      const p = await prisma.product.create({
        data: {
          storeId,
          name: `Product ${i}`,
          slug: `product-${i}`,
          basePrice: 25.0,
        },
      });

      await prisma.productInventory.create({
        data: {
          productId: p.id,
          storeId,
          quantity: 2,
          lowStockThreshold: 10,
          lastRestocked: new Date(),
        },
      });
    }

    const alerts = await monitoringService.detectAnomalies(storeId);

    const stockAlert = alerts.find((a) => a.metric === "low_stock_products");
    expect(stockAlert).toBeDefined();
  });
});

describe("MonitoringService: Prometheus Format", () => {
  let monitoringService: MonitoringService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    monitoringService = new MonitoringService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve formatar métricas em Prometheus", async () => {
    await monitoringService.recordRequest("GET", "/api", 200, 50);
    await monitoringService.recordRequest("GET", "/api", 500, 100);

    const metrics = await monitoringService.getApplicationMetrics();
    const prometheus = monitoringService.formatPrometheusMetrics(metrics);

    expect(prometheus).toContain("requests_total");
    expect(prometheus).toContain("errors_total");
    expect(prometheus).toContain("error_rate");
    expect(prometheus).toContain("latency_average_ms");
  });

  it("deve incluir valores numéricos corretos", async () => {
    await monitoringService.recordRequest("GET", "/api", 200, 100);

    const metrics = await monitoringService.getApplicationMetrics();
    const prometheus = monitoringService.formatPrometheusMetrics(metrics);

    expect(prometheus).toContain("requests_total{} 1");
    expect(prometheus).toContain("errors_total{} 0");
  });
});

describe("MonitoringService: Cleanup", () => {
  let monitoringService: MonitoringService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    monitoringService = new MonitoringService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve limpar alertas antigos", async () => {
    // Criar alerta antigo (simular)
    const oldAlert = {
      id: "old-alert",
      severity: "INFO" as const,
      title: "Old",
      message: "Test",
      metric: "test",
      threshold: 10,
      currentValue: 5,
      timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 horas atrás
      resolved: false,
    };

    await redis.lpush("monitoring:alerts", JSON.stringify(oldAlert));
    await monitoringService.createAlert("INFO", "New", "Test", "test", 10, 5);

    const cleaned = await monitoringService.cleanupOldAlerts(24); // 24 horas

    expect(cleaned).toBeGreaterThan(0);
  });
});
