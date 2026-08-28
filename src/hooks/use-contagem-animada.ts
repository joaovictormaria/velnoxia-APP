import { useEffect, useRef, useState } from "react";

/**
 * O número sobe até o valor novo em vez de trocar de uma vez.
 *
 * A tela recarrega sozinha a cada 8 segundos, e quase sempre nada mudou. Quando
 * muda, a troca seca não deixa rastro: quem estava olhando para outro canto da
 * tela só encontra um número diferente, sem saber que ele acabou de mudar. A
 * contagem é o rastro — curta o bastante para não atrasar a leitura, longa o
 * bastante para o olho pegar o movimento.
 *
 * MOTION É ENFEITE AQUI, e o número é a informação. Por isso a primeira
 * renderização já entra no valor final (animar de zero na abertura da página
 * atrasaria a leitura de todo mundo, todo dia), e quem pediu menos movimento
 * recebe o valor direto. Em nenhum caminho o retorno é um número que não seja o
 * atual ou um passo verdadeiro em direção a ele.
 */
export function useContagemAnimada(valor: number, duracaoMs = 600) {
  const [exibido, setExibido] = useState(valor);
  const anterior = useRef(valor);
  const quadro = useRef(0);

  useEffect(() => {
    const de = anterior.current;
    anterior.current = valor;
    if (de === valor) return;

    const menosMovimento =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Salto de um só passo: contar de 3 para 4 não é animação, é atraso.
    if (menosMovimento || Math.abs(valor - de) <= 1) {
      setExibido(valor);
      return;
    }

    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracaoMs);
      // Desacelera no fim: o valor final é o que importa, e ele chega pousando.
      const suave = 1 - (1 - t) ** 3;
      setExibido(Math.round(de + (valor - de) * suave));
      if (t < 1) quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(quadro.current);
  }, [valor, duracaoMs]);

  return exibido;
}
