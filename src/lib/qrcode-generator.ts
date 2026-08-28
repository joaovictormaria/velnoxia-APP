import QRCode from "qrcode";
import { comLegenda } from "./qr-menu-image";

export async function generateQRCodeDataUrl(text: string): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
    return dataUrl;
  } catch (error) {
    console.error("Erro ao gerar QRCode:", error);
    throw error;
  }
}

/**
 * O PNG do QR Code, opcionalmente com uma legenda impressa embaixo.
 *
 * `rotulo` existe porque o arquivo baixado precisa se identificar sozinho: dez
 * QR Codes de mesa impressos são dez quadrados idênticos, e quem os cola nas
 * mesas não tem como saber qual é qual. O nome vai DENTRO da imagem, e não só
 * no nome do arquivo, porque é o papel colado na mesa que precisa ser lido —
 * não o arquivo no computador.
 *
 * O CÓDIGO EM SI NÃO MUDA. Mesma largura, mesma margem, mesmas cores, mesma
 * URL codificada de antes; a legenda é composta por baixo, numa tela maior.
 * Sem `rotulo`, o retorno é exatamente o que sempre foi.
 *
 * A composição reaproveita `comLegenda`, que já resolve o assunto para o QR do
 * cardápio: quebra de linha, ajuste de fonte e — o detalhe que morde — fundo
 * branco explícito, porque canvas nasce transparente e transparência vira
 * preto em muita impressora.
 */
export async function generateQRCodePNG(text: string, rotulo?: string): Promise<Blob> {
  try {
    const canvas = await QRCode.toCanvas(text, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    if (rotulo) {
      // `comLegenda` devolve data URL; `fetch` é o caminho curto e sem
      // decodificação manual de base64 para chegar ao Blob que o download quer.
      const resposta = await fetch(comLegenda(canvas, rotulo));
      return await resposta.blob();
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to generate QRCode blob"));
        }
      }, "image/png");
    });
  } catch (error) {
    console.error("Erro ao gerar QRCode PNG:", error);
    throw error;
  }
}
