import { useEffect, useState } from "react";

/**
 * Endereço público do app — o que o cliente digita, o que vai no QR Code das
 * mesas e o que o painel mostra ao dono.
 *
 * Vem de `VITE_PUBLIC_APP_URL`. Sem ela, cai na origem em que a página está
 * aberta, que é o certo em desenvolvimento: um QR apontando para o domínio de
 * produção não abriria nada na máquina de quem está testando.
 *
 * Atenção ao publicar: variáveis `VITE_` são gravadas no pacote durante o
 * build, não lidas em tempo de execução. No Railway ela precisa existir antes
 * do build — defini-la depois não muda o que já foi compilado.
 */
const CONFIGURADO = (import.meta.env.VITE_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");

/**
 * A base pública, ou `null` enquanto ainda não dá para saber.
 *
 * O `null` só acontece quando a variável não está definida e o código roda no
 * servidor, onde não existe `window`. Daí o hook: a tela mostra o endereço
 * assim que hidrata, em vez de o servidor chutar um valor diferente do que o
 * navegador veria — o que o React acusaria como divergência.
 */
export function useBaseUrlPublica(): string | null {
  const [base, setBase] = useState<string | null>(CONFIGURADO || null);

  useEffect(() => {
    if (!CONFIGURADO) setBase(window.location.origin);
  }, []);

  return base;
}

/** Endereço completo do cardápio de uma loja. */
export const urlDoCardapio = (base: string, slug: string) => `${base}/${slug}`;

/** Para mostrar na tela: "velnox.app.br/pizzaria" em vez da URL com protocolo. */
export const semProtocolo = (url: string) => url.replace(/^https?:\/\//, "");
