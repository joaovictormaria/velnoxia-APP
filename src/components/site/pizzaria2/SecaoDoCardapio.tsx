import type { ReactNode } from "react";

/**
 * A moldura em que o cardápio vive na vitrine.
 *
 * Existe separada porque a prévia do painel precisa exatamente da mesma: sem
 * ela a seção era renderizada crua e encostava nas bordas, com os cards
 * transbordando pela direita — parecia um defeito da vitrine quando era só
 * falta do container.
 *
 * Duas cópias das mesmas classes teriam divergido no primeiro ajuste de
 * espaçamento, e a prévia passaria a mostrar um enquadramento que a loja não
 * tem.
 */
export function SecaoDoCardapio({ children }: { children: ReactNode }) {
  return (
    <section id="cardapio" className="relative scroll-mt-20 overflow-hidden">
      <div className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-tomato/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-olive/10 blur-3xl" />
      <div className="relative mx-auto max-w-[1800px] px-4 py-20 sm:px-10 sm:py-24 xl:px-16">
        {children}
      </div>
    </section>
  );
}
