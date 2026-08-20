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
  foco = null,
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
  /**
   * O ponto da vitrine para onde a prévia deve ir, quando um campo recebe o
   * cursor. Casa com o data-previa marcado no componente da loja.
   */
  foco?: string | null;
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

  const desenhar = (preencher: boolean, teto?: number) =>
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
        foco={foco}
        preencher={preencher}
        teto={teto}
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
        <div className="bg-[#FDF8F3]">{desenhar(false, altura)}</div>
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

/**
 * O recorte da vitrine, e o enquadramento do campo focado.
 *
 * A posição é feita por rolagem, não por transform. Foram três tentativas com
 * transform, e cada uma trocou um erro por outro: pixels de tela contra pixels
 * dentro do zoom, a âncora do cabeçalho fixo que a própria medição desligava,
 * e a caixa medida que não era a caixa visível.
 *
 * Rolagem não tem esse problema porque não há conversão a fazer: mede-se onde
 * a marca está agora, mede-se onde é o centro agora, e rola-se a diferença. Se
 * a conta estiver imprecisa, a próxima medição parte do estado real e corrige.
 */
function Palco({
  data,
  aplicar,
  aplicarLoja,
  largura,
  foco,
  preencher,
  teto,
  children,
}: {
  data: MenuPayload & { store: StorePayload };
  aplicar?: (p: MenuPayload) => MenuPayload;
  aplicarLoja?: (l: StorePayload) => StorePayload;
  largura: number;
  foco: string | null;
  /** No modal a vitrine ocupa a altura toda; encaixada, ela tem um teto. */
  preencher: boolean;
  teto?: number;
  children: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.4);
  /** Quanto a escala base é multiplicada ao focar um campo. */
  const [ampliacao, setAmpliacao] = useState(1);

  // A cor sai daqui e pinta tudo: o brandTheme abaixo lê desta loja, não da
  // salva, senão trocar a cor não mudaria nada na prévia.
  const loja = aplicarLoja ? aplicarLoja(data.store) : data.store;

  /** A escala base cabe a largura da vitrine na caixa. */
  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return;
    const medir = () => setEscala(Math.min(1, alvo.clientWidth / largura));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [largura]);

  /** Decide o quanto ampliar no ponto focado, pelo tamanho que ele tem. */
  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return;
    if (!foco) {
      setAmpliacao(1);
      return;
    }
    const marca = alvo.querySelector<HTMLElement>(`[data-previa="${foco}"]`);
    const r = marca?.getBoundingClientRect();
    // Marca ausente ou escondida nesta largura: fica no enquadre geral em vez
    // de ampliar em cima de nada.
    if (!r || r.width < 1 || r.height < 1) {
      setAmpliacao(1);
      return;
    }
    // Cresce até a marca ocupar dois terços da caixa, e para em 4x: mais que
    // isso e o entorno some, e ver só o pedaço não diz onde ele fica.
    const cabe = Math.min(
      (alvo.clientWidth * 0.66) / r.width,
      (alvo.clientHeight * 0.66) / r.height,
    );
    setAmpliacao(Math.min(4, Math.max(1, cabe)));
  }, [foco, escala, largura, children]);

  /**
   * Põe no centro o ponto focado — ou o meio da vitrine, quando não há foco.
   *
   * Roda depois da pintura, porque a ampliação acabou de mudar o tamanho de
   * tudo e as medidas anteriores já não valem.
   */
  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return;

    const id = requestAnimationFrame(() => {
      const rCaixa = alvo.getBoundingClientRect();
      const meioCaixaX = rCaixa.left + rCaixa.width / 2;
      const meioCaixaY = rCaixa.top + rCaixa.height / 2;

      const marca = foco
        ? alvo.querySelector<HTMLElement>(`[data-previa="${foco}"]`)
        : null;
      const r = marca?.getBoundingClientRect();

      if (r && r.width >= 1 && r.height >= 1) {
        alvo.scrollTo({
          left: alvo.scrollLeft + (r.left + r.width / 2) - meioCaixaX,
          top: alvo.scrollTop + (r.top + r.height / 2) - meioCaixaY,
          behavior: "smooth",
        });
      } else {
        alvo.scrollTo({
          left: (alvo.scrollWidth - alvo.clientWidth) / 2,
          top: (alvo.scrollHeight - alvo.clientHeight) / 2,
          behavior: "smooth",
        });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [foco, ampliacao, escala, largura, children]);

  return (
    <div
      ref={caixa}
      style={teto ? { maxHeight: teto } : undefined}
      className={
        "w-full overflow-hidden bg-[#FDF8F3] " + (preencher ? "h-full" : "")
      }
    >
      {/*
       * translateZ(0) não desloca nada: está aqui porque um elemento fixed se
       * ancora no primeiro ancestral com transform. O cabeçalho da loja é
       * fixed — sem isto ele se ancorava na janela do navegador, era desenhado
       * por cima do painel e sumia no recorte.
       *
       * pointer-events desligado porque isto é uma imagem, não a loja: clicar
       * num produto tiraria a lojista do formulário no meio da edição.
       */}
      {/*
       * Dentro da prévia o cabeçalho deixa de ser fixo.
       *
       * Elemento fixed não rola — provado no navegador: depois de rolar, ele
       * fica exatamente onde estava. Enquanto fosse fixed, nenhum campo que
       * aponta para o cabeçalho poderia ser enquadrado. Absolute põe-no no
       * mesmo lugar e o faz acompanhar a rolagem.
       *
       * translateZ(0) fica porque é ele que faz deste elemento a referência de
       * posição do que está dentro.
       */}
      <style>{".palco-da-previa .fixed{position:absolute}"}</style>
      <div
        aria-hidden
        className="palco-da-previa pointer-events-none relative select-none"
        style={{
          width: largura,
          zoom: escala * ampliacao,
          transform: "translateZ(0)",
        }}
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
