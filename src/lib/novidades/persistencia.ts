import type { Estado, Registro } from "./tipos";

/**
 * ONDE FICA GUARDADO QUEM JÁ VIU O QUÊ — e o único arquivo do sistema que
 * sabe disso.
 *
 * A Central, o modal e o tour recebem e devolvem `Registro[]`. Nenhum deles
 * conhece o nome de uma chave, o `localStorage` ou o `sessionStorage`. Essa
 * regra não é estética: a Fase 2 troca este arquivo por uma server function
 * com Prisma, e é ela que garante que a troca seja UM arquivo em vez de uma
 * caçada por `localStorage.getItem` espalhado pelos componentes.
 *
 * POR QUE `ler` E `marcar` SÃO ASSÍNCRONOS mesmo lendo memória local.
 * Uma assinatura síncrona não tem como ser servida por um `fetch` depois — o
 * dia da migração viraria uma mudança de tipo em cascata por toda a Central.
 * Async agora custa dois `await` e compra a troca de graça.
 *
 * POR QUE `adiarNaSessao` NÃO é assíncrono, e nunca vai ser: "fechei este
 * modal nesta aba" é estado do navegador por definição. Nunca vai para o
 * servidor, então prometer uma Promise ali seria mentir sobre o futuro.
 *
 * ⚠️ TODO ACESSO É PROTEGIDO. `localStorage` não some no modo anônimo — ele
 * LANÇA, e também lança com a cota estourada ou com cookies de terceiros
 * bloqueados. Uma exceção não capturada aqui derrubaria o painel inteiro por
 * causa de um aviso de novidade. Falhou, o pior caso é a novidade reaparecer.
 */

/** O mínimo que este módulo usa. Um `Storage` de verdade satisfaz; um falso de teste também. */
export type ArmazenamentoSimples = {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
  key(indice: number): string | null;
  readonly length: number;
};

export type Persistencia = {
  /** Tudo que este usuário já concluiu ou dispensou. */
  ler(adminUserId: string): Promise<Registro[]>;
  /** Grava a decisão. Repetir a mesma não cria uma segunda linha. */
  marcar(adminUserId: string, novidadeId: string, estado: Estado): Promise<void>;
  /** "Fechei o modal" — vale só nesta aba, some ao fechá-la. */
  adiarNaSessao(adminUserId: string, novidadeId: string): void;
  adiadasNaSessao(adminUserId: string): string[];
};

const PREFIXO = "velnox:novidade";
const PREFIXO_SESSAO = "velnox:novidade-adiada";

/**
 * O usuário entra na CHAVE, e não no valor.
 *
 * É o que torna o estado de dois usuários no mesmo computador — o dono e o
 * gerente, no PC do balcão — independente sem nenhuma lógica de comparação:
 * eles simplesmente não escrevem no mesmo lugar.
 */
function chave(adminUserId: string, novidadeId: string): string {
  return `${PREFIXO}:${adminUserId}:${novidadeId}`;
}

function prefixoDoUsuario(adminUserId: string): string {
  return `${PREFIXO}:${adminUserId}:`;
}

const ESTADOS_VALIDOS = new Set<string>(["CONCLUIDA", "DISPENSADA"]);

/**
 * Constrói a persistência sobre um armazenamento qualquer.
 *
 * Recebe os dois por parâmetro em vez de alcançar `window` lá dentro: é o que
 * permite testar tudo — inclusive o armazenamento que explode — no ambiente
 * `node` da suíte, sem jsdom e sem dependência nova.
 *
 * Os parâmetros são funções, e não os objetos direto, porque no servidor
 * `window` não existe: resolver na chamada evita quebrar na importação do
 * módulo durante o SSR.
 */
export function criarPersistencia(
  obterLocal: () => ArmazenamentoSimples | null,
  obterSessao: () => ArmazenamentoSimples | null,
): Persistencia {
  return {
    async ler(adminUserId) {
      const loja = tentar(obterLocal);
      if (!loja) return [];

      const registros: Registro[] = [];
      const prefixo = prefixoDoUsuario(adminUserId);

      try {
        /*
         * Varre as chaves em vez de manter um índice numa chave própria. Um
         * índice pode discordar do que existe de fato — e a divergência só
         * aparece depois, como uma novidade que volta ou some sem motivo.
         * Aqui a lista É o estado.
         */
        for (let i = 0; i < loja.length; i++) {
          const k = loja.key(i);
          if (!k || !k.startsWith(prefixo)) continue;

          const estado = loja.getItem(k);
          // Um valor que não reconhecemos é ignorado, não é erro: pode ser de
          // uma versão futura, e nesse caso a novidade voltar é melhor do que
          // a leitura inteira falhar.
          if (!estado || !ESTADOS_VALIDOS.has(estado)) continue;

          registros.push({
            novidadeId: k.slice(prefixo.length),
            estado: estado as Estado,
          });
        }
      } catch {
        return [];
      }

      return registros;
    },

    async marcar(adminUserId, novidadeId, estado) {
      const loja = tentar(obterLocal);
      if (!loja) return;
      try {
        // Uma chave por par usuário+novidade: gravar de novo SUBSTITUI, então
        // duplicata não existe por construção, sem checar antes.
        loja.setItem(chave(adminUserId, novidadeId), estado);
      } catch {
        /* Cota estourada ou escrita bloqueada. A novidade reaparece. Tudo bem. */
      }
    },

    adiarNaSessao(adminUserId, novidadeId) {
      const sessao = tentar(obterSessao);
      if (!sessao) return;
      try {
        sessao.setItem(`${PREFIXO_SESSAO}:${adminUserId}:${novidadeId}`, "1");
      } catch {
        /* Sem adiamento, o modal pode reabrir ao trocar de rota. Não é erro. */
      }
    },

    adiadasNaSessao(adminUserId) {
      const sessao = tentar(obterSessao);
      if (!sessao) return [];
      const prefixo = `${PREFIXO_SESSAO}:${adminUserId}:`;
      const ids: string[] = [];
      try {
        for (let i = 0; i < sessao.length; i++) {
          const k = sessao.key(i);
          if (k?.startsWith(prefixo)) ids.push(k.slice(prefixo.length));
        }
      } catch {
        return [];
      }
      return ids;
    },
  };
}

/**
 * Só o ACESSO ao armazenamento já pode lançar — em aba anônima, `window.
 * localStorage` explode antes de qualquer `getItem`. Por isso o próprio
 * `obter` vem embrulhado.
 */
function tentar(obter: () => ArmazenamentoSimples | null): ArmazenamentoSimples | null {
  try {
    return obter();
  } catch {
    return null;
  }
}

/** A instância que o painel usa. No servidor, `window` não existe e tudo vira no-op. */
export const persistencia: Persistencia = criarPersistencia(
  () => (typeof window === "undefined" ? null : window.localStorage),
  () => (typeof window === "undefined" ? null : window.sessionStorage),
);
