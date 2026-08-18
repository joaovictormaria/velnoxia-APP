import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { semProtocolo, useBaseUrlPublica } from "@/lib/public-url";
import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createStoreAccountFn } from "@/server/functions/signup.fn";
import { BUSINESS_TYPE_OPTIONS, DEFAULT_BUSINESS_TYPE } from "@/server/catalog/starter-catalogs";

export const Route = createFileRoute("/admin/cadastro")({
  component: SignupPage,
});

function SignupPage() {
  const router = useRouter();
  const [storeName, setStoreName] = useState("");
  const [businessType, setBusinessType] = useState(DEFAULT_BUSINESS_TYPE);
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const basePublica = useBaseUrlPublica();

  // Preview only. The real address is built on the server, which appends the
  // verifier code — so this shows the shape, never a promise of the final URL.
  const slugPreview = localSlugify(storeName);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await createStoreAccountFn({
      data: { storeName, businessType, adminName, email, password, whatsappNumber },
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
            <Label htmlFor="businessType">O que você vende</Label>
            <select
              id="businessType"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            >
              {BUSINESS_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-neutral-500">
              Seu cardápio já nasce com categorias e itens desse ramo — é só ajustar depois.
            </p>
          </div>

          {slugPreview && (
            <div className="rounded-lg bg-neutral-100 px-3 py-2.5">
              <p className="text-xs text-neutral-500">Endereço do seu cardápio</p>
              <p className="mt-0.5 font-mono text-sm text-neutral-800">
                {basePublica ? semProtocolo(basePublica) : ""}/{slugPreview}-
                <span className="text-neutral-400">••••</span>
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Criado automaticamente a partir do nome, com um código só seu — assim
                duas lanchonetes com o mesmo nome nunca se confundem. Você vê o
                endereço completo assim que a conta for criada.
              </p>
            </div>
          )}

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
            disabled={pending}
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
