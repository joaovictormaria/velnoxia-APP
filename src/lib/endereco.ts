/**
 * Endereço brasileiro escrito do jeito que um mapa entende.
 *
 * Existia uma versão disto em três telas, cada uma jogando fora um pedaço
 * diferente: a do entregador esquecia estado, CEP e país; a do pedido no painel
 * esquecia até o bairro. O resultado foi um endereço real, salvo inteiro e
 * correto no banco, que o Google respondia não existir.
 *
 *     Rua, Bairro, Cidade - UF, CEP, Brasil
 *
 * **O número da casa fica de fora, e isso é deliberado.** Testado numa entrega
 * real em Mosqueiro, Aracaju: com "Avenida Coronel André Lucas, 18" o Google
 * respondeu "não foi possível traçar uma rota" em todos os modos — de carro, de
 * moto, a pé. Sem o número, a mesma avenida roteia na hora. Ele não tem o
 * número mapeado ali e, em vez de cair na rua, desiste do trajeto inteiro.
 *
 * A troca é consciente: mantendo o número, o erro é catastrófico e silencioso —
 * o motoboy fica sem rota nenhuma; tirando, o erro é ameno — a rota para no
 * quarteirão certo. Entre as duas, a segunda é a que deixa ele trabalhar.
 *
 * Quem faz o papel do número é o CEP, que no Brasil costuma valer por um
 * quarteirão. Ele entra por último e nunca sozinho: buscar só "49009-225"
 * devolve um resultado em Pernambuco, porque sem o resto ele vira só um número.
 *
 * O número continua na tela do entregador, ao lado do endereço. Ele sai do que
 * vai para o mapa, não da vista de quem entrega — são os últimos cinquenta
 * metros, e quem os resolve é a pessoa, olhando a fachada.
 */

type EnderecoDeEntrega = {
  street?: string | null;
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
  const bairro = limpo(e.neighborhood);
  const cidade = limpo(e.city);
  const uf = limpo(e.state);
  const cep = cepEscrito(e.zipCode);

  if (!rua && !cep) return null;

  const localidade = [bairro, cidade && uf ? `${cidade} - ${uf}` : cidade].filter(Boolean).join(", ");

  return [rua, localidade, cep, "Brasil"].filter(Boolean).join(", ");
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
