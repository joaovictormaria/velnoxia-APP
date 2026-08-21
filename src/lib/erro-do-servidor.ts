/**
 * A mensagem que a tela mostra quando uma função de servidor **lança** em vez
 * de responder.
 *
 * Existem dois jeitos de uma chamada dar errado, e eles não se parecem. O
 * previsto — "e-mail já cadastrado", "cupom expirado" — volta como
 * `{ ok: false, error }` e a tela já sabe ler. O outro é a validação recusando
 * a entrada antes do handler rodar: aí a promessa **rejeita**, e quem só trata
 * o primeiro caso fica esperando para sempre.
 *
 * Foi o que aconteceu no cadastro: um e-mail digitado sem o ponto do ".com" era
 * recusado pelo servidor com "Informe um e-mail válido.", e a tela não mostrava
 * nada — o botão ficava preso em "Criando sua loja..." e o lojista não tinha
 * como saber o que corrigir. O erro existia, escrito e em português, e morria
 * no console.
 *
 * O Zod chega aqui com a lista de problemas em JSON dentro de `message`. Só a
 * primeira interessa: é o primeiro campo que a pessoa precisa arrumar, e a
 * segunda aparece sozinha quando ela tentar de novo.
 */
export function mensagemDoErro(erro: unknown, padrao: string): string {
  const bruto = erro instanceof Error ? erro.message : typeof erro === "string" ? erro : "";
  if (!bruto) return padrao;

  try {
    const conteudo: unknown = JSON.parse(bruto);
    if (Array.isArray(conteudo)) {
      const problema = conteudo.find(
        (i): i is { message: string } =>
          typeof i === "object" &&
          i !== null &&
          typeof (i as { message?: unknown }).message === "string" &&
          (i as { message: string }).message.length > 0,
      );
      if (problema) return problema.message;
    }
  } catch {
    // Não era a lista do Zod. Cai no padrão logo abaixo.
  }

  /*
   * Qualquer outra falha vira a frase genérica de propósito. O texto cru de um
   * erro de servidor costuma trazer caminho de arquivo, nome de tabela ou
   * pedaço de stack — nada disso ajuda quem está preenchendo um formulário, e
   * mostrá-lo conta do lado de fora como o sistema é feito por dentro.
   */
  return padrao;
}
