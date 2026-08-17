import burger from "@/assets/burger-hero.jpg";
import { Beef, CreditCard, Menu, ShieldCheck, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = ["Início", "Cardápio", "Promoções", "Sobre", "Contato"];

const benefits = [
  { icon: Truck, title: "Entrega rápida", desc: "Em até 45 min" },
  { icon: Beef, title: "Ingredientes frescos", desc: "Selecionados diariamente" },
  { icon: CreditCard, title: "Pagamento seguro", desc: "Ambiente 100% protegido" },
];

function BurgerLogo({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-md bg-gradient-accent text-primary-foreground",
          small ? "h-5 w-5" : "h-7 w-7",
        )}
      >
        <Beef className={small ? "h-3 w-3" : "h-4 w-4"} />
      </span>
      <span
        className={cn(
          "font-display font-bold leading-[1.05] tracking-tight",
          small ? "text-[7px]" : "text-[10px]",
        )}
      >
        BURGER
        <br />
        HOUSE
      </span>
    </div>
  );
}

/** Realistic desktop website preview for a burger restaurant. */
export function BurgerSiteDesktop({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-sm border-2 border-primary bg-[#0b0b0b] shadow-soft",
        className,
      )}
    >
      <div className="relative">
        <img
          src={burger}
          alt="Hambúrguer artesanal com bacon, queijo cheddar e batatas fritas"
          width={1280}
          height={960}
          loading="lazy"
          className="absolute inset-y-0 right-0 h-full w-[58%] object-cover object-top"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#0b0b0b_38%,rgba(11,11,11,0.75)_58%,rgba(11,11,11,0.25)_100%)]" />

        <div className="relative px-6 pb-5 pt-12">
          <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-5">
            <BurgerLogo />
            <nav className="hidden items-center gap-4 md:flex">
              {navItems.map((n, i) => (
                <span
                  key={n}
                  className={cn(
                    "text-[9px]",
                    i === 0 ? "border-b border-primary pb-1 text-foreground" : "text-white/55",
                  )}
                >
                  {n}
                </span>
              ))}
            </nav>
            <span className="rounded-full bg-gradient-accent px-3 py-1.5 text-[9px] font-semibold text-primary-foreground">
              Pedir agora
            </span>
          </div>

          <div className="max-w-[52%] pb-9 pt-14">
            <h4 className="font-display text-[26px] font-extrabold leading-[1.06] lg:text-[32px]">
              O melhor
              <br />
              <span className="text-primary">hambúrguer</span>
              <br />
              da cidade!
            </h4>
            <p className="mt-3 text-[10px] leading-relaxed text-white/60">
              Ingredientes selecionados, preparo artesanal e muito sabor em cada mordida.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <span className="rounded-lg bg-gradient-accent px-3.5 py-2 text-[9px] font-semibold text-primary-foreground">
                Pedir pelo WhatsApp
              </span>
              <span className="rounded-lg border border-white/15 px-3.5 py-2 text-[9px] font-medium text-white/80">
                Ver cardápio
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/8 bg-black/55 p-5 backdrop-blur-md">
            {benefits.map((b) => (
              <div key={b.title} className="flex min-w-0 items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                  <b.icon className="h-3 w-3" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[9px] font-semibold">{b.title}</span>
                  <span className="block truncate text-[8px] text-white/45">{b.desc}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Realistic mobile website preview for a burger restaurant. */
export function BurgerSiteMobile({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[26px] border border-white/12 bg-[#0b0b0b] p-1.5 shadow-soft",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[20px] bg-[#0b0b0b]">
        <div className="relative">
          <img
            src={burger}
            alt="Prévia mobile do site da hamburgueria"
            width={1280}
            height={960}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,11,11,0.65),#0b0b0b_72%)]" />
          <div className="relative px-3.5 pb-4 pt-3.5">
            <div className="flex items-center justify-between">
              <BurgerLogo small />
              <Menu className="h-3.5 w-3.5 text-white/70" />
            </div>
            <h4 className="mt-5 font-display text-[15px] font-extrabold leading-[1.1]">
              O melhor
              <br />
              <span className="text-primary">hambúrguer</span>
              <br />
              da cidade!
            </h4>
            <p className="mt-2 text-[7px] leading-relaxed text-white/55">
              Ingredientes selecionados e preparo artesanal em cada mordida.
            </p>
            <span className="mt-3 block rounded-md bg-gradient-accent py-1.5 text-center text-[7px] font-semibold text-primary-foreground">
              Pedir pelo WhatsApp
            </span>
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {["Cardápio", "Promoções", "Contato"].map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-white/8 bg-white/5 py-1.5 text-center text-[6px] text-white/65"
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-1.5 rounded-md border border-white/8 bg-black/50 px-2 py-1.5">
              <ShieldCheck className="h-2.5 w-2.5 shrink-0 text-primary" />
              <span className="truncate text-[6px] text-white/50">Pagamento 100% seguro</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}