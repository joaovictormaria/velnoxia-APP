import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Loader2, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkSlugFn, createStoreAccountFn } from "@/server/functions/signup.fn";

export const Route = createFileRoute("/admin/cadastro")({
  component: SignupPage,
});

function SignupPage() {
  const router = useRouter();
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<
    { status: "idle" | "checking" } | { status: "ok"; slug: string } | { status: "error"; error: string }
  >({ status: "idle" });
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Until the person edits the address themselves, it follows the store name.
  const effectiveSlug = slugTouched ? slug : localSlugify(storeName);

  useEffect(() => {
    if (!effectiveSlug) {
      setSlugState({ status: "idle" });
      return;
    }
    setSlugState({ status: "checking" });
    // Debounced so typing doesn't fire a request per keystroke.
    const timer = window.setTimeout(async () => {
      const result = await checkSlugFn({ data: { slug: effectiveSlug } });
      setSlugState(
        result.ok
          ? { status: "ok", slug: result.slug }
          : { status: "error", error: result.error },
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [effectiveSlug]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await createStoreAccountFn({
      data: { storeName, slug: effectiveSlug, adminName, email, password, whatsappNumber },
    });

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    await router.invalidate();
    router.navigate({ to: "/admin" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <UtensilsCrossed className="size-10 text-[#E11D2E]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Crie a conta da sua lanchonete</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Cardápio digital e painel de pedidos. 14 dias grátis, sem cartão.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="admin-theme space-y-4 rounded-2xl bg-white p-6 text-neutral-900 shadow-xl"
        >
          <div className="space-y-2">
            <Label htmlFor="storeName">Nome da lanchonete</Label>
            <Input
              id="storeName"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              required
              minLength={2}
              placeholder="Lanche do Zé"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Endereço do seu cardápio</Label>
            <div className="flex items-center rounded-lg border border-neutral-300 px-3 focus-within:border-neutral-400">
              <span className="shrink-0 text-sm text-neutral-500">velnox.app/</span>
              <input
                id="slug"
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                required
                className="w-full bg-transparent py-2 text-sm text-neutral-900 outline-none"
                placeholder="lanche-do-ze"
              />
              {slugState.status === "checking" && (
                <Loader2 className="size-4 shrink-0 animate-spin text-neutral-400" />
              )}
              {slugState.status === "ok" && <Check className="size-4 shrink-0 text-emerald-600" />}
              {slugState.status === "error" && <X className="size-4 shrink-0 text-[#E11D2E]" />}
            </div>
            {slugState.status === "error" && (
              <p className="text-xs text-[#E11D2E]">{slugState.error}</p>
            )}
            {slugState.status === "ok" && (
              <p className="text-xs text-emerald-700">Endereço disponível.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsappNumber">WhatsApp da loja</Label>
            <Input
              id="whatsappNumber"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              required
              placeholder="(11) 99999-9999"
            />
          </div>

          <hr className="border-neutral-200" />

          <div className="space-y-2">
            <Label htmlFor="adminName">Seu nome</Label>
            <Input
              id="adminName"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
              minLength={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Seu e-mail</Label>
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
              minLength={8}
              autoComplete="new-password"
            />
            <p className="text-xs text-neutral-500">Mínimo de 8 caracteres.</p>
          </div>

          {error && <p className="text-sm text-[#E11D2E]">{error}</p>}

          <Button
            type="submit"
            disabled={pending || slugState.status !== "ok"}
            className="w-full bg-[#E11D2E] text-white hover:bg-[#c4172a]"
          >
            {pending ? "Criando sua loja..." : "Criar conta grátis"}
          </Button>

          <p className="text-center text-sm text-neutral-600">
            Já tem conta?{" "}
            <Link to="/admin/login" className="font-semibold text-[#E11D2E] hover:underline">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

/** Mirrors the server's slugify so the preview matches what will be saved. */
function localSlugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
