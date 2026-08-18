/** Raio médio da Terra, em metros. */
const RAIO_TERRA = 6_371_000;

const rad = (graus: number) => (graus * Math.PI) / 180;

/**
 * Distância em linha reta entre dois pontos, em metros (fórmula de haversine).
 *
 * É distância de pássaro, não de rua: o entregador vai andar mais que isso. Foi
 * decidido assim porque calcular caminho de rua é justamente o que os
 * provedores de mapa cobram por consulta. Para "está chegando" resolve.
 */
export function distanciaEmMetros(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Coordenada plausível: descarta lixo antes de virar distância sem sentido. */
export function coordenadaValida(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/**
 * Texto que o cliente lê.
 *
 * Arredondado de propósito: abaixo de 1 km em passos de 50 m, acima em décimos
 * de quilômetro. O GPS de celular erra dezenas de metros, então "a 843 m"
 * fingiria uma precisão que o aparelho não tem — e ainda deixaria o cliente
 * localizar o entregador com mais exatidão do que ele precisa.
 */
export function textoDaDistancia(metros: number): string {
  if (metros < 1000) {
    const passo = Math.max(50, Math.round(metros / 50) * 50);
    return `${passo} m`;
  }
  const km = Math.round(metros / 100) / 10;
  return `${km.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} km`;
}
