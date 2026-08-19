import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, UtensilsCrossed } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordFn } from "@/server/functions/password-reset.fn";

export const Route = createFileRoute("/admin/nova-senha")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: NovaSenhaPage,
});

function NovaSenhaPage() {
  const router = useRouter();
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pronto, setPronto] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;

    // Conferido aqui, e não no servidor: a segunda senha existe só para pegar
    // erro de digitação de quem está criando, e nunca sai desta tela.
    if (password !== confirmacao) {
      setError("As duas senhas não são iguais.");
      return;
    }

    setPending(true);
    setError(null);
    const r = await resetPasswordFn({ data: { token, password } }).catch(() => null);
    setPending(false);

    if (!r?.ok) {
      setError(r?.error ?? "Não foi possível trocar a senha. Tente de novo.");
      return;
    }
    setPronto(true);
  }

  const conteudo = () => {
    // Link sem token é link truncado pelo cliente de e-mail, caso comum o
    // bastante para merecer explicação em vez de um formulário que não envia.
    if (!token) {
      return (
        <div className="space-y-3 text-center">
          <h2 className="font-bold">Link incompleto</h2>
          <p className="text-sm text-neutral-600">
            Este endereço veio sem o código de verificação — alguns aplicativos de e-mail cortam
            links longos. Abra o link direto da mensagem ou peça um novo.
          </p>
          <Link
            to="/admin/esqueci-senha"
            className="block text-sm font-semibold text-[#E11D2E] hover:underline"
          >
            Pedir um novo link
          </Link>
        </div>
      );
    }

    if (pronto) {
      return (
        <div className="space-y-3 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
          <h2 className="font-bold">Senha trocada</h2>
          <p className="text-sm text-neutral-600">
            Já pode entrar com a senha nova. Este link não vale mais.
          </p>
          <Button
            type="button"
            onClick={() => router.navigate({ to: "/admin/login" })}
            className="w-full bg-[#E11D2E] text-white hover:bg-[#c4172a]"
          >
            Ir para o login
          </Button>
        </div>
      );
    }

    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h2 className="font-bold">Escolha uma nova senha</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Depois de trocar, este link deixa de funcionar.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
          />
          <p className="text-xs text-neutral-500">Pelo menos 8 caracteres.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmacao">Repita a nova senha</Label>
          <Input
            id="confirmacao"
            type="password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        {error && <p className="text-sm text-[#E11D2E]">{error}</p>}

        <Button
          type="submit"
          disabled={pending}
          className="w-full bg-[#E11D2E] text-white hover:bg-[#c4172a]"
        >
          {pending ? "Trocando..." : "Trocar senha"}
        </Button>
      </form>
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <UtensilsCrossed className="size-10 text-[#E11D2E]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Velnox.app</h1>
            <p className="text-[10px] font-semibold tracking-widest text-[#E11D2E]">
              NOVA SENHA
            </p>
          </div>
        </div>

        <div className="admin-theme rounded-2xl bg-white p-6 text-neutral-900 shadow-xl">
          {conteudo()}
        </div>
      </div>
    </div>
  );
}
