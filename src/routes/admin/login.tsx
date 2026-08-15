import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginFn } from "@/server/functions/auth.fn";

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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await loginFn({ data: { email, password } });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    await router.invalidate();
    router.navigate({ to: search.redirect ?? "/admin" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <UtensilsCrossed className="size-10 text-[#E11D2E]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Bella Pizza</h1>
            <p className="text-[10px] font-semibold tracking-widest text-[#E11D2E]">
              SISTEMA DO ADMINISTRADOR
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
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-sm text-[#E11D2E]">{error}</p>}

          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-[#E11D2E] text-white hover:bg-[#c4172a]"
          >
            {pending ? "Entrando..." : "Entrar"}
          </Button>

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
