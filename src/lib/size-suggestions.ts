/**
 * Tamanhos sugeridos por ramo.
 *
 * Só aparecem os do ramo da loja: uma marmitaria não tem nada a ver com
 * "Brotinho", e oferecer as cinco listas de uma vez obriga o dono a garimpar
 * entre opções que nunca vai usar.
 *
 * São sugestões, não uma lista fechada — o campo livre continua ao lado para o
 * que não couber aqui.
 */

const PIZZA = ["Brotinho", "Média", "Grande", "Gigante"];
const LETRAS = ["P", "M", "G", "GG"];
const POR_EXTENSO = ["Pequeno", "Médio", "Grande"];
const COPOS = ["300ml", "400ml", "500ml", "700ml", "1L"];
const PORCOES = ["Individual", "Para dois", "Família"];

const POR_RAMO: Record<string, string[]> = {
  pizzaria: PIZZA,

  // Lanche costuma variar pela quantidade de carne, não pelo tamanho do prato.
  hamburgueria: ["Simples", "Duplo", "Triplo"],
  "fast-food": ["Simples", "Duplo", "Triplo"],
  "hot-dog": ["Simples", "Duplo"],

  // Prato e marmita se medem em P/M/G no balcão inteiro do Brasil.
  restaurante: LETRAS,
  "comida-caseira": LETRAS,
  "comida-brasileira": LETRAS,
  marmitaria: LETRAS,
  saudavel: LETRAS,

  // Carne se vende por peso; a porção diz para quantos serve.
  churrascaria: ["Individual", "300g", "500g", "1kg"],

  // Combinado se conta em peças.
  japones: ["10 peças", "15 peças", "20 peças", "30 peças"],

  // Copo e pote se medem em volume.
  acai: COPOS,
  sorvetes: COPOS,

  cafeteria: POR_EXTENSO,
  confeitaria: ["Fatia", "Pequeno", "Médio", "Grande"],

  bar: PORCOES,
};

/** Cai em P/M/G quando o ramo não tem lista própria — serve em quase tudo. */
export function sugestoesDeTamanho(businessType: string): string[] {
  return POR_RAMO[businessType] ?? LETRAS;
}
