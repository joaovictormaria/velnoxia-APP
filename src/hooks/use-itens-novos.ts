import { useEffect, useRef, useState } from "react";

/**
 * Quais itens apareceram na lista desde a última recarga.
 *
 * A tela recarrega sozinha a cada 8 segundos. Quando um pedido novo cai, ele
 * entra no topo e empurra os outros para baixo — e o que o olho percebe é a
 * lista inteira se mexendo, não o pedido que chegou. Marcar só o que é novo
 * permite destacar a linha certa, e por pouco tempo: o destaque diz "isto
 * acabou de acontecer", não "isto é importante para sempre".
 *
 * A PRIMEIRA CARGA NÃO DESTACA NADA. Tudo é novo quando a tela abre, e piscar
 * cinco linhas de uma vez ensinaria a ignorar o destaque justamente antes de
 * ele ter servido para alguma coisa.
 */
export function useItensNovos(ids: string[], duracaoMs = 1400) {
  const vistos = useRef<Set<string> | null>(null);
  const [novos, setNovos] = useState<ReadonlySet<string>>(new Set());
  // A lista vira uma chave estável: um array novo a cada render dispararia o
  // efeito toda vez, mesmo com exatamente o mesmo conteúdo.
  const chave = ids.join(",");

  useEffect(() => {
    const atuais = new Set(chave ? chave.split(",") : []);

    if (vistos.current === null) {
      vistos.current = atuais;
      return;
    }

    const entrantes = [...atuais].filter((id) => !vistos.current!.has(id));
    /*
     * O conjunto é REESCRITO com os ids atuais, não acrescido deles: a lista
     * tem teto de 5, então guardar tudo que já passou por ela faria a memória
     * crescer o dia inteiro sem nada em troca. Quem saiu do topo não volta —
     * a ordem é por data de criação, decrescente.
     */
    vistos.current = atuais;
    if (entrantes.length === 0) return;

    setNovos(new Set(entrantes));
    const relogio = setTimeout(() => setNovos(new Set()), duracaoMs);
    return () => clearTimeout(relogio);
  }, [chave, duracaoMs]);

  return novos;
}
