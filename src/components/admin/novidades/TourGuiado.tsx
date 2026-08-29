import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { cumpriuPorNavegacao } from "@/lib/novidades/selecao";
import type { Passo, Posicao } from "@/lib/novidades/tipos";
import { useAlvo } from "./useAlvo";

/**
 * O MOTOR DE TOUR DA VELNOX — genérico, e é obrigatório que continue assim.
 *
 * Ele não sabe o que é "A Receber", pagamento, estoque ou pedido. Recebe um
 * array de passos e desenha. A novidade nº 50 usa este mesmo arquivo sem uma
 * linha de alteração.
 *
 * ── O RECORTE É FEITO COM QUATRO FAIXAS, e não com máscara SVG nem com
 * `box-shadow` gigante. As duas alternativas escurecem a tela, mas nenhuma
 * BLOQUEIA o clique: sombra não recebe evento de ponteiro, e uma máscara
 * exigiria desligar os eventos do buraco à mão. Com quatro retângulos ao redor
 * do alvo, o bloqueio sai de graça e o alvo continua clicável — que é o
 * comportamento certo, porque o passo está justamente ensinando a clicar nele.
 */

type Props = {
  passos: Passo[];
  /** Desistiu — ESC, X ou "Pular tutorial". NADA é persistido. */
  onSair: () => void;
  /** Chegou ao fim. Só isto marca a novidade como concluída. */
  onConcluir: () => void;
};

/** Folga entre o alvo e o recorte, para o destaque não encostar na borda. */
const RESPIRO = 8;
/** Margem mínima entre o balão e a borda da tela. */
const MARGEM = 12;
const LARGURA_BALAO = 320;
/** Abaixo disto o balão vira faixa fixa no rodapé — ver `posicionar`. */
const LIMITE_CELULAR = 640;

export function TourGuiado({ passos, onSair, onConcluir }: Props) {
  const [indice, setIndice] = useState(0);
  const passo = passos[indice] ?? null;
  const resolucao = useAlvo(passo, true);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const balao = useRef<HTMLDivElement>(null);
  const [alturaDoBalao, setAlturaDoBalao] = useState(0);

  const ultimo = indice === passos.length - 1;

  function avancar() {
    if (ultimo) onConcluir();
    else setIndice((i) => i + 1);
  }

  /**
   * O último passo cujo destaque a pessoa CHEGOU A VER.
   *
   * É a memória que separa "o tour ainda está indo até o passo" de "o tour
   * mostrou o passo e a pessoa agiu". Sem ela, um tour aberto já na rota de
   * destino daria o passo por cumprido antes de desenhá-lo.
   */
  const passoExibido = useRef<Passo | null>(null);
  useEffect(() => {
    if (resolucao.estado === "achado") passoExibido.current = passo;
  }, [resolucao.estado, passo]);

  /*
   * ═══ CLICAR NO ALVO É CUMPRIR O PASSO, NÃO ABANDONAR O TOUR. ═══
   *
   * Um passo pode destacar um link e mandar clicar nele. Quando isso acontece,
   * a rota muda e o alvo do passo deixa de existir — e a regra geral encerraria
   * o tour por "alvo obrigatório ausente". O tutorial desistiria exatamente de
   * quem obedeceu.
   *
   * Este efeito reconhece a chegada à rota que o passo declarou esperar e
   * AVANÇA. Nada é interceptado: o clique é o do navegador, a navegação é a de
   * verdade, e o tour apenas percebe que ela aconteceu.
   *
   * Roda ANTES do desfecho de "ausente" porque não depende de espera: o
   * `pathname` muda no mesmo instante do clique, enquanto o alvo só é declarado
   * ausente 2,5 segundos depois. Não há corrida entre os dois.
   */
  useEffect(() => {
    if (!cumpriuPorNavegacao(passo, pathname, passoExibido.current)) return;
    avancar();
    // `avancar` é recriado a cada render mas só é chamado, nunca comparado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, passo]);

  /*
   * O QUE FAZER QUANDO O ALVO NÃO APARECE.
   *
   * Opcional  → pula, e o tour segue como se o passo não existisse. É o caso
   *             do botão "Receber" numa loja sem nenhuma conta em aberto.
   * Obrigatório → sai limpo. Não conclui e não dispensa: a novidade continua
   *             disponível numa sessão futura, quando a tela talvez esteja em
   *             outro estado. Prender a pessoa num overlay sem destaque seria
   *             o único desfecho pior do que não mostrar o tutorial.
   */
  useEffect(() => {
    if (resolucao.estado !== "ausente" || !passo) return;
    if (passo.opcional) avancar();
    else onSair();
    // `avancar` e `onSair` são estáveis o bastante para o ciclo deste efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolucao.estado, passo]);

  // ESC sai de qualquer passo, inclusive enquanto o alvo ainda está sendo
  // procurado — é a janela em que a pessoa mais provavelmente desiste.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onSair();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onSair]);

  /*
   * DEVOLVER O FOCO A QUEM O TINHA.
   *
   * O modal ganha isto do Radix; o tour é desenhado à mão e precisava fazer
   * por conta. Sem isto, sair do tutorial jogava o foco no `<body>` e quem
   * navega por teclado recomeçava do topo da página.
   *
   * Efeito de montagem: roda uma vez, e a limpeza é a saída do tour, seja ela
   * por ESC, X, "Pular tutorial", "Sair" ou conclusão.
   */
  const focoAnterior = useRef<Element | null>(null);
  useEffect(() => {
    focoAnterior.current = document.activeElement;
    return () => {
      const anterior = focoAnterior.current;
      // `isConnected` porque o elemento pode ter sido desmontado no meio do
      // tour — o passo 2 troca de rota, e o card do painel deixa de existir.
      if (anterior instanceof HTMLElement && anterior.isConnected) {
        try {
          anterior.focus();
        } catch {
          /* Elemento não focável. Não é motivo para nada quebrar. */
        }
      }
    };
  }, []);

  /*
   * Medido antes da pintura: usar a altura do quadro anterior faria o balão
   * saltar ao trocar de passo, já que o texto muda de tamanho.
   *
   * A dependência é `resolucao.estado`, e não o objeto `resolucao`: ele ganha
   * identidade nova a cada remedição de rolagem, e ler `offsetHeight` força um
   * reflow. A altura do balão não muda quando a página rola — só quando o
   * passo muda ou quando ele passa a existir.
   */
  useLayoutEffect(() => {
    if (balao.current) setAlturaDoBalao(balao.current.offsetHeight);
  }, [indice, resolucao.estado]);

  // Move o foco para o balão a cada passo, para quem navega por teclado ou
  // leitor de tela não continuar preso na tela lá atrás.
  useEffect(() => {
    balao.current?.focus();
  }, [indice, resolucao.estado]);

  if (!passo) return null;

  /*
   * Ainda procurando: escurece a tela, sem recorte e sem balão.
   *
   * Sem nada desenhado, a navegação entre rotas pareceria um clique perdido.
   * Com o balão já visível sobre um alvo que ainda não existe, ele piscaria de
   * posição. O véu sozinho é a leitura honesta de "estou indo até lá".
   */
  if (resolucao.estado !== "achado") {
    return (
      <div className="fixed inset-0 z-[60] bg-black/60">
        {/*
          A SAÍDA DESTE INTERVALO, e ela existe por causa do celular.
          Aqui ainda não há balão — logo, não há "Pular tutorial" —, e a busca
          pode levar até 2,5s enquanto a rota carrega. No desktop o ESC
          resolve; num aparelho de toque não existe ESC, e sem este botão a
          pessoa ficaria encarando um véu sem nada para tocar.

          Chama o MESMO `onSair` dos outros caminhos: nada é persistido.
        */}
        <button
          type="button"
          onClick={onSair}
          className="absolute right-4 top-4 rounded-lg bg-white/15 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
        >
          Sair
        </button>
      </div>
    );
  }

  const { caixa } = resolucao;
  const buraco = {
    top: caixa.top - RESPIRO,
    left: caixa.left - RESPIRO,
    largura: caixa.width + RESPIRO * 2,
    altura: caixa.height + RESPIRO * 2,
  };

  const posicaoDoBalao = posicionar(buraco, passo.posicao ?? "baixo", alturaDoBalao);

  return (
    <>
      {/* ── AS QUATRO FAIXAS ─────────────────────────────────────────────
          Escurecem tudo menos o alvo e bloqueiam o clique fora dele.

          ⚠️ `pointer-events-none` NO CONTÊINER, `auto` EM CADA FAIXA.
          O contêiner é `inset-0` e cobre a viewport INTEIRA — o buraco
          incluído. Com os eventos de ponteiro ligados nele, ele engolia o
          clique no elemento destacado, e o passo que manda "clique aqui" não
          tinha como ser obedecido. Deixar o buraco de fato aberto depende
          destas duas classes. */}
      <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden>
        <Faixa estilo={{ top: 0, left: 0, right: 0, height: Math.max(0, buraco.top) }} />
        <Faixa estilo={{ top: buraco.top + buraco.altura, left: 0, right: 0, bottom: 0 }} />
        <Faixa estilo={{ top: buraco.top, left: 0, width: Math.max(0, buraco.left), height: buraco.altura }} />
        <Faixa estilo={{ top: buraco.top, left: buraco.left + buraco.largura, right: 0, height: buraco.altura }} />
      </div>

      {/* O anel do destaque. `pointer-events-none` para não roubar o clique
          que as faixas acabaram de deixar passar. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[61] rounded-xl ring-2 ring-white/90 ring-offset-2 ring-offset-black/40 transition-[top,left,width,height] duration-150"
        style={{
          top: buraco.top,
          left: buraco.left,
          width: buraco.largura,
          height: buraco.altura,
        }}
      />

      <div
        ref={balao}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-titulo"
        aria-describedby="tour-texto"
        tabIndex={-1}
        className="admin-theme fixed z-[62] rounded-2xl bg-white p-4 text-neutral-900 shadow-2xl outline-none sm:p-5"
        style={posicaoDoBalao}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#E11D2E]">
              Passo {indice + 1} de {passos.length}
            </p>
            <h2 id="tour-titulo" className="mt-1 font-display text-base font-bold tracking-tight">
              {passo.titulo}
            </h2>
          </div>
          <button
            type="button"
            onClick={onSair}
            aria-label="Sair do tutorial"
            className="-m-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="size-4" />
          </button>
        </div>

        <p id="tour-texto" className="mt-2 text-sm leading-relaxed text-neutral-600">
          {passo.texto}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onSair}
            className="mr-auto rounded-lg px-2 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-800"
          >
            Pular tutorial
          </button>
          {indice > 0 && (
            <button
              type="button"
              onClick={() => setIndice((i) => i - 1)}
              className="rounded-xl border-2 border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Voltar
            </button>
          )}
          <button
            type="button"
            onClick={avancar}
            className="rounded-xl bg-[#E11D2E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c4172a]"
          >
            {ultimo ? "Concluir" : "Próximo"}
          </button>
        </div>
      </div>
    </>
  );
}

/** `pointer-events-auto` reata o bloqueio que o contêiner desligou — ver acima. */
function Faixa({ estilo }: { estilo: React.CSSProperties }) {
  return <div className="pointer-events-auto absolute bg-black/60" style={estilo} />;
}

type Buraco = { top: number; left: number; largura: number; altura: number };

/** A ordem de tentativa depois da preferência do passo. */
const ALTERNATIVAS: Posicao[] = ["direita", "esquerda", "baixo", "topo"];

/**
 * Onde o balão cabe — a conta que impede o tutorial de cobrir o que explica.
 *
 * NO CELULAR ele vira uma faixa fixa no rodapé, e não um balão flutuante. Numa
 * tela de 360px, um alvo largo não deixa espaço lateral nenhum, e qualquer
 * posição calculada acaba espremida ou por cima do próprio alvo. O rodapé é
 * sempre alcançável pelo polegar e nunca cobre o destaque, que o
 * `scrollIntoView` já centralizou.
 *
 * NO DESKTOP a regra é uma CADEIA, e não um par de opostos.
 *
 * A versão anterior só sabia virar para o lado contrário: pedindo "esquerda"
 * numa janela em que nem a esquerda nem a direita cabiam, ela escolhia um dos
 * dois assim mesmo e o `prender` final empurrava o balão para dentro da tela —
 * em cima do próprio spotlight. O tutorial tapava o que estava apontando.
 *
 * Agora tenta a preferência do passo e, se não couber, percorre
 * direita → esquerda → baixo → topo, ficando na primeira que couber DE FATO.
 * Só quando nenhuma das quatro cabe é que o grampeamento entra, e aí não há
 * escolha melhor a fazer: a tela é menor que o balão mais o alvo.
 *
 * O grampeamento sobrevive nas duas funções abaixo, mas só no eixo
 * TRANSVERSAL — prender a vertical de um balão que está à direita nunca o faz
 * cobrir o alvo, porque a horizontal já foi confirmada.
 */
function posicionar(buraco: Buraco, preferida: Posicao, alturaDoBalao: number): React.CSSProperties {
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;

  if (vw < LIMITE_CELULAR) {
    return { left: MARGEM, right: MARGEM, bottom: MARGEM };
  }

  // Enquanto a medida real não chega (primeiro quadro do passo), um palpite.
  const altura = alturaDoBalao || 180;

  const ordem: Posicao[] = [preferida, ...ALTERNATIVAS.filter((p) => p !== preferida)];
  const escolhida = ordem.find((p) => cabe(p, buraco, altura, vw, vh));
  const caixa = caixaPara(escolhida ?? preferida, buraco, altura, vw, vh);

  if (escolhida) return { width: LARGURA_BALAO, ...caixa };

  /*
   * ÚLTIMO RECURSO: nenhuma das quatro posições cabe — a janela é menor que o
   * alvo mais o balão. Aqui os DOIS eixos são presos, porque um balão inteiro
   * encostado no destaque ainda é melhor do que metade dele fora da tela.
   */
  return {
    width: LARGURA_BALAO,
    top: prender(caixa.top, MARGEM, vh - altura - MARGEM),
    left: prender(caixa.left, MARGEM, vw - LARGURA_BALAO - MARGEM),
  };
}

/** Há espaço para o balão inteiro deste lado, com as duas margens? */
function cabe(posicao: Posicao, buraco: Buraco, altura: number, vw: number, vh: number): boolean {
  switch (posicao) {
    case "direita":
      return buraco.left + buraco.largura + MARGEM + LARGURA_BALAO + MARGEM <= vw;
    case "esquerda":
      return buraco.left - MARGEM - LARGURA_BALAO - MARGEM >= 0;
    case "baixo":
      return buraco.top + buraco.altura + MARGEM + altura + MARGEM <= vh;
    case "topo":
      return buraco.top - MARGEM - altura - MARGEM >= 0;
  }
}

function caixaPara(
  posicao: Posicao,
  buraco: Buraco,
  altura: number,
  vw: number,
  vh: number,
): { top: number; left: number } {
  // Alinhamentos centrados no alvo: é o que "ao lado de" e "abaixo de" querem
  // dizer visualmente. O eixo transversal é o único que precisa ser preso.
  const centroVertical = buraco.top + buraco.altura / 2 - altura / 2;
  const centroHorizontal = buraco.left + buraco.largura / 2 - LARGURA_BALAO / 2;

  switch (posicao) {
    case "direita":
      return {
        left: buraco.left + buraco.largura + MARGEM,
        top: prender(centroVertical, MARGEM, vh - altura - MARGEM),
      };
    case "esquerda":
      return {
        left: buraco.left - LARGURA_BALAO - MARGEM,
        top: prender(centroVertical, MARGEM, vh - altura - MARGEM),
      };
    case "baixo":
      return {
        top: buraco.top + buraco.altura + MARGEM,
        left: prender(centroHorizontal, MARGEM, vw - LARGURA_BALAO - MARGEM),
      };
    case "topo":
      return {
        top: buraco.top - altura - MARGEM,
        left: prender(centroHorizontal, MARGEM, vw - LARGURA_BALAO - MARGEM),
      };
  }
}

/** O `max` externo cobre a tela menor que o próprio balão: a margem vence. */
function prender(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(valor, Math.max(minimo, maximo)));
}
