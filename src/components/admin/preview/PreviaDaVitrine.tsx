import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2, Maximize2, X } from "lucide-react";
import { CartProvider } from "@/lib/pizzaria2/cart";
import { MenuProvider, type MenuPayload } from "@/lib/pizzaria2/menu-provider";
import { StoreProvider, type StorePayload } from "@/lib/pizzaria2/store-provider";
import { brandTheme } from "@/lib/pizzaria2/brand-theme";
import { getStorefrontMenuFn } from "@/server/functions/storefront-menu.fn";

/**
 * A largura em que a vitrine é montada antes de encolher.
 *
 * Fixa, e não derivada do espaço disponível: é ela que decide qual layout a
 * vitrine escolhe. Deixá-la variar faria a lojista ver o cardápio empilhado de
 * celular numa tela e o de computador em outra, sem ter mudado nada.
 */
const LARGURA_DA_VITRINE = 1280;

/**
 * A vitrine de verdade dentro do painel, refletindo o que ainda não foi salvo.
 *
 * Renderiza os mesmos componentes que o cliente da loja vê, não uma imitação.
 * É o que garante que a prévia não passe a mentir quando a vitrine mudar — e
 * uma prévia que mente é pior do que nenhuma, porque a lojista salva confiando
 * nela.
 */
export function PreviaDaVitrine({
  storeSlug,
  aplicar,
  altura = 360,
  children,
}: {
  storeSlug: string;
  /** Recebe o cardápio salvo e devolve com o rascunho por cima. */
  aplicar: (payload: MenuPayload) => MenuPayload;
  altura?: number;
  /** O pedaço da vitrine a mostrar. */
  children: ReactNode;
}) {
  const [ampliada, setAmpliada] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["previa-da-vitrine", storeSlug],
    queryFn: () => getStorefrontMenuFn({ data: { storeSlug } }),
    // O cardápio salvo muda pouco durante uma edição; o que muda a cada tecla
    // é o rascunho, aplicado por cima sem ir ao servidor.
    staleTime: 30_000,
  });

  const conteudo =
    isPending || !data ? (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" />
        Carregando a prévia...
      </div>
    ) : (
      <Palco data={data} aplicar={aplicar}>
        {children}
      </Palco>
    );

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-2.5">
          <Eye className="size-4 shrink-0 text-neutral-500" />
          <p className="truncate text-sm font-semibold text-neutral-900">Prévia do seu cardápio</p>
          <button
            type="button"
            onClick={() => setAmpliada(true)}
            title="Ver em tamanho maior"
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-[#E11D2E] hover:text-[#E11D2E]"
          >
            <Maximize2 className="size-3.5" />
            Ampliar
          </button>
        </header>

        <div className="bg-[#FDF8F3]" style={{ height: altura }}>
          {conteudo}
        </div>
      </section>

      {ampliada && <ModalDaPrevia onFechar={() => setAmpliada(false)}>{conteudo}</ModalDaPrevia>}
    </>
  );
}

/**
 * A prévia em tela cheia, para conferir o resultado sem apertar os olhos.
 *
 * Encaixada ao lado do formulário, a vitrine aparece a menos de metade do
 * tamanho: serve para acompanhar o que muda enquanto se digita, mas não para
 * ler. Aqui ela cabe grande, e o formulário continua logo atrás.
 */
function ModalDaPrevia({ onFechar, children }: { onFechar: () => void; children: ReactNode }) {
  // Esc fecha: é a tecla que qualquer pessoa tenta primeiro, e sem ela a única
  // saída seria mirar no botão.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-8"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Prévia do cardápio"
        // Clique dentro não fecha: só o fundo e o Esc fecham.
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[90vh] w-full max-w-350 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-neutral-200 px-5 py-3">
          <Eye className="size-4 text-neutral-500" />
          <p className="text-sm font-semibold text-neutral-900">Prévia do seu cardápio</p>
          <p className="hidden text-xs text-neutral-500 sm:block">
            — como fica para o cliente, antes de salvar
          </p>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar prévia"
            className="ml-auto rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-hidden bg-[#FDF8F3]">{children}</div>
      </div>
    </div>
  );
}

function Palco({
  data,
  aplicar,
  children,
}: {
  data: MenuPayload & { store: StorePayload };
  aplicar: (p: MenuPayload) => MenuPayload;
  children: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.4);

  /**
   * A escala sai só da largura disponível.
   *
   * Medir também a altura do conteúdo parecia melhor — caberia a seção
   * inteira. Mas o zoom muda o que offsetHeight devolve, e a conta que
   * compensava isso derrubou a escala para quase zero: a prévia virou um ponto
   * no meio da caixa. Pela largura o resultado é previsível e não depende do
   * que o navegador considera "altura" de um elemento com zoom.
   *
   * O que passar da altura da caixa fica cortado, igualmente em cima e
   * embaixo, porque o conteúdo está centrado.
   */
  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return;
    const medir = () => setEscala(Math.min(1, alvo.clientWidth / LARGURA_DA_VITRINE));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  return (
    /**
     * Centralizado nos dois eixos, com zoom em vez de transform: zoom encolhe
     * também o espaço que o elemento ocupa no layout, então o flex consegue
     * centrá-lo. Com transform o elemento continuaria do tamanho original para
     * o layout, e a vitrine ficaria colada no canto de cima à esquerda.
     *
     * pointer-events desligado porque isto é uma imagem, não a loja. Sem isso,
     * clicar num produto tiraria a lojista do formulário no meio da edição.
     */
    <div ref={caixa} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none select-none"
        style={{ width: LARGURA_DA_VITRINE, zoom: escala }}
      >
        <StoreProvider payload={data.store}>
          <MenuProvider payload={aplicar(data)}>
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
    </div>
  );
}
