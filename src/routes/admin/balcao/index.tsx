import { createFileRoute, Link } from "@tanstack/react-router";
import { recursoNoEstado } from "@/lib/planos/resolucao";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Search, UtensilsCrossed } from "lucide-react";
import {
  FinalizarPedido,
  type DadosDaFinalizacao,
} from "@/components/admin/balcao/FinalizarPedido";
import { ModalDoProduto } from "@/components/admin/balcao/ModalDoProduto";
import { PainelDoPedido } from "@/components/admin/balcao/PainelDoPedido";
import {
  adicionarItem,
  alterarQuantidade,
  paraCheckout,
  removerItem,
  substituirItem,
  type ItemDoBalcao,
} from "@/lib/balcao/carrinho";
import {
  criarPedidoDeBalcaoFn,
  getBalcaoMenuFn,
  precificarBalcaoFn,
} from "@/server/functions/balcao.fn";
import type { ProdutoDoBalcao } from "@/lib/balcao/tipos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/balcao/")({
  component: BalcaoPage,
});

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O BALCÃO — a tela de quem atende de pé.
 *
 * Nada aqui é um segundo sistema de pedidos: é uma vitrine interna que monta o
 * mesmo `items[]` que o checkout da loja monta, e o manda pela porta do painel.
 * Depois de criado, o pedido é um pedido — mesmo quadro, mesmo estoque, mesmo
 * fiado.
 *
 * O QUE A TELA OTIMIZA É CLIQUE. Categorias e busca no topo, cards grandes,
 * carrinho fixo à direita, uma confirmação e acabou. Produto sem tamanho, sem
 * pergunta e sem adicional vai direto para o carrinho, sem abrir modal nenhum:
 * é o refrigerante, e ele é metade dos pedidos de balcão.
 */
function BalcaoPage() {
  const queryClient = useQueryClient();
  /* O estado comercial já veio na sessão, pelo `beforeLoad` de `/admin`. */
  const { admin } = Route.useRouteContext();

  const [categoria, setCategoria] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<ItemDoBalcao[]>([]);
  const [emConfiguracao, setEmConfiguracao] = useState<ProdutoDoBalcao | null>(null);
  const [emEdicao, setEmEdicao] = useState<ItemDoBalcao | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [erroDoEnvio, setErroDoEnvio] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<{
    numero: number;
    total: number;
    aviso: string | null;
  } | null>(null);

  const { data: cardapio, isPending } = useQuery({
    queryKey: ["balcao-cardapio"],
    queryFn: () => getBalcaoMenuFn(),
  });

  /**
   * O total vem do servidor a cada mudança do carrinho.
   *
   * `queryKey` derivada dos itens: mudar quantidade, adicionar ou remover
   * refaz a conta; reordenar a tela não. É a mesma `precificarItens` do
   * checkout, então o número que o atendente lê é o que será cobrado.
   */
  const itensParaCheckout = useMemo(() => paraCheckout(itens), [itens]);
  const { data: precos, isFetching: precificando } = useQuery({
    queryKey: ["balcao-precos", JSON.stringify(itensParaCheckout)],
    queryFn: () => precificarBalcaoFn({ data: { items: itensParaCheckout } }),
    enabled: itens.length > 0,
    placeholderData: (anterior) => anterior,
  });

  const erroDePreco = precos && !precos.ok ? precos.error : null;

  const criar = useMutation({
    mutationFn: (dados: DadosDaFinalizacao) =>
      criarPedidoDeBalcaoFn({
        data: { ...dados, items: itensParaCheckout },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        setErroDoEnvio(r.error);
        return;
      }
      // O pedido existe: limpa a tela e mostra o número, que é o que o
      // atendente vai gritar para a cozinha.
      setSucesso({ numero: r.orderNumber, total: r.total, aviso: r.aviso });
      setItens([]);
      setFinalizando(false);
      setErroDoEnvio(null);
      queryClient.invalidateQueries({ queryKey: ["kanban"] });
      queryClient.invalidateQueries({ queryKey: ["pagamentos-em-aberto"] });
    },
    onError: () =>
      setErroDoEnvio("Não foi possível registrar o pedido. Tente novamente."),
  });

  const produtos = cardapio?.produtos ?? [];
  const termo = busca.trim().toLowerCase();
  const visiveis = produtos.filter((p) => {
    if (categoria !== "todos" && p.categoryId !== categoria) return false;
    if (!termo) return true;
    return (
      p.name.toLowerCase().includes(termo) ||
      p.categoryName.toLowerCase().includes(termo)
    );
  });

  /** Produto sem escolha nenhuma a fazer não merece um modal. */
  function ehDiretoAoCarrinho(p: ProdutoDoBalcao) {
    return (
      p.sizes.length === 0 &&
      p.optionGroups.length === 0 &&
      (cardapio?.extras ?? []).every(
        (e) => !e.productIds.includes(p.id) && !e.categoryIds.includes(p.categoryId),
      )
    );
  }

  function aoClicarNoProduto(p: ProdutoDoBalcao) {
    setSucesso(null);
    if (ehDiretoAoCarrinho(p)) {
      setItens((atual) =>
        adicionarItem(atual, {
          productId: p.id,
          productSlug: p.slug,
          nome: p.name,
          imageUrl: p.imageUrl,
          categoryId: p.categoryId,
          optionIds: [],
          extraIds: [],
          quantity: 1,
        }),
      );
      return;
    }
    setEmEdicao(null);
    setEmConfiguracao(p);
  }

  function confirmarItem(item: Omit<ItemDoBalcao, "uid">) {
    setItens((atual) =>
      emEdicao ? substituirItem(atual, emEdicao.uid, item) : adicionarItem(atual, item),
    );
    setEmConfiguracao(null);
    setEmEdicao(null);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Balcão</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Monte o pedido de quem está na loja. Ele entra no quadro como qualquer
            outro.
          </p>
        </div>
        <Link
          to="/admin/pedidos"
          className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Ver quadro de pedidos
        </Link>
      </header>

      {sucesso && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-900">
            Pedido #{sucesso.numero} registrado · {dinheiro(sucesso.total)}
          </p>
          {sucesso.aviso && (
            <p className="w-full text-xs font-medium text-amber-700">{sucesso.aviso}</p>
          )}
          <button
            type="button"
            onClick={() => setSucesso(null)}
            className="ml-auto text-xs font-semibold text-emerald-700 underline"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto pelo nome"
              className="w-full rounded-xl border border-neutral-300 py-2.5 pl-9 pr-3 text-base text-neutral-900 md:text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <BotaoDeCategoria
              ativo={categoria === "todos"}
              onClick={() => setCategoria("todos")}
            >
              Todos
            </BotaoDeCategoria>
            {(cardapio?.categorias ?? [])
              .filter((c) => c.quantidade > 0)
              .map((c) => (
                <BotaoDeCategoria
                  key={c.id}
                  ativo={categoria === c.id}
                  onClick={() => setCategoria(c.id)}
                >
                  {c.name}
                </BotaoDeCategoria>
              ))}
          </div>

          {isPending ? (
            <p className="text-sm text-neutral-500">Carregando cardápio...</p>
          ) : visiveis.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
              {produtos.length === 0
                ? "Nenhum produto ativo no cardápio ainda."
                : "Nenhum produto encontrado com esse filtro."}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visiveis.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => aoClicarNoProduto(p)}
                    className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left transition-shadow hover:border-neutral-300 hover:shadow-md"
                  >
                    <div className="flex aspect-[4/3] items-center justify-center bg-neutral-100">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <UtensilsCrossed className="size-8 text-neutral-300" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        {p.categoryName}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-neutral-900">
                        {p.name}
                      </p>
                      <p className="mt-auto pt-2 text-sm font-bold text-[#E11D2E]">
                        {p.sizes.length > 0
                          ? `a partir de ${dinheiro(
                              Math.min(...p.sizes.map((s) => s.price)),
                            )}`
                          : dinheiro(p.basePrice)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <PainelDoPedido
            itens={itens}
            linhas={precos?.ok ? precos.linhas : null}
            subtotal={
              itens.length === 0 ? 0 : precos?.ok ? precos.subtotal : null
            }
            carregando={precificando}
            erro={erroDePreco}
            onAlterarQuantidade={(uid, delta) =>
              setItens((atual) => alterarQuantidade(atual, uid, delta))
            }
            onRemover={(uid) => setItens((atual) => removerItem(atual, uid))}
            onEditar={(item) => {
              const p = produtos.find((x) => x.id === item.productId);
              if (!p) return;
              setEmEdicao(item);
              setEmConfiguracao(p);
            }}
            onFinalizar={() => {
              setErroDoEnvio(null);
              setFinalizando(true);
            }}
          />
        </div>
      </div>

      <ModalDoProduto
        produto={emConfiguracao}
        extras={cardapio?.extras ?? []}
        edicao={emEdicao}
        aberto={emConfiguracao !== null}
        onFechar={() => {
          setEmConfiguracao(null);
          setEmEdicao(null);
        }}
        onConfirmar={confirmarItem}
      />

      <FinalizarPedido
        aberto={finalizando}
        total={precos?.ok ? precos.subtotal : null}
        formasAceitas={cardapio?.formasDePagamento ?? []}
        enviando={criar.isPending}
        erro={erroDoEnvio}
        onFechar={() => setFinalizando(false)}
        /* O plano vem da sessão: nenhuma consulta a mais para saber isto. */
        permiteFiado={
          !admin?.store.plano ||
          recursoNoEstado(admin.store.plano, "FIADO") !== "BLOQUEADO"
        }
        onConfirmar={(dados) => {
          setErroDoEnvio(null);
          criar.mutate(dados);
        }}
      />
    </div>
  );
}

function BotaoDeCategoria({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        ativo
          ? "border-[#E11D2E] bg-[#E11D2E] text-white"
          : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400",
      )}
    >
      {children}
    </button>
  );
}
