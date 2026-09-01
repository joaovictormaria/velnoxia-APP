import { useEffect, useState } from "react";
import {
  ChefHat,
  Package,
  PackagePlus,
  Pin,
  ShoppingCart,
  SlidersHorizontal,
  TriangleAlert,
  Undo2,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { adminGetMovementHistory } from "@/server/functions/report.fn";
import { quantidadeComSinal } from "./sinal-do-movimento";

export interface AuditLogProps {
  storeId: string;
  itemId?: string;
  referenceId?: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  O HISTÓRICO DE MOVIMENTAÇÃO DO ESTOQUE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Serve duas telas com o mesmo componente: a aba "Movimentações", filtrada por
 * um item, e a aba "Auditoria", com a loja inteira. A diferença muda o que faz
 * sentido mostrar — ver o nome do item repetido em vinte linhas seguidas, num
 * painel estreito, é gastar a coluna mais larga da tabela com a informação que
 * a pessoa acabou de escolher.
 *
 * ⚠️ ESTE NÃO É O MÓDULO DE AUDITORIA. Aqui é `InventoryMovement` — entradas,
 * saídas e ajustes de estoque. O `AuditLog` do sistema (quem mudou o quê no
 * cadastro) mora em `/admin/auditoria`. O nome da aba coincide; o conteúdo
 * não.
 */

type Aparencia = {
  rotulo: string;
  icone: LucideIcon;
  cor: string;
  fundo: string;
};

/*
 * Ícone de traço e cor por SIGNIFICADO, e não emoji.
 *
 * O emoji muda de desenho em cada sistema e não carrega cor semântica: 🍽️ e
 * 🛒 têm o mesmo peso visual, ainda que um seja saída e o outro entrada. Aqui
 * a cor diz a direção antes de a pessoa ler o rótulo.
 */
const APARENCIA: Record<string, Aparencia> = {
  PURCHASE: {
    rotulo: "Compra",
    icone: ShoppingCart,
    cor: "text-emerald-700",
    fundo: "bg-emerald-50",
  },
  RETURN: {
    rotulo: "Devolução",
    icone: PackagePlus,
    cor: "text-emerald-700",
    fundo: "bg-emerald-50",
  },
  PRODUCTION: {
    rotulo: "Produção",
    icone: ChefHat,
    cor: "text-emerald-700",
    fundo: "bg-emerald-50",
  },
  LOSS: {
    rotulo: "Perda",
    icone: TriangleAlert,
    cor: "text-red-700",
    fundo: "bg-red-50",
  },
  CONSUMPTION: {
    rotulo: "Consumo",
    icone: UtensilsCrossed,
    cor: "text-neutral-700",
    fundo: "bg-neutral-100",
  },
  RESERVATION: {
    rotulo: "Reserva",
    icone: Pin,
    cor: "text-amber-700",
    fundo: "bg-amber-50",
  },
  REVERSAL: {
    rotulo: "Reversão",
    icone: Undo2,
    cor: "text-neutral-700",
    fundo: "bg-neutral-100",
  },
  ADJUSTMENT: {
    rotulo: "Ajuste",
    icone: SlidersHorizontal,
    cor: "text-neutral-700",
    fundo: "bg-neutral-100",
  },
};

/** Um tipo novo aparece com o próprio nome, em vez de sumir da tela. */
const aparenciaDe = (tipo: string): Aparencia =>
  APARENCIA[tipo] ?? {
    rotulo: tipo,
    icone: Package,
    cor: "text-neutral-700",
    fundo: "bg-neutral-100",
  };

/*
 * ONZE LINHAS, E O RESTO ROLA.
 *
 * A consulta traz 50 movimentos, e uma loja com movimento diário enche isso
 * numa tarde. Despejadas na página, elas empurram tudo para baixo e a aba vira
 * uma lista comprida — sem nada abaixo dela para se chegar.
 *
 * A conta abaixo é a altura real da linha, e não um número escolhido no olho:
 *
 *   cabeçalho   py-2.5 (20px) + text-xs (16px) + borda (1px) =  37px
 *   cada linha  py-2.5 (20px) + text-sm (20px) + text-xs (16px) + borda = 57px
 *
 * ⚠️ MEXEU NO `py` DAS CÉLULAS, REFAÇA A CONTA. Se o padding mudar e isto
 * não, a última linha visível fica cortada ao meio — que é pior do que mostrar
 * dez ou doze.
 */
const LINHAS_VISIVEIS = 11;
const ALTURA_DO_CABECALHO = 37;
const ALTURA_DA_LINHA = 57;
const ALTURA_MAXIMA = ALTURA_DO_CABECALHO + LINHAS_VISIVEIS * ALTURA_DA_LINHA;

const dia = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** A quantidade com o sinal certo, o "+" explícito e a unidade ao lado. */
function movimentado(mov: any) {
  const valor = quantidadeComSinal(mov.type, mov.quantity);
  const texto = `${valor > 0 ? "+" : ""}${valor.toLocaleString("pt-BR", {
    maximumFractionDigits: 3,
  })}`;
  return { valor, texto, unidade: mov.unit?.code ?? mov.item?.baseUnit?.code ?? "" };
}

export function AuditLog(props: AuditLogProps) {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMovements = async () => {
      setLoading(true);
      try {
        const params: any = { limit: "50" };
        if (props.itemId) params.itemId = props.itemId;

        const data = await adminGetMovementHistory({ data: params } as any);
        if (Array.isArray(data)) {
          setMovements(data);
        }
      } catch (error) {
        console.error("Failed to fetch movements:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMovements();
  }, [props.itemId]);

  /*
   * A COLUNA "ITEM" SÓ EXISTE QUANDO HÁ MAIS DE UM.
   *
   * Filtrando por item, ela repetia o mesmo nome em todas as linhas — e era a
   * coluna mais larga da tabela, num painel que já é estreito. O nome do item
   * está no seletor logo ao lado.
   */
  const mostrarItem = !props.itemId;

  return (
    <div className="audit-log flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
        <h3 className="font-display text-base font-bold text-neutral-900">
          Histórico de movimentações
        </h3>
        {!loading && movements.length > 0 && (
          <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-neutral-600">
            {movements.length}
          </span>
        )}
      </div>

      {/*
        A ÁREA QUE ROLA. Na aba de Movimentações o card é limitado à altura do
        formulário ao lado; é aqui dentro que os 50 movimentos rolam, com o
        cabeçalho e a contagem parados em cima.
      */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ maxHeight: ALTURA_MAXIMA }}
      >
      {/* Esqueleto com a altura das linhas reais: a lista não pula ao chegar. */}
      {loading && (
        <div className="divide-y divide-neutral-100">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="size-7 shrink-0 animate-pulse rounded-lg bg-neutral-100" />
              <div className="h-4 flex-1 animate-pulse rounded bg-neutral-100" />
              <div className="h-4 w-16 animate-pulse rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      )}

      {!loading && movements.length === 0 && (
        <div className="px-6 py-14 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-neutral-100">
            <Package className="size-5 text-neutral-400" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-medium text-neutral-900">
            Nenhuma movimentação ainda
          </p>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-snug text-neutral-500">
            Compras, perdas e as baixas automáticas das vendas aparecem aqui.
          </p>
        </div>
      )}

      {!loading && movements.length > 0 && (
        <>
          {/* ─────────────── CELULAR: uma linha por movimento ─────────────── */}
          {/*
            Tabela de cinco colunas em 360px vira texto quebrado em duas letras
            por linha. Aqui cada movimento é um bloco, com o que muda em
            destaque — o tipo e a quantidade — e o resto abaixo.
          */}
          <ul className="divide-y divide-neutral-100 sm:hidden">
            {movements.map((mov: any) => {
              const { rotulo, icone: Icone, cor, fundo } = aparenciaDe(mov.type);
              const { valor, texto, unidade } = movimentado(mov);
              return (
                <li key={mov.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${fundo}`}>
                    <Icone className={`size-4 ${cor}`} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-neutral-900">{rotulo}</p>
                      <p
                        className={`shrink-0 text-sm font-bold tabular-nums ${
                          valor < 0 ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        {texto}
                        {unidade && (
                          <span className="ml-0.5 text-xs font-medium text-neutral-400">
                            {unidade}
                          </span>
                        )}
                      </p>
                    </div>
                    {mostrarItem && mov.item?.name && (
                      <p className="truncate text-xs text-neutral-600">{mov.item.name}</p>
                    )}
                    <p className="mt-0.5 text-xs text-neutral-400">
                      {mov.createdAt ? `${dia.format(new Date(mov.createdAt))} · ${hora.format(new Date(mov.createdAt))}` : "—"}
                      {mov.note ? ` · ${mov.note}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* ─────────────────── A PARTIR DE 640px: tabela ─────────────────── */}
          <div className="hidden sm:block">
            <table className="w-full table-fixed border-collapse text-sm">
              {/* Fica visível enquanto a lista rola por baixo. */}
              <thead className="sticky top-0 z-10 bg-neutral-50">
                <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                  <th scope="col" className="w-24 px-4 py-2.5 text-left">
                    Quando
                  </th>
                  {mostrarItem && (
                    <th scope="col" className="px-4 py-2.5 text-left">
                      Item
                    </th>
                  )}
                  <th scope="col" className="w-36 px-4 py-2.5 text-left">
                    Movimento
                  </th>
                  <th scope="col" className="w-28 px-4 py-2.5 text-right">
                    Quantidade
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left">
                    Origem
                  </th>
                </tr>
              </thead>
              <tbody>
                {movements.map((mov: any) => {
                  const { rotulo, icone: Icone, cor, fundo } = aparenciaDe(mov.type);
                  const { valor, texto, unidade } = movimentado(mov);
                  const quando = mov.createdAt ? new Date(mov.createdAt) : null;

                  return (
                    <tr
                      key={mov.id}
                      className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/70"
                    >
                      {/* Data e hora empilhadas: cabem em uma coluna estreita. */}
                      <td className="whitespace-nowrap px-4 py-2.5 align-top">
                        <span className="block text-sm tabular-nums text-neutral-900">
                          {quando ? dia.format(quando) : "—"}
                        </span>
                        <span className="block text-xs tabular-nums text-neutral-400">
                          {quando ? hora.format(quando) : ""}
                        </span>
                      </td>

                      {mostrarItem && (
                        <td className="truncate px-4 py-2.5 align-top text-sm text-neutral-700">
                          {mov.item?.name || "—"}
                        </td>
                      )}

                      <td className="px-4 py-2.5 align-top">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${fundo} ${cor}`}
                        >
                          <Icone className="size-3.5" aria-hidden="true" />
                          {rotulo}
                        </span>
                      </td>

                      <td
                        className={`whitespace-nowrap px-4 py-2.5 text-right align-top text-sm font-bold tabular-nums ${
                          valor < 0 ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        {texto}
                        {unidade && (
                          <span className="ml-0.5 text-xs font-medium text-neutral-400">
                            {unidade}
                          </span>
                        )}
                      </td>

                      {/*
                        A ORIGEM JUNTA REFERÊNCIA E NOTA numa coluna só.

                        Eram duas, e quase sempre uma delas vinha vazia: um "—"
                        ocupando espaço para dizer que não há o que dizer. A
                        referência é um id longo — fica truncada, em monoespaço,
                        com o valor inteiro no `title` para quem precisar copiar.
                      */}
                      <td className="px-4 py-2.5 align-top">
                        {mov.reference ? (
                          <span
                            className="block truncate font-mono text-xs text-neutral-500"
                            title={mov.reference}
                          >
                            {mov.reference}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-300">—</span>
                        )}
                        {mov.note && (
                          <span className="mt-0.5 block text-xs leading-snug text-neutral-600">
                            {mov.note}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
