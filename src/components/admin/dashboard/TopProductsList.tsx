import { UtensilsCrossed } from "lucide-react";

/**
 * O que a cozinha mais fez hoje.
 *
 * Ganhou barra de proporção atrás do nome. A lista de números soltos obrigava a
 * comparar mentalmente 14 com 9; a barra responde antes da leitura, que é o
 * ponto de um painel que se olha de relance. A escala é relativa ao primeiro
 * colocado — a pergunta aqui é "quanto em relação ao campeão", não "quantos".
 *
 * Quantidade, nunca faturamento: é um ranking OPERACIONAL, do que precisa estar
 * pronto, não do que rendeu mais.
 */
export function TopProductsList({
  products,
}: {
  products: { rank: number; name: string; quantity: number }[];
}) {
  const maior = products[0]?.quantity ?? 0;

  return (
    <section className="animate-entrada-suave flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="min-w-0">
        <p className="text-base font-semibold text-neutral-900">Mais pedidos</p>
        <p className="mt-0.5 text-xs text-neutral-500">Por quantidade, hoje.</p>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <UtensilsCrossed className="size-8 text-neutral-300" />
          <p className="text-sm text-neutral-500">Nada saiu ainda hoje.</p>
        </div>
      ) : (
        <ul className="mt-4 flex-1 space-y-3">
          {products.map((p, indice) => {
            // Divisão protegida: com o topo em zero a lista nem chegaria aqui,
            // mas um NaN na largura quebraria a barra inteira em silêncio.
            const proporcao = maior > 0 ? Math.max(4, (p.quantity / maior) * 100) : 0;
            return (
              <li key={p.name} className="animate-linha-entrando" style={{ animationDelay: `${indice * 45}ms` }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm text-neutral-900">{p.name}</span>
                  <span className="shrink-0 font-display text-sm font-bold tabular-nums text-neutral-700">
                    {p.quantity}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  {/*
                   * A barra cresce da esquerda na entrada e acompanha mudanças
                   * de proporção entre as recargas com transição de largura —
                   * o ranking se reorganiza deslizando, não saltando.
                   */}
                  <div
                    className="h-full rounded-full bg-[#E11D2E] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${proporcao}%`, opacity: 1 - indice * 0.13 }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
