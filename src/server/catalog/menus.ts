import type { StarterCatalog } from "./catalog-types";

/**
 * Cardápios iniciais dos ramos que não têm um menu próprio no arquivo antigo.
 *
 * Cada um é só o ponto de partida: o dono abre o painel e encontra um cardápio
 * plausível do ramo dele em vez de uma tela vazia, e edita tudo dali. Os preços
 * são de mercado médio e servem para ele ter o que ajustar, não para acertar.
 *
 * Sem fotos por enquanto — sem `imageUrl`, a vitrine cai no ícone da categoria,
 * que é um estado desenhado e não um buraco.
 */

const BEBIDAS_COMUNS = {
  name: "Bebidas",
  slug: "bebidas",
  icon: "CupSoda",
  kind: "SIMPLE" as const,
  products: [
    { name: "Refrigerante Lata", description: "Coca-Cola, Guaraná ou Fanta, 350ml.", basePrice: 6.9 },
    { name: "Suco Natural 500ml", description: "Laranja, limão ou maracujá.", basePrice: 9.9 },
    { name: "Água Mineral", description: "500ml, com ou sem gás.", basePrice: 4.5 },
  ],
};

export const RESTAURANTE: StarterCatalog = {
  label: "Restaurante",
  tagline: "Restaurante",
  description: "Comida de verdade, feita todo dia, do jeito que se come em casa.",
  categories: [
    {
      name: "Pratos do dia",
      slug: "pratos-do-dia",
      badge: "Feito na hora",
      headline: "O prato do dia, quentinho.",
      subhead: "Servido com arroz, feijão e acompanhamentos.",
      icon: "UtensilsCrossed",
      kind: "SIMPLE",
      products: [
        { name: "Prato Feito", description: "Arroz, feijão, bife acebolado, batata frita e salada.", basePrice: 26.9, tag: "Mais pedido" },
        { name: "Frango Grelhado", description: "Filé de frango grelhado, arroz, feijão e legumes.", basePrice: 25.9 },
        { name: "Bife à Parmegiana", description: "Bife empanado ao molho e queijo, com arroz e fritas.", basePrice: 34.9 },
        { name: "Peixe Frito", description: "Filé de peixe frito, arroz, pirão e salada.", basePrice: 32.9 },
      ],
    },
    {
      name: "Executivos",
      slug: "executivos",
      badge: "Almoço rápido",
      headline: "Porção individual, na medida.",
      subhead: "Pra quem tem uma hora de almoço.",
      icon: "Clock",
      kind: "SIMPLE",
      products: [
        { name: "Executivo de Carne", description: "Porção individual com arroz, feijão e guarnição.", basePrice: 22.9 },
        { name: "Executivo de Frango", description: "Porção individual com arroz, feijão e guarnição.", basePrice: 21.9 },
        { name: "Executivo Vegetariano", description: "Legumes salteados, arroz integral e salada.", basePrice: 21.9 },
      ],
    },
    {
      name: "Porções",
      slug: "porcoes",
      badge: "Pra dividir",
      headline: "Porções pra mesa toda.",
      subhead: "Serve de duas a três pessoas.",
      icon: "Utensils",
      kind: "SIMPLE",
      products: [
        { name: "Batata Frita", description: "Porção generosa, bem sequinha.", basePrice: 24.9 },
        { name: "Frango a Passarinho", description: "Frango frito com alho e cheiro-verde.", basePrice: 39.9 },
        { name: "Calabresa Acebolada", description: "Calabresa fatiada com cebola e vinagrete.", basePrice: 34.9 },
      ],
    },
    BEBIDAS_COMUNS,
  ],
  extras: [
    { name: "Ovo frito", price: 3 },
    { name: "Farofa", price: 4 },
    { name: "Vinagrete", price: 3 },
    { name: "Porção extra de arroz", price: 6 },
  ],
  promotions: [
    { eyebrow: "Almoço da semana", title: "Prato Feito + Refri", description: "O prato do dia com refrigerante lata.", discount: "-15%" },
    { eyebrow: "Pra dividir", title: "Porção + 2 Bebidas", description: "Qualquer porção com duas bebidas geladas." },
  ],
};

export const HOT_DOG: StarterCatalog = {
  label: "Hot Dog",
  tagline: "Hot Dog",
  description: "Cachorro-quente montado na hora, do simples ao caprichado.",
  categories: [
    {
      name: "Cachorros-quentes",
      slug: "cachorros-quentes",
      badge: "Montado na hora",
      headline: "Do simples ao completo.",
      subhead: "Você escolhe o que vai em cima.",
      icon: "Sandwich",
      kind: "SIMPLE",
      products: [
        { name: "Dog Simples", description: "Pão, salsicha, molho, milho e batata palha.", basePrice: 12.9 },
        { name: "Dog Completo", description: "Salsicha, purê, milho, ervilha, batata palha e queijo ralado.", basePrice: 17.9, tag: "Mais pedido" },
        { name: "Dog Duplo", description: "Duas salsichas, cheddar cremoso e bacon.", basePrice: 22.9 },
        { name: "Dog Frango", description: "Frango desfiado, catupiry e batata palha.", basePrice: 21.9 },
      ],
    },
    {
      name: "Prensados",
      slug: "prensados",
      badge: "Na chapa",
      headline: "Prensado até dourar.",
      subhead: "Pão crocante por fora.",
      icon: "Flame",
      kind: "SIMPLE",
      products: [
        { name: "Prensado de Calabresa", description: "Calabresa, queijo e cebola no pão prensado.", basePrice: 18.9 },
        { name: "Prensado Misto", description: "Presunto, queijo e orégano.", basePrice: 15.9 },
      ],
    },
    BEBIDAS_COMUNS,
  ],
  extras: [
    { name: "Bacon", price: 4 },
    { name: "Cheddar cremoso", price: 4 },
    { name: "Salsicha extra", price: 5 },
    { name: "Batata palha extra", price: 2 },
  ],
  promotions: [
    { eyebrow: "Combo do dia", title: "Dog Completo + Refri", description: "O completo com refrigerante lata.", discount: "-10%" },
    { eyebrow: "Pra dois", title: "2 Dogs Simples", description: "Leve dois dogs simples com desconto." },
  ],
};

export const CHURRASCARIA: StarterCatalog = {
  label: "Churrascaria",
  tagline: "Churrascaria",
  description: "Carne no ponto, na brasa, com os acompanhamentos que não podem faltar.",
  categories: [
    {
      name: "Carnes",
      slug: "carnes",
      badge: "Na brasa",
      headline: "Carne assada na hora do pedido.",
      subhead: "No ponto que você pedir.",
      icon: "Beef",
      kind: "SIMPLE",
      products: [
        { name: "Picanha na Brasa", description: "Picanha fatiada, com farofa e vinagrete.", basePrice: 89.9, tag: "Mais pedido" },
        { name: "Maminha", description: "Maminha assada lentamente, macia e suculenta.", basePrice: 69.9 },
        { name: "Costela no Bafo", description: "Costela bovina assada por horas.", basePrice: 74.9 },
        { name: "Linguiça Artesanal", description: "Linguiça de porco assada na brasa.", basePrice: 39.9 },
      ],
    },
    {
      name: "Espetos",
      slug: "espetos",
      badge: "Unidade",
      headline: "Espeto na brasa, um a um.",
      subhead: "Peça quantos quiser.",
      icon: "Flame",
      kind: "SIMPLE",
      products: [
        { name: "Espeto de Carne", description: "Alcatra em cubos, temperada no sal grosso.", basePrice: 14.9 },
        { name: "Espeto de Frango", description: "Peito de frango com pimentão e cebola.", basePrice: 12.9 },
        { name: "Espeto de Queijo Coalho", description: "Queijo coalho grelhado com melaço.", basePrice: 13.9 },
      ],
    },
    {
      name: "Acompanhamentos",
      slug: "acompanhamentos",
      badge: "Pra completar",
      headline: "O que vai junto da carne.",
      subhead: "Serve duas pessoas.",
      icon: "Utensils",
      kind: "SIMPLE",
      products: [
        { name: "Farofa da Casa", description: "Farofa com bacon e ovos.", basePrice: 16.9 },
        { name: "Arroz Branco", description: "Porção de arroz soltinho.", basePrice: 12.9 },
        { name: "Vinagrete", description: "Tomate, cebola e cheiro-verde.", basePrice: 9.9 },
        { name: "Pão de Alho", description: "Quatro unidades assadas na brasa.", basePrice: 18.9 },
      ],
    },
    BEBIDAS_COMUNS,
  ],
  extras: [
    { name: "Farofa extra", price: 6 },
    { name: "Vinagrete extra", price: 5 },
    { name: "Molho chimichurri", price: 6 },
    { name: "Pimenta artesanal", price: 4 },
  ],
  promotions: [
    { eyebrow: "Fim de semana", title: "Picanha + Acompanhamentos", description: "Picanha com farofa, arroz e vinagrete.", discount: "-15%" },
    { eyebrow: "Combo espetos", title: "5 Espetos", description: "Cinco espetos à sua escolha com preço fechado." },
  ],
};

export const CAFETERIA: StarterCatalog = {
  label: "Cafeteria / Padaria",
  tagline: "Cafeteria e padaria",
  description: "Café passado na hora, pão fresco e o que acompanha bem os dois.",
  categories: [
    {
      name: "Cafés",
      slug: "cafes",
      badge: "Passado na hora",
      headline: "Café fresco o dia todo.",
      subhead: "Do espresso ao cremoso.",
      icon: "Coffee",
      kind: "SIMPLE",
      products: [
        { name: "Espresso", description: "Dose curta, café moído na hora.", basePrice: 6.9 },
        { name: "Pingado", description: "Café com leite quente, o clássico da padaria.", basePrice: 7.9, tag: "Mais pedido" },
        { name: "Cappuccino", description: "Café, leite vaporizado e canela.", basePrice: 12.9 },
        { name: "Latte Gelado", description: "Café, leite e gelo, servido no copo alto.", basePrice: 14.9 },
      ],
    },
    {
      name: "Padaria",
      slug: "padaria",
      badge: "Saindo do forno",
      headline: "Pão fresco todo dia.",
      subhead: "Assado aqui mesmo.",
      icon: "Croissant",
      kind: "SIMPLE",
      products: [
        { name: "Pão na Chapa", description: "Pão francês na chapa com manteiga.", basePrice: 7.9 },
        { name: "Misto Quente", description: "Presunto e queijo no pão de forma prensado.", basePrice: 13.9 },
        { name: "Croissant", description: "Massa folhada amanteigada.", basePrice: 11.9 },
        { name: "Pão de Queijo", description: "Porção com quatro unidades.", basePrice: 12.9 },
      ],
    },
    {
      name: "Doces",
      slug: "doces",
      badge: "Feito na casa",
      headline: "Pra acompanhar o café.",
      subhead: "Fatia generosa.",
      icon: "CakeSlice",
      kind: "SIMPLE",
      products: [
        { name: "Bolo de Cenoura", description: "Fatia com cobertura de chocolate.", basePrice: 12.9 },
        { name: "Sonho", description: "Recheado com creme de baunilha.", basePrice: 9.9 },
        { name: "Torta de Limão", description: "Fatia com merengue maçaricado.", basePrice: 16.9 },
      ],
    },
    BEBIDAS_COMUNS,
  ],
  extras: [
    { name: "Dose extra de café", price: 4 },
    { name: "Leite vegetal", price: 5 },
    { name: "Chantilly", price: 4 },
    { name: "Requeijão", price: 4 },
  ],
  promotions: [
    { eyebrow: "Café da manhã", title: "Pingado + Pão na Chapa", description: "O combo da manhã com preço fechado.", discount: "-15%" },
    { eyebrow: "Tarde doce", title: "Café + Fatia de Bolo", description: "Qualquer café com uma fatia à escolha." },
  ],
};

export const BAR: StarterCatalog = {
  label: "Bar / Petiscaria",
  tagline: "Bar e petiscaria",
  description: "Porção pra dividir, bebida gelada e a mesa cheia.",
  categories: [
    {
      name: "Petiscos",
      slug: "petiscos",
      badge: "Pra dividir",
      headline: "Porção que serve a mesa.",
      subhead: "De duas a três pessoas.",
      icon: "Utensils",
      kind: "SIMPLE",
      products: [
        { name: "Batata Frita com Cheddar", description: "Batata sequinha com cheddar e bacon.", basePrice: 39.9, tag: "Mais pedido" },
        { name: "Frango a Passarinho", description: "Frango frito com alho e limão.", basePrice: 44.9 },
        { name: "Calabresa Acebolada", description: "Calabresa fatiada com cebola e pão.", basePrice: 36.9 },
        { name: "Isca de Peixe", description: "Tiras de peixe empanadas com molho tártaro.", basePrice: 49.9 },
      ],
    },
    {
      name: "Cervejas",
      slug: "cervejas",
      badge: "Sempre gelada",
      headline: "Trincando de gelada.",
      subhead: "Long neck e litrão.",
      icon: "Beer",
      kind: "SIMPLE",
      products: [
        { name: "Long Neck", description: "Cerveja long neck 355ml.", basePrice: 11.9 },
        { name: "Litrão", description: "Cerveja 1 litro, bem gelada.", basePrice: 18.9 },
        { name: "Balde com 6", description: "Seis long necks no balde de gelo.", basePrice: 64.9 },
      ],
    },
    {
      name: "Drinks",
      slug: "drinks",
      badge: "Feito na hora",
      headline: "Drinks preparados no balcão.",
      subhead: "Do clássico ao da casa.",
      icon: "Martini",
      kind: "SIMPLE",
      products: [
        { name: "Caipirinha", description: "Limão, açúcar e cachaça artesanal.", basePrice: 22.9 },
        { name: "Gin Tônica", description: "Gin, tônica e especiarias.", basePrice: 29.9 },
        { name: "Caipiroska de Frutas", description: "Vodka com a fruta da sua escolha.", basePrice: 26.9 },
      ],
    },
    BEBIDAS_COMUNS,
  ],
  extras: [
    { name: "Molho extra", price: 5 },
    { name: "Bacon", price: 7 },
    { name: "Limão extra", price: 3 },
    { name: "Gelo de coco", price: 5 },
  ],
  promotions: [
    { eyebrow: "Happy hour", title: "Balde + Porção", description: "Balde de long neck com uma porção à escolha.", discount: "-20%" },
    { eyebrow: "Toda quinta", title: "Dobro de Caipirinha", description: "Peça uma caipirinha e leve duas." },
  ],
};

export const SAUDAVEL: StarterCatalog = {
  label: "Saudável / Fitness",
  tagline: "Comida saudável",
  description: "Comida equilibrada, porção certa e ingrediente fresco todo dia.",
  categories: [
    {
      name: "Bowls",
      slug: "bowls",
      badge: "Equilibrado",
      headline: "Proteína, carboidrato e salada.",
      subhead: "Montado na medida certa.",
      icon: "Salad",
      kind: "SIMPLE",
      products: [
        { name: "Bowl de Frango", description: "Frango grelhado, arroz integral, brócolis e cenoura.", basePrice: 32.9, tag: "Mais pedido" },
        { name: "Bowl de Salmão", description: "Salmão grelhado, quinoa e legumes no vapor.", basePrice: 44.9 },
        { name: "Bowl Vegano", description: "Grão-de-bico, quinoa, abacate e folhas.", basePrice: 31.9 },
      ],
    },
    {
      name: "Saladas",
      slug: "saladas",
      badge: "Fresca do dia",
      headline: "Folhas colhidas no dia.",
      subhead: "Molho servido à parte.",
      icon: "Leaf",
      kind: "SIMPLE",
      products: [
        { name: "Salada Caesar", description: "Alface, frango grelhado, parmesão e croutons.", basePrice: 29.9 },
        { name: "Salada Caprese", description: "Tomate, muçarela de búfala e manjericão.", basePrice: 27.9 },
      ],
    },
    {
      name: "Sucos e shakes",
      slug: "sucos-e-shakes",
      badge: "Batido na hora",
      headline: "Fruta batida na hora.",
      subhead: "Sem açúcar adicionado.",
      icon: "GlassWater",
      kind: "SIMPLE",
      products: [
        { name: "Suco Verde", description: "Couve, maçã, limão e gengibre.", basePrice: 14.9 },
        { name: "Shake de Whey", description: "Whey protein, banana e leite vegetal.", basePrice: 19.9 },
        { name: "Suco Detox", description: "Abacaxi, hortelã e água de coco.", basePrice: 15.9 },
      ],
    },
    BEBIDAS_COMUNS,
  ],
  extras: [
    { name: "Proteína extra", price: 9 },
    { name: "Abacate", price: 6 },
    { name: "Castanhas", price: 5 },
    { name: "Ovo cozido", price: 4 },
  ],
  promotions: [
    { eyebrow: "Semana fit", title: "Bowl + Suco Verde", description: "Qualquer bowl com suco verde.", discount: "-15%" },
    { eyebrow: "Plano semanal", title: "5 Bowls", description: "Cinco bowls para a semana com preço fechado." },
  ],
};

/**
 * Sorveteria tem cardápio próprio, e não o do açaí.
 *
 * Os dois se parecem na vitrine — copo, taça, cobertura —, mas o nome do
 * produto é o que o dono lê ao abrir o painel: uma sorveteria encontrando
 * "Barca de Açaí" no próprio cardápio conclui que o cadastro errou de loja.
 */
export const SORVETES: StarterCatalog = {
  label: "Sorvetes",
  tagline: "Sorveteria",
  description: "Sorvete cremoso servido na hora, com as coberturas que você escolher.",
  categories: [
    {
      name: "Sorvetes",
      slug: "sorvetes",
      badge: "Servido na hora",
      headline: "Escolha o tamanho e o sabor.",
      subhead: "Cobertura por nossa conta.",
      icon: "IceCreamCone",
      kind: "SIMPLE",
      products: [
        { name: "Casquinha", description: "Uma bola no cone crocante.", basePrice: 8.9 },
        { name: "Copo 300ml", description: "Duas bolas com uma cobertura à escolha.", basePrice: 14.9, tag: "Mais pedido" },
        { name: "Taça 500ml", description: "Três bolas, calda e chantilly.", basePrice: 22.9 },
        { name: "Pote 1L", description: "Para levar pra casa, sabor à escolha.", basePrice: 39.9 },
      ],
    },
    {
      name: "Milkshakes",
      slug: "milkshakes",
      badge: "Batido na hora",
      headline: "Cremoso do jeito certo.",
      subhead: "Copo de 400ml.",
      icon: "GlassWater",
      kind: "SIMPLE",
      products: [
        { name: "Milkshake 400ml", description: "Chocolate, morango ou baunilha.", basePrice: 19.9 },
        { name: "Milkshake de Ovomaltine", description: "Com pedaços crocantes por cima.", basePrice: 24.9 },
      ],
    },
    {
      name: "Especiais",
      slug: "especiais",
      badge: "Pra dividir",
      headline: "Montagens caprichadas.",
      subhead: "Serve duas pessoas.",
      icon: "Cherry",
      kind: "SIMPLE",
      products: [
        { name: "Banana Split", description: "Três bolas, banana, calda e castanhas.", basePrice: 29.9 },
        { name: "Sundae Duplo", description: "Duas taças com calda quente e chantilly.", basePrice: 34.9 },
      ],
    },
    BEBIDAS_COMUNS,
  ],
  extras: [
    { name: "Calda de chocolate", price: 4 },
    { name: "Chantilly", price: 4 },
    { name: "Granulado", price: 3 },
    { name: "Castanhas", price: 5 },
  ],
  promotions: [
    { eyebrow: "Oferta da semana", title: "Taça em Dobro", description: "Peça uma taça de 500ml e leve duas.", discount: "-30%" },
    { eyebrow: "Pra levar", title: "Pote 1L com Desconto", description: "Sabor à sua escolha para levar pra casa." },
  ],
};
