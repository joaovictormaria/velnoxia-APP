import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CATALOGO } from "@/lib/novidades/catalogo";
import { persistencia } from "@/lib/novidades/persistencia";
import { escolherNovidade, haNovidadePublicada } from "@/lib/novidades/selecao";
import type { Papel, Registro } from "@/lib/novidades/tipos";
import { ModalDeNovidade } from "./ModalDeNovidade";
import { TourGuiado } from "./TourGuiado";

/**
 * A CENTRAL DE NOVIDADES — o único ponto de montagem do sistema.
 *
 * Mora na moldura do painel, ao lado do `NewOrderDialog`, e não numa tela: o
 * tour atravessa rotas, e um componente montado dentro de uma página seria
 * desmontado no primeiro passo que navegasse.
 *
 * Ela orquestra e não decide: quem escolhe a novidade é `escolherNovidade`,
 * quem guarda o estado é `persistencia`. Aqui só se liga um no outro.
 */

/*
 * O PORTÃO MAIS BARATO DO SISTEMA, e ele é resolvido na IMPORTAÇÃO do módulo.
 *
 * Com o catálogo todo em `publicada: false` — que é o estado de hoje — este
 * booleano é `false` e o componente devolve `null` antes de montar hook nenhum:
 * nenhuma leitura de armazenamento, nenhum observer, nenhum listener, nenhuma
 * query, em nenhuma tela do painel. O custo do sistema desligado é uma
 * comparação por render.
 */
const HA_PUBLICADA = haNovidadePublicada(CATALOGO);

type Props = {
  /**
   * Vem da sessão, pelo contexto da rota do admin. Nunca é digitado, nunca
   * chega do cliente, e é ele que separa o estado do dono do estado do
   * gerente no mesmo computador do balcão.
   */
  adminUserId: string;
  papel: Papel;
};

export function CentralDeNovidades(props: Props) {
  // A casca existe para que o retorno acima não seja um hook condicional: com
  // nada publicado, `CentralAtiva` nunca é montada e seus hooks nunca rodam.
  if (!HA_PUBLICADA) return null;
  return <CentralAtiva {...props} />;
}

function CentralAtiva({ adminUserId, papel }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  /** `null` = ainda não lido. Distingue "não sei" de "não há nada". */
  const [dados, setDados] = useState<{ registros: Registro[]; adiadas: string[] } | null>(null);
  const [modalAberto, setModalAberto] = useState(true);
  const [tourAtivo, setTourAtivo] = useState(false);

  const carregar = useCallback(async () => {
    const registros = await persistencia.ler(adminUserId);
    setDados({ registros, adiadas: persistencia.adiadasNaSessao(adminUserId) });
  }, [adminUserId]);

  /*
   * Lido DEPOIS da montagem, nunca durante a renderização.
   *
   * O painel é servido por SSR, e no servidor não existe `localStorage`. Ler
   * durante o render faria o HTML do servidor divergir do que o navegador
   * monta — o React acusaria a divergência e a hidratação quebraria. É a mesma
   * razão pela qual o `AdminSidebar` lê a preferência de menu num efeito.
   */
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const novidade = useMemo(() => {
    if (!dados) return null;
    return escolherNovidade(CATALOGO, dados.registros, papel, dados.adiadas);
  }, [dados, papel]);

  /*
   * CADA NOVIDADE ABRE UMA VEZ, E SÓ QUANDO ELA MUDA DE FATO.
   *
   * Sem isto, `modalAberto` ficava `false` depois da primeira dispensa e a
   * NOVIDADE SEGUINTE nunca aparecia — o estado do modal era global, mas a
   * decisão de abrir é por novidade. Só um recarregamento da página destravava.
   *
   * A guarda é o id na ref, e não o valor de `modalAberto`: comparar pelo
   * estado reabriria o modal em qualquer re-render depois de fechado, que é
   * exatamente o laço que este efeito não pode criar. Como a ref só avança
   * quando o id muda, fechar continua fechando.
   */
  const idJaApresentado = useRef<string | null>(null);
  useEffect(() => {
    if (!novidade) return;
    if (idJaApresentado.current === novidade.id) return;
    idJaApresentado.current = novidade.id;
    setModalAberto(true);
    // Uma novidade nova nunca herda o tour da anterior.
    setTourAtivo(false);
  }, [novidade]);

  /*
   * O MODAL SÓ ABRE NO PAINEL INICIAL.
   *
   * A Central é global porque o TOUR precisa disso. O modal, não: interromper
   * quem está no quadro de pedidos em hora de pico, ou no meio de uma edição
   * de cardápio, é o jeito mais rápido de ensinar a fechar sem ler. No painel
   * inicial a pessoa está justamente olhando o resumo do dia.
   *
   * O tour, uma vez começado, continua em qualquer rota — é o que o passo 2
   * exige, já que ele mora em outra tela.
   */
  const noPainelInicial = pathname === "/admin" || pathname === "/admin/";

  const encerrarModal = useCallback(() => {
    if (novidade) persistencia.adiarNaSessao(adminUserId, novidade.id);
    setModalAberto(false);
    // Recarrega para o adiamento entrar na conta e a novidade sumir da
    // seleção — sem isto, ela reabriria ao voltar para o painel inicial.
    void carregar();
  }, [novidade, adminUserId, carregar]);

  const concluir = useCallback(async () => {
    if (!novidade) return;
    setTourAtivo(false);
    setModalAberto(false);
    await persistencia.marcar(adminUserId, novidade.id, "CONCLUIDA");
    await carregar();
  }, [novidade, adminUserId, carregar]);

  const dispensar = useCallback(async () => {
    if (!novidade) return;
    setModalAberto(false);
    await persistencia.marcar(adminUserId, novidade.id, "DISPENSADA");
    await carregar();
  }, [novidade, adminUserId, carregar]);

  /*
   * Sair do tour — ESC, X ou "Pular tutorial".
   *
   * NADA é persistido, por decisão de produto: quem abandonou no meio não
   * concluiu nem recusou. Só o adiamento de sessão entra, para o modal não
   * reabrir no mesmo instante em que a pessoa acabou de fechar o overlay.
   */
  const sairDoTour = useCallback(() => {
    setTourAtivo(false);
    if (novidade) persistencia.adiarNaSessao(adminUserId, novidade.id);
    void carregar();
  }, [novidade, adminUserId, carregar]);

  if (!novidade) return null;

  if (tourAtivo && novidade.passos?.length) {
    return (
      <TourGuiado passos={novidade.passos} onSair={sairDoTour} onConcluir={concluir} />
    );
  }

  if (!noPainelInicial) return null;

  return (
    <ModalDeNovidade
      novidade={novidade}
      open={modalAberto}
      onOpenChange={(aberto) => {
        if (!aberto) encerrarModal();
      }}
      onConhecer={() => {
        setModalAberto(false);
        setTourAtivo(true);
      }}
      onConcluir={concluir}
      onDispensar={dispensar}
    />
  );
}
