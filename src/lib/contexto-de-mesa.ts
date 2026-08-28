/**
 * O CONTEXTO DE MESA NO NAVEGADOR — porta única.
 *
 * Antes este estado morava em quatro chaves globais de `localStorage`
 * (`tableId`, `tableNumber`, `deviceToken`, `sessionId`), escritas pelo fluxo
 * do QR e lidas direto por quem quisesse. Nenhuma tinha loja, nenhuma tinha
 * prazo, e `tableId` não era removida em lugar nenhum do sistema — havia um
 * comentário no checkout dizendo que ela "só sai quando o admin finaliza a
 * mesa", mas esse código nunca existiu.
 *
 * O resultado: quem escaneasse uma mesa uma vez virava cliente de mesa para
 * sempre, naquele navegador, em TODAS as lojas. Na vitrine pública o pedido
 * saía sem opção de entrega, com o nome trocado por "Mesa N", e era recusado
 * com "Sessão de mesa expirou ou PIN inválido" — um erro de mesa num pedido
 * que nunca teve mesa.
 *
 * Duas coisas consertam isso, e as duas moram aqui:
 *
 *   1. A CHAVE TEM LOJA. Mesa do restaurante A não existe para o restaurante B.
 *      O mapa `tableNumbers_<slug>` já era escopado assim; o escopo tinha sido
 *      lembrado numa chave e esquecido nas outras quatro.
 *
 *   2. A CHAVE TEM PRAZO — as mesmas 24 horas da sessão no banco. Vencido, o
 *      contexto não é devolvido e é apagado na hora: o navegador não fica
 *      afirmando uma sessão que o servidor já encerrou.
 *
 * PIN É PROPRIEDADE DA MESA, NÃO DO PEDIDO. Quem não passou por
 * `/qr/{loja}/{mesa}` não tem contexto aqui, e sem contexto o checkout não
 * envia `tableId` nem `deviceToken` — então o servidor nem chega perto da
 * validação de PIN.
 */

export type ContextoDeMesa = {
  tableId: string;
  tableNumber: number | null;
  deviceToken: string | null;
  sessionId: string | null;
  pin: string | null;
};

type Guardado = ContextoDeMesa & { expiraEm: number };

/** As mesmas 24h de `TableSession.expiresAt`. */
export const VALIDADE_MS = 24 * 60 * 60 * 1000;

/**
 * As chaves globais da versão antiga.
 *
 * São apagadas a cada leitura ou escrita daqui. `removeItem` de chave que não
 * existe não custa nada, e fazer isso sem guardar um "já limpei" evita o caso
 * em que a limpeza roda uma vez, falha, e nunca mais tenta.
 */
const CHAVES_LEGADAS = ["tableId", "tableNumber", "deviceToken", "sessionId", "pin"];

const chave = (storeSlug: string) => `contextoDeMesa_${storeSlug}`;

/**
 * `localStorage` some no servidor e pode LANÇAR no navegador — em aba anônima,
 * com cookies de terceiros bloqueados, ou com a cota estourada. Um contexto de
 * mesa ilegível vira ausência de mesa, que é o lado seguro: o cliente refaz o
 * scan. O lado inseguro seria o contrário.
 */
function comStorage<T>(acao: (s: Storage) => T, padrao: T): T {
  if (typeof window === "undefined") return padrao;
  try {
    return acao(window.localStorage);
  } catch {
    return padrao;
  }
}

function apagarLegado(s: Storage) {
  for (const k of CHAVES_LEGADAS) s.removeItem(k);
}

/**
 * O contexto de mesa desta loja, ou `null`.
 *
 * `null` significa VITRINE PÚBLICA, e é o que responde para: nunca escaneou,
 * escaneou noutra loja, escaneou há mais de 24h, ou tem só o estado antigo
 * guardado. Nesses casos o pedido é público — sem mesa, sem PIN, sem sessão.
 */
export function lerContextoDeMesa(storeSlug: string): ContextoDeMesa | null {
  return comStorage((s) => {
    apagarLegado(s);

    const cru = s.getItem(chave(storeSlug));
    if (!cru) return null;

    let dados: Guardado;
    try {
      dados = JSON.parse(cru) as Guardado;
    } catch {
      // Escrita truncada ou de um formato anterior: descarta em vez de tentar
      // adivinhar o que aquilo queria dizer.
      s.removeItem(chave(storeSlug));
      return null;
    }

    if (!dados?.tableId || typeof dados.expiraEm !== "number") {
      s.removeItem(chave(storeSlug));
      return null;
    }

    if (Date.now() >= dados.expiraEm) {
      // Vencido some na leitura, e não numa varredura periódica: o momento em
      // que alguém pergunta é o único em que a resposta importa.
      s.removeItem(chave(storeSlug));
      return null;
    }

    return {
      tableId: dados.tableId,
      tableNumber: dados.tableNumber ?? null,
      deviceToken: dados.deviceToken ?? null,
      sessionId: dados.sessionId ?? null,
      pin: dados.pin ?? null,
    };
  }, null);
}

/**
 * Abre um contexto de mesa. Só o fluxo do QR chama isto.
 *
 * Sobrescreve o que houvesse: escanear de novo é começar de novo, e o prazo
 * reinicia junto — que é o comportamento do servidor ao abrir a sessão.
 */
export function gravarContextoDeMesa(
  storeSlug: string,
  contexto: Partial<ContextoDeMesa> & { tableId: string },
): void {
  comStorage((s) => {
    apagarLegado(s);
    const dados: Guardado = {
      tableId: contexto.tableId,
      tableNumber: contexto.tableNumber ?? null,
      deviceToken: contexto.deviceToken ?? null,
      sessionId: contexto.sessionId ?? null,
      pin: contexto.pin ?? null,
      expiraEm: Date.now() + VALIDADE_MS,
    };
    s.setItem(chave(storeSlug), JSON.stringify(dados));
  }, undefined);
}

/**
 * Completa o contexto com o que só se sabe depois.
 *
 * O `deviceToken` do segundo aparelho, por exemplo, só chega quando o PIN
 * passa — telas depois de o `tableId` ter sido guardado.
 *
 * NÃO ESTENDE O PRAZO: a validade é da sessão da mesa, contada de quando ela
 * abriu. Renovar aqui deixaria a mesa viva no navegador enquanto o servidor já
 * a considerou encerrada, que é exatamente a divergência que este módulo
 * existe para acabar. Sem contexto aberto, não faz nada — um PIN validado não
 * inventa uma mesa que ninguém escaneou.
 */
export function atualizarContextoDeMesa(
  storeSlug: string,
  remendo: Partial<Omit<ContextoDeMesa, "tableId">>,
): void {
  comStorage((s) => {
    const atual = lerContextoDeMesa(storeSlug);
    if (!atual) return;

    const cru = s.getItem(chave(storeSlug));
    if (!cru) return;
    const anterior = JSON.parse(cru) as Guardado;

    s.setItem(
      chave(storeSlug),
      JSON.stringify({ ...anterior, ...remendo, expiraEm: anterior.expiraEm } satisfies Guardado),
    );
  }, undefined);
}

/** Encerra o contexto desta loja. Também usado antes de abrir um novo. */
export function limparContextoDeMesa(storeSlug: string): void {
  comStorage((s) => {
    apagarLegado(s);
    s.removeItem(chave(storeSlug));
  }, undefined);
}
