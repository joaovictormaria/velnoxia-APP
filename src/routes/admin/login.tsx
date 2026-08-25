import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { UtensilsCrossed, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <UtensilsCrossed className="size-10 text-[#E11D2E]" />
          {/* Product name, not a store name: one login serves every lanchonete. */}
          <div>
            <h1 className="text-2xl font-bold text-white">Velnox.app</h1>
            <p className="text-[10px] font-semibold tracking-widest text-[#E11D2E]">
              PAINEL DA SUA LANCHONETE
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="admin-theme space-y-4 rounded-2xl bg-white p-6 text-neutral-900 shadow-xl"
        >
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
              >
                {showPassword ? (
                  <EyeOff className="size-5" />
                ) : (
                  <Eye className="size-5" />
                )}
              </button>
            </div>
          </div>

          <div className="text-right">
            <Link
              to="/admin/esqueci-senha"
              className="text-sm text-neutral-500 hover:text-[#E11D2E]"
            >
              Esqueci minha senha
            </Link>
          </div>

          {error && <p className="text-sm text-[#E11D2E]">{error}</p>}

          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-[#E11D2E] text-white hover:bg-[#c4172a]"
          >
            {pending ? "Entrando..." : "Entrar"}
          </Button>

          <div className="flex items-center gap-3 pt-1">
            <span className="h-px flex-1 bg-neutral-200" />
            <span className="text-xs text-neutral-500">ainda não tem conta?</span>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          <Link
            to="/admin/cadastro"
            className="flex w-full items-center justify-center rounded-md border border-[#E11D2E] px-4 py-2 text-sm font-semibold text-[#E11D2E] transition-colors hover:bg-[#E11D2E]/5"
          >
            Criar conta da minha lanchonete
          </Link>

          <Link
            to="/entregador/entrar"
            className="block text-center text-sm text-neutral-500 hover:text-neutral-800"
          >
            Sou entregador e tenho um código
          </Link>

          {import.meta.env.DEV && (
            <p className="rounded-lg bg-neutral-100 px-3 py-2 text-center text-xs text-neutral-600">
              Acesso de desenvolvimento: <strong>admin@bellapizza.com</strong> / <strong>admin123</strong>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
