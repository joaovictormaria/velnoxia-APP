import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Bike } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BOTAO_DE_ACESSO,
  CAMPO_DE_ACESSO,
  PainelDeAcesso,
} from "@/components/admin/acesso/PainelDeAcesso";
import { redeemCourierInviteFn } from "@/server/functions/courier-signup.fn";
import { mensagemDoErro } from "@/lib/erro-do-servidor";

export const Route = createFileRoute("/entregador/entrar")({
  component: EntrarComCodigoPage,
});

const ROTULO = "text-[13px] text-neutral-300";
const AJUDA = "text-xs text-neutral-500";

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
    <PainelDeAcesso
      frases={[
        "As entregas da loja, direto no seu celular.",
        "Suas corridas do dia na palma da mão.",
        "Cada entrega com o endereço certo.",
      ]}
      apoio="O código da loja vira a sua conta. A senha é sua — nem a loja fica sabendo dela."
    >
      {/* O canto da marca é da Velnox em todas as telas; a bicicleta fica aqui,
          que é onde ela diz algo — esta tela não é a do dono. */}
      <p className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-[#E11D2E]">
        <Bike className="size-4" />
        ÁREA DO ENTREGADOR
      </p>
      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
        Entre com o código da loja
      </h1>
      <p className="mt-2 text-sm text-neutral-400">
        Use o código que a loja te passou para criar seu acesso.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code" className={ROTULO}>
            Código que a loja te passou
          </Label>
          <Input
            id="code"
            value={code}
            // Maiúsculas na hora da digitação: o código é lido de um papel ou
            // de uma mensagem, e ninguém deveria errar por causa disso.
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="XXXXXXXX"
            className={`${CAMPO_DE_ACESSO} h-12 text-center text-lg font-bold uppercase tracking-[0.3em] placeholder:tracking-[0.3em]`}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name" className={ROTULO}>
            Seu nome
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className={CAMPO_DE_ACESSO}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className={ROTULO}>
            Seu e-mail
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
          <p className={AJUDA}>É com ele que você entra nas próximas vezes.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className={ROTULO}>
            Crie sua senha
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className={CAMPO_DE_ACESSO}
          />
          <p className={AJUDA}>Pelo menos 8 caracteres. Nem a loja fica sabendo dela.</p>
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
          {pending ? "Criando sua conta..." : "Criar minha conta"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        Já tem conta?{" "}
        <Link
          to="/admin/login"
          className="font-semibold text-[#E11D2E] transition-colors hover:text-[#ff4d5e]"
        >
          Entrar
        </Link>
      </p>
    </PainelDeAcesso>
  );
}
