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
 *
 * O valor é o da moldura do cardápio, que tem max-w-[1800px]. Em 1280 os três
 * cards de produto não cabiam e transbordavam pela direita — a prévia mostrava
 * um layout apertado que a loja de verdade nunca tem.
 */
const LARGURA_PADRAO = 1800;


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
  aplicarLoja,
  altura = 360,
  largura = LARGURA_PADRAO,
  children,
}: {
  storeSlug: string;
  /** Recebe o cardápio salvo e devolve com o rascunho por cima. */
  aplicar?: (payload: MenuPayload) => MenuPayload;
  /** O mesmo para os dados da loja: nome, logo e cores. */
  aplicarLoja?: (loja: StorePayload) => StorePayload;
  altura?: number;
  /**
   * Em que largura montar a vitrine antes de encolher.
   *
   * Menor aproxima: a tela de Produtos mostra só a fileira de cards, e ali
   * cabe uma largura menor — o resultado é o card grande o bastante para se
   * julgar a foto e a etiqueta.
   */
  largura?: number;
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

  const desenhar = (preencher: boolean) =>
    isPending || !data ? (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" />
        Carregando a prévia...
      </div>
    ) : (
      <Palco
        data={data}
        aplicar={aplicar}
        aplicarLoja={aplicarLoja}
        largura={largura}
        preencher={preencher}
      >
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

        {/* Sem altura fixa: com zoom o elemento já ocupa o espaço reduzido no
            layout, então a caixa se ajusta ao tamanho da seção. A altura vira
            teto, para uma seção comprida não empurrar o formulário inteiro
            para fora da tela. */}
        <div className="overflow-hidden bg-[#FDF8F3]" style={{ maxHeight: altura }}>
          {desenhar(false)}
        </div>
      </section>

      {ampliada && (
        <ModalDaPrevia onFechar={() => setAmpliada(false)}>{desenhar(true)}</ModalDaPrevia>
      )}
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
  aplicarLoja,
  largura,
  preencher,
  children,
}: {
  data: MenuPayload & { store: StorePayload };
  aplicar?: (p: MenuPayload) => MenuPayload;
  aplicarLoja?: (l: StorePayload) => StorePayload;
  largura: number;
  /** No modal a vitrine se centra na altura toda; encaixada, ela a define. */
  preencher: boolean;
  children: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.4);
  // A cor sai daqui e pinta tudo: o brandTheme abaixo lê desta loja, não da
  // salva, senão trocar a cor não mudaria nada na prévia.
  const loja = aplicarLoja ? aplicarLoja(data.store) : data.store;

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
    const medir = () => setEscala(Math.min(1, alvo.clientWidth / largura));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [largura]);

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
    <div
      ref={caixa}
      className={
        "flex w-full items-center justify-center overflow-hidden " + (preencher ? "h-full" : "")
      }
    >
      <div
        aria-hidden
        className="pointer-events-none select-none"
        style={{ width: largura, zoom: escala }}
      >
        <StoreProvider payload={loja}>
          <MenuProvider payload={aplicar ? aplicar(data) : data}>
            <CartProvider>
              <div
                className="pizzaria2 bg-cream font-sans text-charcoal"
                style={brandTheme(loja) as React.CSSProperties}
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
