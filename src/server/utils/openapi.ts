/**
 * OpenAPI/Swagger Documentation para Estoque APIs
 * Gera documentação automática dos endpoints
 */

export const OPENAPI_SPEC = {
  openapi: "3.0.0",
  info: {
    title: "Velnox.app - Estoque & Produção API",
    description: "API completa para gerenciamento de estoque e produção",
    version: "1.0.0",
    contact: {
      name: "Velnox.ia",
      url: "https://velnox.ia",
    },
  },
  servers: [
    {
      url: "https://api.velnox.app",
      description: "Produção",
    },
    {
      url: "http://localhost:5173",
      description: "Desenvolvimento",
    },
  ],
  tags: [
    {
      name: "Inventário",
      description: "CRUD de itens de estoque",
    },
    {
      name: "Alertas",
      description: "Alertas de estoque em tempo real",
    },
    {
      name: "Custos",
      description: "Análise de custos e lucratividade",
    },
    {
      name: "Notificações",
      description: "Email de alertas e relatórios",
    },
    {
      name: "Forecast",
      description: "Previsão de demanda e compras",
    },
  ],
  paths: {
    "/api/inventory/items": {
      get: {
        tags: ["Inventário"],
        summary: "Listar todos os itens",
        description: "Retorna lista paginada de itens de estoque",
        operationId: "getInventoryItems",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Lista de itens",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/InventoryItem",
                  },
                },
              },
            },
          },
          401: {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },
    "/api/inventory/items/create": {
      post: {
        tags: ["Inventário"],
        summary: "Criar novo item",
        description: "Cria um novo item de estoque",
        operationId: "createInventoryItem",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateInventoryItemInput",
              },
            },
          },
        },
        responses: {
          201: {
            description: "Item criado com sucesso",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/InventoryItem",
                },
              },
            },
          },
          400: {
            $ref: "#/components/responses/BadRequest",
          },
        },
      },
    },
    "/api/inventory/alerts/summary": {
      get: {
        tags: ["Alertas"],
        summary: "Dashboard de alertas",
        description: "Retorna resumo de alertas críticos",
        operationId: "getAlertsSummary",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Resumo de alertas",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AlertsSummary",
                },
              },
            },
          },
        },
      },
    },
    "/api/inventory/costs/kpis": {
      post: {
        tags: ["Custos"],
        summary: "KPIs Financeiros",
        description: "Retorna KPIs de custo e lucratividade",
        operationId: "getFinancialKPIs",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  days: {
                    type: "integer",
                    default: 30,
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "KPIs financeiros",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FinancialKPIs",
                },
              },
            },
          },
        },
      },
    },
    "/api/inventory/forecast/purchases": {
      post: {
        tags: ["Forecast"],
        summary: "Recomendações de compra",
        description: "Retorna lista de compras recomendadas",
        operationId: "getPurchaseRecommendations",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  forecastDays: {
                    type: "integer",
                    default: 7,
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Recomendações de compra",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/PurchaseRecommendation",
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/inventory/notify/alerts": {
      post: {
        tags: ["Notificações"],
        summary: "Enviar email de alertas",
        description: "Envia email com alertas críticos de estoque",
        operationId: "sendAlertEmail",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Email enviado com sucesso",
          },
          429: {
            $ref: "#/components/responses/RateLimit",
          },
        },
      },
    },
  },
  components: {
    schemas: {
      InventoryItem: {
        type: "object",
        required: ["id", "name", "baseUnitId", "itemType"],
        properties: {
          id: {
            type: "string",
            format: "cuid",
          },
          name: {
            type: "string",
          },
          sku: {
            type: "string",
            nullable: true,
          },
          quantityOnHand: {
            type: "number",
          },
          quantityReserved: {
            type: "number",
          },
          minimumThreshold: {
            type: "number",
            nullable: true,
          },
          cost: {
            type: "number",
            nullable: true,
          },
          isActive: {
            type: "boolean",
          },
        },
      },
      CreateInventoryItemInput: {
        type: "object",
        required: ["name", "baseUnitId"],
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 255,
          },
          sku: {
            type: "string",
            maxLength: 50,
            nullable: true,
          },
          barcode: {
            type: "string",
            maxLength: 50,
            nullable: true,
          },
          baseUnitId: {
            type: "string",
            format: "cuid",
          },
          cost: {
            type: "number",
            minimum: 0,
          },
          itemType: {
            type: "string",
            enum: ["INGREDIENT", "RESALE", "PRODUCED", "PACKAGING"],
          },
        },
      },
      AlertsSummary: {
        type: "object",
        properties: {
          totalCriticalItems: {
            type: "integer",
          },
          criticalAlerts: {
            type: "integer",
          },
          warningAlerts: {
            type: "integer",
          },
          itemsRunningOut: {
            type: "array",
            items: {
              type: "object",
            },
          },
        },
      },
      FinancialKPIs: {
        type: "object",
        properties: {
          totalSalesValue: {
            type: "number",
          },
          totalCost: {
            type: "number",
          },
          totalProfit: {
            type: "number",
          },
          profitMargin: {
            type: "number",
          },
        },
      },
      PurchaseRecommendation: {
        type: "object",
        properties: {
          itemId: {
            type: "string",
          },
          itemName: {
            type: "string",
          },
          recommendedOrder: {
            type: "number",
          },
          urgency: {
            type: "string",
            enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
          },
          reason: {
            type: "string",
          },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
    responses: {
      Unauthorized: {
        description: "Não autorizado",
      },
      BadRequest: {
        description: "Requisição inválida",
      },
      RateLimit: {
        description: "Muitas requisições",
      },
    },
  },
};

/**
 * Gerar URL do Swagger UI
 */
export function getSwaggerDocsUrl(): string {
  return `https://editor.swagger.io/?url=${encodeURIComponent(
    `https://api.velnox.app/openapi.json`
  )}`;
}
