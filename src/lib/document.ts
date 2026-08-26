/**
 * CPF e CNPJ: normalizacao, validacao, formatacao e mascaramento.
 *
 * Sem dependencia externa de proposito. As duas contas de digito verificador
 * cabem em vinte linhas, sao estaveis ha decadas e nao valem uma biblioteca a
 * mais na arvore — que precisaria ser auditada, atualizada e carregada tambem
 * no navegador, ja que a mascara do formulario usa este mesmo arquivo.
 *
 * O modulo e puro: nao le ambiente, nao toca banco, nao registra log. E por
 * isso que ele pode rodar no servidor e no cliente sem adaptacao, e que os
 * testes dele nao precisam de Postgres.
 */

export type DocumentType = "CPF" | "CNPJ";

export type DocumentResult =
  | { valido: true; documento: string; tipo: DocumentType }
  | { valido: false; erro: DocumentError };

/**
 * O motivo da recusa, e nao so "invalido".
 *
 * Quem digitou nove digitos precisa ouvir algo diferente de quem digitou onze
 * com o verificador errado — a primeira pessoa esta no meio da digitacao, a
 * segunda errou um numero.
 */
export type DocumentError =
  | "VAZIO"
  | "TAMANHO_INVALIDO"
  | "DIGITOS_REPETIDOS"
  | "VERIFICADOR_INVALIDO";

/**
 * Deixa so os digitos.
 *
 * Aceita ponto, traco, barra e espaco porque e assim que a pessoa digita e e
 * assim que vem de um colar do navegador. Qualquer outro caractere sobrevive a
 * esta funcao e morre na checagem de tamanho — nao ha por que decidir aqui se
 * uma letra e erro de digitacao ou tentativa de injecao.
 */
export function normalizeDocument(entrada: string | null | undefined): string {
  return (entrada ?? "").replace(/\D/g, "");
}

/**
 * O tipo pelo tamanho, que e o unico sinal confiavel.
 *
 * Nao existe ambiguidade: CPF tem 11 digitos e CNPJ tem 14. Devolve null para
 * qualquer outro tamanho em vez de chutar, porque chutar aqui faria a mensagem
 * de erro falar do documento errado.
 */
export function detectDocumentType(entrada: string | null | undefined): DocumentType | null {
  const d = normalizeDocument(entrada);
  if (d.length === 11) return "CPF";
  if (d.length === 14) return "CNPJ";
  return null;
}

/** Todos os digitos iguais passam nas duas contas de verificador, mas nao existem. */
function digitosRepetidos(d: string): boolean {
  return /^(\d)\1+$/.test(d);
}

/**
 * O digito verificador, que e a mesma conta nos dois documentos.
 *
 * Soma cada digito multiplicado pelo seu peso, tira o resto por 11 e inverte.
 * Resto 0 e 1 viram digito 0 — e a regra da Receita, nao um caso especial
 * nosso.
 */
function digitoVerificador(digitos: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Pesos decrescentes a partir de 10 e 11, sobre 9 e 10 digitos. */
const CPF_PESOS_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
const CPF_PESOS_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

/** Pesos ciclicos de 2 a 9, lidos da direita para a esquerda. */
const CNPJ_PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Aceita com ou sem mascara; devolve o motivo quando recusa. */
export function validateCPF(entrada: string | null | undefined): DocumentResult {
  const d = normalizeDocument(entrada);
  if (d.length === 0) return { valido: false, erro: "VAZIO" };
  if (d.length !== 11) return { valido: false, erro: "TAMANHO_INVALIDO" };
  if (digitosRepetidos(d)) return { valido: false, erro: "DIGITOS_REPETIDOS" };

  const dv1 = digitoVerificador(d, CPF_PESOS_1);
  const dv2 = digitoVerificador(d, CPF_PESOS_2);
  if (dv1 !== Number(d[9]) || dv2 !== Number(d[10])) {
    return { valido: false, erro: "VERIFICADOR_INVALIDO" };
  }
  return { valido: true, documento: d, tipo: "CPF" };
}

/** Aceita com ou sem mascara; devolve o motivo quando recusa. */
export function validateCNPJ(entrada: string | null | undefined): DocumentResult {
  const d = normalizeDocument(entrada);
  if (d.length === 0) return { valido: false, erro: "VAZIO" };
  if (d.length !== 14) return { valido: false, erro: "TAMANHO_INVALIDO" };
  if (digitosRepetidos(d)) return { valido: false, erro: "DIGITOS_REPETIDOS" };

  const dv1 = digitoVerificador(d, CNPJ_PESOS_1);
  const dv2 = digitoVerificador(d, CNPJ_PESOS_2);
  if (dv1 !== Number(d[12]) || dv2 !== Number(d[13])) {
    return { valido: false, erro: "VERIFICADOR_INVALIDO" };
  }
  return { valido: true, documento: d, tipo: "CNPJ" };
}

/**
 * A porta unica: descobre o tipo e valida de acordo.
 *
 * E esta que o backend chama. O tipo nunca vem do cliente — vem do tamanho do
 * que a pessoa digitou, aqui dentro. Um formulario que mandasse
 * `documentType: "CPF"` junto de 14 digitos nao teria como enganar ninguem.
 */
export function validateDocument(entrada: string | null | undefined): DocumentResult {
  const d = normalizeDocument(entrada);
  if (d.length === 0) return { valido: false, erro: "VAZIO" };
  const tipo = detectDocumentType(d);
  if (tipo === null) return { valido: false, erro: "TAMANHO_INVALIDO" };
  return tipo === "CPF" ? validateCPF(d) : validateCNPJ(d);
}

/**
 * Poe a mascara de volta, para exibir.
 *
 * Devolve o que recebeu quando o tamanho nao bate: uma tela que mostra um
 * documento pela metade e melhor do que uma que quebra ao renderiza-lo.
 */
export function formatDocument(entrada: string | null | undefined): string {
  const d = normalizeDocument(entrada);
  if (d.length === 11) {
    return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  if (d.length === 14) {
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  return entrada ?? "";
}

/**
 * A versao que pode ir para o log de auditoria.
 *
 * Documento e dado pessoal: guardar o numero inteiro numa segunda tabela
 * multiplica o estrago de um vazamento sem melhorar o rastro. O que sobra
 * — os ultimos digitos — basta para o dono conferir *qual* documento era, sem
 * que a auditoria vire uma copia da base.
 *
 *   CPF  123.456.789-09  ->  ***.***.789-09
 *   CNPJ 12.345.678/0001-90 -> **.***.***\/****-90
 */
export function maskDocument(entrada: string | null | undefined): string {
  const d = normalizeDocument(entrada);
  if (d.length === 11) return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  if (d.length === 14) return `**.***.***/****-${d.slice(12, 14)}`;
  return "***";
}

/**
 * A mascara enquanto a pessoa ainda esta digitando.
 *
 * Diferente do `formatDocument`, que so sabe lidar com documento completo:
 * aqui cada digito novo entra numa mascara que ja esta meio montada, porque e
 * isso que o campo mostra a cada tecla.
 *
 * A troca de forma acontece no 12o digito. Ate 11 o desenho e de CPF; do 12 em
 * diante vira CNPJ e os separadores se remontam sozinhos. E o que faz um unico
 * campo servir para os dois documentos sem perguntar qual e.
 *
 *   "123"            -> "123"
 *   "1234567890"     -> "123.456.789-0"
 *   "12345678000"    -> "123.456.780-00"     (ainda CPF: 11 digitos)
 *   "123456780001"   -> "12.345.678/0001"    (virou CNPJ no 12o)
 *   "12345678000195" -> "12.345.678/0001-95"
 *
 * Digitos alem de 14 sao descartados: nao existe documento maior, e deixar
 * crescer so daria a impressao de que o campo aceitou.
 */
export function formatDocumentInput(entrada: string | null | undefined): string {
  const d = normalizeDocument(entrada).slice(0, 14);
  if (d.length === 0) return "";

  if (d.length <= 11) {
    // CPF: 000.000.000-00
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }

  // CNPJ: 00.000.000/0000-00
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

/**
 * Se ja da para julgar o documento, ou a pessoa ainda esta no meio da digitacao.
 *
 * Existe para o formulario nao acusar erro cedo demais: quem digitou cinco
 * digitos nao errou nada, so nao terminou. Erro so quando o tamanho fecha em
 * CPF ou CNPJ — 11 ou 14 digitos.
 */
export function documentoCompleto(entrada: string | null | undefined): boolean {
  return detectDocumentType(entrada) !== null;
}

/**
 * Onde o cursor deve ficar depois que a mascara foi reaplicada.
 *
 * O campo mostra um valor derivado do estado, entao a cada tecla o React
 * reescreve o texto inteiro e o navegador joga o cursor para o fim. Quem
 * estivesse corrigindo o terceiro digito perdia o lugar.
 *
 * Nao tenta somar ou subtrair posicoes: um separador que entra ou sai desloca
 * tudo o que vem depois, e a conta erraria de um em um. Conta quantos DIGITOS
 * existiam antes do cursor e procura essa mesma contagem no texto ja formatado
 * — digito e a unica coisa que a mascara nao muda de lugar.
 *
 * Fica aqui, e nao dentro do componente, para poder ser testada sem navegador:
 * e a parte com mais chance de errar por um caractere.
 */
export function posicaoDoCursorAposMascara(
  textoDigitado: string,
  posicaoDoCursor: number,
  textoFormatado: string,
): number {
  const digitosAntes = normalizeDocument(
    textoDigitado.slice(0, posicaoDoCursor),
  ).length;

  let posicao = 0;
  let contados = 0;
  while (posicao < textoFormatado.length && contados < digitosAntes) {
    if (/[0-9]/.test(textoFormatado[posicao])) contados++;
    posicao++;
  }
  return posicao;
}
