import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ExternalLink, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  abrirPortalFn,
  getAssinaturaFn,
  iniciarAssinaturaFn,
} from "@/server/functions/billing.fn";
import { EscolhaDePlano } from "@/components/admin/planos/EscolhaDePlano";
import { dataEscrita } from "@/lib/plano";
import type { Plano } from "@/lib/planos/tipos";

export const Route = createFileRoute("/admin/assinatura")({
  /**
   * As duas marcas que o Stripe devolve na volta do checkout. Opcionais de
   * verdade: os links do painel apontam para /admin/assinatura sem parâmetro
   * nenhum, e exigi-los quebraria cada um deles.
   */
  validateSearch: (busca: Record<string, unknown>): { pago?: true; cancelado?: true } => {
    const marcado = (v: unknown) => v === "1" || v === 1 || v === true;
    return {
      ...(marcado(busca.pago) ? { pago: true as const } : {}),
      ...(marcado(busca.cancelado) ? { cancelado: true as const } : {}),
    };
  },
  component: AssinaturaPage,
});

function AssinaturaPage() {
  const { pago, cancelado } = Route.useSearch();
  const [erro, setErro] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["assinatura"],
    queryFn: () => getAssinaturaFn(),
    /**
     * Voltando do pagamento, quem libera a conta é o webhook do Stripe — e ele
     * chega pela rede, alguns segundos depois. Sem esta consulta repetida, o
     * dono pagaria e continuaria vendo "conta bloqueada" até apertar F5.
     */
    refetchInterval: (consulta) =>
      pago && !consulta.state.data?.acesso.liberado ? 3000 : false,
  });

  /*
    O PLANO ESCOLHIDO VIAJA ATÉ O STRIPE, e o botão do Básico nunca cobra
    Premium: `iniciarAssinaturaFn` exige o plano no validador, sem padrão.

    `contratando` guarda QUAL plano está abrindo, e não um booleano: é o que
    põe o spinner no botão certo e, ao mesmo tempo, desabilita os dois. Dois
    cliques em cards diferentes abririam duas sessões de pagamento.
  */
  const [contratando, setContratando] = useState<Plano | null>(null);

  const assinar = useMutation({
    mutationFn: (plano: Plano) => iniciarAssinaturaFn({ data: { plano } }),
    onMutate: (plano: Plano) => {
      setErro(null);
      setContratando(plano);
    },
    onSuccess: (r) => {
      if (r.ok) {
        // A navegação leva embora a página; o botão fica travado até lá, de
        // propósito — destravá-lo daria uma janela para um segundo clique.
        window.location.href = r.url;
        return;
      }
      setErro(r.error);
      setContratando(null);
    },
    onError: () => {
      setErro("Não foi possível abrir o pagamento. Tente de novo.");
      setContratando(null);
    },
  });

  const gerenciar = useMutation({
    mutationFn: () => abrirPortalFn(),
    onSuccess: (r) => (r.ok ? (window.location.href = r.url) : setErro(r.error)),
    onError: () => setErro("Não foi possível abrir a gestão da assinatura."),
  });

  if (isPending || !data) {
    return <p className="text-sm text-neutral-500">Carregando...</p>;
  }

  const liberando = pago && !data.acesso.liberado;

  return (
    /*
      CENTRADO NA ÁREA ÚTIL, e não encostado à esquerda.

      Faltava o `mx-auto`: a área de conteúdo do painel é `flex-1`, então um
      bloco com largura máxima e sem centralização fica preso na borda
      esquerda — o cabeçalho da escolha aparecia centrado DENTRO de um bloco
      que estava todo de lado, e o conjunto dos dois cards nascia à esquerda
      do centro visual da página.

      `w-full` para o celular usar a largura inteira; `max-w-7xl` porque a
      escolha tem duas colunas — os planos e a comparação ao lado — e num
      monitor largo sobrava uma faixa vazia de quase 200px de cada lado. O teto
      continua existindo para o conjunto não se esparramar: quem cresce com a
      tela é a comparação, não os cards. Nenhuma margem manual e nenhum valor
      preso a uma resolução.
    */
    <div className="mx-auto w-full max-w-7xl">
      <h1 className="text-2xl font-bold text-neutral-900">Assinatura</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Seu cardápio, o painel e os pedidos ficam no ar enquanto a assinatura estiver em dia.
      </p>

      {liberando && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Pagamento recebido.</p>
            <p className="mt-0.5 text-sm text-emerald-800">
              Estamos liberando sua conta — leva alguns segundos. Pode deixar esta tela aberta.
            </p>
          </div>
        </div>
      )}

      {cancelado && (
        <p className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
          Você saiu do pagamento sem concluir. Nada foi cobrado.
        </p>
      )}

      {/*
        UM AVISO SÓ SOBRE O TESTE.

        Durante o teste esta faixa dizia "Teste gratuito até 14/09" logo acima
        de um selo verde e de outra tarja verde na seção de planos: três
        avisos, três cores, a mesma informação. Quem comunica o teste agora é
        o cabeçalho da escolha de plano, com a data junto.

        Fora do teste ela continua inteira: conta suspensa, assinatura vencida,
        cartão recusado e cancelamento agendado pedem ação, e nenhum deles
        aparece na seção de planos.
      */}
      {data.acesso.motivo !== "trial" && <Situacao data={data} />}

      {erro && (
        <p className="mt-4 rounded-xl bg-[#E11D2E]/10 px-4 py-3 text-sm text-[#E11D2E]">{erro}</p>
      )}

      {!data.configurado && (
        <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          A cobrança ainda não está ligada neste ambiente. Em desenvolvimento isso é o esperado.
        </p>
      )}

      {/*
        QUEM JÁ ASSINA TROCA DE PLANO PELO PORTAL DO STRIPE, e não por um
        segundo checkout: abrir outra sessão criaria uma SEGUNDA assinatura, e
        a loja passaria a ser cobrada duas vezes. O portal é quem sabe fazer a
        troca proporcional.
      */}
      {data.temAssinatura && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => gerenciar.mutate()}
            disabled={gerenciar.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {gerenciar.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ExternalLink className="size-4" aria-hidden="true" />
            )}
            Gerenciar assinatura
          </button>
          <p className="mt-2 text-xs text-neutral-500">
            Trocar o cartão, ver as faturas, mudar de plano ou cancelar — tudo pela página
            segura do Stripe.
          </p>
        </div>
      )}

      {data.configurado && (
        <EscolhaDePlano
          plano={data.plano}
          vendaveis={data.vendaveis}
          temAssinatura={data.temAssinatura}
          /*
            A data vai PRONTA. A tela de planos lê o teste, não o calcula:
            formatar lá dentro exigiria `trialEndsAt` cruzando a fronteira e
            abriria caminho para um segundo calendário divergir de
            `conferirAcesso`, que é quem decide o acesso.
          */
          fimDoTeste={data.acesso.motivo === "trial" ? dataEscrita(data.trialEndsAt) : null}
          aoContratar={(plano) => assinar.mutate(plano)}
          contratando={contratando}
        />
      )}
    </div>
  );
}

/** Em que pé está a conta, em uma frase que diz o que fazer a seguir. */
function Situacao({ data }: { data: Awaited<ReturnType<typeof getAssinaturaFn>> }) {
  const { acesso } = data;

  const [tom, titulo, detalhe] = (() => {
    if (!acesso.liberado) {
      if (acesso.motivo === "suspensa") {
        return ["ruim", "Conta suspensa", "Fale com a gente para reativar."] as const;
      }
      if (acesso.motivo === "trial-vencido") {
        return [
          "ruim",
          "Seu período de teste terminou",
          "Seus dados continuam salvos. Assine para voltar a receber pedidos.",
        ] as const;
      }
      return [
        "ruim",
        "Assinatura vencida",
        "O cardápio está fora do ar para os seus clientes.",
      ] as const;
    }

    if (acesso.motivo === "trial") {
      const fim = dataEscrita(data.trialEndsAt);
      return [
        "aviso",
        fim ? `Teste gratuito até ${fim}` : "Teste gratuito",
        "Assine antes do fim para o cardápio não sair do ar.",
      ] as const;
    }

    if (acesso.motivo === "tolerancia") {
      return [
        "aviso",
        "Não conseguimos cobrar seu cartão",
        "Sua loja continua no ar por poucos dias. Atualize o cartão para não cair.",
      ] as const;
    }

    if (acesso.motivo === "pago") {
      const ate = dataEscrita(data.paidUntil);
      return data.cancelAtPeriodEnd
        ? ([
            "aviso",
            `Cancelamento agendado${ate ? ` para ${ate}` : ""}`,
            "Você continua com tudo funcionando até essa data.",
          ] as const)
        : (["bom", "Assinatura ativa", ate ? `Próxima cobrança em ${ate}.` : ""] as const);
    }

    return ["bom", "Conta liberada", "Esta conta não passa por cobrança."] as const;
  })();

  const cores = {
    bom: "border-emerald-200 bg-emerald-50 text-emerald-900",
    aviso: "border-amber-200 bg-amber-50 text-amber-900",
    ruim: "border-[#E11D2E]/30 bg-[#E11D2E]/5 text-[#E11D2E]",
  }[tom];

  return (
    <div className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 ${cores}`}>
      {tom === "bom" ? (
        <ShieldCheck className="mt-0.5 size-5 shrink-0" />
      ) : (
        <TriangleAlert className="mt-0.5 size-5 shrink-0" />
      )}
      <div>
        <p className="text-sm font-semibold">{titulo}</p>
        {detalhe && <p className="mt-0.5 text-sm opacity-90">{detalhe}</p>}
      </div>
    </div>
  );
}
