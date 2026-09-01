import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BOTAO_DE_ACESSO,
  CAMPO_DE_ACESSO,
  PainelDeAcesso,
} from "@/components/admin/acesso/PainelDeAcesso";
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
    <PainelDeAcesso
      frases={[
        "Perdeu a senha? O painel continua seu.",
        "Um link no e-mail e você volta para dentro.",
        "Acontece com todo mundo. Leva um minuto.",
      ]}
      apoio="Mandamos um link para o e-mail da conta e você escolhe uma nova em minutos."
    >
      <p className="text-[10px] font-semibold tracking-[0.2em] text-[#E11D2E]">
        RECUPERAR ACESSO
      </p>

      {enviado ? (
        <div className="mt-3">
          <MailCheck className="size-9 text-emerald-400" />
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-white">
            O link já saiu
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            Se existir uma conta com esse e-mail, o link está a caminho. Confira a caixa de
            entrada de <strong className="text-neutral-200">{email}</strong> — e o spam, que é
            onde esse tipo de mensagem costuma parar. O link vale por 30 minutos.
          </p>
          <Link
            to="/admin/login"
            className="mt-8 flex h-11 w-full items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:border-[#E11D2E]/60 hover:bg-[#E11D2E]/10"
          >
            Voltar para o login
          </Link>
        </div>
      ) : (
        <>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Esqueceu a senha?
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Informe o e-mail da sua conta e mandamos um link para você escolher uma nova.
          </p>

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
                autoFocus
                placeholder="seu@email.com"
                className={CAMPO_DE_ACESSO}
              />
            </div>

            <Button type="submit" disabled={pending} className={BOTAO_DE_ACESSO}>
              {pending ? "Enviando..." : "Enviar link"}
            </Button>
          </form>

          <Link
            to="/admin/login"
            className="mt-6 block text-center text-sm text-neutral-500 transition-colors hover:text-neutral-300"
          >
            Voltar para o login
          </Link>
        </>
      )}
    </PainelDeAcesso>
  );
}
