import { Link, useRouterState } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DESCRICAO_DO_RECURSO, ROTULO_DO_RECURSO } from "@/lib/planos/catalogo";
import { recursoNoEstado, type EstadoComercial } from "@/lib/planos/resolucao";
import type { Recurso } from "@/lib/planos/tipos";

/**
 * A PROTEÇÃO DE ROTA DOS MÓDULOS PAGOS — um lugar só, uma chamada só.
 *
 * ─── A MESMA FONTE DE VERDADE DO BACKEND ───────────────────────────────────
 *
 * A pergunta é feita a `recursoNoEstado()`, exatamente a função que
 * `guarda-de-recurso.ts` usa no servidor. Não há matriz duplicada, não há
 * `if (plano === "PREMIUM")` e não há regra de frontend: se um recurso mudar
 * de plano em `catalogo.ts`, a rota e a server function mudam juntas.
 *
 * ─── NENHUMA CONSULTA A MAIS ───────────────────────────────────────────────
 *
 * O `beforeLoad` de `/admin` já buscou a sessão e a devolveu no contexto, e a
 * sessão já carrega `store.plano` desde a Fase 2. Aqui só se lê o que está na
 * mão: sem ida ao banco, sem ida ao Stripe, sem `useQuery`.
 *
 * ─── ISTO NÃO É A SEGURANÇA ────────────────────────────────────────────────
 *
 * Quem recusa de verdade é o servidor — as server functions do módulo já
 * exigem o recurso desde a Fase 5, e continuariam recusando ainda que esta
 * tela não existisse. O que a rota faz é evitar que a pessoa veja um painel
 * inteiro de erros ao digitar a URL, e explicar o motivo.
 */

/**
 * O recorte do contexto do painel que esta guarda precisa.
 *
 * Declarado aqui em vez de importado de `@/server/auth/session`: aquele módulo
 * carrega o Prisma, e um import — mesmo de tipo — perto de um componente é
 * convite para alguém transformá-lo em import de valor depois. O formato é
 * estruturalmente compatível com `CurrentAdmin`, então o compilador acusa se
 * os dois divergirem.
 */
export type ContextoComPlano = {
  admin: { store: { plano: EstadoComercial } } | null;
};

/**
 * Esta rota deve ser bloqueada para esta sessão?
 *
 * ⚠️ SÓ `BLOQUEADO` BLOQUEIA. `PERMITIDO` e `INDEFINIDO` passam, e o segundo é
 * a permissão transitória da loja legada decidida na Fase 5 — a mesma regra do
 * `guarda-de-recurso.ts`, para as duas pontas nunca discordarem sobre quem
 * entra.
 *
 * Sem sessão devolve `false` de propósito: quem redireciona para o login é o
 * `beforeLoad` de `/admin`, e duplicar essa decisão aqui criaria dois caminhos
 * para o mesmo desvio.
 */
export function rotaBloqueada(context: ContextoComPlano, recurso: Recurso): boolean {
  const plano = context.admin?.store?.plano;
  if (!plano) return false;
  return recursoNoEstado(plano, recurso) === "BLOQUEADO";
}

/**
 * A tela que o BASIC vê no lugar do módulo.
 *
 * Estado normal de produto, e não erro: sem stack, sem mensagem do Prisma, sem
 * página quebrada. O convite leva à assinatura, que é o destino que já existe
 * — nenhum fluxo de upgrade novo foi inventado aqui.
 */
export function TelaDeRecursoPremium({
  recurso,
  compacto = false,
  aoVoltar,
}: {
  recurso: Recurso;
  /** Dentro de um diálogo: sem a altura de página e sem o link "voltar". */
  compacto?: boolean;
  /** Fecha o diálogo. Sem isto, o segundo botão vira o link para o painel. */
  aoVoltar?: () => void;
}) {
  const rotulo = ROTULO_DO_RECURSO[recurso];
  const descricao = DESCRICAO_DO_RECURSO[recurso];

  return (
    <div
      className={cn(
        "flex items-center justify-center px-4",
        compacto ? "py-2" : "min-h-[60vh] py-10",
      )}
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-100">
          <Lock className="size-5 text-neutral-500" aria-hidden="true" />
        </div>

        <h1 className="mt-4 text-lg font-bold text-neutral-900 sm:text-xl">
          {rotulo} está no plano Premium
        </h1>
        <p className="mt-2 text-sm text-neutral-600">{descricao}</p>
        <p className="mt-2 text-sm text-neutral-500">
          Seu plano atual não inclui este módulo.
        </p>

        <Link
          to="/admin/assinatura"
          className="mt-6 block rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D2E]"
        >
          Conhecer o Premium
        </Link>

        {aoVoltar ? (
          <button
            type="button"
            onClick={aoVoltar}
            className="mt-3 w-full rounded-lg py-1.5 text-sm text-neutral-500 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          >
            Voltar
          </button>
        ) : (
          <Link
            to="/admin"
            className="mt-3 block text-sm text-neutral-500 hover:text-neutral-800"
          >
            Voltar ao painel
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * AS DUAS METADES DA PROTEÇÃO, ENTREGUES JUNTAS.
 *
 * Uso, na definição da rota:
 *
 *   export const Route = createFileRoute("/admin/estoque/")(
 *     rotaPremium("ESTOQUE", EstoquePage),
 *   );
 *
 * Uma chamada devolve `beforeLoad` e `component` já ligados. É deliberado que
 * não haja como aplicar só metade: um `beforeLoad` sem o componente certo
 * decidiria e não mostraria nada, e um componente sem o `beforeLoad` decidiria
 * tarde demais, depois do SSR. Quem esquecer a chamada inteira é pego pelo
 * teste de cobertura das rotas.
 *
 * REUTILIZÁVEL COMO ESTÁ. `rotaPremium("FINANCEIRO", …)`,
 * `rotaPremium("MESAS", …)` e os demais módulos entram sem nenhuma
 * infraestrutura nova — só a chamada, quando cada fase chegar.
 */
export function rotaPremium<P extends object>(
  recurso: Recurso,
  Componente: (props: P) => React.ReactNode,
) {
  return {
    /*
     * Decidido ANTES de renderizar, e no servidor também: o veredito entra no
     * contexto da rota, então o HTML do SSR já sai com a tela certa. Fazê-lo
     * dentro do componente produziria um piscar do módulo pago antes do
     * bloqueio aparecer.
     */
    beforeLoad: ({ context }: { context: ContextoComPlano }) => ({
      recursoBloqueado: rotaBloqueada(context, recurso) ? recurso : null,
    }),

    component: function RotaProtegida(props: P) {
      // O contexto vem do `beforeLoad` acima, na mesma rota.
      const { recursoBloqueado } = useContextoDaRota();
      if (recursoBloqueado) return <TelaDeRecursoPremium recurso={recursoBloqueado} />;
      return <Componente {...props} />;
    },
  };
}

/*
 * O acesso ao contexto fica isolado numa função só para o componente acima não
 * depender do `Route` de cada arquivo — o mesmo `rotaPremium` serve todas as
 * rotas, e nenhuma delas precisa passar o próprio `Route` como argumento.
 */
function useContextoDaRota(): { recursoBloqueado: Recurso | null } {
  return useRouterState({
    select: (s) => {
      const contextos = s.matches.map((m) => m.context as { recursoBloqueado?: Recurso | null });
      // A rota mais funda vence: é a que declarou a proteção.
      for (let i = contextos.length - 1; i >= 0; i--) {
        const valor = contextos[i]?.recursoBloqueado;
        if (valor !== undefined) return { recursoBloqueado: valor };
      }
      return { recursoBloqueado: null };
    },
  });
}
