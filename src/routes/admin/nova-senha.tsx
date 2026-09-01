import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BOTAO_DE_ACESSO,
  CAMPO_DE_ACESSO,
  PainelDeAcesso,
} from "@/components/admin/acesso/PainelDeAcesso";
import { resetPasswordFn } from "@/server/functions/password-reset.fn";

export const Route = createFileRoute("/admin/nova-senha")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: NovaSenhaPage,
});

const ROTULO = "text-[13px] text-neutral-300";

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
        <>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Link incompleto
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            Este endereço veio sem o código de verificação — alguns aplicativos de e-mail cortam
            links longos. Abra o link direto da mensagem ou peça um novo.
          </p>
          <Link
            to="/admin/esqueci-senha"
            className="mt-8 flex h-11 w-full items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:border-[#E11D2E]/60 hover:bg-[#E11D2E]/10"
          >
            Pedir um novo link
          </Link>
        </>
      );
    }

    if (pronto) {
      return (
        <>
          <CheckCircle2 className="mt-3 size-9 text-emerald-400" />
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-white">
            Senha trocada
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            Já pode entrar com a senha nova. Este link não vale mais.
          </p>
          <Button
            type="button"
            onClick={() => router.navigate({ to: "/admin/login" })}
            className={`mt-8 ${BOTAO_DE_ACESSO}`}
          >
            Ir para o login
          </Button>
        </>
      );
    }

    return (
      <>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Escolha uma nova senha
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Depois de trocar, este link deixa de funcionar.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password" className={ROTULO}>
              Nova senha
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
              className={CAMPO_DE_ACESSO}
            />
            <p className="text-xs text-neutral-500">Pelo menos 8 caracteres.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmacao" className={ROTULO}>
              Repita a nova senha
            </Label>
            <Input
              id="confirmacao"
              type="password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className={CAMPO_DE_ACESSO}
            />
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
            {pending ? "Trocando..." : "Trocar senha"}
          </Button>
        </form>
      </>
    );
  };

  return (
    <PainelDeAcesso
      frases={[
        "Uma senha nova, e o painel volta a ser seu.",
        "Escolha a senha e siga o dia.",
        "Só você precisa saber a próxima.",
      ]}
      apoio="Depois de trocar, o link do e-mail deixa de funcionar."
    >
      <p className="text-[10px] font-semibold tracking-[0.2em] text-[#E11D2E]">NOVA SENHA</p>
      {conteudo()}
    </PainelDeAcesso>
  );
}
