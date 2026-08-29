import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Destaques, Novidade, Video } from "@/lib/novidades/tipos";
import { cn } from "@/lib/utils";

/**
 * O MODAL DE QUALQUER NOVIDADE — um só, para sempre.
 *
 * Ele recebe uma `Novidade` e desenha. Não conhece "A Receber" nem nenhuma
 * funcionalidade: a novidade nº 50 usa este arquivo sem alteração.
 *
 * Construído sobre o `ui/dialog.tsx` (Radix `react-dialog`) que já existia no
 * projeto e ninguém usava. Ele entrega de graça o que teríamos que refazer
 * mal: foco preso, ESC, `aria-labelledby`/`describedby`, trava de rolagem,
 * botão X no canto, `max-h-[calc(100dvh-2rem)]` e `w-[calc(100%-2rem)]` — ou
 * seja, os limites de viewport de celular já resolvidos.
 *
 * ⚠️ `admin-theme` NO CONTEÚDO É OBRIGATÓRIO. O Radix renderiza em portal no
 * `<body>`, fora da moldura do painel, e o `:root` deste projeto carrega os
 * tokens do tema ESCURO. Sem a classe, o modal sai preto numa tela clara.
 */

type Props = {
  novidade: Novidade;
  open: boolean;
  /** Fechar por X, ESC ou clique no fundo. NÃO é conclusão nem dispensa. */
  onOpenChange: (aberto: boolean) => void;
  /** "Conhecer agora" — só existe quando a novidade tem passos. */
  onConhecer: () => void;
  /** "Entendi" numa novidade sem tour: encerra ali mesmo. */
  onConcluir: () => void;
  onDispensar: () => void;
};

export function ModalDeNovidade({
  novidade,
  open,
  onOpenChange,
  onConhecer,
  onConcluir,
  onDispensar,
}: Props) {
  const temTour = (novidade.passos?.length ?? 0) > 0;

  /*
   * O vídeo abre GRANDE. É ele que a pessoa precisa notar primeiro — o texto
   * ela lê depois, se quiser. Minimizar é uma escolha dela, não o padrão.
   */
  const [videoExpandido, setVideoExpandido] = useState(true);
  /*
   * Erro de carregamento sobe para cá, e não fica dentro do componente do
   * vídeo, porque a LARGURA DO MODAL depende dele: um MP4 que não carrega não
   * pode deixar o diálogo largo e vazio.
   */
  const [videoFalhou, setVideoFalhou] = useState(false);
  const temVideo = Boolean(novidade.video) && !videoFalhou;
  /*
   * Duas colunas só fazem sentido com o vídeo aberto. Minimizado ele é uma
   * miniatura, e uma coluna de 60% ao lado dela seria um vazio enorme.
   */
  const duasColunas = temVideo && videoExpandido;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "admin-theme gap-0 border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl",
          /*
           * A LARGURA É O QUE DECIDE O TAMANHO DO VÍDEO — não a altura.
           * `aspect-video` deriva a altura da largura, então o `max-h` do vídeo
           * quase nunca é alcançado e mexer nele não muda nada.
           *
           * `max-w-7xl` (1280px) com a divisão 60/40: sobram ~1232px úteis, o
           * vídeo fica com ~725px de largura e ~408px de altura, e a coluna de
           * texto com ~483px — largura em que cada linha de benefício cabe
           * inteira, sem picotar em três pedaços.
           *
           * O `w-[calc(100%-2rem)]` do wrapper continua vencendo em qualquer
           * tela mais estreita que isso, então não há como estourar a viewport.
           *
           * Minimizado, volta a `max-w-xl` e o texto reocupa o palco — ali a
           * miniatura não precisa de largura nenhuma.
           */
          duasColunas ? "max-w-7xl" : "max-w-xl",
          // O `sm:rounded-lg` do wrapper venceria a partir de 640px se só
          // trocássemos o raio base.
          "rounded-2xl sm:rounded-2xl",
        )}
      >
        {/*
          CONTEÚDO E AÇÕES SÃO DUAS FAIXAS, não um bloco só.

          Antes tudo dividia o mesmo plano branco com o mesmo respiro, e o
          diálogo terminava sem terminar: o botão principal era uma barra
          vermelha centralizada no meio do nada. Separar as ações numa faixa
          própria — borda em cima, fundo levemente rebaixado — é o que faz um
          diálogo parecer um diálogo, e não um formulário longo.
        */}
        <div className="p-5 sm:p-7">
          {/*
            A etiqueta virou SELO. Solta, ela era só um texto vermelho no canto;
            com fundo e raio total ela ancora o topo e diz "isto é um anúncio"
            antes de qualquer palavra ser lida.
          */}
          <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3.5 py-1.5 text-sm font-bold uppercase tracking-wide text-[#E11D2E]">
            <Sparkles className="size-4" />
            Nova funcionalidade
          </span>

          {/*
            O VÍDEO SÓ EXISTE AQUI DENTRO, e é isso que garante download zero:
            o Radix não monta o `DialogContent` enquanto fechado, então o
            elemento `<video>` nem chega ao DOM até alguém abrir o modal.

            Sem `video` no catálogo, nada é renderizado e o modal segue inteiro.
          */}
          {/*
            ═══ AS DUAS COLUNAS ═══
            Vídeo à esquerda (3/5), detalhes à direita (2/5), a partir de `lg`.

            A GRADE É SEMPRE A MESMA ÁRVORE — dois `div` irmãos, nesta ordem, em
            qualquer estado. Só as classes mudam. Isso não é estilo: mover o
            `<video>` para outro pai faria o React descartar o nó e remontá-lo,
            e a reprodução voltaria ao zero ao minimizar.

            Abaixo de `lg` a grade simplesmente não existe (nenhum `grid`), e os
            dois blocos empilham na ordem natural do documento: vídeo, botão,
            título, descrição, benefícios. É por isso que não há `order-*` em
            lugar nenhum — a ordem do DOM já é a ordem certa no celular.
          */}
          <div className={cn("mt-5", duasColunas && "lg:grid lg:grid-cols-5 lg:gap-8")}>
            <div className={cn(duasColunas && "lg:col-span-3")}>
              {/*
                O VÍDEO SÓ EXISTE AQUI DENTRO, e é isso que garante download
                zero: o Radix não monta o `DialogContent` enquanto fechado,
                então o elemento `<video>` nem chega ao DOM até alguém abrir.
              */}
              {novidade.video && !videoFalhou && (
                <VideoDaNovidade
                  video={novidade.video}
                  expandido={videoExpandido}
                  onAlternar={() => setVideoExpandido((v) => !v)}
                  onErro={() => setVideoFalhou(true)}
                />
              )}
            </div>

            <div className={cn(duasColunas && "lg:col-span-2")}>
              {/*
                A ESCALA DESTA COLUNA: 30 · 16 · 12.

                Era 24 · 14 · 12, e o degrau do meio — a descrição — fazia o
                maior trabalho com o menor tratamento: cinza, miúda, quebrando
                em três linhas ao lado de um card que parecia mais desenhado
                que ela. Subindo o título e transformando a descrição numa
                abertura de verdade, os três degraus passam a se distinguir
                sozinhos, sem moldura nenhuma.
              */}
              <DialogTitle
                className={cn(
                  "font-display text-3xl font-bold leading-tight tracking-tight text-neutral-900",
                  temVideo ? "mt-5" : "mt-3",
                  // Em duas colunas o título encabeça a coluna: a folga que o
                  // separava do vídeo empilhado deixa de fazer sentido.
                  duasColunas && "lg:mt-0",
                )}
              >
                {novidade.titulo}
              </DialogTitle>
              {/* 16px, não 14: esta é a frase que explica a novidade inteira.
                  No tamanho do corpo secundário ela lia como ressalva. */}
              <DialogDescription className="mt-3 text-base leading-relaxed text-neutral-600">
                {novidade.descricao}
              </DialogDescription>

              {/* Só existe se a novidade trouxer o conteúdo. Sem `destaques` no
                  catálogo, nada é renderizado e o modal fica como sempre foi. */}
              {novidade.destaques && <BlocoDeDestaques destaques={novidade.destaques} />}
            </div>
          </div>

        </div>

        {/*
          A FAIXA DE AÇÕES.

          Borda em cima e fundo rebaixado: é o que fecha o diálogo visualmente,
          separando "o que estou lendo" de "o que posso fazer".

          A distribuição também mudou de peso. A recusa fica à ESQUERDA, discreta
          e do tamanho de um link; a ação principal à DIREITA, dimensionada pelo
          próprio texto. Antes as duas se empilhavam centralizadas, com o botão
          vermelho atravessando o diálogo inteiro — largura não é ênfase, é só
          largura, e um alvo daquele tamanho para "conhecer" pesava mais que a
          decisão merece.

          `flex-col-reverse` no celular põe a ação principal ACIMA da recusa,
          onde o polegar chega primeiro.

          Rótulos e handlers são os mesmos de sempre.
        */}
        <div className="flex flex-col-reverse gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <button
            type="button"
            onClick={onDispensar}
            className="rounded-lg py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-900 sm:px-1"
          >
            Não mostrar novamente
          </button>
          <button
            type="button"
            onClick={temTour ? onConhecer : onConcluir}
            className="w-full rounded-xl bg-[#E11D2E] px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#c4172a] sm:w-auto"
          >
            {/* Sem passos, "Conhecer agora" prometeria um tour que não
                existe. O rótulo acompanha o que a novidade de fato tem. */}
            {temTour ? "Conhecer agora" : "Entendi"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O bloco explicativo, abaixo do vídeo.
 *
 * Painel neutro sobre o branco do modal — a mesma linguagem dos cartões do
 * resto do sistema (`rounded-xl`, borda de 1px, fundo levemente tingido), sem
 * cor de alerta: isto é informação, não aviso.
 *
 * Cada pedaço é opcional e só ocupa espaço se existir, então uma novidade que
 * só queira a lista não paga por um parágrafo vazio.
 */
function BlocoDeDestaques({ destaques }: { destaques: Destaques }) {
  return (
    /*
     * O CORPO AQUI É MENOR QUE O DO RESTO DO MODAL — `text-xs` contra o
     * `text-sm` do título e da descrição.
     *
     * Não é economia de espaço: é hierarquia. Este bloco é material de APOIO,
     * lido em diagonal, e no mesmo tamanho da descrição ele disputava a
     * atenção com ela. Menor, ele se lê como uma lista de conferência — que é
     * o que é — e ainda ganha mais palavras por linha, então cada benefício
     * cabe inteiro em vez de quebrar no meio.
     */
    <section className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <h3 className="font-display text-sm font-bold tracking-tight text-neutral-900">
        {destaques.titulo}
      </h3>

      {destaques.chamada && (
        <p className="mt-2 text-xs font-semibold leading-relaxed text-neutral-800">
          {destaques.chamada}
        </p>
      )}

      {destaques.texto && (
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">{destaques.texto}</p>
      )}

      {destaques.itens && destaques.itens.length > 0 && (
        /* `list-none` porque o emoji já é o marcador: um bullet do navegador ao
           lado dele daria dois marcadores na mesma linha. */
        <ul className="mt-3 list-none space-y-1.5">
          {destaques.itens.map((item) => (
            <li key={item} className="text-xs leading-relaxed text-neutral-700">
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * O VÍDEO HORIZONTAL, e as quatro coisas que ele não pode fazer.
 *
 *   1. Não pode ser cortado. `object-contain` preserva a proporção original e
 *      encaixota o que sobrar; `cover` cortaria justamente as bordas onde a
 *      interface gravada está.
 *   2. Não pode empurrar os botões para fora da tela. `aspect-video` calcula a
 *      altura pela largura, e o `max-h-[65vh]` a limita num notebook baixo ou
 *      num celular deitado.
 *   3. Não pode derrubar o modal. Falhou o arquivo, o bloco some e o resto
 *      continua funcionando.
 *   4. NÃO PODE RECOMEÇAR AO MINIMIZAR.
 *
 * ─── SOBRE O ITEM 4, QUE É O QUE GOVERNA A FORMA DESTE COMPONENTE ───────────
 *
 * Os dois estados renderizam a MESMA ÁRVORE: `section > p + div > div > video`,
 * sempre, com os mesmos tipos nas mesmas posições. O que muda são só as classes.
 *
 * Isso não é estilo, é requisito. Se o `<video>` trocasse de pai — ou se um
 * irmão aparecesse/sumisse antes dele — o React descartaria o nó e montaria
 * outro, e o vídeo voltaria ao segundo zero, sem buffer e pausado. Por isso o
 * rótulo "🎬 Vídeo" é escondido com `hidden` em vez de não ser renderizado:
 * removê-lo mudaria as posições dos irmãos.
 *
 * Trocando só `className`, o React atualiza o atributo e mantém o nó — a
 * posição de reprodução, o play/pause, o buffer e os controles sobrevivem.
 */
function VideoDaNovidade({
  video,
  expandido,
  onAlternar,
  onErro,
}: {
  video: Video;
  expandido: boolean;
  onAlternar: () => void;
  onErro: () => void;
}) {
  const referencia = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const elemento = referencia.current;
    if (!elemento) return;

    /*
     * `play()` DEVOLVE UMA PROMISE QUE REJEITA quando o navegador bloqueia o
     * autoplay — e sem este `catch` ela vira um "unhandled rejection" no
     * console de todo mundo que tem a política restritiva ligada.
     *
     * Rejeitou, não há o que fazer nem o que avisar: o vídeo fica parado no
     * primeiro quadro com os controles nativos, e a pessoa dá play. O áudio
     * nunca começa sozinho de qualquer forma — `muted` está no elemento.
     */
    const tentativa = elemento.play();
    if (tentativa && typeof tentativa.catch === "function") {
      tentativa.catch(() => {});
    }
  }, []);

  return (
    <section
      className={cn(
        // A folga em relação ao topo mora na grade, não aqui: em duas colunas
        // esta seção encabeça a coluna e um `mt` próprio a desalinharia do
        // título ao lado.
        // Minimizado o vídeo vira um item de lista e ganha moldura; expandido
        // ele é o palco e não precisa de nada em volta.
        !expandido && "rounded-xl border border-neutral-200 bg-neutral-50 p-3",
      )}
    >
      {/* Escondido, e não removido: tirar este irmão do DOM mudaria a posição
          do vídeo na árvore e o React o remontaria — ver o item 4 acima. */}
      <p
        className={cn(
          "mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500",
          expandido && "hidden",
        )}
      >
        🎬 Vídeo
      </p>

      <div className={cn(expandido ? "flex flex-col gap-2" : "flex items-center gap-3")}>
        <div
          className={cn(
            // O anel e a sombra ASSENTAM o vídeo na página. Sem eles é um
            // retângulo preto colado no branco; com eles vira uma peça
            // apoiada, que é o que separa "tem um vídeo aqui" de "este é o
            // vídeo".
            "shrink-0 overflow-hidden bg-neutral-900 ring-1 ring-neutral-900/10",
            expandido
              ? // O teto é generoso — 65vh, não 50vh — porque agora a largura
                // do modal é que dá o tamanho. Ele só entra em ação em tela
                // baixa, e aí encaixota pelas laterais em vez de cortar.
                "aspect-video max-h-[65vh] w-full rounded-xl shadow-lg shadow-neutral-900/10"
              : "aspect-video w-28 rounded-lg sm:w-36",
          )}
        >
          <video
            ref={referencia}
            src={video.src}
            poster={video.poster}
            controls
            muted
            playsInline
            // `metadata` em vez de `auto`: o modal já está aberto, mas não há por
            // que baixar o arquivo inteiro de quem vai fechar em dois segundos.
            preload="metadata"
            onError={onErro}
            className="size-full object-contain"
          />
        </div>

        {/* FORA da caixa do vídeo, nunca por cima: sobreposto, ele disputaria
            espaço com a barra de controles nativa exatamente onde o dedo vai. */}
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={expandido}
          className={cn(
            // Discreto de propósito: é um controle de conveniência, não uma
            // ação do diálogo. Com a borda forte de antes ele disputava
            // atenção com o botão vermelho lá embaixo.
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900",
            expandido && "self-end",
          )}
        >
          {expandido ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          {expandido ? "Minimizar vídeo" : "Expandir vídeo"}
        </button>
      </div>
    </section>
  );
}
