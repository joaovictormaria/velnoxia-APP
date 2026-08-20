import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { useCart } from "@/lib/pizzaria2/cart";
import { formatCurrency } from "@/lib/pizzaria2/menu";
import { CampoDeCupom } from "@/components/site/pizzaria2/CampoDeCupom";
import { useStore } from "@/lib/pizzaria2/store-provider";
import { submitCheckoutFn } from "@/server/functions/storefront-checkout.fn";
import { previewCouponFn } from "@/server/functions/coupons.fn";
import { loadCustomerDetails, saveCustomerDetails } from "@/lib/pizzaria2/customer-details";
import { formatCep, isCompleteCep, lookupCep, normalizeCep } from "@/lib/pizzaria2/cep-lookup";

const PAYMENT_LABEL: Record<string, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  CASH: "Dinheiro",
};

export function CheckoutForm({ onClose }: { onClose: () => void }) {
  const storeInfo = useStore();
  const { lines, subtotal, clearCart } = useCart();
  const [type, setType] = useState<"DELIVERY" | "PICKUP">(
    storeInfo.acceptsDelivery === false ? "PICKUP" : "DELIVERY",
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [cep, setCep] = useState("");
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "notfound">("idle");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [couponCode, setCouponCode] = useState("");
  /** null = not checked yet. The order service checks again when the order is
   *  placed; this only lets the customer see the discount before confirming. */
  const [couponResult, setCouponResult] = useState<
    { ok: true; code: string; discount: number } | { ok: false; error: string } | null
  >(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  async function checkCoupon() {
    const code = couponCode.trim();
    if (!code) {
      setCouponResult(null);
      return;
    }
    setCheckingCoupon(true);
    try {
      const res = await previewCouponFn({ data: { storeSlug: storeInfo.slug, code, subtotal } });
      setCouponResult(res);
    } catch {
      setCouponResult({ ok: false, error: "Não foi possível conferir o cupom agora." });
    } finally {
      setCheckingCoupon(false);
    }
  }
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{
    number: number;
    total: number;
    trackingToken: string | null;
  } | null>(null);

  const payments = storeInfo.acceptedPaymentMethods;

  // Filled after mount, not in a state initialiser: localStorage does not
  // exist on the server, so seeding it during the first render would make the
  // client markup disagree with the server's and break hydration.
  useEffect(() => {
    const saved = loadCustomerDetails(storeInfo.slug);
    if (!saved.phone && !saved.name) return;
    setName(saved.name);
    setPhone(saved.phone);
    setStreet(saved.street);
    setNumber(saved.number);
    setComplement(saved.complement);
    setNeighborhood(saved.neighborhood);
    setCity(saved.city);
    setState(saved.state);
    setCep(saved.cep);
    if (storeInfo.acceptedPaymentMethods.includes(saved.paymentMethod)) {
      setPaymentMethod(saved.paymentMethod);
    }
    if (saved.type === "PICKUP" ? storeInfo.acceptsPickup : storeInfo.acceptsDelivery) {
      setType(saved.type);
    }
  }, [storeInfo.slug]);

  // Mirrors the server rule. Without it a short phone makes the server-side
  // validator throw, and the mutation's onError shows a generic 'tente
  // novamente' — hiding the one thing the person needs to know.
  function localValidation(): string | null {
    if (phone.replace(/\D/g, "").length < 10) {
      return 'Informe um WhatsApp válido, com DDD.';
    }
    if (type === 'DELIVERY' && !street.trim()) {
      return 'Informe o endereço de entrega.';
    }
    return null;
  }

  // Fires when the CEP is complete. Aborts the previous request so a fast
  // typist does not have an earlier answer overwrite a later one.
  useEffect(() => {
    if (!isCompleteCep(cep)) {
      setCepStatus("idle");
      return;
    }
    const controller = new AbortController();
    setCepStatus("loading");
    lookupCep(cep, controller.signal).then((address) => {
      if (controller.signal.aborted) return;
      if (!address) {
        setCepStatus("notfound");
        return;
      }
      setCepStatus("idle");
      // Only fills what the lookup actually returned: some CEPs cover a whole
      // city and come back without a street, and blanking a line the person
      // already typed would be worse than leaving it alone.
      if (address.street) setStreet(address.street);
      if (address.neighborhood) setNeighborhood(address.neighborhood);
      if (address.city) setCity(address.city);
      if (address.state) setState(address.state);
    });
    return () => controller.abort();
  }, [cep]);

  const submit = useMutation({
    mutationFn: () =>
      submitCheckoutFn({
        data: {
          storeSlug: storeInfo.slug,
          items: lines.map((l) => ({
            productSlug: l.productSlug,
            sizeId: l.sizeId,
            optionIds: l.optionIds,
            secondProductSlug: l.secondProductSlug,
            extraIds: l.extras.map((e) => e.id),
            quantity: l.qty,
            note: l.note,
          })),
          customerName: name.trim(),
          customerPhone: phone,
          type,
          paymentMethod: paymentMethod as "PIX",
          couponCode: couponCode.trim() || undefined,
          customerNote: note.trim() || undefined,
          delivery:
            type === "DELIVERY"
              ? { street, number, complement, neighborhood, city, state, zipCode: normalizeCep(cep) }
              : undefined,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      // Saved only after the order is accepted, so a rejected attempt never
      // becomes the address suggested next time.
      saveCustomerDetails(storeInfo.slug, {
        name, phone, street, number, complement, neighborhood, city, state, cep, type, paymentMethod,
      });
      setPlaced({
        number: res.orderNumber,
        total: res.total,
        trackingToken: res.trackingToken,
      });
      clearCart();
    },
    onError: () => setError("Não foi possível enviar o pedido. Tente novamente."),
  });

  if (placed) {
    const href = storeInfo.whatsappHref(
      `Oi! Acabei de fazer o pedido #${placed.number} pelo site. Total: ${formatCurrency(placed.total)}.`,
    );
    return (
      <Overlay onClose={onClose}>
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
          <h2 className="mt-4 font-display text-2xl font-bold text-charcoal">
            Pedido enviado!
          </h2>
          <p className="mt-1 text-charcoal/60">
            Seu pedido <strong>#{placed.number}</strong> foi recebido e já está na cozinha.
          </p>
          <p className="mt-1 text-lg font-bold text-charcoal">
            {formatCurrency(placed.total)}
          </p>

          {/* O link so existe nesta tela: sem WhatsApp automatico, quem fechar a
              aba perde o acompanhamento. Por isso ele vem em destaque e com o
              aviso de guardar. */}
          {placed.trackingToken && (
            <div className="mt-5 rounded-xl border border-charcoal/12 p-4 text-left">
              <p className="text-sm font-semibold text-charcoal">Acompanhe seu pedido</p>
              <p className="mt-0.5 text-xs text-charcoal/55">
                Guarde este link: ele mostra em que etapa seu pedido está.
              </p>
              <Link
                to="/$storeSlug/acompanhar/$token"
                params={{ storeSlug: storeInfo.slug, token: placed.trackingToken }}
                className="mt-2 inline-block text-sm font-semibold text-tomato hover:underline"
              >
                Ver o andamento →
              </Link>
            </div>
          )}

          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-3 font-semibold text-white hover:bg-emerald-600"
          >
            <WhatsAppIcon className="size-5" />
            Acompanhar pelo WhatsApp
          </a>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 text-sm text-charcoal/50 hover:text-charcoal"
          >
            Fechar
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const invalid = localValidation();
          if (invalid) {
            setError(invalid);
            return;
          }
          setError(null);
          submit.mutate();
        }}
        className="space-y-4"
      >
        <h2 className="font-display text-2xl font-bold text-charcoal">Finalizar pedido</h2>

        <div className="flex gap-2">
          {storeInfo.acceptsDelivery && (
            <TypeButton active={type === "DELIVERY"} onClick={() => setType("DELIVERY")}>
              Entrega
            </TypeButton>
          )}
          {storeInfo.acceptsPickup && (
            <TypeButton active={type === "PICKUP"} onClick={() => setType("PICKUP")}>
              Retirada
            </TypeButton>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Seu nome">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base md:text-sm text-charcoal"
            />
          </Field>
          <Field label="WhatsApp">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="(11) 98765-4321"
              className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base md:text-sm text-charcoal"
            />
          </Field>
        </div>

        {type === "DELIVERY" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <Field label="CEP">
                <input
                  value={formatCep(cep)}
                  onChange={(e) => setCep(normalizeCep(e.target.value))}
                  inputMode="numeric"
                  placeholder="00000-000"
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base md:text-sm text-charcoal"
                />
                {cepStatus === "loading" && (
                  <span className="mt-1 block text-xs text-charcoal/50">Buscando endereço...</span>
                )}
                {cepStatus === "notfound" && (
                  <span className="mt-1 block text-xs text-tomato">
                    CEP não encontrado. Preencha o endereço manualmente.
                  </span>
                )}
              </Field>
            </div>
            <div className="sm:col-span-3" />
            <div className="sm:col-span-4">
              <Field label="Rua">
                <input
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  required
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base md:text-sm text-charcoal"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Número">
                <input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  required
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base md:text-sm text-charcoal"
                />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Complemento">
                <input
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base md:text-sm text-charcoal"
                />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Bairro">
                <input
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base md:text-sm text-charcoal"
                />
              </Field>
            </div>
            <div className="sm:col-span-5">
              <Field label="Cidade">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base md:text-sm text-charcoal"
                />
              </Field>
            </div>
            <div className="sm:col-span-1">
              <Field label="UF">
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                  maxLength={2}
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base md:text-sm uppercase text-charcoal"
                />
              </Field>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Forma de pagamento">
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2.5 text-base md:text-sm text-charcoal"
            >
              {payments.map((p) => (
                <option key={p} value={p}>
                  {PAYMENT_LABEL[p] ?? p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cupom (opcional)">
            <CampoDeCupom
              codigo={couponCode}
              onDigitar={(v) => {
                setCouponCode(v);
                // Editar invalida a resposta anterior, senão um "aplicado"
                // velho ficaria ao lado de um código que mudou.
                setCouponResult(null);
              }}
              onAplicar={checkCoupon}
              conferindo={checkingCoupon}
              resposta={couponResult}
            />
          </Field>
        </div>

        <Field label="Observação (opcional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Ex: tocar o interfone 45 ao chegar."
            className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base md:text-sm text-charcoal placeholder:text-charcoal/30"
          />
        </Field>

        {error && (
          <p className="rounded-xl border border-tomato/30 bg-tomato/5 px-4 py-3 text-sm text-tomato">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-4 border-t border-charcoal/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-charcoal/50">
              {couponResult?.ok ? "Com o desconto do cupom" : "Subtotal dos itens"}
            </p>
            <p className="font-display text-xl font-bold text-charcoal">
              {formatCurrency(subtotal - (couponResult?.ok ? couponResult.discount : 0))}
            </p>
            {couponResult?.ok && (
              <p className="text-xs text-charcoal/45 line-through">{formatCurrency(subtotal)}</p>
            )}
          </div>
          <Button
            type="submit"
            disabled={submit.isPending}
            className="h-auto w-full rounded-full bg-tomato px-8 py-4 text-base font-semibold text-[color:var(--on-primary)] hover:bg-tomato/90 sm:w-auto"
          >
            {submit.isPending ? "Enviando..." : "Confirmar pedido"}
          </Button>
        </div>
        <p className="text-center text-xs text-charcoal/45">
          A taxa de entrega e os descontos são calculados pela loja ao confirmar.
        </p>
      </form>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative max-h-[92dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-3xl bg-mozzarella p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-charcoal/40 hover:text-charcoal"
          aria-label="Fechar"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-charcoal">{label}</span>
      {children}
    </label>
  );
}

function TypeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
        active
          ? "border-tomato bg-tomato text-[color:var(--on-primary)]"
          : "border-charcoal/15 text-charcoal hover:border-tomato/40"
      }`}
    >
      {children}
    </button>
  );
}
