"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatCurrency, type Extra } from "@/lib/pizzaria2/menu";
import { cn } from "@/lib/utils";

/**
 * Os adicionais que o cliente marca antes de pôr no carrinho.
 *
 * Separada da tela do produto para a prévia do painel mostrar exatamente esta
 * lista enquanto a lojista cadastra um adicional — duas cópias do mesmo
 * markup divergiriam no primeiro ajuste, e a prévia passaria a mostrar algo
 * que a loja não tem.
 *
 * Agora renderiza um card/container que abre um modal com accordion ao clicar.
 */
export function ListaDeExtras({
  extras,
  selecionados,
  onAlternar,
}: {
  extras: Extra[];
  selecionados: string[];
  onAlternar: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Produto sem adicional nenhum não ganha um "Adicione extras" seguido de
  // nada. Antes os adicionais eram da loja inteira e a lista nunca vinha
  // vazia; agora ela vem, sempre que o produto não tiver nenhum ligado.
  if (extras.length === 0) return null;

  const qtSelecionados = selecionados.length;
  const totalExtras = selecionados.reduce((sum, id) => {
    const extra = extras.find((e) => e.id === id);
    return sum + (extra?.price ?? 0);
  }, 0);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {/* Card/Container que serve como trigger */}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={cn(
            "w-full rounded-2xl border p-5 text-left transition-colors",
            qtSelecionados > 0
              ? "border-tomato bg-tomato/5"
              : "border-charcoal/12 hover:border-charcoal/25",
          )}
          data-previa="lista-de-extras"
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base font-bold text-charcoal">
                Adicione extras
              </h2>
              {qtSelecionados > 0 && (
                <p className="mt-1 text-sm text-charcoal/70">
                  {qtSelecionados} {qtSelecionados === 1 ? "selecionado" : "selecionados"}
                  {totalExtras > 0 && (
                    <span className="ml-2 text-charcoal/50">
                      • {formatCurrency(totalExtras)}
                    </span>
                  )}
                </p>
              )}
            </div>
            {qtSelecionados === 0 && (
              <span className="text-sm text-charcoal/50">Clique para adicionar</span>
            )}
          </div>
        </button>

        {/* Modal com Accordion */}
        <DialogContent className="rounded-2xl border-charcoal/8 bg-mozzarella p-0 sm:rounded-2xl">
          <DialogHeader className="border-b border-charcoal/8 px-6 py-5">
            <DialogTitle className="text-left font-display text-lg font-bold text-charcoal">
              Adicione extras
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4">
            {extras.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {extras.map((extra) => (
                  <AccordionItem key={extra.id} value={extra.id} className="border-charcoal/8">
                    <AccordionTrigger className="text-charcoal hover:no-underline [&[data-state=open]>svg]:rotate-180">
                      <div className="flex flex-1 items-center gap-3 text-left">
                        <Checkbox
                          checked={selecionados.includes(extra.id)}
                          onCheckedChange={(checked) => {
                            // Evita toggle ao clicar no checkbox já que o accordio vai expandir
                            // Mas permitimos o toggle quando explicitamente clicado
                            onAlternar(extra.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="border-tomato data-[state=checked]:border-tomato data-[state=checked]:bg-tomato data-[state=checked]:text-mozzarella"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-charcoal">
                            {extra.label}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-charcoal/70">
                          {formatCurrency(extra.price)}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-2 pt-3 text-charcoal/70">
                      {/* Extra space for expanded content if needed in the future */}
                      <p className="text-xs text-charcoal/55">
                        {selecionados.includes(extra.id) && "✓ Selecionado"}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <p className="text-center text-sm text-charcoal/50">
                Nenhum extra disponível
              </p>
            )}
          </div>

          <div className="border-t border-charcoal/8 px-6 py-4">
            <p className="text-xs text-charcoal/50">
              {qtSelecionados === 0
                ? "Selecione os extras que desejar"
                : `${qtSelecionados} ${qtSelecionados === 1 ? "extra selecionado" : "extras selecionados"}`}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
