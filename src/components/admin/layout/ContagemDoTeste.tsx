import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { precoEscrito } from "@/lib/plano";

/** A partir de quando a conta vira urgente. */
const JANELA_MS = 24 * 60 * 60 * 1000;
/** Última hora: o tom muda porque o cardápio está prestes a sair do ar. */
const CRITICO_MS = 60 * 60 * 1000;

/**
 * Se a contagem regressiva está no ar para este fim de teste.
 *
 * Existe para o aviso em dias do painel inicial saber quando se calar: os dois
 * dizem a mesma coisa, e nas últimas horas quem serve é o relógio.
 */
export function contagemNoAr(trialEndsAt: Date | string | null): boolean {
  if (!trialEndsAt) return false;
  const falta = new Date(trialEndsAt).getTime() - Date.now();
  return falta > 0 && falta <= JANELA_MS;
}

export type Contagem =
  | { mostrar: false }
  | { mostrar: true; horas: string; minutos: string; segundos: string; critico: boolean };

/**
 * O que a faixa deve mostrar para um tempo restante.
 *
 * Separada da tela para poder ser conferida nos limites — 24h em ponto, 1h em
 * ponto, o último segundo — que é onde esse tipo de conta erra por um.
 */
export function formatarContagem(restanteMs: number): Contagem {
  if (restanteMs <= 0 || restanteMs > JANELA_MS) return { mostrar: false };

  const total = Math.floor(restanteMs / 1000);
  const doisDigitos = (n: number) => String(n).padStart(2, "0");
  return {
    mostrar: true,
    horas: doisDigitos(Math.floor(total / 3600)),
    minutos: doisDigitos(Math.floor((total % 3600) / 60)),
    segundos: doisDigitos(total % 60),
    critico: restanteMs < CRITICO_MS,
  };
}

/**
 * A contagem das últimas 24 horas do teste.
 *
 * "Restam 3 dias" é uma informação que se lê e se esquece. Faltando menos de
 * um dia isso deixa de servir: o dono precisa saber que é hoje, e precisa
 * disso na tela em que estiver — não só no painel inicial, onde ele talvez
 * não passe.
 *
 * Antes disso a faixa não aparece. Um contador correndo a semana inteira vira
 * paisagem, e quando finalmente importasse já não seria visto.
 */
export function ContagemDoTeste({
  trialEndsAt,
  onExpirar,
}: {
  trialEndsAt: Date | string | null;
  /** Chamado quando zera, para a moldura reavaliar o acesso na hora. */
  onExpirar: () => void;
}) {
  // Começa nulo de propósito: o servidor e o navegador calculariam "agora" em
  // instantes diferentes, e o HTML renderizado não bateria com o do cliente.
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    if (!trialEndsAt) return;
    const fim = new Date(trialEndsAt).getTime();

    const marcar = () => {
      const falta = fim - Date.now();
      setRestante(falta);
      // Zerou: quem decide o bloqueio é o servidor, então a moldura recarrega
      // o contexto em vez de esta faixa tentar adivinhar o que vem depois.
      if (falta <= 0) onExpirar();
    };

    marcar();
    const id = setInterval(marcar, 1000);
    return () => clearInterval(id);
  }, [trialEndsAt, onExpirar]);

  if (restante === null) return null;
  const c = formatarContagem(restante);
  if (!c.mostrar) return null;
  const { horas, minutos, segundos, critico } = c;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-5 py-3.5 " +
        (critico ? "bg-[#E11D2E] text-white" : "bg-amber-100 text-amber-950")
      }
    >
      <AlertTriangle className="size-5 shrink-0" />

      <p className="text-sm font-medium">
        {critico ? "Seu cardápio sai do ar em" : "Seu teste grátis termina em"}
      </p>

      {/* Largura fixa por dígito: sem isso o texto ao lado dança a cada
          segundo, porque "1" e "0" não ocupam o mesmo espaço. */}
      <p className="font-mono text-xl font-bold tabular-nums" aria-label={`${horas} horas, ${minutos} minutos e ${segundos} segundos`}>
        {horas}:{minutos}:{segundos}
      </p>

      <Link
        to="/admin/assinatura"
        className={
          "ml-auto rounded-xl px-4 py-2 text-sm font-semibold " +
          (critico
            ? "bg-white text-[#E11D2E] hover:bg-white/90"
            : "bg-[#E11D2E] text-white hover:bg-[#c4172a]")
        }
      >
        Assinar por {precoEscrito()} por mês
      </Link>
    </div>
  );
}
