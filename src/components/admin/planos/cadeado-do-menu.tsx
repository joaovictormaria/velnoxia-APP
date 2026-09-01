import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ROTULO_DO_RECURSO } from "@/lib/planos/catalogo";
import { recursoDaRota } from "@/lib/planos/navegacao";
import { recursoNoEstado, type EstadoComercial } from "@/lib/planos/resolucao";
import type { Recurso } from "@/lib/planos/tipos";
import { TelaDeRecursoPremium } from "./rota-premium";

/**
 * O CADEADO DA BARRA LATERAL — e o convite que ele abre.
 *
 * ─── A BARRA NÃO TEM MATRIZ PRÓPRIA ────────────────────────────────────────
 *
 * Ela não sabe quais rotas são pagas. Pergunta a `recursoDaRota()` qual recurso
 * a tela pertence e a `recursoNoEstado()` se o plano o inclui — as mesmas duas
 * funções que a guarda de rota e as server functions usam. Não há
 * `PREMIUM_ROUTES`, não há `if (plano === "PREMIUM")` e não há lista repetida:
 * mover um recurso de plano em `catalogo.ts` acende ou apaga o cadeado sozinho.
 *
 * ─── POR QUE UM CONTEXTO, E NÃO UMA PROP ───────────────────────────────────
 *
 * O menu tem três formas de desenhar o mesmo item — a lista larga, a lista
 * dentro de um grupo aberto e a trilha de ícones do menu recolhido. Passar o
 * plano por prop obrigaria as três a repassá-lo, e bastaria uma esquecer para
 * um caminho ficar sem cadeado. O contexto entrega a mesma resposta às três.
 *
 * ─── O CADEADO NÃO É A SEGURANÇA ───────────────────────────────────────────
 *
 * Quem recusa de verdade é o servidor. Para o Estoque isso já vale desde a
 * Fase 5; para os outros módulos o cadeado chega primeiro, e o enforcement vem
 * na fase de cada um. É por isso que ele NÃO promete segurança: ele informa o
 * que o plano inclui, e impede o clique de levar a uma tela que confundiria.
 */

type ValorDoContexto = {
  /** O recurso bloqueado desta rota, ou `null` quando ela está liberada. */
  bloqueioDaRota: (rota: string) => Recurso | null;
  /** Abre o convite do Premium para este recurso. */
  abrirConvite: (recurso: Recurso) => void;
};

/*
 * O padrão é "nada bloqueado". Um menu montado fora do provedor — num teste,
 * numa tela futura — continua funcionando como antes desta fase, em vez de
 * trancar tudo por não saber o plano.
 */
const Contexto = createContext<ValorDoContexto>({
  bloqueioDaRota: () => null,
  abrirConvite: () => {},
});

export function useCadeado(): ValorDoContexto {
  return useContext(Contexto);
}

/**
 * Decide o cadeado de UMA rota. Função pura, testável sem React.
 *
 * ⚠️ SÓ `BLOQUEADO` ACENDE O CADEADO. `PERMITIDO` e `INDEFINIDO` passam — o
 * segundo é a loja legada, com a permissão transitória da Fase 5. É a mesma
 * regra do servidor e da guarda de rota, para as três nunca discordarem.
 */
export function bloqueioDaRotaNoPlano(
  plano: EstadoComercial | null | undefined,
  rota: string,
): Recurso | null {
  if (!plano) return null;
  const recurso = recursoDaRota(rota);
  // Rota não mapeada não é rota paga: é rota que ninguém classificou, e
  // trancá-la por omissão esconderia uma tela sem ninguém ter decidido isso.
  if (!recurso) return null;
  return recursoNoEstado(plano, recurso) === "BLOQUEADO" ? recurso : null;
}

/**
 * Envolve o menu e guarda o diálogo do convite.
 *
 * O diálogo mora aqui, e não em cada item: um por menu, aberto pelo item que
 * for clicado. Vinte diálogos montados de uma vez seriam vinte nós no DOM para
 * mostrar, no máximo, um.
 */
export function ProvedorDeCadeado({
  plano,
  children,
}: {
  plano: EstadoComercial | null | undefined;
  children: React.ReactNode;
}) {
  const [convite, setConvite] = useState<Recurso | null>(null);

  const bloqueioDaRota = useCallback(
    (rota: string) => bloqueioDaRotaNoPlano(plano, rota),
    [plano],
  );

  const valor = useMemo<ValorDoContexto>(
    () => ({ bloqueioDaRota, abrirConvite: setConvite }),
    [bloqueioDaRota],
  );

  return (
    <Contexto.Provider value={valor}>
      {children}

      <Dialog open={convite !== null} onOpenChange={(aberto) => !aberto && setConvite(null)}>
        <DialogContent className="admin-theme max-w-md border-neutral-200 bg-white p-0">
          {convite && (
            <>
              {/*
                O título acessível do diálogo. Fica fora da moldura visível
                porque a tela já mostra o nome do recurso em destaque — repetir
                seria ruído para quem enxerga e ausência para quem não enxerga.
              */}
              <DialogTitle className="sr-only">
                {ROTULO_DO_RECURSO[convite]} está no plano Premium
              </DialogTitle>
              <TelaDeRecursoPremium
                recurso={convite}
                compacto
                aoVoltar={() => setConvite(null)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Contexto.Provider>
  );
}
