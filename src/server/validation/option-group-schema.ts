import { z } from "zod";

/**
 * As perguntas feitas ao pedir: sabor, ponto da carne, complementos.
 *
 * min/max/free cobrem o que cada ramo precisa sem um campo por caso:
 * obrigatório é min>=1, escolha única é max=1, e "3 grátis depois paga" é
 * free=3.
 *
 * Vale igual para categoria e para produto — a regra da pergunta não muda
 * conforme quem a faz, só o alcance dela.
 */
export const optionGroupsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "O grupo precisa de um nome.").max(40),
      minChoices: z.number().int().min(0).max(20),
      maxChoices: z.number().int().min(1).max(20),
      freeChoices: z.number().int().min(0).max(20),
      options: z
        .array(
          z.object({
            name: z.string().trim().min(1, "A opção precisa de um nome.").max(40),
            price: z.number().nonnegative(),
          }),
        )
        .max(40),
    }),
  )
  .max(6)
  .optional();
