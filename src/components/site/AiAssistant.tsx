import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Beef,
  Check,
  Coffee,
  Flame,
  IceCream2,
  Leaf,
  Lock,
  Mail,
  MoreHorizontal,
  Phone,
  Pizza,
  Soup,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const steps = ["Tipo do restaurante", "Alguns dados", "Como vende hoje", "Objetivo", "Preview"];

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

const restaurants = [
  { label: "Hamburgueria", article: "da", icon: Beef },
  { label: "Pizzaria", article: "da", icon: Pizza },
  { label: "Japonês", article: "do", icon: Soup },
  { label: "Restaurante", article: "do", icon: UtensilsCrossed },
  { label: "Cafeteria", article: "da", icon: Coffee },
  { label: "Sorveteria", article: "da", icon: IceCream2 },
  { label: "Açaí", article: "do", icon: Leaf },
  { label: "Churrascaria", article: "da", icon: Flame },
  { label: "Outro", article: "do", icon: MoreHorizontal },
];

export function AiAssistant() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState("Hamburgueria");
  const [customType, setCustomType] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [leavingTo, setLeavingTo] = useState<1 | 2 | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");

  const restaurant = restaurants.find((r) => r.label === selected) ?? restaurants[0];
  const restaurantLabel =
    selected === "Outro" && customType.trim() ? customType.trim() : restaurant.label;
  const progressPercent = Math.round((step / steps.length) * 100);

  function handleContinue() {
    if (step !== 1 || leavingTo !== null) return;
    setLeavingTo(2);
  }

  function handleSubmitStep2(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    sessionStorage.setItem(
      "velnox:onboarding",
      JSON.stringify({
        businessType: restaurantLabel,
        businessName,
        businessPhone,
        businessEmail,
      }),
    );

    if (selected === "Pizzaria") {
      navigate({ to: "/pizzaria-2", viewTransition: { types: ["slide"] } });
      return;
    }

    navigate({ to: "/analise", viewTransition: { types: ["slide"] } });
  }

  function handleBack() {
    if (step !== 2 || leavingTo !== null) return;
    setLeavingTo(1);
  }

  return (
    <section
      id="assistente"
      className="relative mt-22 flex min-h-[calc(100vh-5.5rem)] scroll-mt-24 items-center overflow-hidden pb-16 lg:pb-20"
    >
      <div className="mx-auto max-w-[1440px] 2xl:max-w-400 px-6 lg:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[24px] font-extrabold leading-[1.1] sm:text-[30px]">
            Vamos criar seu site em menos de 30 segundos
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Responda algumas perguntas rápidas e geramos um exemplo personalizado do site do seu
            restaurante — na hora, sem compromisso.
          </p>
        </div>

        <div className="relative isolate mx-auto mt-10 max-w-xl">
          <div className="pointer-events-none absolute inset-x-6 inset-y-4 -z-10 rounded-[24px] bg-primary/60 opacity-80 blur-[90px]" />
          <div className="card-sheen overflow-hidden rounded-[28px] border-2! border-primary! bg-card p-6 shadow-card sm:p-8">
            <div
              key={step}
              onAnimationEnd={() => {
                if (leavingTo !== null) {
                  setStep(leavingTo);
                  setLeavingTo(null);
                }
              }}
              className={leavingTo !== null ? "animate-card-out" : "animate-card-in"}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {step === 2 && (
                    <button
                      type="button"
                      onClick={handleBack}
                      aria-label="Voltar"
                      className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:text-primary"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  )}
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                    Passo {step} de {steps.length}
                  </span>
                </div>
                <h3 className="mt-2 truncate font-display text-xl font-bold">
                  {step === 1
                    ? "Qual é o tipo do seu restaurante?"
                    : `Como é o nome ${restaurant.article} ${restaurantLabel}?`}
                </h3>
              </div>

              <div className="relative mt-8 h-1.5 w-full overflow-visible rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-accent shadow-glow mask-[linear-gradient(to_right,black_60%,transparent_100%)] transition-all duration-500"
                  style={{
                    width: `${progressPercent}%`,
                    WebkitMaskImage: "linear-gradient(to right, black 60%, transparent 100%)",
                  }}
                />
                <span
                  className="absolute -top-6 -translate-x-1/2 text-xs text-muted-foreground transition-all duration-500"
                  style={{ left: `${progressPercent}%` }}
                >
                  {progressPercent}%
                </span>
              </div>

              <ol className="@container mt-5 flex items-start justify-between gap-2">
                {steps.map((s, i) => (
                  <li key={s} className="flex min-w-0 items-start gap-2">
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
                        i <= step - 1
                          ? "bg-gradient-accent text-primary-foreground"
                          : "border border-border text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        "hidden text-[11px] leading-tight @[420px]:inline",
                        i <= step - 1 ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {s}
                    </span>
                  </li>
                ))}
              </ol>

              {step === 1 ? (
                <>
                  <p className="mt-8 text-sm text-muted-foreground">
                    Escolha a opção que melhor descreve o seu negócio.
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {restaurants.map((r) => {
                      const active = selected === r.label;
                      return (
                        <button
                          key={r.label}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelected(r.label)}
                          className={cn(
                            "group relative flex cursor-pointer flex-col items-center gap-2.5 rounded-2xl border p-4 text-center transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            active
                              ? "border-primary/60 bg-primary/10 shadow-glow"
                              : "border-border bg-card/60 hover:-translate-y-1 hover:border-primary/35 hover:bg-card",
                          )}
                        >
                          {active && (
                            <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-gradient-accent text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                          <r.icon
                            className={cn(
                              "h-6 w-6 transition-all duration-300 group-hover:-translate-y-1 group-hover:scale-110",
                              active
                                ? "animate-bounce text-primary"
                                : "text-muted-foreground group-hover:text-primary",
                            )}
                          />
                          <span className="text-xs font-medium">{r.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {selected === "Outro" && (
                    <div className="animate-in fade-in slide-in-from-top-2 mt-4 space-y-1.5 duration-300">
                      <Label htmlFor="custom-type" className="text-muted-foreground">
                        Qual é o tipo do seu estabelecimento?
                      </Label>
                      <Input
                        id="custom-type"
                        value={customType}
                        onChange={(e) => setCustomType(e.target.value)}
                        placeholder="Ex: Adega, Sushi bar, Padaria..."
                        autoFocus
                      />
                    </div>
                  )}
                </>
              ) : (
                <form id="business-form" onSubmit={handleSubmitStep2} className="mt-8 space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="business-name" className="flex items-center gap-1.5 text-muted-foreground">
                      <Store className="h-3.5 w-3.5" /> Nome do comércio
                    </Label>
                    <Input
                      id="business-name"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Ex: Burger House"
                      required
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="business-phone" className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" /> Telefone
                    </Label>
                    <Input
                      id="business-phone"
                      type="tel"
                      inputMode="numeric"
                      value={businessPhone}
                      onChange={(e) => setBusinessPhone(formatPhone(e.target.value))}
                      placeholder="(00) 00000-0000"
                      pattern="\(\d{2}\) \d{4,5}-\d{4}"
                      title="Telefone no formato (00) 00000-0000"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="business-email" className="flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" /> E-mail
                    </Label>
                    <Input
                      id="business-email"
                      type="email"
                      value={businessEmail}
                      onChange={(e) => setBusinessEmail(e.target.value)}
                      placeholder="voce@email.com"
                      required
                    />
                  </div>
                </form>
              )}
            </div>

            <Button
              variant="hero"
              size="xl"
              className="mt-8 w-full"
              type={step === 2 ? "submit" : "button"}
              form={step === 2 ? "business-form" : undefined}
              onClick={step === 1 ? handleContinue : undefined}
            >
              Continuar <ArrowRight />
            </Button>

            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Seus dados estão protegidos e nunca serão
              compartilhados.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}