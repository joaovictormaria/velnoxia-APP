import { Link } from "@tanstack/react-router";
import { ChefHat, HandCoins, PackageX, ShoppingBag, Inbox, type LucideIcon } from "lucide-react";
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
  para: "/admin/pedidos" | "/admin/estoque" | "/admin/relatorios/recebimentos";
  /** Pinta a célula enquanto houver alguém esperando. Só "Recebidos" usa. */
  alarme?: boolean;
  /**
   * Uma linha menor ACIMA do número, entre o rótulo e ele.
   *
   * Só "Pagamentos em aberto" usa: ali a contagem sozinha não decide nada —
   * "1 em aberto" pode ser R$ 5 ou R$ 500, e é o valor que diz se vale ligar
   * para o cliente hoje. Fica acima, e não abaixo, para que o número grande
   * continue sendo a última coisa da célula, como nas outras quatro.
   */
  sobrelinha?: string;
  /**
   * O nome desta célula para o tutorial guiado, quando ela for alvo de algum.
   *
   * Vira `data-tour="..."` no link. É um atributo explícito de propósito: o
   * tour precisa de uma âncora que sobreviva a mudanças de cor, de ordem e de
   * texto — e nenhuma classe visual daqui sobrevive a isso.
   */
  tour?: string;
};

const dinheiro = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function BarraDeOperacao({
  pedidosHoje,
  recebidos,
  emPreparo,
  esgotados,
  pagamentosEmAberto,
  valorEmAberto,
}: {
  pedidosHoje: number;
  recebidos: number;
  emPreparo: number;
  esgotados: number;
  pagamentosEmAberto: number;
  valorEmAberto: number;
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
    /*
     * O ÚNICO CARD EM DINHEIRO desta barra, e ele não é faturamento: é
     * cobrança pendente. Fica aqui, e não em Relatórios, porque quem abre o
     * painel de manhã precisa ver quem ainda deve antes de o dia começar.
     *
     * O pedido fiado saiu dos três contadores à esquerda — não é trabalho da
     * cozinha. Este card é para onde ele foi.
     */
    {
      chave: "aberto",
      rotulo: "A receber",
      valor: pagamentosEmAberto,
      sobrelinha: dinheiro.format(valorEmAberto),
      icone: HandCoins,
      para: "/admin/relatorios/recebimentos",
      tour: "a-receber",
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
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-200 lg:grid-cols-5">
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
  sobrelinha,
  tour,
  indice,
}: Celula & { indice: number }) {
  const contado = useContagemAnimada(valor);

  return (
    <Link
      to={para}
      /* Âncora do tutorial. Sem `tour`, o atributo não é emitido e o HTML
         desta célula fica exatamente como sempre foi. */
      data-tour={tour}
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
        Discreta de propósito: pequena e em tom secundário, ela informa sem
        disputar com o número. Sem `sobrelinha` nada é renderizado, e as
        outras quatro células ficam idênticas ao que sempre foram.
      */}
      {sobrelinha && (
        <span className="relative mb-1 block text-sm font-medium tabular-nums text-neutral-500">
          {sobrelinha}
        </span>
      )}
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
