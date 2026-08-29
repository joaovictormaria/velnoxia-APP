import {
  listarEstadoDasNovidadesFn,
  marcarNovidadeFn,
} from "@/server/functions/novidades.fn";
import type { Estado, Registro } from "./tipos";

/**
 * ONDE FICA GUARDADO QUEM JÁ VIU O QUÊ — e o único arquivo do sistema que
 * sabe disso.
 *
 * ─── O QUE MUDOU, E POR QUÊ ────────────────────────────────────────────────
 *
 * Isto morava no `localStorage`. O defeito era visível: o dono concluía o
 * tutorial no PC do balcão e o via de novo no celular, porque cada navegador
 * tinha a própria memória — e limpar o cache trazia tudo de volta. A fonte de
 * verdade passou a ser o servidor.
 *
 * NÃO HÁ FALLBACK PARA O `localStorage`, e a ausência é deliberada. "Se o
 * banco não souber, pergunta ao navegador" manteria o armazenamento local como
 * fonte de verdade parcial — e o bug de "vejo no PC mas não no celular"
 * continuaria, agora mais difícil de diagnosticar. O código não lê mais aquelas
 * chaves; elas ficam órfãs no navegador de quem as tem e não decidem nada.
 *
 * ─── POR QUE `adminUserId` SUMIU DA ASSINATURA ─────────────────────────────
 *
 * Antes era `marcar(adminUserId, novidadeId, estado)` — o usuário era só uma
 * chave de armazenamento, e passá-lo era inofensivo. Agora ele é a IDENTIDADE,
 * e um parâmetro seria um convite: quem chama escolheria em nome de quem
 * gravar.
 *
 * A server function não tem campo para isso. O usuário sai de
 * `requireAdminSession()`, do lado do servidor, e a única coisa que atravessa
 * o fio é `{ novidadeId, estado }`. Não é uma checagem que pode ser esquecida
 * — é uma informação que não existe no caminho.
 *
 * ─── O QUE CONTINUA NO NAVEGADOR ───────────────────────────────────────────
 *
 * Só o adiamento de sessão: "fechei este modal nesta aba". Ele é estado de aba
 * por definição, some ao fechá-la, e nunca vai ao servidor — prometer uma
 * Promise ali seria mentir sobre o futuro. CONCLUIDA e DISPENSADA, que são
 * decisões, vivem no banco.
 */

/** O mínimo que este módulo usa do `sessionStorage`. Um falso de teste serve. */
export type ArmazenamentoSimples = {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
  key(indice: number): string | null;
  readonly length: number;
};

export type Persistencia = {
  /** Tudo que o usuário da SESSÃO já concluiu ou dispensou. */
  ler(): Promise<Registro[]>;
  /** Grava a decisão para o usuário da SESSÃO. */
  marcar(novidadeId: string, estado: Estado): Promise<void>;
  /** "Fechei o modal" — vale só nesta aba, some ao fechá-la. */
  adiarNaSessao(novidadeId: string): void;
  adiadasNaSessao(): string[];
};

const PREFIXO_SESSAO = "velnox:novidade-adiada";

/**
 * O adiamento NÃO leva o usuário na chave, e não precisa: `sessionStorage` é
 * por aba, e uma aba tem uma sessão só. Se outra pessoa entrar, ela abre a
 * própria aba — e o que vale para valer está no banco de qualquer forma.
 */
export function criarPersistencia(
  obterSessao: () => ArmazenamentoSimples | null,
  servidor: {
    ler: () => Promise<Registro[]>;
    marcar: (novidadeId: string, estado: Estado) => Promise<void>;
  },
): Persistencia {
  return {
    async ler() {
      try {
        return await servidor.ler();
      } catch {
        /*
         * Rede fora, sessão caída, servidor de pé mas com erro: devolver vazio
         * faz a novidade REAPARECER, que é o pior caso aceitável — o oposto,
         * inventar que já foi vista, esconderia o aviso para sempre por causa
         * de uma falha momentânea.
         */
        return [];
      }
    },

    async marcar(novidadeId, estado) {
      try {
        await servidor.marcar(novidadeId, estado);
      } catch {
        // A gravação não vingou. A novidade volta na próxima sessão, e é
        // melhor assim do que derrubar o painel por causa de um aviso.
      }
    },

    adiarNaSessao(novidadeId) {
      const sessao = tentar(obterSessao);
      if (!sessao) return;
      try {
        sessao.setItem(`${PREFIXO_SESSAO}:${novidadeId}`, "1");
      } catch {
        /* Sem adiamento, o modal pode reabrir ao trocar de rota. Não é erro. */
      }
    },

    adiadasNaSessao() {
      const sessao = tentar(obterSessao);
      if (!sessao) return [];
      const prefixo = `${PREFIXO_SESSAO}:`;
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
 * Só o ACESSO ao armazenamento já pode lançar — em aba anônima,
 * `window.sessionStorage` explode antes de qualquer `getItem`. Por isso o
 * próprio `obter` vem embrulhado.
 */
function tentar(obter: () => ArmazenamentoSimples | null): ArmazenamentoSimples | null {
  try {
    return obter();
  } catch {
    return null;
  }
}

/** A instância que o painel usa. No servidor, `window` não existe. */
export const persistencia: Persistencia = criarPersistencia(
  () => (typeof window === "undefined" ? null : window.sessionStorage),
  {
    ler: () => listarEstadoDasNovidadesFn(),
    marcar: async (novidadeId, estado) => {
      await marcarNovidadeFn({ data: { novidadeId, estado } });
    },
  },
);
