import { Link } from "@tanstack/react-router";
import { ChevronRight, Receipt } from "lucide-react";
import { useItensNovos } from "@/hooks/use-itens-novos";

/**
 * OS ÚLTIMOS PEDIDOS QUE ENTRARAM.
 *
 * A tela de Pedidos mostra o trabalho organizado por etapa; aqui é a ordem de
 * chegada, que é como se responde "o que acabou de cair?" sem varrer o quadro
 * inteiro. Por isso subiu para a coluna principal: é pergunta de alta
 * frequência, e estava no rodapé.
 *
 * NENHUM VALOR EM DINHEIRO — nem total, nem preço de item. A lista existe para
 * reconhecer o pedido (número, cliente, quantos itens, quando chegou) e abrir o
 * que interessa; o valor está a um clique, na tela que se abre de propósito.
 */

const CHIP: Record<string, { label: string; classe: string }> = {
  RECEIVED: { label: "Recebido", classe: "bg-red-50 text-[#E11D2E]" },
  PREPARING: { label: "Em preparo", classe: "bg-amber-100 text-amber-700" },
  TABLE_READY: { label: "Pronto (mesa)", classe: "bg-purple-50 text-purple-700" },
  OUT_FOR_DELIVERY: { label: "Saiu p/ entrega", classe: "bg-blue-50 text-blue-700" },
  COMPLETED: { label: "Finalizado", classe: "bg-emerald-50 text-emerald-700" },
};

export type PedidoRecente = {
  id: string;
  numero: number;
  cliente: string;
  status: string;
  criadoEm: Date | string;
  itens: number;
};

export function PedidosRecentes({ pedidos }: { pedidos: PedidoRecente[] }) {
  // Quem entrou desde a recarga anterior ganha destaque por instantes.
  const novos = useItensNovos(pedidos.map((p) => p.id));

  return (
    <section className="animate-entrada-suave flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-neutral-900">Pedidos recentes</p>
          <p className="mt-0.5 text-xs text-neutral-500">Por ordem de chegada.</p>
        </div>
        <Link
          to="/admin/pedidos"
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[#E11D2E] transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D2E]"
        >
          Ver todos
        </Link>
      </div>

      {pedidos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <Receipt className="size-8 text-neutral-300" />
          <p className="text-sm text-neutral-500">Nenhum pedido ainda hoje.</p>
          <p className="max-w-56 text-xs text-neutral-400">
            Assim que alguém pedir pelo cardápio, aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="mt-3 flex-1 divide-y divide-neutral-100">
          {pedidos.map((p, indice) => {
            const chip =
              CHIP[p.status] ?? { label: p.status, classe: "bg-neutral-100 text-neutral-600" };
            const acabouDeChegar = novos.has(p.id);
            return (
              <li key={p.id}>
                <Link
                  to="/admin/pedidos/$orderId"
                  params={{ orderId: p.id }}
                  className="group animate-linha-entrando relative flex items-center gap-3 rounded-xl px-2 py-3 transition-colors duration-200 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D2E]"
                  /* Escalonado na ordem de leitura. Teto de 5 linhas, então a
                     última entra em 160ms — rápido demais para virar espera. */
                  style={{ animationDelay: `${indice * 40}ms` }}
                >
                  {/*
                   * O destaque do pedido novo mora numa barra própria, e não
                   * numa segunda classe de animação na linha: duas utilities
                   * `animate-*` no mesmo elemento disputam a propriedade
                   * `animation`, e quem vence é a ordem da folha de estilo, não
                   * a do atributo — o destaque apagaria a entrada em silêncio.
                   *
                   * Some sozinho em ~1,4s. Ele diz "isto acabou de acontecer",
                   * não "isto é importante": um realce permanente perderia o
                   * sentido na recarga seguinte, quando tudo já teria sido novo
                   * alguma vez.
                   */}
                  {acabouDeChegar && (
                    <span
                      aria-hidden
                      className="animate-pedido-chegou absolute inset-y-1.5 left-0 w-0.75 rounded-full bg-[#E11D2E]"
                    />
                  )}
                  <span className="w-12 shrink-0 font-display text-sm font-bold tabular-nums text-neutral-900">
                    #{p.numero}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {p.cliente}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      {p.itens} {p.itens === 1 ? "item" : "itens"} · {desde(p.criadoEm)}
                    </span>
                  </span>
                  {/* `transition-colors` no chip: quando o pedido muda de etapa
                      entre duas recargas, a cor desliza em vez de trocar seca —
                      a mudança fica perceptível sem precisar piscar. */}
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors duration-500 ${chip.classe}`}
                  >
                    {chip.label}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-neutral-200 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-neutral-400 motion-reduce:transition-none" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Quanto tempo faz, em português de balcão.
 *
 * Minutos enquanto ainda é "agora", horas depois disso, e a partir de um dia o
 * relógio deixa de ajudar — "há 27h" obriga a fazer a conta que "ontem, 19:40"
 * já entrega pronta.
 */
function desde(quando: Date | string) {
  const data = new Date(quando);
  const minutos = Math.floor((Date.now() - data.getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  if (horas < 48) return `ontem, ${HORA.format(data)}`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(data);
}
