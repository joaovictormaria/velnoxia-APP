/**
 * Grupos de opções prontos, por ramo.
 *
 * Existe para o dono não encarar uma tela em branco perguntando "que grupo eu
 * crio?". Ele clica em "Sabor" e a pergunta vem montada com as opções do
 * negócio dele — e edita dali, como faz com o cardápio inicial.
 */

export type GrupoSugerido = {
  name: string;
  minChoices: number;
  maxChoices: number;
  freeChoices: number;
  options: { name: string; price: number }[];
};

const semCusto = (nomes: string[]) => nomes.map((name) => ({ name, price: 0 }));
const comCusto = (pares: [string, number][]) =>
  pares.map(([name, price]) => ({ name, price }));

/** Escolher um sabor: obrigatório, único e sem acréscimo. */
const sabor = (opcoes: string[]): GrupoSugerido => ({
  name: "Sabor",
  minChoices: 1,
  maxChoices: 1,
  freeChoices: 0,
  options: semCusto(opcoes),
});

const POR_RAMO: Record<string, GrupoSugerido[]> = {
  pizzaria: [
    {
      name: "Borda",
      minChoices: 0,
      maxChoices: 1,
      freeChoices: 0,
      options: comCusto([
        ["Sem borda recheada", 0],
        ["Catupiry", 8],
        ["Cheddar", 8],
        ["Chocolate", 10],
      ]),
    },
    {
      name: "Adicionais",
      minChoices: 0,
      maxChoices: 5,
      freeChoices: 0,
      options: comCusto([
        ["Bacon", 6],
        ["Queijo extra", 6],
        ["Milho", 4],
      ]),
    },
  ],

  hamburgueria: [
    {
      name: "Ponto da carne",
      minChoices: 1,
      maxChoices: 1,
      freeChoices: 0,
      options: semCusto(["Ao ponto", "Bem passado", "Mal passado"]),
    },
    {
      name: "Adicionais",
      minChoices: 0,
      maxChoices: 5,
      freeChoices: 0,
      options: comCusto([
        ["Bacon", 5],
        ["Cheddar", 4],
        ["Ovo", 3],
        ["Salada", 2],
      ]),
    },
  ],

  "hot-dog": [
    {
      name: "Cobertura",
      minChoices: 0,
      maxChoices: 6,
      freeChoices: 0,
      options: comCusto([
        ["Batata palha", 0],
        ["Milho", 0],
        ["Ervilha", 0],
        ["Cheddar", 4],
        ["Bacon", 4],
      ]),
    },
  ],

  marmitaria: [
    {
      name: "Proteína",
      minChoices: 1,
      maxChoices: 1,
      freeChoices: 0,
      options: semCusto(["Bife acebolado", "Frango grelhado", "Carne moída", "Peixe"]),
    },
    {
      name: "Acompanhamentos",
      minChoices: 2,
      maxChoices: 2,
      freeChoices: 2,
      options: semCusto(["Arroz", "Feijão", "Farofa", "Salada", "Batata frita", "Legumes"]),
    },
  ],

  acai: [
    {
      name: "Complementos",
      minChoices: 0,
      maxChoices: 8,
      freeChoices: 3,
      options: comCusto([
        ["Granola", 3],
        ["Leite condensado", 3],
        ["Paçoca", 3],
        ["Banana", 3],
        ["Morango", 6],
        ["Nutella", 9],
      ]),
    },
  ],

  sorvetes: [
    sabor(["Chocolate", "Morango", "Baunilha", "Creme", "Flocos"]),
    {
      name: "Cobertura",
      minChoices: 0,
      maxChoices: 3,
      freeChoices: 1,
      options: comCusto([
        ["Calda de chocolate", 4],
        ["Chantilly", 4],
        ["Granulado", 3],
        ["Castanhas", 5],
      ]),
    },
  ],

  cafeteria: [
    {
      name: "Leite",
      minChoices: 1,
      maxChoices: 1,
      freeChoices: 0,
      options: comCusto([
        ["Integral", 0],
        ["Desnatado", 0],
        ["Vegetal", 5],
      ]),
    },
    {
      name: "Temperatura",
      minChoices: 1,
      maxChoices: 1,
      freeChoices: 0,
      options: semCusto(["Quente", "Gelado"]),
    },
  ],

  confeitaria: [sabor(["Chocolate", "Morango", "Ninho", "Limão", "Prestígio"])],

  japones: [
    {
      name: "Acompanha",
      minChoices: 0,
      maxChoices: 4,
      freeChoices: 2,
      options: comCusto([
        ["Shoyu", 0],
        ["Wasabi", 0],
        ["Gengibre", 0],
        ["Cream cheese extra", 6],
      ]),
    },
  ],

  bar: [
    {
      name: "Acompanha",
      minChoices: 0,
      maxChoices: 3,
      freeChoices: 1,
      options: comCusto([
        ["Limão", 0],
        ["Molho da casa", 0],
        ["Pimenta", 0],
        ["Vinagrete", 4],
      ]),
    },
  ],

  saudavel: [
    {
      name: "Proteína",
      minChoices: 1,
      maxChoices: 1,
      freeChoices: 0,
      options: comCusto([
        ["Frango", 0],
        ["Ovo", 0],
        ["Grão-de-bico", 0],
        ["Salmão", 12],
      ]),
    },
  ],

  restaurante: [
    {
      name: "Acompanhamentos",
      minChoices: 0,
      maxChoices: 3,
      freeChoices: 2,
      options: comCusto([
        ["Arroz", 0],
        ["Feijão", 0],
        ["Farofa", 0],
        ["Batata frita", 6],
      ]),
    },
  ],
};

/**
 * Ramos que herdam o cardápio de outro herdam também as sugestões — a comida é
 * a mesma, as perguntas também.
 */
const HERDA: Record<string, string> = {
  "fast-food": "hamburgueria",
  "comida-caseira": "restaurante",
  "comida-brasileira": "restaurante",
};

export function gruposSugeridos(businessType: string): GrupoSugerido[] {
  const chave = HERDA[businessType] ?? businessType;
  return POR_RAMO[chave] ?? [];
}
