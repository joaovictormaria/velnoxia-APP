import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BOTAO_DE_ACESSO,
  CAMPO_DE_ACESSO,
  PainelDeAcesso,
} from "@/components/admin/acesso/PainelDeAcesso";
import { loginFn } from "@/server/functions/auth.fn";
import { mensagemDoErro } from "@/lib/erro-do-servidor";

export const Route = createFileRoute("/admin/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    // Uma recusa de validação rejeita a promessa em vez de voltar em `result`.
    // Sem o try, um e-mail mal digitado prendia o botão em "Entrando..." sem
    // dizer nada — e a pessoa fica sem entender por que a tela parou.
    try {
      const result = await loginFn({ data: { email, password } });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      await router.invalidate();
      // O mesmo formulário serve dono e entregador: o papel decide onde cada um
      // cai, senão o motoboy aterrissaria num painel que não é dele.
      if (result.admin.role === "COURIER") {
        router.navigate({ to: "/entregador" });
        return;
      }
      router.navigate({ to: search.redirect ?? "/admin" });
    } catch (erro) {
      setError(mensagemDoErro(erro, "Não foi possível entrar. Tente de novo."));
    } finally {
      setPending(false);
    }
  }

  return (
    <PainelDeAcesso
      frases={[
        "A gestão da sua lanchonete, em um só lugar.",
        "Do pedido no balcão ao entregador na porta.",
        "Cardápio, estoque e caixa falando a mesma língua.",
        "O dia inteiro da loja em uma tela só.",
      ]}
      apoio="Pedidos, cardápio, estoque e entregas no mesmo painel."
    >
      <p className="text-[10px] font-semibold tracking-[0.2em] text-[#E11D2E]">
        PAINEL DA SUA LANCHONETE
      </p>
      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
        Bem-vindo de volta
      </h1>
      <p className="mt-2 text-sm text-neutral-400">Entre no painel da sua lanchonete.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[13px] text-neutral-300">
            E-mail
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="seu@email.com"
            className={CAMPO_DE_ACESSO}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-[13px] text-neutral-300">
            Senha
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className={`${CAMPO_DE_ACESSO} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D2E]/50"
            >
              {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <Link
            to="/admin/esqueci-senha"
            className="text-sm text-neutral-400 transition-colors hover:text-[#E11D2E]"
          >
            Esqueci minha senha
          </Link>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-[#E11D2E]/30 bg-[#E11D2E]/10 px-3 py-2 text-sm text-[#FF8A94]"
          >
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className={BOTAO_DE_ACESSO}>
          {pending ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <div className="mt-8 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-neutral-500">ainda não tem conta?</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <Link
        to="/admin/cadastro"
        className="mt-4 flex h-11 w-full items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:border-[#E11D2E]/60 hover:bg-[#E11D2E]/10"
      >
        Criar conta da minha lanchonete
      </Link>

      <Link
        to="/entregador/entrar"
        className="mt-5 block text-center text-sm text-neutral-500 transition-colors hover:text-neutral-300"
      >
        Sou entregador e tenho um código
      </Link>
    </PainelDeAcesso>
  );
}
