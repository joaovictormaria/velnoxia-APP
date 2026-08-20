/**
 * Endereço brasileiro escrito do jeito que um mapa entende.
 *
 * Existia uma versão disto em três telas, cada uma jogando fora um pedaço
 * diferente: a do entregador esquecia estado, CEP e país; a do pedido no painel
 * esquecia até o bairro. O resultado foi um endereço real, salvo inteiro e
 * correto no banco, que o Google respondia não existir.
 *
 * A forma abaixo é a convenção dos Correios, que é a que os mapas reconhecem:
 *
 *     Rua, número - Bairro, Cidade - UF, CEP, Brasil
 *
 * O CEP entra por último e nunca sozinho: buscar só "49009-225" devolve um
 * resultado em Pernambuco, porque sem o resto ele vira só um número.
 */

type EnderecoDeEntrega = {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
};

const limpo = (v: string | null | undefined) => v?.trim() || null;

/** 49009225 -> 49009-225. Devolve como veio se não for um CEP de 8 dígitos. */
export function cepEscrito(cep: string | null | undefined): string | null {
  const digitos = limpo(cep)?.replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

/**
 * A linha que vai para o mapa. Null quando não há nem rua nem CEP — sem um dos
 * dois não há o que procurar, e mandar "Aracaju - SE" abriria o centro da
 * cidade como se fosse a casa do cliente.
 */
export function enderecoParaMapa(e: EnderecoDeEntrega): string | null {
  const rua = limpo(e.street);
  const numero = limpo(e.number);
  const bairro = limpo(e.neighborhood);
  const cidade = limpo(e.city);
  const uf = limpo(e.state);
  const cep = cepEscrito(e.zipCode);

  if (!rua && !cep) return null;

  // O complemento fica de fora de propósito: "apto 302", "fundos" e "casa 2"
  // não existem para o mapa e só atrapalham a busca do número na rua.
  const logradouro = [rua, numero].filter(Boolean).join(", ");
  const localidade = [bairro, cidade && uf ? `${cidade} - ${uf}` : cidade].filter(Boolean).join(", ");

  return [logradouro, localidade, cep, "Brasil"].filter(Boolean).join(", ");
}

/**
 * Link de rota, e não de busca: abre o trajeto já traçado a partir de onde a
 * pessoa está. Para quem está na moto é um toque a menos — a busca só marcava
 * o destino e ainda exigia pedir a rota lá dentro.
 */
export function rotaNoMapa(e: EnderecoDeEntrega): string | null {
  const destino = enderecoParaMapa(e);
  if (!destino) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
}

/** Só marcar o ponto no mapa, para quem está olhando e não indo. */
export function buscaNoMapa(e: EnderecoDeEntrega): string | null {
  const alvo = enderecoParaMapa(e);
  if (!alvo) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alvo)}`;
}
