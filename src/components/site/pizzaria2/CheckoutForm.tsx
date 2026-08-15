import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { useCart } from "@/lib/pizzaria2/cart";
import { formatCurrency } from "@/lib/pizzaria2/menu";
import { whatsappLink } from "@/lib/pizzaria2/onboarding";
import { submitCheckoutFn } from "@/server/functions/storefront-checkout.fn";

const PAYMENT_LABEL: Record<string, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  CASH: "Dinheiro",
};

type StoreInfo = {
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  acceptedPaymentMethods: string[];
} | null;

export function CheckoutForm({
  storeInfo,
  businessPhone,
  onClose,
}: {
  storeInfo: StoreInfo;
  businessPhone: string;
  onClose: () => void;
}) {
  const { lines, subtotal, clearCart } = useCart();
  const [type, setType] = useState<"DELIVERY" | "PICKUP">(
    storeInfo?.acceptsDelivery === false ? "PICKUP" : "DELIVERY",
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [couponCode, setCouponCode] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ number: number; total: number } | null>(null);

  const payments = storeInfo?.acceptedPaymentMethods ?? ["PIX", "CREDIT_CARD", "DEBIT_CARD", "CASH"];

  const submit = useMutation({
    mutationFn: () =>
      submitCheckoutFn({
        data: {
          items: lines.map((l) => ({
            productSlug: l.productSlug,
            sizeKey: l.sizeKey,
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
              ? { street, number, complement, neighborhood, city }
              : undefined,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setPlaced({ number: res.orderNumber, total: res.total });
      clearCart();
    },
    onError: () => setError("Não foi possível enviar o pedido. Tente novamente."),
  });

  if (placed) {
    const href = whatsappLink(
      businessPhone,
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
          setError(null);
          submit.mutate();
        }}
        className="space-y-4"
      >
        <h2 className="font-display text-2xl font-bold text-charcoal">Finalizar pedido</h2>

        <div className="flex gap-2">
          {storeInfo?.acceptsDelivery !== false && (
            <TypeButton active={type === "DELIVERY"} onClick={() => setType("DELIVERY")}>
              Entrega
            </TypeButton>
          )}
          {storeInfo?.acceptsPickup !== false && (
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
              className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-sm text-charcoal"
            />
          </Field>
          <Field label="WhatsApp">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="(11) 98765-4321"
              className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-sm text-charcoal"
            />
          </Field>
        </div>

        {type === "DELIVERY" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div className="sm:col-span-4">
              <Field label="Rua">
                <input
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  required
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-sm text-charcoal"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Número">
                <input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  required
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-sm text-charcoal"
                />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Complemento">
                <input
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-sm text-charcoal"
                />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Bairro">
                <input
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-sm text-charcoal"
                />
              </Field>
            </div>
            <div className="sm:col-span-6">
              <Field label="Cidade">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-sm text-charcoal"
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
              className="w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2.5 text-sm text-charcoal"
            >
              {payments.map((p) => (
                <option key={p} value={p}>
                  {PAYMENT_LABEL[p] ?? p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cupom (opcional)">
            <input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="PIZZA10"
              className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-sm text-charcoal placeholder:text-charcoal/30"
            />
          </Field>
        </div>

        <Field label="Observação (opcional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Ex: tocar o interfone 45 ao chegar."
            className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-sm text-charcoal placeholder:text-charcoal/30"
          />
        </Field>

        {error && (
          <p className="rounded-xl border border-tomato/30 bg-tomato/5 px-4 py-3 text-sm text-tomato">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-charcoal/10 pt-4">
          <div>
            <p className="text-xs text-charcoal/50">Subtotal dos itens</p>
            <p className="font-display text-xl font-bold text-charcoal">
              {formatCurrency(subtotal)}
            </p>
          </div>
          <Button
            type="submit"
            disabled={submit.isPending}
            className="rounded-full bg-tomato px-8 py-6 text-base font-semibold text-mozzarella hover:bg-tomato/90"
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
      <div className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-mozzarella p-6">
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
          ? "border-tomato bg-tomato text-mozzarella"
          : "border-charcoal/15 text-charcoal hover:border-tomato/40"
      }`}
    >
      {children}
    </button>
  );
}
