import { useEffect, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import type { Passo } from "@/lib/novidades/tipos";

/**
 * ACHAR O ELEMENTO DE UM PASSO — a parte do tour que de fato pode dar errado.
 *
 * Um passo aponta para um `[data-tour]` que pode estar em outra rota, pode
 * ainda não ter chegado (a tela busca por `useQuery`), pode nunca chegar (uma
 * lista vazia não tem linha), e pode ser trocado por outro nó no meio do
 * caminho — o painel recarrega sozinho a cada 8 segundos.
 *
 * O hook resolve os quatro casos e nunca lança. O pior desfecho é `ausente`,
 * que é uma resposta, não uma falha.
 *
 * ── A SEQUÊNCIA ────────────────────────────────────────────────────────────
 *
 *   rota certa?  não → navega → espera o pathname mudar
 *                            ↓
 *   procura o alvo agora ────┴─→ achou? mede e devolve
 *                                não? MutationObserver, teto de 2,5s
 *                                     estourou → `ausente`
 *
 * ── POR QUE NÃO POLLING ────────────────────────────────────────────────────
 *
 * Um `setInterval` de 100ms rodando por dois segundos e meio faz 25 varreduras
 * para um elemento que aparece na primeira ou na vigésima. O MutationObserver
 * pergunta zero vezes e responde no instante em que o nó entra. O `setTimeout`
 * existe só para desistir.
 */

export type Resolucao =
  | { estado: "procurando" }
  /** `caixa` é medida na viewport — é o que o spotlight `fixed` precisa. */
  | { estado: "achado"; caixa: DOMRect }
  | { estado: "ausente" };

/** Teto de espera por passo. Acima disso é mais honesto desistir do que travar. */
const LIMITE_MS = 2_500;

export function useAlvo(passo: Passo | null, ativo: boolean): Resolucao {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [resolucao, setResolucao] = useState<Resolucao>({ estado: "procurando" });

  /*
   * O elemento vive num ref, e não no estado: quem muda com o scroll é a
   * MEDIDA, não o nó. Guardá-lo no estado faria cada remedição recriar os
   * observers que dependem dele.
   */
  const elemento = useRef<Element | null>(null);

  /**
   * O ÚLTIMO PASSO PARA O QUAL JÁ TENTAMOS NAVEGAR.
   *
   * Guarda o passo, e não um booleano, porque assim "Voltar" volta a navegar:
   * ao retroceder, o passo é OUTRO objeto que não este, então a ida automática
   * acontece de novo. Só a repetição do MESMO passo é bloqueada.
   */
  const passoJaNavegado = useRef<Passo | null>(null);

  // ── Fase 1: navegar, esperar, achar ──────────────────────────────────────
  useEffect(() => {
    if (!ativo || !passo) {
      setResolucao({ estado: "procurando" });
      elemento.current = null;
      return;
    }

    setResolucao({ estado: "procurando" });
    elemento.current = null;

    let vivo = true;
    let observador: MutationObserver | null = null;
    let relogio: ReturnType<typeof setTimeout> | null = null;

    /*
     * ═══ A NAVEGAÇÃO AUTOMÁTICA ACONTECE UMA VEZ POR PASSO. ═══
     *
     * Este efeito depende de `pathname` — precisa disso para reprocurar o alvo
     * na tela nova. Mas navegar a cada reexecução transformava o tutorial num
     * carcereiro: o alvo do passo 1 é um `<Link>`, e o texto do passo manda
     * clicar nele. O usuário clicava, a rota mudava, o efeito reexecutava e
     * arrastava a pessoa de volta — o tour desfazendo a instrução que ele
     * mesmo tinha acabado de dar.
     *
     * Separar as duas coisas é a correção: "ir até onde o passo mora" é
     * automático e vale uma vez; qualquer navegação DEPOIS é vontade do
     * usuário e não se desfaz.
     *
     * Sair da rota do passo faz o alvo não ser encontrado, e o desfecho é o
     * de sempre: opcional pula, obrigatório encerra limpo. Nunca um puxão.
     */
    const primeiraVezNestePasso = passoJaNavegado.current !== passo;
    passoJaNavegado.current = passo;

    if (primeiraVezNestePasso && passo.rota && pathname !== passo.rota) {
      /*
       * A rota do passo é uma string livre do catálogo, e o `navigate` do
       * TanStack é tipado com as rotas conhecidas em tempo de compilação. O
       * `as never` é o preço de um catálogo genérico: uma rota errada vira um
       * 404 do roteador — que este hook trata como alvo ausente, e não como
       * exceção.
       */
      try {
        router.navigate({ to: passo.rota as never });
      } catch {
        /* Rota inválida no catálogo. Cai no timeout abaixo, como ausente. */
      }
    }

    function encerrar(r: Resolucao) {
      if (!vivo) return;
      observador?.disconnect();
      if (relogio) clearTimeout(relogio);
      setResolucao(r);
    }

    function procurar(): boolean {
      let alvo: Element | null = null;
      try {
        alvo = document.querySelector(passo!.alvo);
      } catch {
        // Seletor malformado no catálogo. Não é motivo para derrubar a tela.
        encerrar({ estado: "ausente" });
        return true;
      }
      if (!alvo) return false;

      elemento.current = alvo;
      /*
       * Traz o alvo para o meio da tela ANTES de medir. No celular ele
       * costuma estar fora da viewport, e um spotlight desenhado sobre uma
       * caixa invisível é um retângulo escuro no vazio.
       *
       * `smooth` deixaria a medição correr atrás da animação; a remedição da
       * Fase 2 acompanha o resto.
       */
      try {
        alvo.scrollIntoView({ block: "center", inline: "nearest" });
      } catch {
        /* Navegador antigo sem opções: a medição abaixo ainda vale. */
      }
      encerrar({ estado: "achado", caixa: alvo.getBoundingClientRect() });
      return true;
    }

    // A tentativa imediata resolve o caso comum — já estamos na rota certa e o
    // elemento está na tela. Sem ela, todo passo pagaria um quadro de atraso.
    if (procurar()) return () => { vivo = false; };

    observador = new MutationObserver(() => {
      procurar();
    });
    observador.observe(document.body, { childList: true, subtree: true });

    relogio = setTimeout(() => encerrar({ estado: "ausente" }), LIMITE_MS);

    return () => {
      vivo = false;
      observador?.disconnect();
      if (relogio) clearTimeout(relogio);
    };
    // `pathname` entra de propósito: navegar muda o pathname, o efeito roda de
    // novo e a busca acontece já na tela nova.
  }, [passo, ativo, pathname, router]);

  // ── Fase 2: manter a medida honesta ──────────────────────────────────────
  useEffect(() => {
    if (resolucao.estado !== "achado") return;

    let quadro = 0;

    function remedir() {
      // Uma remedição por quadro, no máximo. O painel recarrega a cada 8s e
      // dispara mutações em rajada; sem isto seriam dezenas de medições para
      // desenhar o mesmo retângulo.
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;

        let atual = elemento.current;
        /*
         * O NÓ PODE TER SIDO TROCADO. A barra de vitais do painel é remontada
         * quando os dados voltam, e o elemento que medimos deixa de existir —
         * `getBoundingClientRect` de um nó solto devolve zeros, e o spotlight
         * colapsaria num ponto no canto superior esquerdo.
         *
         * Reconsultar quando o nó saiu do documento é o que faz o destaque
         * sobreviver às recargas automáticas.
         */
        if (!atual || !atual.isConnected) {
          try {
            atual = document.querySelector(passo!.alvo);
          } catch {
            atual = null;
          }
          elemento.current = atual;
        }
        // Sumiu de vez: mantém a última medida em vez de piscar. Se foi só uma
        // troca de nó, o próximo quadro já encontra o substituto.
        if (!atual) return;

        setResolucao({ estado: "achado", caixa: atual.getBoundingClientRect() });
      });
    }

    // `capture: true` alcança a rolagem de qualquer painel interno, não só a
    // da página — o quadro de pedidos e as tabelas rolam por dentro.
    window.addEventListener("scroll", remedir, { capture: true, passive: true });
    window.addEventListener("resize", remedir, { passive: true });

    const observadorDeTamanho = new ResizeObserver(remedir);
    if (elemento.current) observadorDeTamanho.observe(elemento.current);

    const observadorDeDom = new MutationObserver(remedir);
    observadorDeDom.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (quadro) cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", remedir, { capture: true });
      window.removeEventListener("resize", remedir);
      observadorDeTamanho.disconnect();
      observadorDeDom.disconnect();
    };
    // Só o ESTADO importa aqui, não a caixa: incluir `resolucao` inteira
    // recriaria todos os observers a cada remedição — um laço infinito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolucao.estado, passo]);

  return resolucao;
}
