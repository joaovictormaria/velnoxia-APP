import { describe, it, expect } from "vitest";
import {
  adicionarItem,
  alterarQuantidade,
  extrasDoProduto,
  faltaResponder,
  paraCheckout,
  precoDoItem,
  removerItem,
  substituirItem,
  totalDeItens,
  type ItemDoBalcao,
} from "./carrinho";

/*
 * O CARRINHO DO BALCÃO, sem banco e sem tela.
 *
 * O que estes testes trancam é a montagem: somar linhas iguais, sumir com a
 * linha que chegou a zero, e não deixar a prévia de preço divergir da regra
 * que o servidor aplica na cota grátis.
 */

const base = {
  productId: "p1",
  productSlug: "x-burger",
  nome: "X-Burger",
  imageUrl: null,
  categoryId: "c1",
  optionIds: [] as string[],
  extraIds: [] as string[],
  quantity: 1,
};

describe("balcão · carrinho", () => {
  it("adiciona um produto", () => {
    const itens = adicionarItem([], base);
    expect(itens).toHaveLength(1);
    expect(itens[0].nome).toBe("X-Burger");
    expect(itens[0].quantity).toBe(1);
    expect(itens[0].uid).toBeTruthy();
  });

  it("o mesmo produto com a mesma configuração vira UMA linha, com a soma", () => {
    let itens = adicionarItem([], base);
    itens = adicionarItem(itens, { ...base, quantity: 2 });
    expect(itens).toHaveLength(1);
    expect(itens[0].quantity).toBe(3);
  });

  it("o mesmo produto com adicionais diferentes vira DUAS linhas", () => {
    let itens = adicionarItem([], { ...base, extraIds: ["bacon"] });
    itens = adicionarItem(itens, { ...base, extraIds: ["cheddar"] });
    expect(itens).toHaveLength(2);
  });

  it("a ordem dos adicionais não cria uma linha nova", () => {
    let itens = adicionarItem([], { ...base, extraIds: ["bacon", "cheddar"] });
    itens = adicionarItem(itens, { ...base, extraIds: ["cheddar", "bacon"] });
    expect(itens).toHaveLength(1);
    expect(itens[0].quantity).toBe(2);
  });

  it("observação diferente é item diferente — 'sem cebola' muda o prato", () => {
    let itens = adicionarItem([], { ...base, note: "sem cebola" });
    itens = adicionarItem(itens, base);
    expect(itens).toHaveLength(2);
  });

  it("aumenta e diminui a quantidade", () => {
    let itens = adicionarItem([], { ...base, quantity: 2 });
    const uid = itens[0].uid;
    itens = alterarQuantidade(itens, uid, 1);
    expect(itens[0].quantity).toBe(3);
    itens = alterarQuantidade(itens, uid, -1);
    expect(itens[0].quantity).toBe(2);
  });

  it("chegar a zero REMOVE a linha, em vez de deixá-la com quantidade 0", () => {
    let itens = adicionarItem([], base);
    itens = alterarQuantidade(itens, itens[0].uid, -1);
    expect(itens).toHaveLength(0);
  });

  it("remove o item escolhido e só ele", () => {
    let itens = adicionarItem([], base);
    itens = adicionarItem(itens, { ...base, productSlug: "coca", nome: "Coca-Cola" });
    itens = removerItem(itens, itens[0].uid);
    expect(itens).toHaveLength(1);
    expect(itens[0].nome).toBe("Coca-Cola");
  });

  it("editar uma linha mantém a POSIÇÃO dela na lista", () => {
    let itens = adicionarItem([], base);
    itens = adicionarItem(itens, { ...base, productSlug: "coca", nome: "Coca-Cola" });
    const uid = itens[0].uid;
    itens = substituirItem(itens, uid, { ...base, quantity: 5 });
    expect(itens[0].quantity).toBe(5);
    expect(itens[1].nome).toBe("Coca-Cola");
  });

  it("editar até ficar igual a outra linha junta as duas", () => {
    let itens = adicionarItem([], { ...base, extraIds: ["bacon"], quantity: 2 });
    itens = adicionarItem(itens, { ...base, quantity: 1 });
    // A segunda linha ganha bacon e vira a primeira.
    itens = substituirItem(itens, itens[1].uid, { ...base, extraIds: ["bacon"], quantity: 1 });
    expect(itens).toHaveLength(1);
    expect(itens[0].quantity).toBe(3);
  });

  it("conta as unidades, e não as linhas", () => {
    let itens = adicionarItem([], { ...base, quantity: 2 });
    itens = adicionarItem(itens, { ...base, productSlug: "coca", quantity: 3 });
    expect(totalDeItens(itens)).toBe(5);
    expect(itens).toHaveLength(2);
  });

  it("converte para o formato que o checkout já conhece", () => {
    const itens: ItemDoBalcao[] = [
      {
        ...base,
        uid: "l1",
        sizeId: "g",
        optionIds: ["o1"],
        extraIds: ["bacon"],
        quantity: 2,
        note: "  bem passado  ",
      },
    ];
    expect(paraCheckout(itens)).toEqual([
      {
        productSlug: "x-burger",
        sizeId: "g",
        optionIds: ["o1"],
        extraIds: ["bacon"],
        quantity: 2,
        note: "bem passado",
      },
    ]);
  });

  it("observação em branco não vira observação", () => {
    const itens: ItemDoBalcao[] = [{ ...base, uid: "l1", note: "   " }];
    expect(paraCheckout(itens)[0].note).toBeUndefined();
  });
});

describe("balcão · adicionais do produto", () => {
  const extras = [
    { id: "bacon", price: 4, categoryIds: ["c1"], productIds: [] },
    { id: "borda", price: 8, categoryIds: ["c2"], productIds: [] },
    { id: "molho", price: 2, categoryIds: [], productIds: ["p1"] },
  ];

  it("mostra os da categoria e os marcados no próprio produto", () => {
    const oferecidos = extrasDoProduto(extras, { id: "p1", categoryId: "c1" });
    expect(oferecidos.map((e) => e.id).sort()).toEqual(["bacon", "molho"]);
  });

  it("não mostra adicional de outra categoria", () => {
    const oferecidos = extrasDoProduto(extras, { id: "p9", categoryId: "c9" });
    expect(oferecidos).toHaveLength(0);
  });
});

describe("balcão · prévia de preço", () => {
  const produto = {
    basePrice: 20,
    sizes: [
      { id: "p", price: 20 },
      { id: "g", price: 32 },
    ],
    optionGroups: [
      {
        id: "g1",
        name: "Complementos",
        minChoices: 0,
        maxChoices: 3,
        freeChoices: 1,
        options: [
          { id: "leite", name: "Leite condensado", price: 3 },
          { id: "morango", name: "Morango", price: 5 },
        ],
      },
    ],
  };
  const extras = [{ id: "bacon", price: 4 }];

  it("sem escolhas, é o preço base", () => {
    const r = precoDoItem(produto, { optionIds: [], extraIds: [], quantity: 1 }, extras);
    expect(r.unitario).toBe(20);
    expect(r.total).toBe(20);
  });

  it("o tamanho escolhido substitui o preço base", () => {
    const r = precoDoItem(
      produto,
      { sizeId: "g", optionIds: [], extraIds: [], quantity: 2 },
      extras,
    );
    expect(r.unitario).toBe(32);
    expect(r.total).toBe(64);
  });

  it("o adicional entra na conta, e a quantidade multiplica tudo", () => {
    const r = precoDoItem(
      produto,
      { optionIds: [], extraIds: ["bacon"], quantity: 3 },
      extras,
    );
    expect(r.unitario).toBe(24);
    expect(r.total).toBe(72);
  });

  it("a cota grátis vale para a opção MAIS CARA, como no servidor", () => {
    // Morango (5) é grátis; leite (3) é cobrado.
    const r = precoDoItem(
      produto,
      { optionIds: ["leite", "morango"], extraIds: [], quantity: 1 },
      extras,
    );
    expect(r.unitario).toBe(23);
  });
});

describe("balcão · perguntas obrigatórias", () => {
  const grupos = [
    {
      id: "g1",
      name: "Sabor",
      minChoices: 1,
      maxChoices: 1,
      freeChoices: 0,
      options: [
        { id: "morango", name: "Morango", price: 0 },
        { id: "chocolate", name: "Chocolate", price: 0 },
      ],
    },
  ];

  it("acusa a pergunta não respondida, com a mesma frase do servidor", () => {
    expect(faltaResponder(grupos, [])).toBe('Escolha uma opção em "Sabor".');
  });

  it("respondida, não acusa nada", () => {
    expect(faltaResponder(grupos, ["morango"])).toBeNull();
  });

  it("produto sem pergunta nenhuma nunca fica bloqueado", () => {
    expect(faltaResponder([], [])).toBeNull();
  });
});
