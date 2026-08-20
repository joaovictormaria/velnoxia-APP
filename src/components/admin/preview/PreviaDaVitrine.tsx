import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { CartProvider } from "@/lib/pizzaria2/cart";
import { MenuProvider, type MenuPayload } from "@/lib/pizzaria2/menu-provider";
import { StoreProvider, type StorePayload } from "@/lib/pizzaria2/store-provider";
import { brandTheme } from "@/lib/pizzaria2/brand-theme";
import { getStorefrontMenuFn } from "@/server/functions/storefront-menu.fn";

/**
 * O quanto a prévia se afasta.
 *
 * Em painel largo a vitrine cabia em tamanho real, e o que entrava na altura
 * era só o começo da seção — um nariz colado na tela. Afastar mostra o bloco
 * inteiro e onde ele se encaixa no resto da página.
 *
 * É o mesmo que dar zoom-out no navegador: a janela passa a valer mais pixels.
 * Por isso a largura de renderização cresce junto — se ficasse fixa, a prévia
 * encolheria e sobraria uma faixa vazia à direita.
 */
const AFASTAMENTO = 0.7;

/**
 * Abaixo disto a vitrine troca para o layout de celular.
 *
 * Num painel estreito a conta daria uma largura pequena, e a lojista veria o
 * cardápio empilhado — que não é o que ela está editando nesta tela.
 */
const LARGURA_MINIMA = 1180;

/**
 * A vitrine de verdade dentro do painel, refletindo o que ainda não foi salvo.
 *
 * Renderiza os mesmos componentes que o cliente da loja vê, não uma imitação.
 * É o que garante que a prévia não passe a mentir quando a vitrine mudar — e
 * uma prévia que mente é pior do que nenhuma, porque a lojista salva confiando
 * nela.
 *
 * Fica em cima e ocupa a largura toda, com altura limitada: a vitrine é
 * desenhada para tela larga, e espremê-la numa coluna lateral mostraria um
 * layout que ninguém nunca vai ver.
 */
export function PreviaDaVitrine({
  storeSlug,
  aplicar,
  altura = 520,
  children,
}: {
  storeSlug: string;
  /** Recebe o cardápio salvo e devolve com o rascunho por cima. */
  aplicar: (payload: MenuPayload) => MenuPayload;
  altura?: number;
  /** O pedaço da vitrine a mostrar. */
  children: ReactNode;
}) {
  const { data, isPending } = useQuery({
    queryKey: ["previa-da-vitrine", storeSlug],
    queryFn: () => getStorefrontMenuFn({ data: { storeSlug } }),
    // O cardápio salvo muda pouco durante uma edição; o que muda a cada tecla
    // é o rascunho, aplicado por cima sem ir ao servidor.
    staleTime: 30_000,
  });

  const caixa = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState({ escala: AFASTAMENTO, largura: LARGURA_MINIMA });

  // Medido da largura real, não de pontos de quebra: o menu do painel recolhe
  // e expande, e a prévia acompanha.
  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return;
    const medir = () => {
      const disponivel = alvo.clientWidth;
      const largura = Math.max(LARGURA_MINIMA, disponivel / AFASTAMENTO);
      // A escala sai da razão entre as duas, e não da constante: assim o
      // conteúdo reduzido preenche exatamente a caixa, sem sobra.
      setMedida({ escala: disponivel / largura, largura });
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-2.5">
        <Eye className="size-4 text-neutral-500" />
        <p className="text-sm font-semibold text-neutral-900">Prévia do seu cardápio</p>
        <p className="text-xs text-neutral-500">— como fica para o cliente, antes de salvar</p>
      </header>

      <div ref={caixa} className="relative bg-[#FDF8F3]" style={{ height: altura }}>
        {isPending || !data ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-500">
            <Loader2 className="size-4 animate-spin" />
            Carregando a prévia...
          </div>
        ) : (
          <Palco
            escala={medida.escala}
            largura={medida.largura}
            altura={altura}
            data={data}
            aplicar={aplicar}
          >
            {children}
          </Palco>
        )}
      </div>
    </section>
  );
}

function Palco({
  escala,
  largura,
  altura,
  data,
  aplicar,
  children,
}: {
  escala: number;
  largura: number;
  altura: number;
  data: MenuPayload & { store: StorePayload };
  aplicar: (p: MenuPayload) => MenuPayload;
  children: ReactNode;
}) {
  const comRascunho = aplicar(data);

  return (
    /**
     * O conteúdo é montado no tamanho de projeto e encolhido por transform, em
     * vez de renderizado num espaço estreito: assim a lojista vê o layout que
     * o cliente dela vê, e não uma versão que só existe aqui.
     *
     * pointer-events desligado porque isto é uma imagem, não a loja. Sem isso,
     * clicar num produto da prévia tiraria a lojista do formulário no meio da
     * edição, perdendo o que ela digitou.
     */
    <div
      aria-hidden
      className="pointer-events-none select-none"
      style={{
        width: largura,
        height: altura / escala,
        transform: `scale(${escala})`,
        transformOrigin: "top left",
        overflow: "hidden",
      }}
    >
      <StoreProvider payload={data.store}>
        <MenuProvider payload={comRascunho}>
          <CartProvider>
            <div
              className="pizzaria2 bg-cream font-sans text-charcoal"
              style={brandTheme(data.store) as React.CSSProperties}
            >
              {children}
            </div>
          </CartProvider>
        </MenuProvider>
      </StoreProvider>
    </div>
  );
}
