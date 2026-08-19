# Imagens do catálogo inicial

Fotos que uma loja recém-cadastrada recebe, escolhidas por ramo. O lojista
troca qualquer uma pelo painel — estas são só o ponto de partida para o
cardápio não nascer vazio.

## Origem e licença

Todas do **Unsplash**, sob a [Unsplash License](https://unsplash.com/license):
uso comercial permitido, sem necessidade de atribuição. O crédito abaixo existe
para rastreabilidade, não por obrigação legal.

O identificador é o da URL de origem: `https://images.unsplash.com/photo-<id>`.

| Arquivo | ID Unsplash |
|---|---|
| pizzaria/hero-pizza.jpg | 1513104890138-7c749659a591 |
| pizzaria/hero-pizza-2.jpg | 1571997478779-2adcbbe9ab2f |
| pizzaria/hero-pizza-3.jpg | 1595854341625-f33ee10dbf94 |
| pizzaria/mussarela.jpg | 1574071318508-1cdbab80d002 |
| pizzaria/calabresa.jpg | 1565299624946-b28f40a0ae38 |
| pizzaria/portuguesa.jpg | 1571407970349-bc81e7e96d47 |
| pizzaria/quatro-queijos.jpg | 1593560708920-61dd98c46a4e |
| hamburgueria/hero-burger.jpg | 1568901346375-23c9450c58cd |
| hamburgueria/hero-burger-2.jpg | 1572802419224-296b0aeee0d9 |
| hamburgueria/hero-burger-3.jpg | 1607013251379-e6eecfffe234 |
| hamburgueria/x-salada.jpg | 1550547660-d9450f859349 |
| hamburgueria/x-bacon.jpg | 1594212699903-ec8a3eca50f5 |
| hamburgueria/batata-frita.jpg | 1573080496219-bb080dd4f877 |
| hamburgueria/milkshake.jpg | 1572490122747-3968b75cc699 |
| hamburgueria/x-tudo.jpg | 1571091718767-18b5b1457add |
| hamburgueria/smash-duplo.jpg | 1586190848861-99aa4a171e90 |
| hamburgueria/batata-cheddar.jpg | 1585109649139-366815a0d713 |
| hamburgueria/nuggets.jpg | 1562967914-608f82629710 |
| hamburgueria/refrigerante-lata.jpg | 1554866585-cd94860890b7 |
| acai/hero-acai.jpg | QyH-eSLaEr8 (foto de copo de açaí) |
| japones/hero-sushi.jpg | 1579871494447-9811cf80d66c |
| japones/hero-sushi-2.jpg | 1553621042-f6e147245754 |
| japones/hero-sushi-3.jpg | 1611143669185-af224c5e3252 |
| japones/combinado.jpg | 1583623025817-d180a2221d0a |
| japones/temaki.jpg | 1607301405390-d831c242f59b |
| japones/yakisoba.jpg | 1585032226651-759b368d7246 |

### Fotos do ramo de açaí fornecidas pelo cliente

acai-300-copo.jpg, acai-500-tigela.png, acai-combo-casal.jpg e acai-barca.jpg
vieram do dono do projeto, não do Unsplash. A procedência e o direito de uso
delas são de quem as forneceu.

O hero do ramo de acai gira essas mesmas fotos do cliente, e nao fotos de banco:
as buscas por acai em bancos de imagem trouxeram outras frutas, entao a foto
verificada e a que veio de quem conhece o produto.

acai-300-copo.jpg tem 447x447 — abaixo do ideal para um card de cardápio, e
pode aparecer suavizada em telas grandes.

## Aviso

Os arquivos foram baixados sem inspeção visual: verificou-se que são JPEG
válidos e do tamanho esperado, não que a foto corresponda ao prato indicado
pelo nome. **Revise antes de ligá-las ao catálogo.**

## Ramos novos (2026-08-19)

Ao contrário do aviso acima, **estas foram vistas uma a uma antes de entrar**:
cada arquivo foi aberto e conferido contra o ramo a que se destina. Também se
descartou tudo que vinha de `plus.unsplash.com/premium_photo-` — esses são do
Unsplash+ pago e não valem sob a licença gratuita, apesar de aparecerem
misturados na mesma busca.

| Arquivo | ID Unsplash | O que mostra |
|---|---|---|
| churrascaria/hero-churrasco.jpg | 1748864222743-c3f47f0fc19d | Picanha no espeto sendo fatiada |
| churrascaria/hero-churrasco-2.jpg | 1755437103545-6aca71afa6b7 | Espetos sobre a brasa |
| churrascaria/hero-churrasco-3.jpg | 1586058584825-c1e87ed735b4 | Grelha com fogo e fumaça |
| hot-dog/hero-dog.jpg | 1638368593249-7cadb261e8b3 | Cachorro-quente montado, com fritas |
| hot-dog/hero-dog-2.jpg | 1619538189873-3f511db5fec6 | Tábua com vários dogs e molhos |
| hot-dog/hero-dog-3.jpg | 1612392062093-b07f9f626f0c | Fileira de dogs em tábua de madeira |

Todas em retrato 800x1200, o mesmo formato dos ramos antigos — a capa corta em
coluna vertical e foto deitada fica estranha ali.

**Ressalva do hot dog:** as fotos mostram o cachorro-quente americano (mostarda
e picles), enquanto o cardápio inicial descreve o brasileiro (purê, milho,
batata palha). É a mesma comida, não outro ramo, mas o dono provavelmente vai
querer trocar pelas dele.

## Ramos ainda sem foto

`restaurante`, `cafeteria`, `bar`, `saudavel` e `sorvetes` estão com
`photos: []` em hero-by-type.ts. **Isso é uma escolha, não uma pendência
quebrada:** sem foto a capa vira só texto sobre o gradiente da marca e a coluna
da imagem sai do layout, o que parece decidido. Emprestar a foto de outro ramo
seria pior — uma churrascaria anunciando pizza.

O caso de `restaurante` é o mais difícil e cobre quatro ramos (restaurante,
comida caseira, comida brasileira, marmitaria). Quatro buscas no Unsplash não
acharam prato feito brasileiro: vieram pratos asiáticos, comida fusion, uma mesa
com o cardápio de outro restaurante à mostra e um prato com bandeirinha do
Brasil espetada num hambúrguer. Arroz, feijão e bife acebolado praticamente não
existem no acervo — é um banco internacional, e comida caseira brasileira é o
nicho que falta nele. Foto de cliente real resolveria melhor que qualquer banco.

Para acrescentar: salve em `public/catalogo-inicial/<ramo>/`, em retrato
800x1200, e preencha o `photos` do ramo em
`src/lib/pizzaria2/hero-by-type.ts`.
