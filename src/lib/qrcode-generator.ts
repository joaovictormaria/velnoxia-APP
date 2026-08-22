import QRCode from "qrcode";

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

export async function generateQRCodePNG(text: string): Promise<Blob> {
  try {
    const canvas = await QRCode.toCanvas(text, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
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
