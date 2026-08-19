import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";
import { ImageUploadField } from "@/components/admin/products/ImageUploadField";
import {
  formatCep,
  isCompleteCep,
  lookupCep,
} from "@/lib/pizzaria2/cep-lookup";
import {
  getBusinessTypeFn,
  getStoreSettingsFn,
  saveBusinessTypeFn,
  saveOpeningHoursFn,
  saveStoreSettingsFn,
} from "@/server/functions/settings.fn";
import { BUSINESS_TYPE_OPTIONS } from "@/server/catalog/starter-catalogs";

export const Route = createFileRoute("/admin/configuracoes/")({
  component: SettingsPage,
});

const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MONDAY: "Segunda",
  TUESDAY: "Terça",
  WEDNESDAY: "Quarta",
  THURSDAY: "Quinta",
  FRIDAY: "Sexta",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

const PAYMENT_METHODS = [
  { value: "PIX", label: "Pix" },
  { value: "CREDIT_CARD", label: "Cartão de crédito" },
  { value: "DEBIT_CARD", label: "Cartão de débito" },
  { value: "CASH", label: "Dinheiro" },
] as const;

type Draft = {
  storeName: string;
  tagline: string;
  description: string;
  heroSubtitle: string;
  logoUrl: string | null;
  primaryColor: string;
  colorMode: "SOLID" | "GRADIENT";
  secondaryColor: string;
  tertiaryColor: string;
  whatsappNumber: string;
  email: string;
  instagramUrl: string;
  facebookUrl: string;
  tiktokUrl: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  addressZipCode: string;
  deliveryFee: number;
  freeDeliveryMinOrder: number | null;
  minOrderValue: number;
  estimatedDeliveryMinMin: number;
  estimatedDeliveryMinMax: number;
  estimatedPickupMinMin: number;
  estimatedPickupMinMax: number;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  acceptedPaymentMethods: string[];
};

type HoursDraft = Record<
  Weekday,
  { isOpen: boolean; opensAt: string; closesAt: string }
>;

type TabId = "identidade" | "contato" | "endereco" | "entrega" | "horarios";

const TABS: { id: TabId; label: string }[] = [
  { id: "identidade", label: "Identidade" },
  { id: "contato", label: "Contato e redes" },
  { id: "endereco", label: "Endereço" },
  { id: "entrega", label: "Entrega e retirada" },
  { id: "horarios", label: "Horários" },
];

function SettingsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hours, setHours] = useState<HoursDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<TabId>("identidade");
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "notfound">("idle");
  const cepRequest = useRef<AbortController | null>(null);
  // O ramo vive noutra tabela e não entra no rascunho das configurações.
  const [businessType, setBusinessType] = useState<string | null>(null);

  // Sair da tela no meio de uma busca não deve deixar um retorno tardio
  // tentando escrever num formulário que já não existe.
  useEffect(() => () => cepRequest.current?.abort(), []);

  const { data, isPending } = useQuery({
    queryKey: ["store-settings"],
    queryFn: () => getStoreSettingsFn(),
  });

  const { data: ramoSalvo } = useQuery({
    queryKey: ["business-type"],
    queryFn: () => getBusinessTypeFn(),
  });

  useEffect(() => {
    if (ramoSalvo && businessType === null) setBusinessType(ramoSalvo);
  }, [ramoSalvo, businessType]);

  // Seed the editable copy once the server payload lands.
  useEffect(() => {
    if (!data || draft) return;
    setDraft({
      storeName: data.storeName,
      tagline: data.tagline ?? "",
      description: data.description ?? "",
      heroSubtitle: data.heroSubtitle ?? "",
      logoUrl: data.logoUrl,
      primaryColor: data.primaryColor,
      colorMode: data.colorMode === "SOLID" ? "SOLID" : "GRADIENT",
      secondaryColor: data.secondaryColor ?? "#F59E0B",
      tertiaryColor: data.tertiaryColor ?? "#7C3AED",
      whatsappNumber: data.whatsappNumber,
      email: data.email ?? "",
      instagramUrl: data.instagramUrl ?? "",
      facebookUrl: data.facebookUrl ?? "",
      tiktokUrl: data.tiktokUrl ?? "",
      addressStreet: data.addressStreet ?? "",
      addressNumber: data.addressNumber ?? "",
      addressComplement: data.addressComplement ?? "",
      addressNeighborhood: data.addressNeighborhood ?? "",
      addressCity: data.addressCity ?? "",
      addressState: data.addressState ?? "",
      addressZipCode: data.addressZipCode ?? "",
      deliveryFee: data.deliveryFee,
      freeDeliveryMinOrder: data.freeDeliveryMinOrder,
      minOrderValue: data.minOrderValue,
      estimatedDeliveryMinMin: data.estimatedDeliveryMinMin,
      estimatedDeliveryMinMax: data.estimatedDeliveryMinMax,
      estimatedPickupMinMin: data.estimatedPickupMinMin,
      estimatedPickupMinMax: data.estimatedPickupMinMax,
      acceptsDelivery: data.acceptsDelivery,
      acceptsPickup: data.acceptsPickup,
      acceptedPaymentMethods: data.acceptedPaymentMethods,
    });
    setHours(
      Object.fromEntries(
        WEEKDAYS.map((d) => {
          const row = data.openingHours.find((h) => h.weekday === d);
          return [
            d,
            {
              isOpen: row?.isOpen ?? true,
              opensAt: row?.opensAt ?? "18:00",
              closesAt: row?.closesAt ?? "23:30",
            },
          ];
        }),
      ) as HoursDraft,
    );
  }, [data, draft]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  /**
   * Busca o endereço quando o CEP fica completo.
   *
   * Disparado na digitação, e não num efeito sobre o valor: um efeito também
   * rodaria ao abrir a tela com um CEP já salvo, e reescreveria por cima do
   * endereço que o dono tinha ajustado à mão.
   */
  function handleCepChange(value: string) {
    const cep = formatCep(value);
    set("addressZipCode", cep);

    // A busca anterior perde a vez: quem digita rápido não pode receber a
    // resposta de um CEP que já não é o que está no campo.
    cepRequest.current?.abort();
    if (!isCompleteCep(cep)) {
      setCepStatus("idle");
      return;
    }

    const controller = new AbortController();
    cepRequest.current = controller;
    setCepStatus("loading");

    lookupCep(cep, controller.signal).then((address) => {
      if (controller.signal.aborted) return;
      if (!address) {
        setCepStatus("notfound");
        return;
      }
      setCepStatus("idle");
      setDraft((d) =>
        d
          ? {
              ...d,
              // Só o que o ViaCEP devolveu: CEP de cidade inteira vem sem rua,
              // e apagar uma linha já preenchida seria pior que deixá-la.
              addressStreet: address.street || d.addressStreet,
              addressNeighborhood: address.neighborhood || d.addressNeighborhood,
              addressCity: address.city || d.addressCity,
              addressState: address.state || d.addressState,
            }
          : d,
      );
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!draft || !hours) throw new Error("Formulário não carregado.");
      const settingsRes = await saveStoreSettingsFn({
        data: {
          ...draft,
          tagline: draft.tagline || null,
          secondaryColor:
            draft.colorMode === "GRADIENT" ? draft.secondaryColor : null,
          tertiaryColor:
            draft.colorMode === "GRADIENT" ? draft.tertiaryColor : null,
          description: draft.description || null,
          heroSubtitle: draft.heroSubtitle || null,
          email: draft.email || null,
          instagramUrl: draft.instagramUrl || null,
          facebookUrl: draft.facebookUrl || null,
          tiktokUrl: draft.tiktokUrl || null,
          addressStreet: draft.addressStreet || null,
          addressNumber: draft.addressNumber || null,
          addressComplement: draft.addressComplement || null,
          addressNeighborhood: draft.addressNeighborhood || null,
          addressCity: draft.addressCity || null,
          addressState: draft.addressState || null,
          addressZipCode: draft.addressZipCode || null,
          acceptedPaymentMethods: draft.acceptedPaymentMethods as "PIX"[],
        },
      });
      if (!settingsRes.ok) throw new Error(settingsRes.error);

      const hoursRes = await saveOpeningHoursFn({
        data: WEEKDAYS.map((d) => ({ weekday: d, ...hours[d] })),
      });
      if (!hoursRes.ok) throw new Error(hoursRes.error);

      // Só quando mudou de fato: é outra tabela, e uma escrita por salvamento
      // que não muda nada é ruído no banco.
      if (businessType && businessType !== ramoSalvo) {
        await saveBusinessTypeFn({ data: { businessType } });
      }
    },
    onSuccess: () => {
      setError(null);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["store-settings"] });
      queryClient.invalidateQueries({ queryKey: ["business-type"] });
      window.setTimeout(() => setSaved(false), 2500);
    },
    onError: (e: Error) => {
      setSaved(false);
      setError(e.message);
    },
  });

  if (isPending || !draft || !hours) {
    return (
      <p className="text-sm text-neutral-500">Carregando configurações...</p>
    );
  }

  const togglePayment = (value: string) =>
    set(
      "acceptedPaymentMethods",
      draft.acceptedPaymentMethods.includes(value)
        ? draft.acceptedPaymentMethods.filter((v) => v !== value)
        : [...draft.acceptedPaymentMethods, value],
    );

  return (
    <form
      className="space-y-6 pb-10"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Configurações</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Tudo aqui aparece direto no cardápio digital.
          </p>
        </div>
        <button
          type="submit"
          disabled={save.isPending}
          className="flex items-center gap-2 rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {saved && !save.isPending && <Check className="size-4" />}
          {save.isPending
            ? "Salvando..."
            : saved
              ? "Salvo"
              : "Salvar alterações"}
        </button>
      </header>

      <div className="flex flex-wrap gap-1 rounded-xl bg-neutral-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors " +
              (tab === t.id
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <Section
        active={tab === "identidade"}
        title="Identidade"
        description="Nome, logo e cor que o cliente vê no site."
      >
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <ImageUploadField
            kind="logo"
            label="Logo"
            value={draft.logoUrl}
            onChange={(url) => set("logoUrl", url)}
          />
          <div className="space-y-4">
            <Field label="Nome da loja">
              <Input
                value={draft.storeName}
                onChange={(v) => set("storeName", v)}
                required
              />
            </Field>
            <Field
              label="Ramo do seu negócio"
              hint="Define os textos e a capa do seu cardápio digital. Não mexe no que você já cadastrou: produtos, categorias e preços continuam como estão."
            >
              <select
                value={businessType ?? ""}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
              >
                {businessType === null && <option value="">Carregando...</option>}
                {BUSINESS_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Subtítulo"
              hint="Aparece abaixo do nome no topo. Ex.: Pizzaria"
            >
              <Input
                value={draft.tagline}
                onChange={(v) => set("tagline", v)}
              />
            </Field>
            <Field
              label="Frase do topo"
              hint="Aparece logo abaixo do título grande do cardápio. Ex.: Hambúrguer artesanal, pão fresquinho e ingredientes selecionados todos os dias. Deixe vazio para usar a frase padrão do seu ramo."
            >
              <textarea
                value={draft.heroSubtitle}
                onChange={(e) => set("heroSubtitle", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
            </Field>
            <Field
              label="Descrição"
              hint="Parágrafo curto exibido no rodapé do site."
            >
              <textarea
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
            </Field>
            <Field label="Cores do site">
              <div className="flex gap-2">
                {(["SOLID", "GRADIENT"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => set("colorMode", mode)}
                    className={
                      draft.colorMode === mode
                        ? "rounded-full bg-[#E11D2E] px-4 py-2 text-sm font-medium text-white"
                        : "rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
                    }
                  >
                    {mode === "SOLID" ? "Cor única" : "Degradê"}
                  </button>
                ))}
              </div>

              <div className="mt-3 space-y-2">
                <ColorRow
                  label={draft.colorMode === "SOLID" ? "Cor" : "Cor 1"}
                  value={draft.primaryColor}
                  onChange={(v) => set("primaryColor", v)}
                />
                {draft.colorMode === "GRADIENT" && (
                  <>
                    <ColorRow
                      label="Cor 2"
                      value={draft.secondaryColor}
                      onChange={(v) => set("secondaryColor", v)}
                    />
                    <ColorRow
                      label="Cor 3"
                      value={draft.tertiaryColor}
                      onChange={(v) => set("tertiaryColor", v)}
                    />
                  </>
                )}
              </div>

              {/* Shows the real thing rather than three swatches: the point of a
                  gradient is how the colours meet, which separate chips hide. */}
              <div
                className="mt-3 h-16 rounded-xl border border-neutral-200"
                style={{
                  background:
                    draft.colorMode === "SOLID"
                      ? draft.primaryColor
                      : `linear-gradient(135deg, ${draft.primaryColor}, ${draft.secondaryColor}, ${draft.tertiaryColor})`,
                }}
              />
              <p className="mt-1 text-xs text-neutral-500">
                O texto do site escurece ou clareia sozinho para continuar
                legível sobre as cores escolhidas.
              </p>
            </Field>
          </div>
        </div>
      </Section>

      <Section
        active={tab === "contato"}
        title="Contato e redes"
        description="Deixe em branco o que não quiser exibir."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp" hint="Usado nos botões de pedido do site.">
            <Input
              value={draft.whatsappNumber}
              onChange={(v) => set("whatsappNumber", v)}
              placeholder="(11) 99999-9999"
              required
            />
          </Field>
          <Field label="E-mail">
            <Input
              value={draft.email}
              onChange={(v) => set("email", v)}
              type="email"
            />
          </Field>
          <Field label="Instagram">
            <Input
              value={draft.instagramUrl}
              onChange={(v) => set("instagramUrl", v)}
              placeholder="https://instagram.com/sualoja"
            />
          </Field>
          <Field label="Facebook">
            <Input
              value={draft.facebookUrl}
              onChange={(v) => set("facebookUrl", v)}
              placeholder="https://facebook.com/sualoja"
            />
          </Field>
          <Field label="TikTok">
            <Input
              value={draft.tiktokUrl}
              onChange={(v) => set("tiktokUrl", v)}
              placeholder="https://tiktok.com/@sualoja"
            />
          </Field>
        </div>
      </Section>

      <Section
        active={tab === "endereco"}
        title="Endereço"
        description="Exibido no rodapé com link para o mapa."
      >
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <Field
              label="CEP"
              hint={
                cepStatus === "loading"
                  ? "Buscando endereço..."
                  : cepStatus === "notfound"
                    ? "CEP não encontrado. Preencha à mão."
                    : "Preenche rua, bairro, cidade e UF."
              }
            >
              <Input
                value={draft.addressZipCode}
                onChange={handleCepChange}
                inputMode="numeric"
                placeholder="00000-000"
              />
            </Field>
          </div>
          <div className="sm:col-span-4">
            <Field label="Rua">
              <Input
                value={draft.addressStreet}
                onChange={(v) => set("addressStreet", v)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Número">
              <Input
                value={draft.addressNumber}
                onChange={(v) => set("addressNumber", v)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Complemento">
              <Input
                value={draft.addressComplement}
                onChange={(v) => set("addressComplement", v)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Bairro">
              <Input
                value={draft.addressNeighborhood}
                onChange={(v) => set("addressNeighborhood", v)}
              />
            </Field>
          </div>
          <div className="sm:col-span-4">
            <Field label="Cidade">
              <Input
                value={draft.addressCity}
                onChange={(v) => set("addressCity", v)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="UF">
              <Input
                value={draft.addressState}
                onChange={(v) => set("addressState", v)}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        active={tab === "entrega"}
        title="Entrega e retirada"
        description="Controla o que o checkout oferece."
      >
        <div className="flex flex-wrap gap-6">
          <Toggle
            label="Aceita entrega"
            checked={draft.acceptsDelivery}
            onChange={(v) => set("acceptsDelivery", v)}
          />
          <Toggle
            label="Aceita retirada"
            checked={draft.acceptsPickup}
            onChange={(v) => set("acceptsPickup", v)}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Taxa de entrega (R$)">
            <NumberInput
              value={draft.deliveryFee}
              onChange={(v) => set("deliveryFee", v)}
              step={0.5}
            />
          </Field>
          <Field label="Pedido mínimo (R$)">
            <NumberInput
              value={draft.minOrderValue}
              onChange={(v) => set("minOrderValue", v)}
              step={0.5}
            />
          </Field>
          <Field
            label="Frete grátis a partir de (R$)"
            hint="Deixe vazio para não oferecer."
          >
            <input
              type="number"
              min={0}
              step={0.5}
              value={draft.freeDeliveryMinOrder ?? ""}
              onChange={(e) =>
                set(
                  "freeDeliveryMinOrder",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            />
          </Field>
          <Field label="Entrega: mínimo (min)">
            <NumberInput
              value={draft.estimatedDeliveryMinMin}
              onChange={(v) => set("estimatedDeliveryMinMin", v)}
            />
          </Field>
          <Field label="Entrega: máximo (min)">
            <NumberInput
              value={draft.estimatedDeliveryMinMax}
              onChange={(v) => set("estimatedDeliveryMinMax", v)}
            />
          </Field>
          <div />
          <Field label="Retirada: mínimo (min)">
            <NumberInput
              value={draft.estimatedPickupMinMin}
              onChange={(v) => set("estimatedPickupMinMin", v)}
            />
          </Field>
          <Field label="Retirada: máximo (min)">
            <NumberInput
              value={draft.estimatedPickupMinMax}
              onChange={(v) => set("estimatedPickupMinMax", v)}
            />
          </Field>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-neutral-900">
            Formas de pagamento aceitas
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => {
              const active = draft.acceptedPaymentMethods.includes(m.value);
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => togglePayment(m.value)}
                  className={
                    active
                      ? "rounded-full bg-[#E11D2E] px-4 py-2 text-sm font-medium text-white"
                      : "rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
                  }
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      <Section
        active={tab === "horarios"}
        title="Horários de funcionamento"
        description="Exibidos no rodapé do cardápio."
      >
        <div className="space-y-2">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3"
            >
              <span className="w-24 text-sm font-medium text-neutral-900">
                {WEEKDAY_LABEL[d]}
              </span>
              <Toggle
                label={hours[d].isOpen ? "Aberto" : "Fechado"}
                checked={hours[d].isOpen}
                onChange={(v) =>
                  setHours((h) =>
                    h ? { ...h, [d]: { ...h[d], isOpen: v } } : h,
                  )
                }
              />
              <input
                type="time"
                value={hours[d].opensAt}
                disabled={!hours[d].isOpen}
                onChange={(e) =>
                  setHours((h) =>
                    h ? { ...h, [d]: { ...h[d], opensAt: e.target.value } } : h,
                  )
                }
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900 disabled:opacity-40"
              />
              <span className="text-sm text-neutral-400">às</span>
              <input
                type="time"
                value={hours[d].closesAt}
                disabled={!hours[d].isOpen}
                onChange={(e) =>
                  setHours((h) =>
                    h
                      ? { ...h, [d]: { ...h[d], closesAt: e.target.value } }
                      : h,
                  )
                }
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900 disabled:opacity-40"
              />
            </div>
          ))}
        </div>
      </Section>
    </form>
  );
}

function Section({
  title,
  description,
  active,
  children,
}: {
  title: string;
  description?: string;
  active: boolean;
  children: ReactNode;
}) {
  // The form is controlled — the values live in state, not in the DOM — so a
  // hidden section keeps everything the owner typed in it.
  if (!active) return null;
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      {description && (
        <p className="mt-0.5 text-sm text-neutral-500">{description}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-neutral-900">{label}</span>
      {children}
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

function Input({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
    />
  );
}

function NumberInput({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      min={0}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
    />
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[#E11D2E]"
      />
      <span className="text-sm text-neutral-700">{label}</span>
    </label>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-neutral-300"
        aria-label={label}
      />
      <span className="w-12 shrink-0 text-xs text-neutral-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm text-neutral-900"
      />
    </div>
  );
}
