/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A APARÊNCIA DOS CAMPOS DO ESTOQUE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quatro telas do módulo pediam o mesmo campo — movimentações, receitas,
 * preparados e o cadastro de item —, e cada uma escrevia a própria string de
 * classe. Foi assim que elas divergiram: umas com `bg-background`, que nesta
 * área não resolve para nada, outras com `border` sem cor, e nenhuma com anel
 * de foco. Um campo cinza-claro sobre fundo branco, sem foco visível, é a
 * queixa de "os campos estão apagados".
 *
 * Aqui é só APARÊNCIA. Nada de estado, nada de validação — quem importa isto
 * continua dono do próprio comportamento.
 */

/*
 * A SETA DO SELECT, DESENHADA AQUI.
 *
 * A seta nativa é cinza-claro e pequena, e muda de forma em cada navegador —
 * no Chrome do Windows quase some contra a borda, e o campo fica com cara de
 * caixa de texto que não abre. `appearance-none` remove aquela seta e esta
 * entra no lugar, igual nos três.
 *
 * Continua sendo um `<select>` nativo: no celular abre a roleta do sistema,
 * melhor do que qualquer lista desenhada à mão.
 */
export const SETA_DO_SELECT =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23525252' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

/** Texto, número, data — qualquer `<input>` de uma linha, e o `<textarea>`. */
export const campo =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "placeholder:text-neutral-400 transition-colors focus:border-neutral-900 focus:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500 " +
  "motion-reduce:transition-none";

/** O mesmo campo, com espaço à direita para a seta. Use com `estiloDaSeta`. */
export const selecao = `${campo} cursor-pointer appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10`;

/**
 * A seta vai por `style` porque é uma data URI: o Tailwind não gera classe
 * para valor arbitrário com aspas e `%` dentro.
 */
export const estiloDaSeta = { backgroundImage: SETA_DO_SELECT } as const;

export const rotulo = "mb-1.5 block text-sm font-medium text-neutral-700";
export const ajuda = "mt-1 text-xs leading-snug text-neutral-500";

/** O asterisco de obrigatório, no vermelho da marca. */
export const marcaObrigatorio = "text-[#E11D2E]";

/** A ação principal de um formulário. Uma por tela. */
export const botaoPrimario =
  "rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white transition-colors " +
  "hover:bg-[#c4172a] focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-[#E11D2E] disabled:cursor-not-allowed disabled:opacity-50 " +
  "motion-reduce:transition-none";

/** Cancelar, voltar, fechar — o que acompanha a ação principal sem competir. */
export const botaoSecundario =
  "rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 " +
  "transition-colors hover:bg-neutral-50 focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed " +
  "disabled:opacity-50 motion-reduce:transition-none";
