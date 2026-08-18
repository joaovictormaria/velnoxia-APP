/**
 * Imagem do QR Code do cardápio, para o dono imprimir e colar nas mesas: o
 * código em cima, "Acesse o Cardápio do <loja>" embaixo, fundo branco.
 *
 * Só de navegador — usa canvas. Fica fora do componente para poder ser exercido
 * sem montar React, que é o que permite conferir a imagem pixel a pixel.
 */

/** Lado do QR em pixels. Grande porque o destino é a impressora: um QR de
 *  256 px esticado num adesivo de mesa sai serrilhado. */
export const LADO_QR = 1024;

/** Espaço lateral reservado para a legenda não encostar na borda do papel. */
const MARGEM_LATERAL = 72;

const FONTE_MAX = 60;
const FONTE_MIN = 30;

/** Até onde vale quebrar a frase antes de aceitar letra menor. */
const MAX_LINHAS = 3;

/** Respiro entre o QR e a frase, e sobra embaixo. Fixos, não derivados da
 *  fonte: assim a arte não encolhe junto quando o nome é comprido. */
const RESPIRO = 28;
const RODAPE = 44;
const FAMILIA = 'Arial, "Segoe UI", Helvetica, sans-serif';

export const legendaDoCardapio = (storeName: string) => `Acesse o Cardápio do ${storeName}`;

/**
 * Gera o PNG final, em data URL.
 *
 * O `qrcode` entra por import dinâmico: são ~19 kB que a maioria dos donos usa
 * uma vez, e não faz sentido pesarem no dashboard que ele abre todo dia.
 */
export async function gerarQrDoCardapio(menuUrl: string, storeName: string): Promise<string> {
  const { default: QRCode } = await import("qrcode");

  const qrDataUrl = await QRCode.toDataURL(menuUrl, {
    width: LADO_QR,
    // Quatro módulos de borda branca é o que a norma pede — sem essa margem o
    // leitor não acha onde o código começa.
    margin: 4,
    // Nível Q aguenta cerca de 25% do código danificado. Numa mesa de
    // lanchonete o adesivo vive sendo raspado e engordurado.
    errorCorrectionLevel: "Q",
  });

  return comLegenda(await carregarImagem(qrDataUrl), legendaDoCardapio(storeName));
}

function carregarImagem(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("QR não carregou"));
    img.src = src;
  });
}

function novoContexto(largura?: number, altura?: number) {
  const canvas = document.createElement("canvas");
  if (largura) canvas.width = largura;
  if (altura) canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  return { canvas, ctx };
}

/** Divide a frase em linhas que caibam na largura, na fonte já posta no ctx. */
function quebrar(ctx: CanvasRenderingContext2D, texto: string, disponivel: number) {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(" ")) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && ctx.measureText(tentativa).width > disponivel) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = tentativa;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/**
 * Escolhe o tamanho da fonte e quebra a legenda em linhas.
 *
 * Quebra ANTES de encolher: num adesivo de mesa, lido a um metro de
 * distância, duas linhas grandes valem mais que uma linha pequena. Encolher só
 * entra quando nem três linhas resolvem — nome de lanchonete varia muito
 * ("Zé" e "Pizzaria e Esfiharia do Seu Antônio" saem do mesmo campo).
 */
export function ajustarLegenda(texto: string, largura: number) {
  const { ctx } = novoContexto();
  const disponivel = largura - MARGEM_LATERAL * 2;

  for (let tamanho = FONTE_MAX; tamanho >= FONTE_MIN; tamanho -= 2) {
    ctx.font = `bold ${tamanho}px ${FAMILIA}`;
    const linhas = quebrar(ctx, texto, disponivel);
    // Uma palavra sozinha pode estourar a largura por si só; nesse caso a
    // fonte menor da próxima volta é o que resolve.
    const todasCabem = linhas.every((l) => ctx.measureText(l).width <= disponivel);
    if (linhas.length <= MAX_LINHAS && todasCabem) return { tamanho, linhas };
  }

  ctx.font = `bold ${FONTE_MIN}px ${FAMILIA}`;
  return { tamanho: FONTE_MIN, linhas: quebrar(ctx, texto, disponivel) };
}

/** Monta a imagem final: o QR em cima, a chamada embaixo, fundo branco. */
export function comLegenda(qr: HTMLImageElement | HTMLCanvasElement, texto: string) {
  const larguraQr = qr.width;
  const alturaQr = qr.height;
  const { tamanho, linhas } = ajustarLegenda(texto, larguraQr);

  const alturaLinha = Math.round(tamanho * 1.25);

  const { canvas, ctx } = novoContexto(
    larguraQr,
    alturaQr + RESPIRO + alturaLinha * linhas.length + RODAPE,
  );

  // Fundo branco explícito: canvas nasce transparente, e transparência virando
  // preto é surpresa comum de impressora.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(qr, 0, 0);

  ctx.fillStyle = "#111111";
  ctx.font = `bold ${tamanho}px ${FAMILIA}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  linhas.forEach((linha, i) => {
    ctx.fillText(linha, canvas.width / 2, alturaQr + RESPIRO + alturaLinha * i);
  });

  return canvas.toDataURL("image/png");
}
