import { useEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";

/**
 * O aviso de que o cardápio de demonstração saiu e o sistema ficou do dono.
 *
 * EXPERIÊNCIA DE UMA LOJA SÓ, POR ENQUANTO. A regra é um id literal, e é
 * deliberadamente burra: não olha nome, e-mail, data de criação nem tempo de
 * teste. Uma segunda loja que complete três dias NÃO recebe isto — quando essa
 * decisão for tomada, ela troca a constante abaixo por uma regra de verdade, e
 * o resto do componente continua valendo.
 *
 * O texto é o do João, palavra por palavra. Só a quebra em três blocos é minha:
 * a frase corrida tinha quatro exclamações seguidas e ninguém lia até o fim.
 */
const LOJA_DA_EXPERIENCIA = "cmtcgxboe00001yqk3hxq75a3";

/**
 * Onde fica o "já li".
 *
 * `sessionStorage`, e não banco: a experiência é temporária e de uma loja só, e
 * uma coluna nova — ou uma linha na Central de Novidades, que persiste por
 * usuário — seria migration e schema para um aviso que vai sair. Some quando a
 * aba fecha, que é exatamente o "durante a mesma navegação" pedido.
 *
 * A chave leva o storeId para o caso de duas lojas usarem o mesmo navegador.
 */
const chave = (storeId: string) => `velnox:aviso-limpeza-inicial:${storeId}`;

/** Leitura tolerante: aba anônima e site data bloqueado lançam em vez de devolver null. */
function jaDispensou(storeId: string): boolean {
  try {
    return sessionStorage.getItem(chave(storeId)) === "1";
  } catch {
    return false;
  }
}

export function AvisoDeLimpezaInicial() {
  /*
   * O MESMO CAMINHO QUE O RESTO DO PAINEL USA. `beforeLoad` da rota `/admin`
   * resolve a sessão uma vez e a publica no contexto; `avaliacoes`,
   * `categorias`, `extras` e `configuracoes` já leem daqui. Nada de sessão
   * paralela, nada de uma segunda consulta ao servidor só para um banner.
   */
  const { admin } = useRouteContext({ from: "/admin" });
  const storeId = admin?.storeId ?? null;

  /*
   * FECHADO NO PRIMEIRO RENDER, E ABERTO SÓ DEPOIS DE HIDRATAR.
   *
   * A versão anterior lia o `sessionStorage` já no inicializador do `useState`,
   * e isso quebrava a hidratação: no servidor aquele objeto não existe, o
   * `catch` devolvia "não dispensou", o SSR pintava o aviso — e o navegador de
   * quem já tinha clicado em "Entendi" pintava nada. O React acusou a
   * divergência em voz alta no console.
   *
   * É a mesma convenção que `useBaseUrlPublica` em `@/lib/public-url` adota
   * pelo mesmo motivo: o servidor não chuta o que só o navegador sabe. Começar
   * fechado é o lado seguro da escolha — quem já dispensou nunca vê o aviso
   * piscar, e quem não dispensou o vê aparecer no instante em que a página
   * ganha vida.
   */
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (storeId && !jaDispensou(storeId)) setAberto(true);
  }, [storeId]);

  // A regra, e ela vem antes de tudo: qualquer outra loja não vê nada.
  if (storeId !== LOJA_DA_EXPERIENCIA) return null;
  if (!aberto) return null;

  function dispensar() {
    setAberto(false);
    try {
      sessionStorage.setItem(chave(LOJA_DA_EXPERIENCIA), "1");
    } catch {
      /* Sem storage o aviso volta na próxima tela. Chato, não quebrado. */
    }
  }

  return (
    /*
     * NÃO É MODAL, e isso é regra: nada de `fixed`, nada de overlay, nada que
     * capture foco. Ele ocupa uma faixa no fluxo da página e o dono segue
     * trabalhando com ele aberto.
     *
     * As cores saem do que o painel já usa em aviso — a mesma família do
     * `bg-amber-50 border-amber-200` das outras faixas — com o vermelho da
     * marca só no ícone e no botão, para chamar o olho sem virar alerta de
     * erro.
     */
    <section
      aria-labelledby="aviso-limpeza-titulo"
      className="relative overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white px-4 py-4 sm:px-5"
    >
      <button
        type="button"
        onClick={dispensar}
        aria-label="Fechar aviso"
        className="absolute right-2 top-2 rounded-lg p-1.5 text-amber-500 transition-colors hover:bg-amber-100 hover:text-amber-700"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#E11D2E]/10 text-[#E11D2E]">
          <Sparkles className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <h2
            id="aviso-limpeza-titulo"
            className="text-base font-bold text-neutral-900"
          >
            Parabéns!
          </h2>

          {/*
            Três blocos, e a ordem é a do texto original: o marco, o que foi
            feito, e o convite. Corrido, viravam quatro exclamações seguidas.
          */}
          <p className="mt-1 text-sm text-neutral-700">
            Você passou <strong className="font-semibold">3 dias</strong> como
            usuário da nossa plataforma!
          </p>
          <p className="mt-1.5 text-sm text-neutral-700">
            Limpamos todos os dados cadastrados padrão do sistema!{" "}
            <strong className="font-semibold text-neutral-900">
              Agora ele é todo seu!
            </strong>
          </p>
          <p className="mt-1.5 text-sm text-neutral-600">
            Aproveite seu tempo de teste!
          </p>

          <button
            type="button"
            onClick={dispensar}
            className="mt-3 rounded-lg bg-[#E11D2E] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#c4152a]"
          >
            Entendi
          </button>
        </div>
      </div>
    </section>
  );
}
