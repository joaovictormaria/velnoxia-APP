import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MailCheck, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetFn } from "@/server/functions/password-reset.fn";

export const Route = createFileRoute("/admin/esqueci-senha")({
  component: EsqueciSenhaPage,
});

function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    await requestPasswordResetFn({ data: { email } }).catch(() => undefined);
    // Sempre a mesma tela, tenha ou não a conta existido. Uma resposta
    // diferente para "não encontrado" diria a quem estivesse testando e-mails
    // quais lojistas estão cadastrados.
    setEnviado(true);
    setPending(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <UtensilsCrossed className="size-10 text-[#E11D2E]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Velnox.app</h1>
            <p className="text-[10px] font-semibold tracking-widest text-[#E11D2E]">
              RECUPERAR ACESSO
            </p>
          </div>
        </div>

        {enviado ? (
          <div className="admin-theme space-y-4 rounded-2xl bg-white p-6 text-center text-neutral-900 shadow-xl">
            <MailCheck className="mx-auto size-10 text-emerald-600" />
            <p className="font-semibold">Se existir uma conta com esse e-mail, o link já saiu.</p>
            <p className="text-sm text-neutral-600">
              Confira a caixa de entrada de <strong>{email}</strong> — e o spam, que é onde esse
              tipo de mensagem costuma parar. O link vale por 30 minutos.
            </p>
            <Link
              to="/admin/login"
              className="block text-sm font-semibold text-[#E11D2E] hover:underline"
            >
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="admin-theme space-y-4 rounded-2xl bg-white p-6 text-neutral-900 shadow-xl"
          >
            <div>
              <h2 className="font-bold">Esqueceu a senha?</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Informe o e-mail da sua conta e mandamos um link para você escolher uma nova.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <Button
              type="submit"
              disabled={pending}
              className="w-full bg-[#E11D2E] text-white hover:bg-[#c4172a]"
            >
              {pending ? "Enviando..." : "Enviar link"}
            </Button>

            <Link
              to="/admin/login"
              className="block text-center text-sm text-neutral-500 hover:text-neutral-800"
            >
              Voltar para o login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
