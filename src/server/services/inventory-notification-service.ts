import { prisma } from "@/server/db/client";
import { Resend } from "resend";
import { InventoryAlertService } from "./inventory-alert-service";

/**
 * ServiÃ§o de NotificaÃ§Ãµes de Estoque
 * Envia emails quando hÃ¡ alertas crÃ­ticos
 */

const resend = new Resend(process.env.RESEND_API_KEY);

export class InventoryNotificationService {
  /**
   * Enviar email de alerta crÃ­tico
   */
  static async sendAlertEmail(storeId: string, adminEmail: string) {
    try {
      // Obter alertas
      const alerts = await InventoryAlertService.checkStoreAlerts(storeId);
      const criticalAlerts = alerts.filter((item) =>
        item.alerts.some((a) => a.severity === "CRITICAL")
      );

      if (criticalAlerts.length === 0) {
        return { success: false, reason: "Nenhum alerta crÃ­tico" };
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
        subject: `ðŸš¨ ${criticalAlerts.length} Alerta(s) CrÃ­tico(s) de Estoque`,
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
   * Enviar email de previsÃ£o de estoque
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
        subject: `ðŸ“‰ ${itemsRunningOut.length} Item(ns) Vai(Ã£o) Acabar em Breve`,
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
   * Enviar email de relatÃ³rio semanal
   */
  static async sendWeeklyReportEmail(storeId: string, adminEmail: string) {
    try {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
      });

      if (!store) {
        return { success: false, reason: "Store nÃ£o encontrada" };
      }

      const summary = await InventoryAlertService.getDashboardSummary(
        storeId
      );

      const htmlContent = this.generateWeeklyReportHTML(summary, store.name);

      const result = await resend.emails.send({
        from: "estoque@velnox.ia",
        to: adminEmail,
        subject: `ðŸ“Š RelatÃ³rio Semanal de Estoque - ${store.name}`,
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
        <h1 style="margin: 0;">ðŸš¨ Alertas CrÃ­ticos de Estoque</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px;">AÃ§Ã£o requerida imediatamente</p>
      </div>

      <div class="content">
        <p>OlÃ¡,</p>
        <p>VocÃª tem <strong>${alerts.length} alerta(s) crÃ­tico(s)</strong> que requerem atenÃ§Ã£o imediata:</p>

        ${alertsHTML}

        <p style="margin-top: 20px; color: #666; font-size: 14px;">
          <strong>RecomendaÃ§Ã£o:</strong> Entre no painel e tome as aÃ§Ãµes necessÃ¡rias para resolver estes alertas.
        </p>

        <a href="https://velnox.app/admin/estoque" class="button">
          Ir para Estoque
        </a>

        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #999; margin: 0;">
          Este Ã© um email automÃ¡tico. NÃ£o responda a este endereÃ§o.
        </p>
      </div>
    </div>
  </body>
</html>
    `;
  }

  /**
   * Gerar HTML para email de previsÃ£o
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
        <strong>Consumo DiÃ¡rio:</strong> ${item.dailyConsumption.toString()}/dia
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
        <h1 style="margin: 0;">ðŸ“‰ PrevisÃ£o: Estoque Vai Acabar</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px;">Planeje suas compras com antecedÃªncia</p>
      </div>

      <div class="content">
        <p>OlÃ¡,</p>
        <p>Baseado no consumo atual, <strong>${items.length} item(ns)</strong> vai(Ã£o) acabar em breve:</p>

        ${itemsHTML}

        <p style="margin-top: 20px; color: #666; font-size: 14px;">
          <strong>AÃ§Ã£o Recomendada:</strong> Antecipe suas compras para nÃ£o ficar sem estoque.
        </p>

        <a href="https://velnox.app/admin/estoque" class="button">
          Ver Detalhes
        </a>

        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #999; margin: 0;">
          Este Ã© um email automÃ¡tico. NÃ£o responda a este endereÃ§o.
        </p>
      </div>
    </div>
  </body>
</html>
    `;
  }

  /**
   * Gerar HTML para relatÃ³rio semanal
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
        <h1 style="margin: 0;">ðŸ“Š RelatÃ³rio Semanal</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px;">${storeName}</p>
      </div>

      <div class="content">
        <h2 style="margin-top: 0;">Resumo da Semana</h2>

        <div class="stats">
          <div class="stat-box">
            <div class="stat-number">${summary.totalCriticalItems}</div>
            <div class="stat-label">Items CrÃ­ticos</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${summary.totalAlerts}</div>
            <div class="stat-label">Total de Alertas</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${summary.criticalAlerts}</div>
            <div class="stat-label">Alertas CrÃ­ticos</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${summary.warningAlerts}</div>
            <div class="stat-label">Avisos</div>
          </div>
        </div>

        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">

        <h3>ðŸ“‹ RecomendaÃ§Ãµes:</h3>
        <ul style="font-size: 14px;">
          ${summary.totalCriticalItems > 0 ? `<li>âš ï¸ VocÃª tem <strong>${summary.totalCriticalItems}</strong> items com estoque crÃ­tico</li>` : ""}
          ${summary.criticalAlerts > 0 ? `<li>ðŸ”´ <strong>${summary.criticalAlerts}</strong> alerta(s) crÃ­tico(s) requer(em) atenÃ§Ã£o</li>` : ""}
          ${summary.warningAlerts > 0 ? `<li>ðŸŸ¡ <strong>${summary.warningAlerts}</strong> aviso(s) de estoque baixo</li>` : ""}
          ${summary.totalCriticalItems === 0 && summary.totalAlerts === 0 ? `<li>âœ… Tudo em ordem! Nenhum alerta de estoque.</li>` : ""}
        </ul>

        <a href="https://velnox.app/admin/estoque" class="button">
          Ver Dashboard Completo
        </a>

        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #999; margin: 0;">
          RelatÃ³rio enviado automaticamente todas as segundas-feiras Ã s 9:00 AM.
        </p>
      </div>
    </div>
  </body>
</html>
    `;
  }
}

