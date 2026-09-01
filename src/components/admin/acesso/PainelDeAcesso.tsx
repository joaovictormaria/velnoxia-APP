import { useEffect, useState, type ReactNode } from "react";
import { TypingText } from "@/components/site/TypingText";

/**
 * Uma foto de cada ramo que o sistema já atende, em rodízio.
 *
 * O Velnox não é um produto de hamburgueria: mostrar só o hambúrguer na porta
 * de entrada dizia justamente isso para quem vende açaí, sushi ou café. A
 * ordem alterna as cores e os ramos de propósito — duas fotos escuras
 * seguidas passam despercebidas como troca.
 *
 * Não sai de `hero-by-type`: aquela lista é a capa de UMA loja, escolhida pelo
 * ramo dela, e cobre só sete ramos. Aqui a escolha é outra — uma foto por
 * ramo, e nenhuma delas com marca de terceiro aparecendo (a `hero-acai`, por
 * exemplo, tem o logo de outra empresa no fundo).
 */
const FOTOS = [
  "/catalogo-inicial/hamburgueria/hero-burger.jpg",
  "/catalogo-inicial/acai/acai-combo-casal.jpg",
  "/catalogo-inicial/pizzaria/hero-pizza.jpg",
  "/catalogo-inicial/cafeteria/chocolate-quente.jpg",
  "/catalogo-inicial/churrascaria/hero-churrasco.jpg",
  "/catalogo-inicial/japones/hero-sushi.jpg",
  "/catalogo-inicial/sorvetes/milkshakes.jpg",
  "/catalogo-inicial/hot-dog/hero-dog-3.jpg",
  "/catalogo-inicial/bar/gin-tonica.jpg",
  "/catalogo-inicial/saudavel/salada-bowl.jpg",
  "/catalogo-inicial/restaurante/prato-feito.jpg",
];

/** O mesmo compasso do hero da vitrine. */
const INTERVALO = 5000;

/** Fisher-Yates, sobre uma cópia — a lista que chega por prop não é minha. */
function embaralhar(itens: string[]) {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * O logo de verdade, extraído do PDF da marca — vetor, não uma foto do logo.
 *
 * A palavra vem com a cor clara embutida em vez de `currentColor`: carregado
 * por <img>, o SVG não enxerga a cor do texto ao redor, e `currentColor`
 * resolveria para preto no meio do painel escuro. Estas telas são todas
 * escuras, então a cor fixa não custa nada.
 */
const LOGO = "/marca/velnox-horizontal.svg";

/**
 * Um campo dos formulários de acesso.
 *
 * A borda acende em vermelho no foco, e esse é o único vermelho da coluna além
 * do botão — espalhar a cor da marca pelos campos tiraria o destaque de onde
 * ele importa, que é a ação.
 */
const CAMPO_BASE =
  "rounded-xl border-white/10 bg-white/4 text-white shadow-none " +
  "placeholder:text-neutral-500 focus-visible:border-[#E11D2E] " +
  "focus-visible:ring-2 focus-visible:ring-[#E11D2E]/40";

export const CAMPO_DE_ACESSO = `h-11 ${CAMPO_BASE}`;

/**
 * A mesma coisa, um pouco mais baixa.
 *
 * Só para o cadastro: com sete campos empilhados, os 4px a mais de cada um
 * somam altura suficiente para o formulário passar da moldura do painel.
 */
export const CAMPO_DE_ACESSO_COMPACTO = `h-10 ${CAMPO_BASE}`;

/** O botão principal das telas de acesso. */
export const BOTAO_DE_ACESSO =
  "h-11 w-full rounded-xl bg-[#E11D2E] text-sm font-semibold text-white " +
  "shadow-none transition-colors hover:bg-[#c4172a]";

type Props = {
  /**
   * As frases grandes sobre a foto, digitadas letra a letra e em rodízio.
   *
   * Texto puro, e não JSX: a digitação fatia a string caractere a caractere, e
   * uma quebra manual de linha não sobreviveria ao corte. A largura da coluna
   * já quebra a frase sozinha.
   */
  frases: string[];
  /** A linha de apoio, abaixo da frase. */
  apoio: string;
  /**
   * A largura da coluna da foto contra a do formulário. O padrão é 65/35; um
   * formulário longo (cadastro) pede mais espaço para respirar.
   */
  proporcao?: string;
  /** A largura máxima do conteúdo dentro da coluna da direita. */
  larguraDoConteudo?: string;
  /** A altura do painel no desktop. Um formulário longo pede um pouco mais. */
  altura?: string;
  children: ReactNode;
};

/**
 * O painel das telas de acesso: foto e marca à esquerda, formulário à direita.
 *
 * A tela inteira é o produto — não um cartão branco solto no meio do vazio. No
 * celular vira uma coluna só: duas colunas espremidas deixariam o formulário
 * estreito demais para digitar, e é o formulário que a pessoa veio usar.
 */
export function PainelDeAcesso({
  frases,
  apoio,
  proporcao = "lg:grid-cols-[1.85fr_1fr]",
  larguraDoConteudo = "max-w-sm",
  altura = "lg:h-[min(88vh,880px)]",
  children,
}: Props) {
  const [foto, setFoto] = useState(0);
  const [jaTrocou, setJaTrocou] = useState(false);
  /**
   * Quantas fotos existem no DOM.
   *
   * A animação precisa da que sai e da que entra montadas ao mesmo tempo, mas
   * montar as onze de uma vez faria a tela de login baixar ~1,5 MB antes de
   * alguém digitar o e-mail. Cresce uma por troca: no primeiro quadro só duas
   * são pedidas, e o resto chega espaçado, se a pessoa ficar tempo suficiente.
   */
  const [montadas, setMontadas] = useState(2);
  /**
   * Começa `false` nos dois lados para a hidratação bater: o servidor não tem
   * como saber a preferência de quem vai abrir a página.
   */
  const [semMovimento, setSemMovimento] = useState(false);
  /**
   * A ordem das frases só é sorteada depois de montar.
   *
   * Embaralhar durante a renderização daria uma ordem no servidor e outra no
   * navegador, e a hidratação reclamaria da diferença. Roda uma vez, sobre o
   * valor inicial — por isso não depende de `frases`, cuja identidade muda a
   * cada render por ser um literal na chamada.
   */
  const [frasesEmOrdem, setFrasesEmOrdem] = useState(frases);
  useEffect(() => {
    setFrasesEmOrdem((atuais) => embaralhar(atuais));
  }, []);

  useEffect(() => {
    // Quem pediu menos movimento fica com a primeira foto e a frase inteira
    // parada: rodízio e digitação são enfeite, e nada aqui depende deles.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSemMovimento(true);
      return;
    }
    const id = setInterval(() => {
      setFoto((i) => (i + 1) % FOTOS.length);
      setJaTrocou(true);
      setMontadas((n) => Math.min(n + 1, FOTOS.length));
    }, INTERVALO);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#070707] p-3 sm:p-6 lg:p-8">
      <div
        className={`animate-entrada-suave grid w-full max-w-[1360px] overflow-hidden rounded-3xl border border-white/10 bg-[#0F1010] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] ${altura} ${proporcao}`}
      >
        {/* Área da marca. No celular ela encolhe para uma faixa: continua dando
            contexto sem empurrar o formulário para fora da primeira dobra. */}
        <aside className="relative h-36 sm:h-52 lg:h-auto">
          {/* As fotos entram pela direita e saem pela esquerda, com as mesmas
              animações do hero da vitrine. Elas vêm antes das camadas escuras
              na ordem do DOM porque, entre irmãos absolutos, quem vem depois
              pinta por cima — o véu tem de ficar sobre a foto. */}
          {FOTOS.slice(0, montadas).map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              aria-hidden="true"
              fetchPriority={i === 0 ? "high" : undefined}
              className={`absolute inset-0 size-full object-cover object-[50%_45%] ${
                !jaTrocou
                  ? i === foto
                    ? "opacity-100"
                    : "-translate-x-20 opacity-0"
                  : i === foto
                    ? "animate-[slide-in-from-right_0.9s_ease-out_forwards]"
                    : "animate-[slide-out-to-left_0.9s_ease-in_forwards]"
              }`}
            />
          ))}
          {/* Duas camadas: a escura garante o contraste do texto, a vermelha é
              só um respiro da marca no canto. */}
          <div className="absolute inset-0 bg-gradient-to-br from-black/75 via-black/55 to-black/80" />
          <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_18%_12%,rgba(225,29,46,0.20),transparent_70%)]" />

          {/* Ancorado embaixo: o logo saiu daqui e ficou só na coluna do
              formulário, então o topo da foto não tem mais nada a segurar —
              deixar a frase subir para lá abriria um buraco no meio. */}
          <div className="relative flex h-full flex-col justify-end p-5 sm:p-8 lg:p-12">
            <div className="hidden max-w-md lg:block">
              {/* A altura mínima é de duas linhas: sem ela o bloco cresce e
                  encolhe a cada ciclo da digitação, e a frase de apoio abaixo
                  fica subindo e descendo junto. */}
              <h2 className="min-h-[2.3em] font-display text-4xl font-bold leading-[1.15] tracking-tight text-white">
                {semMovimento ? (
                  frasesEmOrdem[0]
                ) : (
                  <TypingText texts={frasesEmOrdem} caretClassName="text-[#E11D2E]" />
                )}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-white/60">{apoio}</p>
            </div>

            <p className="mt-10 hidden text-xs text-white/40 lg:block">
              © {new Date().getFullYear()} Velnox.app
            </p>
          </div>
        </aside>

        {/* O `overflow-y-auto` existe para a tela baixa: com a altura do painel
            travada, num notebook curto o botão ficaria fora do recorte.
            A centralização é por `m-auto`, e não por `justify-center`: quando o
            conteúdo passa da altura, o justify-center empurra o topo para fora
            da caixa de rolagem e ele fica inalcançável — o título some e não
            volta nem rolando. Margem automática cede em vez de cortar. */}
        <section className="flex flex-col overflow-y-auto px-6 py-10 sm:px-10 sm:py-12 lg:px-12">
          {/* Product name, not a store name: one login serves every lanchonete.
              Agora é o único logo da tela, então volta a ser anunciado.

              Fica fora do bloco centralizado, encostado no topo da coluna:
              dentro dele, só subia metade de cada folga que eu acrescentasse.
              O `mb` garante o piso do respiro quando a coluna fica sem sobra. */}
          <img
            src={LOGO}
            alt="Velnox.app"
            width={559}
            height={136}
            // O `mt` do desktop é o meio-termo entre encostar no topo e voltar
            // para dentro do bloco centralizado. No celular a coluna não tem
            // altura fixa, e a mesma folga viraria um vão morto acima do logo.
            className="mx-auto mb-10 mt-4 h-14 w-auto shrink-0 lg:mt-14"
          />

          <div className={`m-auto w-full ${larguraDoConteudo}`}>
            {children}

            <p className="mt-8 text-center text-[11px] text-neutral-600 lg:hidden">
              © {new Date().getFullYear()} Velnox.app
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
