import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CreditCard, ExternalLink, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  abrirPortalFn,
  getAssinaturaFn,
  iniciarAssinaturaFn,
} from "@/server/functions/billing.fn";
import { dataEscrita, precoEscrito } from "@/lib/plano";

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

  const assinar = useMutation({
    mutationFn: () => iniciarAssinaturaFn(),
    onSuccess: (r) => (r.ok ? (window.location.href = r.url) : setErro(r.error)),
    onError: () => setErro("Não foi possível abrir o pagamento."),
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
    <div className="max-w-2xl">
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

      <Situacao data={data} />

      {erro && (
        <p className="mt-4 rounded-xl bg-[#E11D2E]/10 px-4 py-3 text-sm text-[#E11D2E]">{erro}</p>
      )}

      {!data.configurado ? (
        <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          A cobrança ainda não está ligada neste ambiente. Em desenvolvimento isso é o esperado.
        </p>
      ) : data.temAssinatura ? (
        <button
          type="button"
          onClick={() => gerenciar.mutate()}
          disabled={gerenciar.isPending}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-800 hover:border-neutral-400 disabled:opacity-60"
        >
          {gerenciar.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ExternalLink className="size-4" />
          )}
          Gerenciar assinatura
        </button>
      ) : (
        <button
          type="button"
          onClick={() => assinar.mutate()}
          disabled={assinar.isPending}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#E11D2E] px-5 py-3 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
        >
          {assinar.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CreditCard className="size-4" />
          )}
          Assinar por {precoEscrito()} por mês
        </button>
      )}

      {data.temAssinatura && (
        <p className="mt-2 text-xs text-neutral-500">
          Trocar o cartão, ver as faturas ou cancelar — tudo pela página segura do Stripe.
        </p>
      )}

      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="text-sm font-semibold text-neutral-900">O que está incluso</p>
        <ul className="mt-3 grid gap-2 text-sm text-neutral-600 sm:grid-cols-2">
          {[
            "Cardápio digital no seu endereço",
            "Pedidos em tempo real no Kanban",
            "Entregadores e acompanhamento",
            "Promoções, cupons e avaliações",
            "Relatórios de vendas e produtos",
            "QR Code para colar na loja",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              {item}
            </li>
          ))}
        </ul>
      </div>
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
