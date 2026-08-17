import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Flame, MessageCircle, Rocket, Search, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/site/Badge";
import { BurgerSiteDesktop } from "@/components/site/BurgerSite";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { TypingText } from "@/components/site/TypingText";
import { Reveal } from "@/components/site/Reveal";
import { Counter } from "@/components/site/Counter";
import { NeuralNetwork } from "@/components/site/NeuralNetwork";

const features = [
  { icon: Rocket, title: "Entrega rápida", desc: "do seu site" },
  { icon: Smartphone, title: "Design 100%", desc: "responsivo" },
  { icon: Search, title: "Otimizado para", desc: "Google" },
  { icon: WhatsAppIcon, title: "Integração com", desc: "WhatsApp" },
];

const stats = [
  { to: 500, suffix: "+", label: "restaurantes atendidos" },
  { to: 3, suffix: "x", label: "mais pedidos em média" },
  { to: 30, suffix: "s", label: "para gerar seu site" },
];

const statusLines = [
  "Analisando cardápio...",
  "Otimizando para Google...",
  "Gerando layout responsivo...",
  "Conectando ao WhatsApp...",
  "Site pronto ✅",
];

function HeroStatusCard() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % statusLines.length), 1800);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="glass hidden animate-float rounded-2xl border border-primary/25 px-4 py-3 shadow-glow sm:flex sm:items-center sm:gap-2.5">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
        <span className="relative h-2 w-2 rounded-full bg-primary" />
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {statusLines[i]}
        <span className="animate-caret-blink text-primary">▋</span>
      </span>
    </div>
  );
}

export function Hero() {
  return (
    <section
      id="top"
      className="relative mt-22 flex min-h-[calc(100vh-5.5rem)] items-center overflow-hidden pb-16 lg:pb-20"
    >
      <div className="pointer-events-none absolute inset-0 [background:var(--gradient-ember)]" />
      <div className="pointer-events-none absolute -right-40 top-10 h-[520px] w-[520px] rounded-full bg-primary/12 blur-[140px]" />
      <NeuralNetwork className="pointer-events-none absolute inset-0 -z-10" />

      <div className="relative mx-auto grid max-w-[1440px] 2xl:max-w-400 grid-cols-1 items-start gap-16 px-6 lg:grid-cols-12 lg:gap-10 lg:scale-110 lg:px-10">
        <div className="lg:col-span-5">
          <Reveal variant="left">
            <Pill>
              <Flame className="h-3.5 w-3.5 text-primary" /> Mais pedidos. Mais clientes. Mais resultados.
            </Pill>
          </Reveal>

          <Reveal variant="left" delay={80}>
            <h1 className="mt-7 font-display text-[38px] font-extrabold leading-[1.05] sm:text-[48px] lg:text-[44px] xl:text-[48px] 2xl:text-[56px]">
              Seu restaurante
              <br />
              <span className="whitespace-nowrap">
                merece{" "}
                <TypingText
                  texts={["mais pedidos.", "mais clientes.", "mais resultados."]}
                  className="text-gradient-accent"
                />
              </span>
            </h1>
          </Reveal>

          <Reveal variant="left" delay={160}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground lg:text-lg">
              Criamos sites rápidos e otimizados que transformam cada visita em pedido. Design que
              vende, sem complicação.
            </p>
          </Reveal>

          <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {features.map((f, i) => (
              <Reveal key={f.title} variant="up" delay={240 + i * 80} className="flex flex-col items-center text-center">
                <span className="shadow-glow grid h-10 w-10 place-items-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
                  <f.icon className="h-4.5 w-4.5" />
                </span>
                <span className="mt-2.5 block text-xs text-muted-foreground">{f.title}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{f.desc}</span>
              </Reveal>
            ))}
          </ul>

          <Reveal variant="left" delay={520}>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button variant="hero" size="lg" className="rounded-sm" asChild>
                <Link to="/criar-site" viewTransition={{ types: ["slide"] }}>
                  Quero meu site <ArrowRight />
                </Link>
              </Button>
              <Button variant="glass" size="lg" className="rounded-sm" asChild>
                <a href="#contato">
                  <MessageCircle /> Falar no WhatsApp
                </a>
              </Button>
            </div>
          </Reveal>

          <Reveal variant="up" delay={600}>
            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-border/60 pt-6">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="font-display text-2xl font-bold text-gradient-accent">
                    <Counter to={s.to} suffix={s.suffix} />
                  </dd>
                  <dd className="mt-0.5 text-[11px] text-muted-foreground">{s.label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal variant="scale" delay={200} className="relative isolate lg:col-span-7 lg:-mr-24">
          <div className="pointer-events-none absolute -top-4 right-6 z-20 hidden sm:block lg:right-16">
            <HeroStatusCard />
          </div>
          <div className="pointer-events-none absolute inset-x-6 inset-y-4 -z-10 rounded-[24px] bg-primary/60 opacity-80 blur-[90px]" />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={0.05}
            strokeLinecap="round"
            className="pointer-events-none absolute -left-56 top-8 -z-10 hidden h-110 w-110 -scale-x-100 lg:block"
          >
            <defs>
              <linearGradient id="hero-wave-fade" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0" />
                <stop offset="25%" stopColor="var(--primary)" stopOpacity="0" />
                <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.4" />
                <stop offset="75%" stopColor="var(--primary)" stopOpacity="0" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path stroke="url(#hero-wave-fade)" d="M2 6c2.5-1 5-1 7.5 0s5 1 7.5 0 5-1 7.5 0">
              <animate
                attributeName="d"
                dur="3.2s"
                begin="0s"
                repeatCount="indefinite"
                calcMode="spline"
                keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
                values="M2 6c2.5-1 5-1 7.5 0s5 1 7.5 0 5-1 7.5 0;
                        M2 6c2.5-1.8 5-0.3 7.5 0s5 1.8 7.5 0 5-1.8 7.5 0;
                        M2 6c2.5-0.3 5-1.8 7.5 0s5 0.3 7.5 0 5-0.3 7.5 0;
                        M2 6c2.5-1 5-1 7.5 0s5 1 7.5 0 5-1 7.5 0"
              />
            </path>
            <path stroke="url(#hero-wave-fade)" d="M2 12c2.5-1 5-1 7.5 0s5 1 7.5 0 5-1 7.5 0">
              <animate
                attributeName="d"
                dur="3.8s"
                begin="-1.1s"
                repeatCount="indefinite"
                calcMode="spline"
                keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
                values="M2 12c2.5-1 5-1 7.5 0s5 1 7.5 0 5-1 7.5 0;
                        M2 12c2.5-0.3 5-1.8 7.5 0s5 0.3 7.5 0 5-0.3 7.5 0;
                        M2 12c2.5-1.8 5-0.3 7.5 0s5 1.8 7.5 0 5-1.8 7.5 0;
                        M2 12c2.5-1 5-1 7.5 0s5 1 7.5 0 5-1 7.5 0"
              />
            </path>
            <path stroke="url(#hero-wave-fade)" d="M2 18c2.5-1 5-1 7.5 0s5 1 7.5 0 5-1 7.5 0">
              <animate
                attributeName="d"
                dur="3.5s"
                begin="-2.2s"
                repeatCount="indefinite"
                calcMode="spline"
                keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
                values="M2 18c2.5-1 5-1 7.5 0s5 1 7.5 0 5-1 7.5 0;
                        M2 18c2.5-1.8 5-0.3 7.5 0s5 1.8 7.5 0 5-1.8 7.5 0;
                        M2 18c2.5-0.3 5-1.8 7.5 0s5 0.3 7.5 0 5-0.3 7.5 0;
                        M2 18c2.5-1 5-1 7.5 0s5 1 7.5 0 5-1 7.5 0"
              />
            </path>
          </svg>
          <BurgerSiteDesktop />
        </Reveal>
      </div>
    </section>
  );
}