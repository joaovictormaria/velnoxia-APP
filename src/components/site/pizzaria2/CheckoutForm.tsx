import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/pizzaria2/cart";
import { formatCurrency } from "@/lib/pizzaria2/menu";
import { CampoDeCupom } from "@/components/site/pizzaria2/CampoDeCupom";
import {
  CampoDeFuncionario,
  type RespostaDoFuncionario,
} from "@/components/site/pizzaria2/CampoDeFuncionario";
import { useStore } from "@/lib/pizzaria2/store-provider";
import { lerContextoDeMesa } from "@/lib/contexto-de-mesa";
import { submitCheckoutFn } from "@/server/functions/storefront-checkout.fn";
import { previewCouponFn } from "@/server/functions/coupons.fn";
import {
  employeePhoneHasBenefitFn,
  previewEmployeeBenefitFn,
} from "@/server/functions/employee-benefit.fn";
import { loadCustomerDetails, saveCustomerDetails } from "@/lib/pizzaria2/customer-details";
import { salvarPedidoEmAndamento } from "@/lib/pizzaria2/pedido-em-andamento";
import { formatCep, isCompleteCep, lookupCep, normalizeCep } from "@/lib/pizzaria2/cep-lookup";

const PAYMENT_LABEL: Record<string, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  CASH: "Dinheiro",
  PAYROLL: "Desconto em folha",
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
  const [tableId, setTableId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const isTableOrder = tableId !== null;
  /** null = not checked yet. The order service checks again when the order is
   *  placed; this only lets the customer see the discount before confirming. */
  const [couponResult, setCouponResult] = useState<
    { ok: true; code: string; discount: number } | { ok: false; error: string } | null
  >(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [employeePin, setEmployeePin] = useState("");
  const [employeeResult, setEmployeeResult] = useState<RespostaDoFuncionario>(null);
  const [checkingEmployee, setCheckingEmployee] = useState(false);
  /** O telefone digitado é de funcionário — o campo do PIN se abre sozinho. */
  const [employeeRecognized, setEmployeeRecognized] = useState(false);

  /*
   * ESTE PEDIDO É DE MESA OU É PÚBLICO?
   *
   * A resposta vem inteira do contexto desta loja. Antes vinha de três chaves
   * globais e perpétuas do `localStorage`, e quem tivesse escaneado uma mesa
   * qualquer, um dia, em qualquer loja, caía aqui como pedido de mesa: sem
   * opção de entrega, com o nome trocado por "Mesa N", e recusado no servidor
   * por um PIN que aquele pedido nunca deveria ter envolvido.
   *
   * `null` é vitrine pública — e é o que o módulo devolve para contexto de
   * outra loja, vencido, ou apenas legado.
   */
  useEffect(() => {
    const contexto = lerContextoDeMesa(storeInfo.slug);
    if (!contexto) return;

    setTableId(contexto.tableId);
    setTableNumber(contexto.tableNumber);
    setDeviceToken(contexto.deviceToken);
    // Pedido de mesa é sempre retirada: o cliente já está sentado nela.
    setType("PICKUP");
  }, [storeInfo.slug]);


  /*
   * Assim que o WhatsApp fica completo, o servidor diz se aquele número tem
   * benefício, e o campo do PIN aparece por conta própria.
   *
   * Existe porque o link discreto não bastava: o funcionário digitava o
   * telefone, não via nada, fechava o pedido por preço cheio e concluía que o
   * desconto não funcionava. Nada disto libera desconto — só revela o campo; o
   * PIN continua sendo o que vale.
   */
  useEffect(() => {
    const digitos = phone.replace(/\D/g, "");
    if (digitos.length < 10) {
      setEmployeeRecognized(false);
      return;
    }
    // Espera a digitação parar: sem isto sairia uma consulta por tecla.
    let vivo = true;
    const timer = setTimeout(async () => {
      try {
        const res = await employeePhoneHasBenefitFn({
          data: { storeSlug: storeInfo.slug, phone: digitos },
        });
        if (!vivo) return;
        setEmployeeRecognized(res.funcionario);
        if (res.funcionario) setEmployeeOpen(true);
      } catch {
        // Silêncio de propósito: é conveniência, e o link manual continua ali.
      }
    }, 600);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [phone, storeInfo.slug]);

  /**
   * Confere o PIN e já traz quanto o benefício tira deste carrinho.
   *
   * O servidor recalcula tudo ao confirmar o pedido; isto aqui só existe para a
   * pessoa ver o desconto e a cota antes de decidir.
   */
  async function checkEmployee() {
    if (employeePin.length < 4) return;
    if (phone.replace(/\D/g, "").length < 10) {
      setEmployeeResult({ ok: false, error: "Informe seu WhatsApp antes de conferir o PIN." });
      return;
    }
    setCheckingEmployee(true);
    try {
      const res = await previewEmployeeBenefitFn({
        data: {
          storeSlug: storeInfo.slug,
          phone,
          pin: employeePin,
          items: lines.map((l) => ({
            productSlug: l.productSlug,
            sizeId: l.sizeId,
            optionIds: l.optionIds,
            secondProductSlug: l.secondProductSlug,
            extraIds: l.extras.map((e) => e.id),
            quantity: l.qty,
          })),
        },
      });
      setEmployeeResult(res);
      // Um cupom junto seria recusado pelo servidor; tirar aqui evita o
      // pedido morrer no botão por causa de um código que a pessoa nem usou.
      if (res.ok && res.desconto > 0) {
        setCouponCode("");
        setCouponResult(null);
      }
    } catch {
      setEmployeeResult({ ok: false, error: "Não foi possível conferir agora." });
    } finally {
      setCheckingEmployee(false);
    }
  }

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

  /*
   * "Desconto em folha" não é forma de pagamento da loja: ela só aparece para
   * quem foi reconhecido e cujo plano a libera. Se não estivesse condicionada,
   * qualquer cliente escolheria não pagar.
   */
  const payments =
    employeeResult?.ok && employeeResult.permiteFolha
      ? [...storeInfo.acceptedPaymentMethods, "PAYROLL"]
      : storeInfo.acceptedPaymentMethods;

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

  /*
   * O desconto que a tela mostra. Os dois nunca somam — o servidor recusa o
   * cupom quando há benefício —, então mostrar a soma seria prometer um total
   * que o pedido não vai ter.
   */
  const descontoNaTela =
    employeeResult?.ok && employeeResult.desconto > 0
      ? employeeResult.desconto
      : couponResult?.ok
        ? couponResult.discount
        : 0;

  const submit = useMutation({
    mutationFn: () => {
      // Se for pedido via QRCode, usar "Mesa X" como nome
      const customerName = tableId && tableNumber ? `Mesa ${tableNumber}` : name.trim();

      return submitCheckoutFn({
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
          customerName,
          customerPhone: phone,
          type,
          paymentMethod: paymentMethod as "PIX",
          couponCode: couponCode.trim() || undefined,
          // Só vai quando a pessoa se declarou funcionária e o PIN passou na
          // conferência: um PIN meio digitado faria o pedido inteiro ser
          // recusado no servidor.
          employeePin: employeeResult?.ok ? employeePin : undefined,
          customerNote: note.trim() || undefined,
          tableId: tableId ?? undefined,
          deviceToken: deviceToken ?? undefined,
          delivery:
            type === "DELIVERY"
              ? { street, number, complement, neighborhood, city, state, zipCode: normalizeCep(cep) }
              : undefined,
        },
      });
    },
    onSuccess: (res) => {
      console.log("[Checkout] Response:", res);
      if (!res.ok) {
        console.error("[Checkout] Error:", res.error);
        setError(res.error);
        return;
      }
      setError(null);
      // NÃO limpar tableId aqui! A mesa fica aberta por 24h para novos pedidos.
      // tableId só é removido quando a mesa é finalizada (COMPLETED) pelo admin.

      // Saved only after the order is accepted, so a rejected attempt never
      // becomes the address suggested next time.
      saveCustomerDetails(storeInfo.slug, {
        name, phone, street, number, complement, neighborhood, city, state, cep, type, paymentMethod,
      });
      // Guarda o link no aparelho: o token só existe nesta resposta, e sem ele
      // quem fechasse a aba agora perderia o acompanhamento para sempre.
      if (res.trackingToken) {
        salvarPedidoEmAndamento(storeInfo.slug, {
          token: res.trackingToken,
          number: res.orderNumber,
        });
      }
      setPlaced({
        number: res.orderNumber,
        total: Number(res.total),
        trackingToken: res.trackingToken,
      });
      clearCart();
    },
    onError: (err) => {
      console.error("[Checkout] Mutation Error:", err);
      setError("Não foi possível enviar o pedido. Tente novamente.");
    },
  });

  if (placed) {
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

          {/*
            O ACOMPANHAMENTO É O BOTÃO PRINCIPAL — e não mais o WhatsApp.

            Os dois disputavam a mesma tela: o link do andamento vinha pequeno
            dentro de uma moldura, e o botão grande e verde levava para uma
            conversa. Quem acabou de fazer o pedido quer saber em que etapa ele
            está, e essa resposta mora aqui dentro — a conversa não a dá
            sozinha, alguém da loja precisa responder.

            A moldura ficou como explicação e o botão virou a ação, em vez de
            repetirem o mesmo destino em dois tamanhos. O aviso de guardar
            continua: o link só existe nesta tela, e quem fechar a aba sem
            salvá-lo perde o acompanhamento.
          */}
          {placed.trackingToken && (
            <>
              <div className="mt-5 rounded-xl border border-charcoal/12 p-4 text-left">
                <p className="text-sm font-semibold text-charcoal">Acompanhe seu pedido</p>
                <p className="mt-0.5 text-xs text-charcoal/55">
                  Guarde este link: ele mostra em que etapa seu pedido está.
                </p>
              </div>

              <Link
                to="/$storeSlug/acompanhar/$token"
                params={{ storeSlug: storeInfo.slug, token: placed.trackingToken }}
                /*
                  `--on-primary`, e não `text-white`: a vitrine é branca-label
                  e a cor primária é escolhida por loja. Um branco fixo some
                  em cima de uma cor clara.
                */
                className="mt-5 flex items-center justify-center gap-2 rounded-full bg-tomato px-6 py-3 font-semibold text-[color:var(--on-primary)] transition-colors hover:bg-tomato/90"
              >
                Ver o andamento →
              </Link>
            </>
          )}
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
          {storeInfo.acceptsDelivery && !isTableOrder && (
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
              onChange={(e) => {
                setPhone(e.target.value);
                // O reconhecimento foi feito para o número anterior. Trocar o
                // telefone sem derrubá-lo deixaria na tela um desconto que o
                // servidor recusaria na hora de confirmar.
                setEmployeeResult(null);
              }}
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

        <CampoDeFuncionario
          aberto={employeeOpen}
          reconhecido={employeeRecognized}
          onAbrir={() => setEmployeeOpen(true)}
          pin={employeePin}
          onDigitar={(v) => {
            setEmployeePin(v);
            setEmployeeResult(null);
            /*
             * Mexer no PIN derruba a conferência, e com ela o direito ao
             * desconto em folha. Sem devolver a forma de pagamento para uma
             * que a loja aceita, o pedido sairia com PAYROLL sem respaldo e
             * seria recusado no fim, sem a pessoa entender por quê.
             */
            if (paymentMethod === "PAYROLL") {
              setPaymentMethod(storeInfo.acceptedPaymentMethods[0] ?? "PIX");
            }
          }}
          onConferir={checkEmployee}
          conferindo={checkingEmployee}
          resposta={employeeResult}
        />

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
              {employeeResult?.ok && employeeResult.desconto > 0
                ? "Com o desconto de funcionário"
                : couponResult?.ok
                  ? "Com o desconto do cupom"
                  : "Subtotal dos itens"}
            </p>
            <p className="font-display text-xl font-bold text-charcoal">
              {formatCurrency(subtotal - descontoNaTela)}
            </p>
            {descontoNaTela > 0 && (
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
