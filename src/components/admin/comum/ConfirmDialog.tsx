import type { ReactNode } from "react";
import { AlertCircle, Loader2, type LucideIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * A CONFIRMAÇÃO DO PAINEL — uma só, para todas as decisões que pedem
 * "tem certeza?".
 *
 * Substitui o `window.confirm()` do navegador, que anunciava "localhost:5173
 * diz" e desenhava uma caixa do sistema operacional no meio da Velnox. Além de
 * destoar, o confirm nativo é síncrono: trava a aba inteira, não tem como
 * mostrar que a operação está correndo e não tem onde escrever o motivo de uma
 * falha.
 *
 * POR QUE RADIX, E NÃO MAIS UM `fixed inset-0` À MÃO. O painel já tem oito
 * modais escritos na unha e nenhum deles prende o foco: com Tab dá para sair do
 * diálogo e clicar no que está atrás — exatamente o que um "tem certeza?" não
 * pode permitir. O `@radix-ui/react-alert-dialog` já estava nas dependências e
 * resolve foco, ESC, `aria-labelledby`, `aria-describedby` e trava de rolagem
 * de graça, e melhor do que refaríamos.
 *
 * ⚠️ `admin-theme` NO CONTEÚDO NÃO É ENFEITE. O Radix renderiza em portal no
 * `<body>`, fora da moldura do painel. Os tokens de cor do `:root` deste
 * projeto são os do tema ESCURO, então sem esta classe o diálogo sairia preto
 * no meio de uma tela clara. É o mesmo motivo pelo qual o DispatchDialog a
 * carrega.
 *
 * O COMPONENTE NÃO CONHECE REGRA DE NEGÓCIO. Ele não sabe o que é fiado, nem
 * estoque, nem pedido: recebe `onConfirm` e chama. Quem decide o que acontece é
 * a tela que o abriu.
 */

type Variante = "padrao" | "atencao";

/**
 * Duas variantes, e as duas já existem na linguagem do painel:
 *
 * · `padrao`  — o vermelho da Velnox, a cor de ação de toda a interface.
 * · `atencao` — o âmbar de "em aberto", que o quadro de pedidos, o card do
 *               painel e a tela de recebimentos já usam para o dinheiro que
 *               ainda não entrou. Aqui ele não é alarme, é continuidade.
 *
 * Não há uma terceira para "destrutivo" porque a cor primária da Velnox JÁ é
 * vermelha — uma variante de exclusão sairia idêntica à padrão.
 */
/*
 * Só cor de fundo e de ícone. O anel de foco NÃO entra aqui: o
 * `buttonVariants` do projeto já traz `focus-visible:outline-none` mais um
 * `ring-ring`, e uma `outline-*` nossa por cima seria classe morta — desenhada
 * no arquivo, invisível na tela.
 */
const PALETA: Record<Variante, { botao: string; circulo: string; icone: string }> = {
  padrao: {
    botao: "bg-[#E11D2E] hover:bg-[#c4172a]",
    circulo: "bg-red-50",
    icone: "text-[#E11D2E]",
  },
  atencao: {
    botao: "bg-amber-600 hover:bg-amber-700",
    circulo: "bg-amber-50",
    icone: "text-amber-700",
  },
};

export type ConfirmDialogProps = {
  open: boolean;
  /** Recebe `false` no ESC e no botão de cancelar. Nomes do Radix, de propósito. */
  onOpenChange: (aberto: boolean) => void;
  titulo: string;
  /** O que vai acontecer, em uma frase. Vira o `aria-describedby` do diálogo. */
  descricao: ReactNode;
  /** Os dados da decisão — quem, quanto, qual. Opcional. */
  children?: ReactNode;
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  icone?: LucideIcon;
  variante?: Variante;
  /** Trava os dois botões e o ESC enquanto a operação corre. */
  carregando?: boolean;
  /** Mensagem amigável de falha. Enquanto houver uma, o diálogo fica aberto. */
  erro?: string | null;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  titulo,
  descricao,
  children,
  rotuloConfirmar = "Confirmar",
  rotuloCancelar = "Cancelar",
  icone: Icone,
  variante = "padrao",
  carregando = false,
  erro = null,
  onConfirm,
}: ConfirmDialogProps) {
  const cor = PALETA[variante];

  return (
    <AlertDialog
      open={open}
      /* Fechar no meio de uma operação deixaria a tela mentindo sobre o que o
         servidor está fazendo. Enquanto corre, o diálogo não fecha por ESC. */
      onOpenChange={(v) => {
        if (carregando) return;
        onOpenChange(v);
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(e) => carregando && e.preventDefault()}
        className={cn(
          "admin-theme gap-0 border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl",
          // `w-full` num elemento `fixed` é a viewport inteira: no celular o
          // diálogo encostaria nas duas bordas. Os 2rem são a margem.
          "w-[calc(100vw-2rem)] max-w-md",
          // O `sm:rounded-lg` do wrapper venceria a partir de 640px se só
          // trocássemos o raio base — daí os dois.
          "rounded-2xl sm:rounded-2xl",
          "max-h-[90vh] overflow-y-auto",
        )}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            {Icone && (
              <span
                aria-hidden
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full",
                  cor.circulo,
                )}
              >
                <Icone className={cn("size-5", cor.icone)} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <AlertDialogTitle className="font-display text-lg font-bold tracking-tight text-neutral-900">
                {titulo}
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                {descricao}
              </AlertDialogDescription>
            </div>
          </div>

          {children && <div className="mt-5">{children}</div>}

          {/*
            A FALHA APARECE AQUI, e o diálogo continua aberto.
            Fechar e jogar o motivo num aviso lá atrás faria a pessoa perder a
            decisão que acabou de tomar — e o botão de tentar de novo junto.
          */}
          {erro && (
            <p
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">{erro}</span>
            </p>
          )}

          {/*
            Empilhado no celular e lado a lado a partir de 640px. `py-2.5` dá a
            altura de toque confortável, a mesma dos outros diálogos do painel.
            `flex-col-reverse` põe o confirmar ACIMA do cancelar no celular: o
            polegar alcança primeiro a ação que a pessoa veio fazer.
          */}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:grid sm:grid-cols-2">
            <AlertDialogCancel
              disabled={carregando}
              className="mt-0 h-auto rounded-xl border-2 border-neutral-300 bg-white py-2.5 text-sm font-semibold text-neutral-700 shadow-none hover:bg-neutral-50 disabled:opacity-60"
            >
              {rotuloCancelar}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={carregando}
              /*
               * O `preventDefault` é o que impede o Radix de fechar sozinho no
               * clique — e é ele que torna possível manter o diálogo aberto
               * quando a operação falha. Quem fecha é a tela, no sucesso.
               *
               * Com `disabled` durante `carregando`, o segundo clique de um
               * duplo clique não chega a este handler.
               */
              onClick={(e) => {
                e.preventDefault();
                if (carregando) return;
                onConfirm();
              }}
              className={cn(
                "h-auto rounded-xl py-2.5 text-sm font-semibold text-white shadow-none disabled:opacity-60",
                cor.botao,
              )}
            >
              {carregando && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {rotuloConfirmar}
            </AlertDialogAction>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
