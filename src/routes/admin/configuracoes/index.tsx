import { createFileRoute, useRouteContext, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, Lock, X } from "lucide-react";
import { ImageUploadField } from "@/components/admin/products/ImageUploadField";
import { PreviaDaVitrine } from "@/components/admin/preview/PreviaDaVitrine";
import { Header } from "@/components/site/pizzaria2/Header";
import { HeroDaVitrine } from "@/components/site/pizzaria2/HeroDaVitrine";
import { SobreORestaurante } from "@/components/site/pizzaria2/SobreORestaurante";
import {
  aplicarRascunhoDaLoja,
  aplicarRascunhoDoSobre,
} from "@/lib/previa/aplicar-rascunho";
/* As MESMAS de sempre — a edição do "Sobre" mudou de tela, não de porta. */
import { getAboutFn, saveAboutFn } from "@/server/functions/posts.fn";
import {
  formatCep,
  isCompleteCep,
  lookupCep,
} from "@/lib/pizzaria2/cep-lookup";
import {
  getBusinessTypeFn,
  getControleDeEstoqueFn,
  getStoreSettingsFn,
  salvarControleDeEstoqueFn,
  saveBusinessTypeFn,
  saveOpeningHoursFn,
  saveStoreSettingsFn,
} from "@/server/functions/settings.fn";
import { BUSINESS_TYPE_OPTIONS } from "@/server/catalog/starter-catalogs";
import { recursoNoEstado } from "@/lib/planos/resolucao";

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

type TabId =
  | "identidade"
  | "sobre"
  | "contato"
  | "endereco"
  | "entrega"
  | "horarios"
  | "estoque";

const TABS: { id: TabId; label: string }[] = [
  { id: "identidade", label: "Identidade" },
  /*
    "NOSSO RESTAURANTE" MUDOU DE CASA — de Avaliações para cá.

    Ele edita `StoreSettings.about*`: a mesma natureza de nome, logo e horário
    — a apresentação da loja, não campanha de marketing. Enquanto morava na
    tela de Avaliações, que virou paga, a loja BASIC ficava sem como escrever a
    própria história, tendo CONFIGURACOES no plano.
  */
  { id: "sobre", label: "Nosso restaurante" },
  { id: "contato", label: "Contato e redes" },
  { id: "endereco", label: "Endereço" },
  { id: "entrega", label: "Entrega e retirada" },
  { id: "horarios", label: "Horários" },
  { id: "estoque", label: "Estoque" },
];

function SettingsPage() {
  // A loja vem da moldura do painel, que é quem tem a sessão.
  const { admin } = useRouteContext({ from: "/admin" });

  /*
    A MESMA PERGUNTA QUE O SERVIDOR FAZ, e não uma segunda regra.

    `recursoNoEstado` é a função que a guarda de rota, o cadeado do menu, as
    abas do estoque e `entregaLiberadaNoPlano` usam. Escrever aqui um
    `plano === "BASIC"` criaria a quinta versão da mesma regra — e a primeira
    a divergir no dia em que a matriz comercial mudar.

    ⚠️ ISTO É CORTESIA, NÃO PROTEÇÃO. Quem recusa gravar taxa e prazo numa loja
    sem entrega é `saveStoreSettingsFn`; quem recusa o pedido é `order-service`.
    Esta linha só evita que a tela ofereça o que não vai valer.
  */
  /*
    Sem sessão carregada, NÃO tranca. É a mesma escolha do `INDEFINIDO`: na
    dúvida a tela deixa passar, porque quem recusa de verdade é o servidor —
    e trancar por não saber transformaria um carregamento em cadeado.
  */
  const entregaTrancada = admin
    ? recursoNoEstado(admin.store.plano, "DELIVERY_BASICO") === "BLOQUEADO"
    : false;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hours, setHours] = useState<HoursDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<TabId>("identidade");
  /**
   * Onde a prévia deve olhar. Muda quando um campo recebe o cursor, e fica
   * assim até outro receber — voltar ao geral a cada saída de campo faria a
   * prévia pular o tempo todo enquanto a lojista escreve.
   */
  const [foco, setFoco] = useState<string | null>(null);
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
      deliveryFee: Number(data.deliveryFee) || 0,
      freeDeliveryMinOrder: data.freeDeliveryMinOrder ? Number(data.freeDeliveryMinOrder) : null,
      minOrderValue: Number(data.minOrderValue) || 0,
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
      const settings = settingsRes as any;
      if (!settings.ok) throw new Error(settings.error);

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

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-neutral-100 p-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              "shrink-0 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-colors " +
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
            className="-m-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg"
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
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Topo à direita, como nas outras telas. Aqui é onde a prévia mais
              rende: a cor é escolhida por um código hexadecimal, e sem ver o
              resultado a lojista salva, abre a loja, volta e corrige. */}
          {admin && (
            <div className="hidden lg:col-span-2 lg:col-start-4 lg:row-span-2 lg:row-start-1 lg:block">
              <PreviaDaVitrine
                storeSlug={admin.store.slug}
                foco={foco}
                aplicarLoja={(loja) =>
                  aplicarRascunhoDaLoja(loja, {
                    storeName: draft.storeName,
                    tagline: draft.tagline,
                    heroSubtitle: draft.heroSubtitle,
                    description: draft.description,
                    logoUrl: draft.logoUrl,
                    primaryColor: draft.primaryColor,
                    colorMode: draft.colorMode,
                    secondaryColor: draft.secondaryColor,
                    tertiaryColor: draft.tertiaryColor,
                  })
                }
              >
                {/* A mesma montagem da loja: cabeçalho e, abaixo, o conteúdo
                    com o espaço dele reservado.
                    O pt-16.75 não é enfeite. O cabeçalho sai do fluxo, e o hero
                    começa com margem negativa para subir por baixo dele — sem o
                    espaço reservado, tudo sobe e o cabeçalho fica acima da
                    origem da rolagem, num lugar aonde não há como chegar. */}
                <Header />
                <div className="pt-16.75">
                  <HeroDaVitrine />
                </div>
              </PreviaDaVitrine>
            </div>
          )}

          <div className="lg:col-span-1" onFocusCapture={() => setFoco("logo")}>
            <ImageUploadField
              kind="logo"
              label="Logo"
              value={draft.logoUrl}
              onChange={(url) => set("logoUrl", url)}
            />
          </div>
          <div className="space-y-4 lg:col-span-2">
            <Field label="Nome da loja">
              <Input
                onFocus={() => setFoco("nome-da-loja")}
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
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base md:text-sm text-neutral-900"
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
                onFocus={() => setFoco("subtitulo")}
                value={draft.tagline}
                onChange={(v) => set("tagline", v)}
              />
            </Field>
            <Field
              label="Frase do topo"
              hint="Aparece logo abaixo do título grande do cardápio. Ex.: Hambúrguer artesanal, pão fresquinho e ingredientes selecionados todos os dias. Deixe vazio para usar a frase padrão do seu ramo."
            >
              <textarea
                onFocus={() => setFoco("frase-do-topo")}
                value={draft.heroSubtitle}
                onChange={(e) => set("heroSubtitle", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900"
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
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900"
              />
            </Field>
            <Field label="Cores do site">
              <div className="flex gap-2" onFocusCapture={() => setFoco("cores")}>
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
        {/*
          A ABA NÃO É TODA PAGA, e por isso o cadeado desce para o bloco.

          Retirada, pedido mínimo e formas de pagamento são do BASIC — trancar
          a aba inteira tiraria da loja configurações que ela tem direito de
          mexer. O que é exclusivo da entrega fica reunido no bloco abaixo,
          separado do resto justamente para poder ser trancado sozinho.

          Mesma escolha do menu, das abas do estoque e dos cards de relatório:
          o bloqueado continua VISÍVEL. Escondê-lo faria a loja nunca descobrir
          que a entrega existe — e é ela que dá motivo para assinar.
        */}
        <div className="flex flex-wrap gap-6">
          <Toggle
            label="Aceita retirada"
            checked={draft.acceptsPickup}
            onChange={(v) => set("acceptsPickup", v)}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Pedido mínimo (R$)" hint="Vale para entrega e retirada.">
            <NumberInput
              value={draft.minOrderValue}
              onChange={(v) => set("minOrderValue", v)}
              step={0.5}
            />
          </Field>
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

        <div
          className={`mt-6 rounded-xl border p-4 ${
            entregaTrancada
              ? "border-neutral-200 bg-neutral-50"
              : "border-neutral-200"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                {entregaTrancada && (
                  <Lock className="size-3.5 text-neutral-400" aria-hidden="true" />
                )}
                Entrega
              </p>
              <p className="mt-0.5 text-xs leading-snug text-neutral-500">
                {entregaTrancada
                  ? "Seu plano atual vende por retirada e balcão. Com o Premium a loja passa a receber pedidos com endereço, taxa e prazo."
                  : "Taxa, frete grátis e prazo do pedido com endereço."}
              </p>
            </div>
            {entregaTrancada && (
              <Link
                to="/admin/assinatura"
                className="shrink-0 rounded-lg bg-[#E11D2E] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#c4172a] motion-reduce:transition-none"
              >
                Conhecer o Premium
              </Link>
            )}
          </div>

          {/*
            OS CAMPOS CONTINUAM NA TELA, desabilitados e com os valores reais.
            Uma loja que caiu de Premium para BASIC vê a configuração que tinha
            — e sabe que ela volta inteira se reassinar. O servidor descarta
            qualquer escrita neles enquanto o plano não permitir.
          */}
          <div className="mt-4 flex flex-wrap gap-6">
            <Toggle
              label="Aceita entrega"
              checked={draft.acceptsDelivery && !entregaTrancada}
              onChange={(v) => set("acceptsDelivery", v)}
              disabled={entregaTrancada}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Taxa de entrega (R$)">
              <NumberInput
                value={draft.deliveryFee}
                onChange={(v) => set("deliveryFee", v)}
                step={0.5}
                disabled={entregaTrancada}
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
                disabled={entregaTrancada}
                value={draft.freeDeliveryMinOrder ?? ""}
                onChange={(e) =>
                  set(
                    "freeDeliveryMinOrder",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
              />
            </Field>
            <div />
            <Field label="Entrega: mínimo (min)">
              <NumberInput
                value={draft.estimatedDeliveryMinMin}
                onChange={(v) => set("estimatedDeliveryMinMin", v)}
                disabled={entregaTrancada}
              />
            </Field>
            <Field label="Entrega: máximo (min)">
              <NumberInput
                value={draft.estimatedDeliveryMinMax}
                onChange={(v) => set("estimatedDeliveryMinMax", v)}
                disabled={entregaTrancada}
              />
            </Field>
          </div>
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
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 rounded-xl border border-neutral-200 px-4 py-3 sm:flex sm:flex-wrap"
            >
              <span className="text-sm font-medium text-neutral-900 sm:w-24">
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
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-base md:text-sm text-neutral-900 disabled:opacity-40"
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
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-base md:text-sm text-neutral-900 disabled:opacity-40"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        active={tab === "sobre"}
        title="Nosso restaurante"
        description="A seção que conta a história da loja na sua página."
      >
        <EdicaoDoSobre />
      </Section>

      <Section
        active={tab === "estoque"}
        title="Controle de estoque"
        description="Decide se o cardápio precisa dizer de onde sai o que vende."
      >
        <ControleDeEstoque />
      </Section>
    </form>
  );
}

/**
 * A edição de "Nosso restaurante" — o MESMO componente de antes, mudado de tela.
 *
 * NENHUMA SERVER FUNCTION NOVA: continua chamando `getAboutFn` e `saveAboutFn`,
 * que seguem exigindo CONFIGURACOES. O que mudou foi só onde a tela mora — de
 * `/admin/avaliacoes`, que virou paga, para cá, que o BASIC tem.
 *
 * FORA DO `draft` DA PÁGINA, pelo mesmo motivo de `ControleDeEstoque`: aquele
 * formulário salva a loja inteira num POST só, e este bloco tem consulta e
 * gravação próprias.
 *
 * E NÃO É UM `<form>`: as seções desta página já vivem dentro de um, e
 * formulário aninhado é HTML inválido. O botão grava no clique.
 */
function EdicaoDoSobre() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["about"],
    queryFn: () => getAboutFn(),
  });
  const { admin } = useRouteContext({ from: "/admin" });
  const [foco, setFoco] = useState<string | null>(null);
  const [form, setForm] = useState({
    aboutEyebrow: "",
    aboutTitle: "",
    aboutBody: "",
    aboutImageUrl: null as string | null,
  });
  const [saved, setSaved] = useState(false);

  // A consulta responde depois do primeiro render, então o formulário se
  // preenche por efeito em vez de por um valor inicial que estaria sempre vazio.
  useEffect(() => {
    if (!data) return;
    setForm({
      aboutEyebrow: data.aboutEyebrow ?? "",
      aboutTitle: data.aboutTitle ?? "",
      aboutBody: data.aboutBody ?? "",
      aboutImageUrl: data.aboutImageUrl,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveAboutFn({
        data: {
          aboutEyebrow: form.aboutEyebrow,
          aboutTitle: form.aboutTitle,
          aboutBody: form.aboutBody,
          aboutImageUrl: form.aboutImageUrl,
        },
      }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["about"] });
      window.setTimeout(() => setSaved(false), 2500);
    },
  });

  if (isPending) return <p className="text-sm text-neutral-500">Carregando...</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* Prévia no topo à direita, como nas outras telas: quem escreve o texto
          aqui não faz ideia de como ele vai cair ao lado da foto. */}
      {admin && (
        <div className="hidden lg:col-span-2 lg:col-start-4 lg:row-span-3 lg:row-start-1 lg:block">
          <PreviaDaVitrine
            storeSlug={admin.store.slug}
            foco={foco}
            largura={900}
            aplicarLoja={(loja) => aplicarRascunhoDoSobre(loja, form)}
          >
            <div className="bg-mozzarella p-8">
              <SobreORestaurante />
            </div>
          </PreviaDaVitrine>
        </div>
      )}

      <p className="text-sm text-neutral-500 lg:col-span-3">
        Deixe qualquer campo vazio para usar o texto padrão do seu ramo.
      </p>

      <div
        className="grid gap-4 sm:grid-cols-[200px_1fr] lg:col-span-3"
        onFocusCapture={() => setFoco("foto-do-sobre")}
      >
        <ImageUploadField
          kind="product"
          label="Foto do restaurante"
          value={form.aboutImageUrl}
          onChange={(url) => setForm({ ...form, aboutImageUrl: url })}
        />
        <div className="space-y-4">
          <Field label="Chamada" hint="Linha pequena acima do título.">
            <Input
              onFocus={() => setFoco("chamada-do-sobre")}
              value={form.aboutEyebrow}
              onChange={(v) => setForm({ ...form, aboutEyebrow: v })}
              placeholder="Nosso restaurante"
            />
          </Field>
          <Field label="Título">
            <Input
              onFocus={() => setFoco("titulo-do-sobre")}
              value={form.aboutTitle}
              onChange={(v) => setForm({ ...form, aboutTitle: v })}
              placeholder="Feito com paixão, servido com carinho."
            />
          </Field>
        </div>
      </div>

      <div className="lg:col-span-3">
        <Field label="Texto" hint="Conte a história da sua loja em um parágrafo.">
          <textarea
            onFocus={() => setFoco("texto-do-sobre")}
            value={form.aboutBody}
            onChange={(e) => setForm({ ...form, aboutBody: e.target.value })}
            rows={5}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 lg:col-span-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
        >
          {save.isPending ? "Salvando..." : "Salvar"}
        </button>
        {saved && <span className="text-sm text-green-600">Salvo.</span>}
      </div>
    </div>
  );
}

/**
 * O interruptor do controle de estoque, com a lista do que impede ligá-lo.
 *
 * COMPONENTE SEPARADO, e fora do `draft` da página. Aquele formulário salva a
 * loja inteira num POST só; este campo pode ser RECUSADO sozinho, e uma recusa
 * dele não pode derrubar junto o nome, o endereço e o horário que a pessoa
 * acabou de digitar.
 *
 * A TELA NÃO É A AUTORIDADE. Ela mostra as pendências para o dono saber o que
 * corrigir, mas quem recusa é `salvarControleDeEstoqueFn`: mesmo que esta
 * lista chegue vazia por estar velha, o servidor confere de novo antes de
 * gravar.
 */
function ControleDeEstoque() {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  const estado = useQuery({
    queryKey: ["controle-de-estoque"],
    queryFn: () => getControleDeEstoqueFn(),
  });

  const salvar = useMutation({
    mutationFn: (ativo: boolean) =>
      salvarControleDeEstoqueFn({ data: { ativo } }),
    onSuccess: async (r: any) => {
      /*
       * O DESFECHO AQUI, O MOTIVO NO BLOCO DE BAIXO.
       *
       * A recusa do servidor vem com o texto longo — "alguns produtos ainda não
       * têm ficha técnica nem item de estoque vinculado..." — e mostrá-lo aqui
       * dizia em vermelho exatamente o que o bloco de pendências logo abaixo já
       * diz, com a lista dos produtos junto. Duas mensagens, o mesmo fato, uma
       * delas pintada de alarme: o dono lia como se duas coisas tivessem dado
       * errado, quando a recusa é o comportamento correto.
       *
       * Só a mensagem encolhe. A regra, a recusa e o texto do servidor seguem
       * intactos — quem chamar a server function direto continua recebendo a
       * explicação completa.
       */
      setErro(
        r?.ok
          ? null
          : r?.pendentes?.length
            ? "Não foi possível ligar o controle de estoque."
            : (r?.error ?? "Não foi possível salvar."),
      );
      await queryClient.invalidateQueries({ queryKey: ["controle-de-estoque"] });
      /*
       * DESCONGELA A LISTA. Sem isto, `salvar.data.ok === false` continuava
       * verdadeiro para sempre — o `useMutation` guarda o último resultado — e
       * as pendências passavam a vir da mutação em vez da consulta. Corrigir um
       * produto e voltar sem trocar de aba mostrava a lista velha.
       *
       * Depois do `await` acima a consulta já foi refeita, então zerar aqui faz
       * a lista voltar para a fonte atual, e não para uma vazia.
       */
      salvar.reset();
    },
    onError: (e: Error) => setErro(e.message),
  });

  if (estado.isPending || !estado.data) {
    return <p className="text-sm text-neutral-500">Carregando...</p>;
  }

  const ativo = estado.data.ativo;
  /*
   * SEMPRE DA CONSULTA, e nunca do último resultado da mutação.
   *
   * A lista vinha da mutação quando a recusa era a mais recente, para não
   * exibir uma consulta envelhecida. Mas `salvar.data` não envelhece nunca — o
   * `useMutation` o guarda indefinidamente — então a "mais recente" virava a
   * eterna, e as pendências congelavam na foto do clique.
   *
   * O `invalidateQueries` do `onSuccess` é aguardado antes do `reset`, então a
   * consulta aqui já está atualizada quando esta linha roda.
   */
  const pendentes = estado.data.pendentes;

  return (
    <div className="space-y-5">
      <Toggle
        label={ativo ? "Controle de estoque ativado" : "Controle de estoque desativado"}
        checked={ativo}
        onChange={(v) => {
          setErro(null);
          salvar.mutate(v);
        }}
      />

      <p className="text-sm text-neutral-500">
        {ativo
          ? "Produtos que participam do controle precisam ter uma ficha técnica com pelo menos um ingrediente ou um item de estoque vinculado."
          : "Com o controle desativado, o cadastro de produtos segue sem exigir ficha técnica nem vínculo com o estoque."}
      </p>

      {salvar.isPending && (
        <p className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="size-4 animate-spin" /> Salvando...
        </p>
      )}

      {erro && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro}
        </p>
      )}

      {/*
        DUAS LEITURAS DA MESMA LISTA, e a diferença não é cosmética.

        Com o controle LIGADO, um produto sem origem é uma pendência real: ele
        está no cardápio e não desce saldo. Alarme âmbar, lista aberta.

        Com o controle DESLIGADO, não há nada errado — a loja simplesmente não
        usa estoque. O texto anterior dizia "N produtos ainda precisam ser
        configurados" mesmo assim, e numa loja que nunca vai ligar o controle
        isso era um alarme permanente sobre um problema que não existe. Aqui
        vira o que de fato é: o pré-requisito, recolhido, para quem quiser ver.
      */}
      {pendentes.length > 0 &&
        (ativo ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              {pendentes.length === 1
                ? "1 produto ainda precisa ser configurado:"
                : `${pendentes.length} produtos ainda precisam ser configurados:`}
            </p>
            <ListaDePendentes pendentes={pendentes} />
            <p className="mt-3 text-xs text-amber-700">
              Cadastre uma receita, vincule um item de estoque ou desmarque
              &ldquo;Participa do controle de estoque&rdquo; em cada um deles.
            </p>
          </div>
        ) : (
          <details
            /*
             * Aberto quando a ativação acabou de ser recusada: o desfecho acima
             * diz que não deu, e o motivo tem de estar à vista sem exigir um
             * segundo clique justamente no momento em que ele é procurado.
             * Fechado no resto do tempo, que é o comportamento da UX-3.
             */
            open={Boolean(erro)}
            className="rounded-xl border border-neutral-200 bg-neutral-50 p-4"
          >
            <summary className="cursor-pointer text-sm text-neutral-700 marker:text-neutral-400">
              Para ligar o controle de estoque,{" "}
              {pendentes.length === 1
                ? "1 produto precisará"
                : `${pendentes.length} produtos precisarão`}{" "}
              de receita ou item de estoque.{" "}
              <span className="underline underline-offset-2">Ver quais</span>
            </summary>
            <ListaDePendentes pendentes={pendentes} />
          </details>
        ))}
    </div>
  );
}

/** Os produtos pendentes, cada um linkado para a própria tela de edição. */
function ListaDePendentes({
  pendentes,
}: {
  pendentes: { id: string; name: string }[];
}) {
  return (
    <ul className="mt-2 space-y-1">
      {pendentes.map((p) => (
        <li key={p.id} className="text-sm text-neutral-700">
          <Link
            to="/admin/cardapio/$productId"
            params={{ productId: p.id }}
            className="underline underline-offset-2 hover:text-neutral-950"
          >
            {p.name}
          </Link>
        </li>
      ))}
    </ul>
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
      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900"
    />
  );
}

function NumberInput({
  value,
  onChange,
  step = 1,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      min={0}
      step={step}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
    />
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`inline-flex items-center gap-2 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
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
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-base md:text-sm text-neutral-900"
      />
    </div>
  );
}
