import { prisma } from "@/server/db/client";
import { Resend } from "@anthropic-ai/sdk";
import { InventoryAlertService } from "./inventory-alert-service";

/**
 * Serviço de Notificações de Estoque
 * Envia emails quando há alertas críticos
 */

const resend = new Resend(process.env.RESEND_API_KEY);

export class InventoryNotificationService {
  /**
   * Enviar email de alerta crítico
   */
  static async sendAlertEmail(storeId: string, adminEmail: string) {
    try {
      // Obter alertas
      const alerts = await InventoryAlertService.checkStoreAlerts(storeId);
      const criticalAlerts = alerts.filter((item) =>
        item.alerts.some((a) => a.severity === "CRITICAL")
      );

      if (criticalAlerts.length === 0) {
        return { success: false, reason: "Nenhum alerta crítico" };
      }

      // Gerar HTML do email
      const htmlContent = this.generateAlertEmailHTML(
        criticalAlerts,
        storeId
      );

      // Enviar via Resend
      const result = await resend.emails.send({
        from: "estoque@velnox.ia",
        to: adminEmail,
        subject: `🚨 ${criticalAlerts.length} Alerta(s) Crítico(s) de Estoque`,
        html: htmlContent,
      });

      if (result.error) {
        console.error("Email error:", result.error);
        return { success: false, error: result.error.message };
      }

      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Notification error:", error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Enviar email de previsão de estoque
   */
  static async sendForecastEmail(storeId: string, adminEmail: string) {
    try {
      const forecast = await InventoryAlertService.getStockRunoutForecast(
        storeId,
        7
      );

      const itemsRunningOut = forecast.filter(
        (item) =>
          item.daysUntilRunout !== null && item.daysUntilRunout < 3
      );

      if (itemsRunningOut.length === 0) {
        return { success: false, reason: "Nenhum item vai acabar" };
      }

      const htmlContent = this.generateForecastEmailHTML(
        itemsRunningOut,
        storeId
      );

      const result = await resend.emails.send({
        from: "estoque@velnox.ia",
        to: adminEmail,
        subject: `📉 ${itemsRunningOut.length} Item(ns) Vai(ão) Acabar em Breve`,
        html: htmlContent,
      });

      if (result.error) {
        console.error("Email error:", result.error);
        return { success: false, error: result.error.message };
      }

      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Notification error:", error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Enviar email de relatório semanal
   */
  static async sendWeeklyReportEmail(storeId: string, adminEmail: string) {
    try {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
      });

      if (!store) {
        return { success: false, reason: "Store não encontrada" };
      }

      const summary = await InventoryAlertService.getDashboardSummary(
        storeId
      );

      const htmlContent = this.generateWeeklyReportHTML(summary, store.name);

      const result = await resend.emails.send({
        from: "estoque@velnox.ia",
        to: adminEmail,
        subject: `📊 Relatório Semanal de Estoque - ${store.name}`,
        html: htmlContent,
      });

      if (result.error) {
        console.error("Email error:", result.error);
        return { success: false, error: result.error.message };
      }

      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Notification error:", error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Gerar HTML para email de alerta
   */
  private static generateAlertEmailHTML(
    alerts: Awaited<ReturnType<typeof InventoryAlertService.checkStoreAlerts>>,
    storeId: string
  ): string {
    const alertsHTML = alerts
      .map(
        (item) => `
    <div style="border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 12px; background: #fee2e2;">
      <h3 style="margin: 0 0 8px 0; color: #991b1b; font-size: 16px;">${item.itemName}</h3>
      ${item.alerts
        .map(
          (alert) => `
        <p style="margin: 4px 0; color: #7f1d1d; font-size: 14px;">
          <strong>${alert.type}:</strong> ${alert.message}
        </p>
      `
        )
        .join("")}
    </div>
  `
      )
      .join("");

    return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: #0a0a0a; color: white; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
      .content { background: #f9fafb; padding: 20px; border-radius: 8px; }
      .button { background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">🚨 Alertas Críticos de Estoque</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px;">Ação requerida imediatamente</p>
      </div>

      <div class="content">
        <p>Olá,</p>
        <p>Você tem <strong>${alerts.length} alerta(s) crítico(s)</strong> que requerem atenção imediata:</p>

        ${alertsHTML}

        <p style="margin-top: 20px; color: #666; font-size: 14px;">
          <strong>Recomendação:</strong> Entre no painel e tome as ações necessárias para resolver estes alertas.
        </p>

        <a href="https://velnox.app/admin/estoque" class="button">
          Ir para Estoque
        </a>

        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #999; margin: 0;">
          Este é um email automático. Não responda a este endereço.
        </p>
      </div>
    </div>
  </body>
</html>
    `;
  }

  /**
   * Gerar HTML para email de previsão
   */
  private static generateForecastEmailHTML(
    items: Awaited<
      ReturnType<typeof InventoryAlertService.getStockRunoutForecast>
    >,
    storeId: string
  ): string {
    const itemsHTML = items
      .map(
        (item) => `
    <div style="border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 12px; background: #fef3c7;">
      <h3 style="margin: 0 0 8px 0; color: #92400e; font-size: 16px;">${item.itemName}</h3>
      <p style="margin: 4px 0; color: #b45309;">
        <strong>Quantidade Atual:</strong> ${item.currentQty.toString()}
      </p>
      <p style="margin: 4px 0; color: #b45309;">
        <strong>Consumo Diário:</strong> ${item.dailyConsumption.toString()}/dia
      </p>
      ${
        item.daysUntilRunout !== null
          ? `
        <p style="margin: 4px 0; color: #b45309;">
          <strong>Vai Acabar em:</strong> ${Math.round(item.daysUntilRunout)} dias
          (${item.estimatedRunoutDate?.toLocaleDateString("pt-BR")})
        </p>
      `
          : ""
      }
    </div>
  `
      )
      .join("");

    return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: #0a0a0a; color: white; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
      .content { background: #f9fafb; padding: 20px; border-radius: 8px; }
      .button { background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">📉 Previsão: Estoque Vai Acabar</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px;">Planeje suas compras com antecedência</p>
      </div>

      <div class="content">
        <p>Olá,</p>
        <p>Baseado no consumo atual, <strong>${items.length} item(ns)</strong> vai(ão) acabar em breve:</p>

        ${itemsHTML}

        <p style="margin-top: 20px; color: #666; font-size: 14px;">
          <strong>Ação Recomendada:</strong> Antecipe suas compras para não ficar sem estoque.
        </p>

        <a href="https://velnox.app/admin/estoque" class="button">
          Ver Detalhes
        </a>

        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #999; margin: 0;">
          Este é um email automático. Não responda a este endereço.
        </p>
      </div>
    </div>
  </body>
</html>
    `;
  }

  /**
   * Gerar HTML para relatório semanal
   */
  private static generateWeeklyReportHTML(
    summary: Awaited<ReturnType<typeof InventoryAlertService.getDashboardSummary>>,
    storeName: string
  ): string {
    return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: #0a0a0a; color: white; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
      .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 20px 0; }
      .stat-box { background: #eff6ff; border: 2px solid #3b82f6; padding: 12px; border-radius: 6px; text-align: center; }
      .stat-number { font-size: 24px; font-weight: bold; color: #1e40af; }
      .stat-label { font-size: 12px; color: #1e40af; }
      .content { background: #f9fafb; padding: 20px; border-radius: 8px; }
      .button { background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">📊 Relatório Semanal</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px;">${storeName}</p>
      </div>

      <div class="content">
        <h2 style="margin-top: 0;">Resumo da Semana</h2>

        <div class="stats">
          <div class="stat-box">
            <div class="stat-number">${summary.totalCriticalItems}</div>
            <div class="stat-label">Items Críticos</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${summary.totalAlerts}</div>
            <div class="stat-label">Total de Alertas</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${summary.criticalAlerts}</div>
            <div class="stat-label">Alertas Críticos</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${summary.warningAlerts}</div>
            <div class="stat-label">Avisos</div>
          </div>
        </div>

        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">

        <h3>📋 Recomendações:</h3>
        <ul style="font-size: 14px;">
          ${summary.totalCriticalItems > 0 ? `<li>⚠️ Você tem <strong>${summary.totalCriticalItems}</strong> items com estoque crítico</li>` : ""}
          ${summary.criticalAlerts > 0 ? `<li>🔴 <strong>${summary.criticalAlerts}</strong> alerta(s) crítico(s) requer(em) atenção</li>` : ""}
          ${summary.warningAlerts > 0 ? `<li>🟡 <strong>${summary.warningAlerts}</strong> aviso(s) de estoque baixo</li>` : ""}
          ${summary.totalCriticalItems === 0 && summary.totalAlerts === 0 ? `<li>✅ Tudo em ordem! Nenhum alerta de estoque.</li>` : ""}
        </ul>

        <a href="https://velnox.app/admin/estoque" class="button">
          Ver Dashboard Completo
        </a>

        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #999; margin: 0;">
          Relatório enviado automaticamente todas as segundas-feiras às 9:00 AM.
        </p>
      </div>
    </div>
  </body>
</html>
    `;
  }
}
