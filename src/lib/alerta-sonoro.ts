import { useEffect, useState } from "react";

/**
 * O aviso sonoro de pedido novo.
 *
 * O som é sintetizado em vez de vir de um arquivo porque o que se precisa aqui
 * são duas notas curtas — um .mp3 seria mais um pedido de rede para o painel
 * fazer justamente no momento em que ele está ocupado abrindo um pedido.
 *
 * A parte chata é a regra do navegador: uma página não toca som antes de
 * alguém interagir com ela. No balcão isso não é detalhe — o painel abre
 * sozinho com o Windows e pode ficar horas sem ninguém clicar, então o som
 * ficaria mudo justamente na hora que importa. Daí `bloqueado` existir: a tela
 * precisa conseguir pedir o clique em vez de fingir que está tudo certo.
 */

let contexto: AudioContext | null = null;
const ouvintes = new Set<() => void>();

function avisarOuvintes() {
  for (const ouvinte of ouvintes) ouvinte();
}

function obterContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Construtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Construtor) return null;
  if (!contexto) {
    contexto = new Construtor();
    contexto.onstatechange = avisarOuvintes;
  }
  return contexto;
}

/** Chamado a cada clique: é o gesto que o navegador exige para liberar o som. */
export function destravarSom(): void {
  const ctx = obterContexto();
  if (!ctx || ctx.state === "running") return;
  void ctx.resume().then(avisarOuvintes, avisarOuvintes);
}

/** Duas notas ascendentes, audíveis num salão barulhento sem virar alarme. */
export function tocarAvisoDePedido(): void {
  const ctx = obterContexto();
  if (!ctx || ctx.state !== "running") return;

  const agora = ctx.currentTime;
  const notas = [880, 1320];
  notas.forEach((hertz, indice) => {
    const oscilador = ctx.createOscillator();
    const ganho = ctx.createGain();
    oscilador.type = "triangle";
    oscilador.frequency.value = hertz;

    const inicio = agora + indice * 0.18;
    // A subida rápida e a queda longa é o que faz soar como uma campainha em
    // vez do "clique" que um volume ligado de uma vez produz.
    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(0.3, inicio + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.45);

    oscilador.connect(ganho);
    ganho.connect(ctx.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + 0.5);
  });
}

/** Diz à tela se o som está liberado, e destrava no primeiro toque em qualquer lugar. */
export function useSomDePedido(): { bloqueado: boolean } {
  const [bloqueado, setBloqueado] = useState(false);

  useEffect(() => {
    const conferir = () => setBloqueado(obterContexto()?.state !== "running");
    ouvintes.add(conferir);
    conferir();

    // Qualquer interação vale como o gesto exigido, então o aviso na tela some
    // sozinho assim que a pessoa mexe no painel — não precisa achar o botão.
    document.addEventListener("pointerdown", destravarSom);
    document.addEventListener("keydown", destravarSom);
    return () => {
      ouvintes.delete(conferir);
      document.removeEventListener("pointerdown", destravarSom);
      document.removeEventListener("keydown", destravarSom);
    };
  }, []);

  return { bloqueado };
}
