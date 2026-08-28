import { Link } from "@tanstack/react-router";
import { ChefHat, PackageX, ShoppingBag, Inbox, type LucideIcon } from "lucide-react";
import { useContagemAnimada } from "@/hooks/use-contagem-animada";

/**
 * OS SINAIS VITAIS DO DIA, EM UM ELEMENTO SÓ.
 *
 * Antes eram sete cartões: quatro do Kanban e três de alerta, todos com a mesma
 * moldura, o mesmo círculo com ícone e o mesmo número grande. Pareciam a mesma
 * coisa e não eram — uns diziam onde o trabalho está, outros o que quebrou.
 *
 * Aqui são quatro células de UMA peça, separadas por fio de cabelo. A leitura
 * passa a ser "esta é a barra de vitais" em vez de "estas são quatro coisas
 * soltas", e sobra espaço para o que de fato precisa de cartão próprio.
 *
 * NENHUM VALOR EM DINHEIRO. Só contagem de trabalho.
 */

type Celula = {
  chave: string;
  rotulo: string;
  valor: number;
  icone: LucideIcon;
  para: "/admin/pedidos" | "/admin/estoque";
  /** Pinta a célula enquanto houver alguém esperando. Só "Recebidos" usa. */
  alarme?: boolean;
};

export function BarraDeOperacao({
  pedidosHoje,
  recebidos,
  emPreparo,
  esgotados,
}: {
  pedidosHoje: number;
  recebidos: number;
  emPreparo: number;
  esgotados: number;
}) {
  const celulas: Celula[] = [
    {
      chave: "hoje",
      rotulo: "Pedidos hoje",
      valor: pedidosHoje,
      icone: ShoppingBag,
      para: "/admin/pedidos",
    },
    {
      chave: "recebidos",
      rotulo: "Recebidos",
      valor: recebidos,
      icone: Inbox,
      para: "/admin/pedidos",
      /*
       * Pedido recebido é o único estado em que a loja está devendo uma ação:
       * nos outros alguém já pegou o pedido. Por isso só ele pulsa, e pulsa
       * até parar de ter pedido esperando — o alarme apaga quando o trabalho
       * começa, não depois de um tempo.
       */
      alarme: recebidos > 0,
    },
    {
      chave: "preparo",
      rotulo: "Em preparo",
      valor: emPreparo,
      icone: ChefHat,
      para: "/admin/pedidos",
    },
    {
      chave: "esgotados",
      rotulo: "Esgotados",
      valor: esgotados,
      icone: PackageX,
      para: "/admin/estoque",
    },
  ];

  return (
    /*
     * `gap-px` sobre fundo neutro desenha as divisórias: um fio contínuo em
     * qualquer quebra de coluna, sem a borda dupla que `border-l` por célula
     * produz quando a grade passa de quatro colunas para duas no celular.
     */
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-200 lg:grid-cols-4">
      {celulas.map((c, indice) => (
        <Celula key={c.chave} {...c} indice={indice} />
      ))}
    </div>
  );
}

function Celula({
  rotulo,
  valor,
  icone: Icone,
  para,
  alarme,
  indice,
}: Celula & { indice: number }) {
  const contado = useContagemAnimada(valor);

  return (
    <Link
      to={para}
      className={
        "group animate-entrada-suave relative flex flex-col justify-between gap-3 bg-white p-5 transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#E11D2E] sm:p-6 " +
        (alarme ? "" : "hover:bg-neutral-50")
      }
      /* Entra em cascata, na ordem de leitura. Só na primeira montagem: as
         recargas de 8 segundos não remontam a barra. */
      style={{ animationDelay: `${indice * 45}ms` }}
      /* Anuncia o pedido novo a quem usa leitor de tela, que não vê a célula
         piscando. "polite" para não cortar a frase em curso. */
      aria-live={alarme !== undefined ? "polite" : undefined}
    >
      {/*
       * O PULSO MORA NUMA CAMADA PRÓPRIA, atrás do conteúdo.
       *
       * Duas classes `animate-*` no mesmo elemento disputam a propriedade
       * `animation`, e quem vence é a ordem da folha de estilo — não a do
       * atributo. Com o alarme e a animação de entrada na mesma célula, a
       * entrada venceria e o alarme simplesmente não tocaria: exatamente a
       * falha que ninguém percebe, porque só aparece quando há pedido parado.
       */}
      {alarme && <span aria-hidden className="animate-celula-alerta absolute inset-0" />}
      <div className="relative flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {rotulo}
        </span>
        <Icone
          className={
            "size-4 shrink-0 transition-colors duration-200 " +
            (alarme ? "text-[#E11D2E]" : "text-neutral-300 group-hover:text-neutral-400")
          }
        />
      </div>
      {/*
       * Space Grotesk, e não a fonte de corpo. É a face de display do painel,
       * já no tema, e é o que separa um número informado de um número exibido.
       * `tabular-nums` mantém a largura entre os ciclos de recarga, para o
       * número não empurrar o que está ao lado quando vai de 9 para 10.
       */}
      <span
        className={
          "relative font-display text-4xl font-bold leading-none tracking-tight tabular-nums " +
          (alarme ? "text-[#E11D2E]" : "text-neutral-900")
        }
      >
        {contado}
      </span>
    </Link>
  );
}
