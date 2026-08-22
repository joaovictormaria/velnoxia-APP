import QRCode from "qrcode";
import { tableRepository } from "@/server/repositories/table-repository";

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://velnox.app.br";

export const tableService = {
  /**
   * Gera um QRCode para uma mesa
   * Retorna a URL pública e o código em base64
   */
  async generateTableQrCode(tableId: string, storeSlug: string) {
    // URL pública que será escaneada
    const qrcodeUrl = `${PUBLIC_BASE_URL}/${storeSlug}/mesa/${tableId}`;

    // Gera o QRCode em base64 (PNG)
    const qrcodeData = await QRCode.toDataURL(qrcodeUrl, {
      errorCorrectionLevel: "H",
      type: "image/png",
      quality: 0.95,
      margin: 1,
      width: 300,
    });

    return {
      qrcodeUrl,
      qrcodeData,
    };
  },

  /**
   * Gera SVG do QRCode (para impressão)
   */
  async generateTableQrCodeSVG(tableId: string, storeSlug: string) {
    const qrcodeUrl = `${PUBLIC_BASE_URL}/${storeSlug}/mesa/${tableId}`;

    const qrcodeSVG = await QRCode.toString(qrcodeUrl, {
      errorCorrectionLevel: "H",
      type: "image/svg+xml",
      width: 300,
      margin: 1,
    });

    return qrcodeSVG;
  },
};
