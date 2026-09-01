import { useState } from "react";
import { ArrowRight, Check, ChevronDown, Loader2, Minus, Sparkles } from "lucide-react";
import {
  DESCRICAO_DO_RECURSO,
  ESSENCIAIS,
  EXCLUSIVOS_DO_PREMIUM,
  RECURSOS_DO_PLANO,
  ROTULO_DO_PLANO,
  ROTULO_DO_RECURSO,
} from "@/lib/planos/catalogo";
import { SUBSTANTIVO_DO_LIMITE, TETOS_DO_PLANO, TODOS_OS_LIMITES } from "@/lib/planos/limites";
import { precoEscrito } from "@/lib/plano";
import type { EstadoComercial } from "@/lib/planos/resolucao";
import type { Plano, Recurso } from "@/lib/planos/tipos";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A ESCOLHA DO PLANO — a única tela onde a matriz vira argumento de venda
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── NENHUMA LISTA ESCRITA À MÃO ───────────────────────────────────────────
 *
 * O que cada plano inclui sai de `ESSENCIAIS`, `EXCLUSIVOS_DO_PREMIUM` e
 * `RECURSOS_DO_PLANO`, os nomes de `ROTULO_DO_RECURSO`, as frases de
 * `DESCRICAO_DO_RECURSO` e os tetos de `TETOS_DO_PLANO` — as mesmas fontes que
 * as guardas do servidor usam.
 *
 * Isso não é elegância: é a diferença entre uma página de preços que mente e
 * uma que não pode mentir. Quando ESTOQUE desceu para o BASIC, esta tela
 * passou a anunciá-lo sozinha. Uma lista digitada aqui teria continuado
 * vendendo como Premium algo que o Básico já tem.
 *
 * ─── UM AVISO SÓ SOBRE O TESTE ─────────────────────────────────────────────
 *
 * O teste é comunicado UMA vez, no cabeçalho, com a data que a página passa já
 * formatada. A faixa de situação da página se cala durante o teste justamente
 * para não haver três tarjas dizendo o mesmo em três cores.
 *
 * A data chega pronta (`fimDoTeste`) de propósito: esta tela LÊ o teste, não o
 * calcula. Um segundo calendário aqui divergiria de `conferirAcesso`, que é
 * quem decide se a conta está liberada.
 */

/*
 * ASSINATURA não entra na lista de vantagens. É esta página: anunciá-la como
 * benefício do plano seria vender a porta como se fosse a casa.
 */
export const VANTAGENS_DO_BASICO: readonly Recurso[] = ESSENCIAIS.filter((r) => r !== "ASSINATURA");

/** A ordem da comparação: primeiro o que todo mundo tem, depois o que é pago. */
const RECURSOS_COMPARADOS: readonly Recurso[] = [
  ...VANTAGENS_DO_BASICO,
  ...EXCLUSIVOS_DO_PREMIUM,
];

/**
 * "Até 50 produtos e 10 categorias" — ou "Produtos e categorias ilimitados".
 *
 * As duas começam com maiúscula porque ficam lado a lado, uma em cada card:
 * uma frase capitalizada ao lado de outra em caixa baixa lê como descuido.
 */
export function limitesEscritos(plano: Plano): string {
  const tetos = TODOS_OS_LIMITES.map((limite) => ({
    teto: TETOS_DO_PLANO[plano][limite],
    nome: SUBSTANTIVO_DO_LIMITE[limite],
  }));

  const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  if (tetos.every((t) => t.teto === null)) {
    return maiuscula(`${tetos.map((t) => t.nome).join(" e ")} ilimitados`);
  }

  const partes = tetos.map((t) =>
    typeof t.teto === "number" ? `${t.teto} ${t.nome}` : `${t.nome} ilimitados`,
  );
  return `Até ${partes.join(" e ")}`;
}

/** Uma frase por plano — o que ele resolve, sem promessa que o produto não cumpre. */
const PROMESSA: Readonly<Record<Plano, string>> = {
  BASIC: "Para vender e operar no dia a dia.",
  PREMIUM: "Para controlar custos, produção e crescimento.",
};

type Props = {
  /** O estado comercial da loja, vindo da sessão. */
  plano: EstadoComercial;
  /** Quais planos têm Price configurado — um sem Price não convida. */
  vendaveis: Readonly<Record<Plano, boolean>>;
  /** A loja já tem assinatura: aqui não se contrata, se gerencia. */
  temAssinatura: boolean;
  /** A data do fim do teste, já escrita. `null` quando não há teste correndo. */
  fimDoTeste: string | null;
  /** Abre o checkout do plano escolhido. */
  aoContratar: (plano: Plano) => void;
  /** O plano cujo checkout está sendo aberto agora, se algum. */
  contratando: Plano | null;
};

export function EscolhaDePlano({
  plano,
  vendaveis,
  temAssinatura,
  fimDoTeste,
  aoContratar,
  contratando,
}: Props) {
  const [selecionado, setSelecionado] = useState<Plano>(plano.armazenado ?? "PREMIUM");
  const [comparando, setComparando] = useState(false);

  const ocupado = contratando !== null;

  return (
    <section className="mt-6">
      {/* ───────── CABEÇALHO: o teste e a proposta, em um bloco só ───────── */}
      <header className="text-center">
        {plano.emTrial ? (
          <div className="mx-auto inline-flex max-w-xl items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-left">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <p className="text-sm text-emerald-900">
              <span className="font-semibold">Você está no período de teste</span>
              {fimDoTeste && <span className="text-emerald-800"> · até {fimDoTeste}</span>}
              <br />
              <span className="text-emerald-800">
                Todos os recursos Premium estão liberados.
              </span>
            </p>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <Sparkles className="size-3.5" aria-hidden="true" />
            14 dias grátis
          </span>
        )}

        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-neutral-900">
          Escolha o plano ideal para o seu negócio
        </h2>
        <p className="mx-auto mt-1.5 max-w-lg text-sm text-neutral-500">
          Comece grátis por 14 dias com acesso completo ao Premium.
        </p>
      </header>

      {/*
        DUAS COLUNAS A PARTIR DE 1024px: os planos à esquerda, a comparação à
        direita.

        A comparação embaixo empurrava os cards para cima da dobra sempre que
        alguém a abria, e deixava metade da largura do painel vazia num monitor
        de 1440. Ao lado, ela vira consulta — a pessoa confere um recurso sem
        perder os preços de vista.

        A COLUNA DOS PLANOS TEM TETO; A DA COMPARAÇÃO ABSORVE O RESTO.

        `minmax(0,36rem)` nos planos e `minmax(0,1fr)` na comparação: os cards
        param de crescer em 576px — cerca de 280px cada, largura em que o
        preço e o nome mais longo da lista ("Entregadores e rastreamento")
        ainda cabem numa linha — e toda a largura extra do monitor vai para a
        comparação, que é quem tem conteúdo para ocupá-la.

        O `minmax(0,…)` nos dois lados, e não `42rem` e `1fr` secos: sem o zero
        como mínimo, uma linha longa dentro de um card impede a coluna de
        encolher e a grade estoura para fora da tela.

        Abaixo de 1024 vira uma coluna só e a comparação volta para baixo dos
        cards, que é onde ela cabe.
      */}
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
        <div className="min-w-0">
        {/* ─────────────────────────── OS DOIS CARDS ──────────────────────── */}
        <div
          role="radiogroup"
          aria-label="Planos disponíveis"
          className="grid items-stretch gap-4 md:grid-cols-2"
        >
          {(["BASIC", "PREMIUM"] as const).map((atual) => (
            <CardDoPlano
              key={atual}
              qual={atual}
              selecionado={selecionado === atual}
              aoSelecionar={() => setSelecionado(atual)}
              ehPlanoAtual={plano.armazenado === atual}
              vendavel={vendaveis[atual]}
              temAssinatura={temAssinatura}
              aoContratar={() => aoContratar(atual)}
              contratando={contratando === atual}
              ocupado={ocupado}
            />
          ))}
        </div>

        {/*
          A LOJA SEM PLANO É UM FATO DA CONTA, NÃO DE UM DOS CARDS.

          Esta linha morava dentro do card do Básico, logo abaixo do botão — e
          ali dizia a coisa errada por posição: parecia falar sobre o Básico, e
          um texto cinza embaixo de um CTA lê como mensagem de erro.

          Some durante o teste. A loja em teste também tem `plan = null`, e o
          cabeçalho acima já explicou a situação dela com todas as letras —
          repetir "Plano não definido" dois blocos abaixo é o mesmo excesso de
          avisos que este ajuste veio tirar.

          Continua sem classificar ninguém: dizer "seu plano é Básico" para quem
          tem `plan = null` seria inventar uma decisão que ninguém tomou.
        */}
        {plano.armazenado === null && !plano.emTrial && !temAssinatura && (
          <p className="mt-3 text-center text-xs text-neutral-400">
            Plano não definido — escolha um acima para começar.
          </p>
        )}

        </div>

        {/* ────────────── COMPARAÇÃO — a coluna da direita ───────────────── */}
        {/*
          O cabeçalho do painel É o botão. Fechado ele explica o que há dentro
          em vez de deixar a coluna vazia; aberto, a lista rola dentro do
          próprio painel — vinte recursos numa coluna de 352px cresceriam mais
          que os cards e desalinhariam o conjunto inteiro.

          `lg:sticky`: rolando a comparação, os preços continuam à vista.
        */}
        <aside className="overflow-hidden rounded-2xl border border-neutral-200 bg-white lg:sticky lg:top-4">
          <button
            type="button"
            onClick={() => setComparando((v) => !v)}
            aria-expanded={comparando}
            aria-controls="comparacao-de-planos"
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-400 motion-reduce:transition-none"
          >
            <span>
              <span className="block text-sm font-bold text-neutral-900">
                Compare todos os recursos
              </span>
              <span className="block text-xs text-neutral-500">
                {comparando
                  ? "Recurso a recurso, nos dois planos."
                  : "Veja recurso a recurso o que muda entre os planos."}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-neutral-500 transition-transform motion-reduce:transition-none",
                comparando && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>

          {comparando && (
            <div className="border-t border-neutral-200 lg:max-h-[60vh] lg:overflow-y-auto">
              <Comparacao id="comparacao-de-planos" />
            </div>
          )}
        </aside>
      </div>

      {/* ───────────── CELULAR: o CTA sempre ao alcance do polegar ────────── */}
      {!temAssinatura && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-neutral-500">
                {ROTULO_DO_PLANO[selecionado]} selecionado
              </p>
              <p className="font-display text-lg font-bold tabular-nums text-neutral-900">
                {precoEscrito(selecionado)}
                <span className="text-xs font-medium text-neutral-500"> /mês</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => aoContratar(selecionado)}
              disabled={ocupado || !vendaveis[selecionado]}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c4172a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D2E] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
            >
              {contratando === selecionado ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="size-4" aria-hidden="true" />
              )}
              Continuar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  UM CARD
 * ═══════════════════════════════════════════════════════════════════════════ */

function CardDoPlano({
  qual,
  selecionado,
  aoSelecionar,
  ehPlanoAtual,
  vendavel,
  temAssinatura,
  aoContratar,
  contratando,
  ocupado,
}: {
  /*
    O plano DESTE card — "qual" e não "plano" de propósito: no resto do
    projeto `plano` é o estado comercial da loja, e comparar
    `plano === "PREMIUM"` significaria decidir permissão na mão — coisa que
    nenhuma tela pode fazer. Aqui a comparação é só "sou o card escuro?", e o
    nome diferente mantém a varredura que procura aquele erro funcionando em
    todo o repositório.
  */
  qual: Plano;
  selecionado: boolean;
  aoSelecionar: () => void;
  ehPlanoAtual: boolean;
  vendavel: boolean;
  temAssinatura: boolean;
  aoContratar: () => void;
  contratando: boolean;
  ocupado: boolean;
}) {
  const premium = qual === "PREMIUM";
  const vantagens = premium ? EXCLUSIVOS_DO_PREMIUM : VANTAGENS_DO_BASICO;

  return (
    <article
      className={cn(
        /*
          `h-full` + coluna + `mt-auto` no CTA: os dois cards terminam na mesma
          linha mesmo com listas de tamanhos diferentes. Era o desequilíbrio
          que empurrava o botão do Premium para fora da primeira tela.
        */
        "relative flex h-full flex-col rounded-2xl border transition-shadow duration-200 motion-reduce:transition-none",
        premium
          ? "border-neutral-800 bg-neutral-900 text-white"
          : "border-neutral-200 bg-white text-neutral-900",
        selecionado
          ? premium
            ? "shadow-lg ring-2 ring-[#E11D2E] ring-offset-2 ring-offset-[#FAF9F7]"
            : "shadow-md ring-2 ring-neutral-900 ring-offset-2 ring-offset-[#FAF9F7]"
          : "shadow-sm hover:shadow-md",
      )}
    >
      {/*
        O CARD INTEIRO É O CONTROLE DE SELEÇÃO, e é um `radio` de verdade: o
        leitor de tela anuncia "Premium, opção 2 de 2, marcada", e as setas do
        teclado funcionam como em qualquer grupo de opções. O botão de
        contratar fica FORA dele — botão dentro de botão é HTML inválido e
        quebra o clique em parte dos navegadores.
      */}
      <button
        type="button"
        role="radio"
        aria-checked={selecionado}
        onClick={aoSelecionar}
        className={cn(
          "rounded-t-2xl px-5 pb-4 pt-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4",
          premium ? "focus-visible:outline-white" : "focus-visible:outline-neutral-900",
        )}
      >
        {/* Nome e selos na mesma linha: economiza uma faixa inteira de altura. */}
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-base font-bold">{ROTULO_DO_PLANO[qual]}</h3>

          {ehPlanoAtual && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                premium ? "bg-white/15 text-white" : "bg-neutral-900 text-white",
              )}
            >
              Seu plano atual
            </span>
          )}

          {premium && !ehPlanoAtual && (
            <span className="rounded-full bg-[#E11D2E] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
              Mais completo
            </span>
          )}
        </div>

        {/* O PREÇO — a linha que a pessoa procura primeiro, e a maior da tela. */}
        <p className="mt-3 flex items-baseline gap-1">
          <span className="font-display text-4xl font-bold leading-none tabular-nums tracking-tight">
            {precoEscrito(qual)}
          </span>
          <span className={cn("text-sm", premium ? "text-neutral-400" : "text-neutral-500")}>
            /mês
          </span>
        </p>

        <p className={cn("mt-2 text-sm", premium ? "text-neutral-300" : "text-neutral-600")}>
          {PROMESSA[qual]}
        </p>

        <p
          className={cn(
            "mt-1 text-xs font-medium",
            premium ? "text-neutral-400" : "text-neutral-500",
          )}
        >
          {limitesEscritos(qual)}
        </p>
      </button>

      {/* ─────────────────────────── VANTAGENS ─────────────────────────── */}
      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className={cn("border-t pt-4", premium ? "border-white/10" : "border-neutral-100")}>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {premium
              ? `Tudo do Básico, e mais ${EXCLUSIVOS_DO_PREMIUM.length}`
              : "O que está incluído"}
          </p>

          {/*
            UMA COLUNA, agora que o card tem 280px.

            A lista já foi grade de duas colunas (que abria degraus, porque as
            células de uma linha compartilham altura) e depois `columns` de
            texto, que resolveu os degraus. As duas pressupunham um card largo:
            em 280px cada coluna sobraria com ~112px e "Entregadores e
            rastreamento" quebraria em três linhas — mais alto do que a lista
            inteira em coluna única.

            O preço de voltar a uma coluna é o Premium ficar mais alto que o
            Básico. Quem segura isso é o `h-full` do card com o `mt-auto` do
            CTA: os dois terminam na mesma linha, e a folga fica no card mais
            curto em vez de o mais longo transbordar.
          */}
          <ul className="space-y-1.5">
            {vantagens.map((recurso) => (
              <li key={recurso} className="flex items-start gap-2 text-sm leading-snug">
                <Check
                  className={cn(
                    "mt-[3px] size-3.5 shrink-0",
                    premium ? "text-[#E11D2E]" : "text-emerald-600",
                  )}
                  aria-hidden="true"
                />
                <span className={premium ? "text-neutral-200" : "text-neutral-700"}>
                  {ROTULO_DO_RECURSO[recurso]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* ────────────────────────────── CTA ────────────────────────────── */}
        <div className="mt-auto pt-5">
          {ehPlanoAtual && !temAssinatura ? (
            /*
              Nada de "Começar com o Básico" para quem já está no Básico: um
              botão que oferece o que a pessoa já tem faz o produto parecer que
              não sabe quem ela é.
            */
            <p
              className={cn(
                "rounded-xl px-4 py-3 text-center text-sm font-medium",
                premium ? "bg-white/5 text-neutral-300" : "bg-neutral-50 text-neutral-600",
              )}
            >
              Plano atual
            </p>
          ) : temAssinatura ? (
            <p
              className={cn(
                "rounded-xl px-4 py-3 text-center text-xs",
                premium ? "bg-white/5 text-neutral-400" : "bg-neutral-50 text-neutral-500",
              )}
            >
              {ehPlanoAtual
                ? "Este é o seu plano."
                : "Para trocar de plano, use “Gerenciar assinatura”."}
            </p>
          ) : !vendavel ? (
            <p
              className={cn(
                "rounded-xl px-4 py-3 text-center text-xs",
                premium ? "bg-white/5 text-neutral-400" : "bg-neutral-50 text-neutral-500",
              )}
            >
              Este plano ainda não está disponível para contratação.
            </p>
          ) : (
            <button
              type="button"
              onClick={aoContratar}
              /*
                DESABILITADO ENQUANTO QUALQUER checkout abre, e não só o deste
                card: dois cliques em cards diferentes abririam duas sessões de
                pagamento, e a pessoa poderia concluir as duas.
              */
              disabled={ocupado}
              aria-busy={contratando}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60",
                premium
                  ? "bg-[#E11D2E] text-white hover:bg-[#c4172a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  : "bg-neutral-900 text-white hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900",
              )}
            >
              {/*
                O RÓTULO NÃO MUDA durante o carregamento: só o ícone vira
                spinner. Trocar o texto mudaria a largura do botão e faria o
                card inteiro pular no instante do clique. Quem não enxerga
                recebe o aviso pela região viva abaixo, que é o lugar dele.
              */}
              {contratando ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="size-4" aria-hidden="true" />
              )}
              Começar com o {ROTULO_DO_PLANO[qual]}
              <span className="sr-only" role="status">
                {contratando ? "Abrindo o pagamento…" : ""}
              </span>
            </button>
          )}

        </div>
      </div>
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  A COMPARAÇÃO COMPLETA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tabela de três colunas a partir de 640px, lista abaixo disso. Não é conteúdo
 * duplicado: as duas percorrem `RECURSOS_COMPARADOS` e perguntam a
 * `RECURSOS_DO_PLANO`. O que muda é a forma — três colunas em 360px viram
 * texto quebrado em duas letras por linha.
 */
function Comparacao({ id }: { id: string }) {
  const tem = (plano: Plano, recurso: Recurso) => RECURSOS_DO_PLANO[plano].has(recurso);

  return (
    <div id={id}>
      {/* ──────── A PARTIR DE 640px: a tabela de três colunas ───────────── */}
      {/*
        A tabela voltou a valer também na coluna da direita.

        Ela tinha sido trocada por uma lista ali porque o painel media 352px.
        Depois o teto de largura passou para a coluna dos PLANOS, e a
        comparação virou quem absorve a sobra do monitor — 430px em 1366,
        quase 700px em 1440. Nessa largura a tabela é a forma certa: uma
        linha por recurso, duas colunas de marca, e a pessoa lê na vertical.

        A lista que estava aqui repetia "Básico" e "Premium" em cada uma das
        vinte linhas — vinte vezes a mesma palavra para dizer o que dois
        cabeçalhos dizem uma vez.
      */}
      <table className="hidden w-full border-collapse text-sm sm:table">
        <thead>
          {/*
            O cabeçalho gruda no topo enquanto a lista rola dentro do painel:
            sem isso, na décima linha ninguém sabe mais qual coluna é qual.
          */}
          <tr className="sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
            <th scope="col" className="px-4 py-2.5 text-left">
              Recurso
            </th>
            <th scope="col" className="w-20 px-2 py-2.5 text-center">
              {ROTULO_DO_PLANO.BASIC}
            </th>
            <th scope="col" className="w-20 px-2 py-2.5 text-center">
              {ROTULO_DO_PLANO.PREMIUM}
            </th>
          </tr>
        </thead>
        <tbody>
          {RECURSOS_COMPARADOS.map((recurso) => (
            <tr
              key={recurso}
              className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/70"
            >
              <th scope="row" className="px-4 py-2 text-left font-normal">
                <span className="block font-medium text-neutral-900">
                  {ROTULO_DO_RECURSO[recurso]}
                </span>
                {/*
                  A frase do catálogo — o que o módulo FAZ, não o nome de novo.
                  Só a partir de 1024, onde o painel é largo: entre 640 e 1023
                  ela dobraria a altura de cada linha e a tabela viraria uma
                  parede de texto.
                */}
                <span className="mt-0.5 hidden text-xs leading-snug text-neutral-500 lg:block">
                  {DESCRICAO_DO_RECURSO[recurso]}
                </span>
              </th>
              <td className="px-2 py-2 text-center">
                <Marca presente={tem("BASIC", recurso)} plano={ROTULO_DO_PLANO.BASIC} />
              </td>
              <td className="px-2 py-2 text-center">
                <Marca presente={tem("PREMIUM", recurso)} plano={ROTULO_DO_PLANO.PREMIUM} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ─────────────── ABAIXO DE 640px: agrupado, sem repetição ────────── */}
      {/*
        No celular não cabe tabela, e a lista antiga repetia os dois nomes de
        plano em cada linha. Aqui o plano é dito UMA vez, no cabeçalho do
        grupo, e cada recurso aparece uma vez só — que é como a pessoa
        realmente lê: "o que já tenho" e "o que ganho pagando mais".
      */}
      <div className="sm:hidden">
        <GrupoDeRecursos
          titulo="Nos dois planos"
          recursos={VANTAGENS_DO_BASICO}
          premium={false}
        />
        <GrupoDeRecursos
          titulo={`Só no ${ROTULO_DO_PLANO.PREMIUM}`}
          recursos={EXCLUSIVOS_DO_PREMIUM}
          premium
        />
      </div>
    </div>
  );
}

/** Um grupo da comparação no celular: o plano dito uma vez, no topo. */
function GrupoDeRecursos({
  titulo,
  recursos,
  premium,
}: {
  titulo: string;
  recursos: readonly Recurso[];
  premium: boolean;
}) {
  return (
    <section>
      <h4 className="border-y border-neutral-100 bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {titulo}
      </h4>
      <ul className="divide-y divide-neutral-100">
        {recursos.map((recurso) => (
          <li key={recurso} className="flex items-start gap-2.5 px-4 py-2.5">
            <Check
              className={cn(
                "mt-0.5 size-4 shrink-0",
                premium ? "text-[#E11D2E]" : "text-emerald-600",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900">
                {ROTULO_DO_RECURSO[recurso]}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-neutral-500">
                {DESCRICAO_DO_RECURSO[recurso]}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** ✓ ou —, com o texto que o leitor de tela lê no lugar do símbolo. */
function Marca({ presente, plano }: { presente: boolean; plano: string }) {
  return presente ? (
    <Check
      className="inline size-4 text-emerald-600"
      role="img"
      aria-label={`Incluído no ${plano}`}
    />
  ) : (
    <Minus
      className="inline size-4 text-neutral-300"
      role="img"
      aria-label={`Não incluído no ${plano}`}
    />
  );
}
