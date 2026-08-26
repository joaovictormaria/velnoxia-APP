import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { semProtocolo, useBaseUrlPublica } from "@/lib/public-url";
import { useRef, useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createStoreAccountFn } from "@/server/functions/signup.fn";
import { mensagemDoErro } from "@/lib/erro-do-servidor";
import { BUSINESS_TYPE_OPTIONS, DEFAULT_BUSINESS_TYPE } from "@/server/catalog/starter-catalogs";
import {
  documentoCompleto,
  formatDocumentInput,
  normalizeDocument,
  posicaoDoCursorAposMascara,
  validateDocument,
} from "@/lib/document";

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
  /**
   * So os digitos. A mascara e desenhada na hora de exibir, e desfeita antes de
   * enviar — guardar formatado obrigaria a limpar em todo lugar que le isto.
   */
  const [document, setDocument] = useState("");
  const documentRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * Conta criada, mas o cookie de sessao nao foi gravado. Estado proprio, e nao
   * um texto em `error`: nada deu errado no cadastro, e tratar como erro faria
   * a pessoa achar que precisa preencher tudo de novo.
   */
  const [contaSemSessao, setContaSemSessao] = useState(false);
  const [pending, setPending] = useState(false);
  const basePublica = useBaseUrlPublica();

  // Preview only. The real address is built on the server, which appends the
  // verifier code — so this shows the shape, never a promise of the final URL.
  const slugPreview = localSlugify(storeName);

  /**
   * Reaplica a mascara sem jogar o cursor para o fim.
   *
   * O valor exibido e derivado do estado, entao a cada tecla o React reescreve
   * o campo inteiro e o navegador poe o cursor no final. Quem estivesse
   * corrigindo o terceiro digito perdia o lugar e digitava no fim da linha.
   *
   * A correcao nao tenta somar ou subtrair posicoes — separador entrando ou
   * saindo desloca tudo. Conta quantos DIGITOS existiam antes do cursor e
   * procura essa mesma contagem no texto ja formatado. Digito e a unica coisa
   * que a mascara nao muda de lugar.
   */
  function aoDigitarDocumento(e: React.ChangeEvent<HTMLInputElement>) {
    const campo = e.target;
    const posicao = campo.selectionStart ?? campo.value.length;

    const digitos = normalizeDocument(campo.value).slice(0, 14);
    setDocument(digitos);

    const novaPosicao = posicaoDoCursorAposMascara(
      campo.value,
      posicao,
      formatDocumentInput(digitos),
    );

    // Depois da pintura: antes dela o campo ainda mostra o texto velho.
    requestAnimationFrame(() => {
      documentRef.current?.setSelectionRange(novaPosicao, novaPosicao);
    });

    conferirValidade(campo, digitos);
  }

  /*
   * Erro so quando o documento fecha em 11 ou 14 digitos. Quem digitou cinco
   * nao errou nada — ainda esta digitando, e acusar ali e ruido.
   *
   * Isto e conveniencia, nao autoridade: o servidor valida tudo de novo, e e
   * a resposta dele que decide se a conta e criada.
   */
  const documentoInvalido =
    documentoCompleto(document) && !validateDocument(document).valido;
  const documentoOk = validateDocument(document).valido;

  /*
   * O required sozinho faz o navegador dizer "Preencha este campo", que nao
   * ajuda quem nao sabe de qual campo ele esta falando. setCustomValidity troca
   * o texto do balao pelo nosso, e o campo passa a entrar na mesma validacao
   * nativa dos outros: o formulario nao envia com documento vazio ou incompleto.
   *
   * Isto e conveniencia. A autoridade continua no servidor, que valida de novo
   * e e quem recusa de verdade.
   */
  /*
   * Recebe os digitos em vez de ler o estado: quando chamada de dentro do
   * requestAnimationFrame logo apos o setDocument, a closure ainda enxerga o
   * valor do render anterior, e a mensagem ficaria uma tecla atrasada — o campo
   * diria "invalido" no exato momento em que a pessoa acabou de completar o
   * documento.
   */
  function conferirValidade(campo: HTMLInputElement | null, digitos: string) {
    if (!campo) return;
    if (digitos.length === 0) {
      campo.setCustomValidity("CPF ou CNPJ é obrigatório.");
    } else if (!validateDocument(digitos).valido) {
      campo.setCustomValidity("Informe um CPF ou CNPJ válido.");
    } else {
      campo.setCustomValidity("");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const payload = {
      storeName,
      businessType,
      adminName,
      email,
      password,
      whatsappNumber,
      // Vai so o documento. O tipo (CPF ou CNPJ) quem decide e o servidor, a
      // partir do tamanho — mandar daqui seria dar ao cliente uma palavra que
      // ele nao pode ter.
      document,
    };

    /*
     * O try existe porque a recusa de validação não volta em `result` — ela
     * rejeita a promessa. Sem ele, um e-mail mal digitado deixava o botão preso
     * em "Criando sua loja..." para sempre, sem dizer o que estava errado.
     */
    try {
      const result = await createStoreAccountFn({
        data: payload,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      await router.invalidate();

      /*
       * A conta existe nos dois caminhos; o que muda é se o cookie foi gravado.
       * Sem sessão, mandar para o painel faria o guarda de rota devolver a
       * pessoa para o login sem explicação nenhuma — e ela acabou de criar a
       * conta. O aviso fica aqui, onde ela já está olhando, com o link.
       */
      if (result.sessaoAberta === false) {
        setContaSemSessao(true);
        return;
      }

      router.navigate({ to: "/admin" });
    } catch (erro) {
      /*
       * Nada do erro é impresso. A mensagem crua de um erro de servidor traz os
       * argumentos da consulta — e um deles é o CPF. Já apareceu por extenso no
       * console desta tela quando o Prisma Client ficou dessincronizado.
       */
      setError(mensagemDoErro(erro, "Não foi possível criar a conta. Tente novamente."));
    } finally {
      // No finally, e não em cada saída: é o que garante que o botão volte
      // mesmo num caminho de erro que ninguém previu.
      setPending(false);
    }
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

        {contaSemSessao && (
          <div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Conta criada.</p>
            <p className="mt-1">
              Não conseguimos abrir sua sessão automaticamente — sua conta está
              pronta e você já pode entrar com o e-mail e a senha que acabou de
              cadastrar.
            </p>
            <Link
              to="/admin/login"
              className="mt-3 inline-block font-semibold text-emerald-900 underline"
            >
              Ir para o login
            </Link>
          </div>
        )}

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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900"
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

          <div className="space-y-2">
            <Label htmlFor="document">CPF ou CNPJ</Label>
            <Input
              ref={documentRef}
              id="document"
              value={formatDocumentInput(document)}
              onChange={aoDigitarDocumento}
              onInvalid={(e) => conferirValidade(e.currentTarget, document)}
              required
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              aria-invalid={documentoInvalido || undefined}
              aria-describedby="document-ajuda"
              className={
                documentoInvalido
                  ? "border-red-400 focus-visible:ring-red-400"
                  : documentoOk
                    ? "border-emerald-500 focus-visible:ring-emerald-500"
                    : undefined
              }
            />
            <p
              id="document-ajuda"
              className={
                documentoInvalido ? "text-xs text-red-600" : "text-xs text-neutral-500"
              }
            >
              {documentoInvalido
                ? "Informe um CPF ou CNPJ válido."
                : "Pode ser o seu CPF ou o CNPJ da empresa. A máscara se ajusta sozinha."}
            </p>
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
