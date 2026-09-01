import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BOTAO_DE_ACESSO,
  CAMPO_DE_ACESSO_COMPACTO,
  PainelDeAcesso,
} from "@/components/admin/acesso/PainelDeAcesso";
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

/** O rótulo dos campos, no tom claro que o painel escuro pede. */
const ROTULO = "text-[13px] text-neutral-300";

/** A linha de ajuda embaixo de um campo. */
const AJUDA = "text-xs text-neutral-500";

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
    <PainelDeAcesso
      frases={[
        "Sua lanchonete no ar em poucos minutos.",
        "O cardápio já nasce pronto para o seu ramo.",
        "Quatorze dias para testar, sem cartão.",
        "Comece hoje e ajuste o resto depois.",
      ]}
      apoio="Cardápio digital, painel de pedidos e controle de estoque desde o primeiro dia."
      // O formulário é longo: a coluna dele ganha um pouco mais de largura que
      // a do login, senão sete campos empilhados viram um corredor estreito.
      proporcao="lg:grid-cols-[1.35fr_1fr]"
      larguraDoConteudo="max-w-md"
      altura="lg:h-[min(92vh,940px)]"
    >
      <p className="text-[10px] font-semibold tracking-[0.2em] text-[#E11D2E]">
        14 DIAS GRÁTIS, SEM CARTÃO
      </p>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white">
        Crie a conta da sua lanchonete
      </h1>
      <p className="mt-1.5 text-sm text-neutral-400">
        Cardápio digital e painel de pedidos, prontos para usar.
      </p>

      {contaSemSessao && (
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          <p className="font-semibold">Conta criada.</p>
          <p className="mt-1 text-emerald-200/80">
            Não conseguimos abrir sua sessão automaticamente — sua conta está pronta e você já
            pode entrar com o e-mail e a senha que acabou de cadastrar.
          </p>
          <Link
            to="/admin/login"
            className="mt-3 inline-block font-semibold text-emerald-200 underline"
          >
            Ir para o login
          </Link>
        </div>
      )}

      {/* Campos curtos vão em pares. São sete no total: empilhados um a um o
          formulário passa da altura do painel e nasce com barra de rolagem. */}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="storeName" className={ROTULO}>
            Nome da lanchonete
          </Label>
          <Input
            id="storeName"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            required
            minLength={2}
            placeholder="Lanche do Zé"
            className={CAMPO_DE_ACESSO_COMPACTO}
          />
        </div>

        <div className="space-y-1.5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="businessType" className={ROTULO}>
                O que você vende
              </Label>
              {/* O select nativo herda as cores do sistema na lista aberta,
                  então as opções também precisam do fundo escuro — no Windows
                  elas saem brancas se só o campo for pintado. */}
              <select
                id="businessType"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                aria-describedby="businessType-ajuda"
                className="h-10 w-full rounded-xl border border-white/10 bg-white/4 px-3 text-base text-white transition-colors focus-visible:border-[#E11D2E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D2E]/40 md:text-sm [&>option]:bg-[#141515] [&>option]:text-white"
              >
                {BUSINESS_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="whatsappNumber" className={ROTULO}>
                WhatsApp da loja
              </Label>
              <Input
                id="whatsappNumber"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                required
                placeholder="(11) 99999-9999"
                className={CAMPO_DE_ACESSO_COMPACTO}
              />
            </div>
          </div>

          {/* A ajuda do ramo fica embaixo do par inteiro: dentro da meia coluna
              ela quebraria em três linhas e comeria a altura que o par economiza. */}
          <p id="businessType-ajuda" className={AJUDA}>
            Seu cardápio já nasce com categorias e itens desse ramo — é só ajustar depois.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="document" className={ROTULO}>
            CPF ou CNPJ
          </Label>
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
                ? `${CAMPO_DE_ACESSO_COMPACTO} border-red-500/70 focus-visible:border-red-500 focus-visible:ring-red-500/40`
                : documentoOk
                  ? `${CAMPO_DE_ACESSO_COMPACTO} border-emerald-500/70 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/40`
                  : CAMPO_DE_ACESSO_COMPACTO
            }
          />
          <p id="document-ajuda" className={documentoInvalido ? "text-xs text-red-400" : AJUDA}>
            {documentoInvalido
              ? "Informe um CPF ou CNPJ válido."
              : "Pode ser o seu CPF ou o CNPJ da empresa. A máscara se ajusta sozinha."}
          </p>
        </div>

        <hr className="border-white/10" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="adminName" className={ROTULO}>
              Seu nome
            </Label>
            <Input
              id="adminName"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
              minLength={2}
              className={CAMPO_DE_ACESSO_COMPACTO}
            />
          </div>

          <div className="space-y-1.5">
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
              className={CAMPO_DE_ACESSO_COMPACTO}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className={ROTULO}>
            Senha
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className={CAMPO_DE_ACESSO_COMPACTO}
          />
          <p className={AJUDA}>Mínimo de 8 caracteres.</p>
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
          {pending ? "Criando sua loja..." : "Criar conta grátis"}
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
