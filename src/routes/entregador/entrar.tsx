import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Bike } from "lucide-react";
import { redeemCourierInviteFn } from "@/server/functions/courier-signup.fn";
import { mensagemDoErro } from "@/lib/erro-do-servidor";

export const Route = createFileRoute("/entregador/entrar")({
  component: EntrarComCodigoPage,
});

/**
 * O motoboy troca o código do dono pela própria conta.
 *
 * A senha é escolhida aqui, nesta tela, e não passa pelo dono em momento algum
 * — é isso que faz o código ser um convite e não uma credencial compartilhada.
 */
function EntrarComCodigoPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    // Validação recusada rejeita a promessa, e não volta em `result`. Sem o
    // try, o motoboy ficava com o botão preso e sem mensagem — no primeiro
    // contato dele com o sistema, que é a pior hora para isso acontecer.
    try {
      const result = await redeemCourierInviteFn({
        data: { code: code.trim(), name: name.trim(), email: email.trim(), password },
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // O resgate já deixou a sessão de pé: dá para ir direto para as entregas.
      await router.invalidate();
      router.navigate({ to: "/entregador" });
    } catch (erro) {
      setError(mensagemDoErro(erro, "Não foi possível criar seu acesso. Confira os dados."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Bike className="size-10 text-[#E11D2E]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Área do entregador</h1>
            <p className="text-[10px] font-semibold tracking-widest text-[#E11D2E]">
              ENTRE COM O CÓDIGO DA LOJA
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="admin-theme space-y-4 rounded-2xl bg-white p-6 text-neutral-900 shadow-xl"
        >
          <div className="space-y-2">
            <label htmlFor="code" className="text-sm font-medium text-neutral-700">
              Código que a loja te passou
            </label>
            <input
              id="code"
              value={code}
              // Maiúsculas na hora da digitação: o código é lido de um papel ou
              // de uma mensagem, e ninguém deveria errar por causa disso.
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="XXXXXXXX"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-lg font-bold tracking-[0.3em] uppercase"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-neutral-700">
              Seu nome
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-neutral-700">
              Seu e-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
            <p className="text-xs text-neutral-500">É com ele que você entra nas próximas vezes.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-neutral-700">
              Crie sua senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
            <p className="text-xs text-neutral-500">
              Pelo menos 8 caracteres. Nem a loja fica sabendo dela.
            </p>
          </div>

          {error && <p className="text-sm text-[#E11D2E]">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
          >
            {pending ? "Criando sua conta..." : "Criar minha conta"}
          </button>

          <p className="text-center text-sm text-neutral-500">
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
