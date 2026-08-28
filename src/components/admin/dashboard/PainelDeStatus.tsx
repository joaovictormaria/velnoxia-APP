import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight, Timer, TrendingDown, type LucideIcon } from "lucide-react";

/**
 * COMO A LOJA ESTÁ, E O QUE PRECISA DE ALGUÉM.
 *
 * Antes eram três cartões grandes lado a lado. Quando estava tudo bem — que é
 * a maior parte do tempo — a fileira inteira ficava ocupada por três zeros
 * cinzas dizendo "nada". A informação estava certa e o peso, errado.
 *
 * Aqui os alertas são LINHAS, e só existem enquanto existirem. Sem nenhum, o
 * painel encolhe para uma frase; com algum, ele cresce e a linha aparece. O
 * tamanho do bloco passa a ser, por si só, uma leitura do estado da casa.
 *
 * Some quando zerado sem substituir por nada obrigaria a decorar quais alertas
 * existem — por isso o "Tudo em ordem" ocupa o lugar deles em vez de deixar o
 * espaço vazio.
 */

type Alerta = {
  chave: string;
  texto: string;
  detalhe: string;
  icone: LucideIcon;
  para: "/admin/pedidos" | "/admin/estoque";
};

export function PainelDeStatus({
  abertoAgora,
  aguardandoRecebimento,
  minutosAguardando,
  estoqueBaixo,
}: {
  abertoAgora: boolean;
  aguardandoRecebimento: number;
  minutosAguardando: number;
  estoqueBaixo: number;
}) {
  const alertas: Alerta[] = [];

  if (aguardandoRecebimento > 0) {
    alertas.push({
      chave: "aguardando",
      texto:
        aguardandoRecebimento === 1
          ? "1 pedido pago aguardando você"
          : `${aguardandoRecebimento} pedidos pagos aguardando você`,
      detalhe: `parados há ${minutosAguardando} min`,
      icone: Timer,
      para: "/admin/pedidos",
    });
  }

  if (estoqueBaixo > 0) {
    alertas.push({
      chave: "baixo",
      texto:
        estoqueBaixo === 1 ? "1 item abaixo do mínimo" : `${estoqueBaixo} itens abaixo do mínimo`,
      detalhe: "repor antes de faltar",
      icone: TrendingDown,
      para: "/admin/estoque",
    });
  }

  return (
    <section className="animate-entrada-suave flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-neutral-900">Status da loja</p>
        <SeloDeAtendimento aberto={abertoAgora} />
      </div>

      <div className="mt-4 flex-1 border-t border-neutral-100 pt-1">
        {alertas.length === 0 ? (
          <p className="flex items-center gap-2 py-4 text-sm text-neutral-500">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            Tudo em ordem por aqui.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {alertas.map((a, indice) => (
              <li key={a.chave}>
                <Link
                  to={a.para}
                  className="group animate-alerta-surgindo flex items-center gap-3 rounded-xl py-3 pr-1 transition-colors hover:bg-amber-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D2E]"
                  style={{ animationDelay: `${indice * 60}ms` }}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <a.icone className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {a.texto}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">{a.detalhe}</span>
                  </span>
                  {/* A seta só se compromete no hover: parada em toda linha
                      vira ruído; ausente, a linha não parece clicável. */}
                  <ChevronRight className="size-4 shrink-0 text-neutral-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-neutral-500 motion-reduce:transition-none" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * A loja está atendendo neste momento, segundo o horário cadastrado.
 *
 * Responde à primeira pergunta de quem abre o painel de manhã — e um "fechado"
 * que ninguém percebeu é a explicação mais comum para um dia sem pedido nenhum.
 */
function SeloDeAtendimento({ aberto }: { aberto: boolean }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors duration-300 " +
        (aberto ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500")
      }
    >
      <span
        className={
          "size-1.5 rounded-full " + (aberto ? "animate-brilho-suave bg-emerald-500" : "bg-neutral-400")
        }
      />
      {aberto ? "Aberto agora" : "Fechado"}
    </span>
  );
}
