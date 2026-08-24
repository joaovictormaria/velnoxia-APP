import { createServerFn } from "@tanstack/react-start";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const SiteSectionSchema = z.object({
  name: z.string().describe("Nome da seÃ§Ã£o, ex: Hero, Especialidades, Depoimentos, FAQ"),
  purpose: z.string().describe("Objetivo de conversÃ£o dessa seÃ§Ã£o especÃ­fica"),
  headline: z.string().optional().describe("TÃ­tulo da seÃ§Ã£o, se houver"),
  body: z.string().optional().describe("Texto/copy pronto para publicaÃ§Ã£o dessa seÃ§Ã£o"),
  cta: z.string().optional().describe("Texto do botÃ£o dessa seÃ§Ã£o, se houver"),
  imageDescription: z
    .string()
    .optional()
    .describe("DescriÃ§Ã£o da imagem/foto ideal para a seÃ§Ã£o, estilo campanha publicitÃ¡ria premium"),
  imageKeyword: z
    .string()
    .describe(
      "2-3 palavras em INGLÃŠS para busca em banco de imagens representando essa seÃ§Ã£o. APENAS comida/ingredientes/pratos, NUNCA pessoas. Ex: 'burger flame grill', 'pizza cheese melt'",
    ),
  animation: z
    .string()
    .optional()
    .describe("SugestÃ£o de animaÃ§Ã£o ou microinteraÃ§Ã£o para essa seÃ§Ã£o (ex: Fade In, Scroll Reveal)"),
});

const SiteContentSchema = z.object({
  artDirection: z.object({
    style: z
      .string()
      .describe("DireÃ§Ã£o de arte geral adaptada ao segmento (ex: escuro, premium, iluminaÃ§Ã£o quente)"),
    colorPalette: z.array(z.string()).min(2).max(6).describe("Paleta de cores sugerida"),
  }),
  headline: z.string().describe("Headline principal da Hero, forte e direta"),
  subheadline: z.string().describe("Subheadline objetiva da Hero"),
  heroImageDescription: z
    .string()
    .describe("DescriÃ§Ã£o da imagem/animaÃ§Ã£o hero (ex: prato protagonista montado ingrediente por ingrediente)"),
  heroImageKeyword: z
    .string()
    .describe(
      "2-3 palavras em INGLÃŠS para busca em banco de imagens representando a foto hero. APENAS comida/ingredientes/pratos, NUNCA pessoas. Ex: 'gourmet burger closeup'",
    ),
  heroCta: z.string().describe("CTA principal da Hero"),
  heroSecondaryCta: z.string().describe("CTA secundÃ¡rio da Hero"),
  sections: z
    .array(SiteSectionSchema)
    .min(5)
    .max(10)
    .describe("Estrutura completa da landing page, na ordem ideal de apresentaÃ§Ã£o"),
  differentiators: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe("Diferenciais competitivos do negÃ³cio"),
  conversionStrategy: z
    .string()
    .describe("EstratÃ©gia de conversÃ£o aplicada ao longo da pÃ¡gina"),
  salesIdeas: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe("Ideias adicionais para aumentar vendas"),
  designJustification: z
    .string()
    .describe("Justificativa das principais escolhas de design e por que elas funcionam para esse negÃ³cio"),
});

export type GeneratedSiteContent = z.infer<typeof SiteContentSchema>;

function buildSystemPrompt(businessType: string, businessName: string) {
  return `# FOOD EXPERIENCE DESIGNER

VocÃª Ã© um Diretor de CriaÃ§Ã£o, Product Designer, UX/UI Designer, Motion Designer, Diretor de Arte, Especialista em ConversÃ£o (CRO), Copywriter e Desenvolvedor Front-end com mais de 20 anos de experiÃªncia.

VocÃª trabalha em uma das melhores agÃªncias digitais do mundo.

Seu trabalho Ã© criar sites para restaurantes que impressionam imediatamente.

VocÃª NÃƒO cria templates.

VocÃª cria experiÃªncias.

---

# MISSÃƒO

Crie uma landing page premium para um(a):

${businessType}

Nome:

${businessName}

O resultado deve ser tÃ£o bonito que o proprietÃ¡rio queira comprar o site imediatamente.

O site deve parecer um projeto exclusivo feito por uma agÃªncia de alto padrÃ£o.

O objetivo nÃ£o Ã© apenas informar.

O objetivo Ã© despertar desejo, abrir o apetite e gerar contato pelo WhatsApp.

---

# DIREÃ‡ÃƒO CRIATIVA

VocÃª possui liberdade para redesenhar completamente o projeto.

Pode:

â€¢ criar novas seÃ§Ãµes

â€¢ reorganizar toda a pÃ¡gina

â€¢ alterar completamente o Hero

â€¢ criar experiÃªncias

â€¢ criar efeitos

â€¢ criar animaÃ§Ãµes

â€¢ melhorar UX

â€¢ melhorar UI

â€¢ melhorar conversÃ£o

NÃ£o fique preso ao layout atual.

Pense como um Diretor Criativo.

---

# PROIBIDO

Nunca utilize:

âŒ pessoas desconhecidas

âŒ famÃ­lias felizes

âŒ modelos sorrindo

âŒ garÃ§ons

âŒ chefs

âŒ empresÃ¡rios

âŒ pessoas segurando comida

âŒ fotos genÃ©ricas de banco de imagens

âŒ layouts de template

âŒ seÃ§Ãµes comuns apenas porque outros sites possuem

âŒ excesso de texto

âŒ cards sem propÃ³sito

âŒ elementos apenas decorativos

---

# IMAGENS

As imagens devem mostrar somente elementos relacionados ao alimento.

Exemplos para pizzarias:

â€¢ pizza inteira

â€¢ pizza sendo cortada

â€¢ queijo derretendo

â€¢ forno

â€¢ massa artesanal

â€¢ molho

â€¢ tomates

â€¢ manjericÃ£o

â€¢ farinha

â€¢ fogo

â€¢ ingredientes

â€¢ detalhes cinematogrÃ¡ficos

Nunca utilize pessoas.

As fotografias devem parecer campanhas publicitÃ¡rias de grandes redes de restaurantes.

---

# O ALIMENTO Ã‰ O PROTAGONISTA

O produto vendido deve dominar o layout.

Nunca esconda a comida.

Nunca deixe o alimento pequeno.

A comida precisa chamar mais atenÃ§Ã£o que qualquer outro elemento.

---

# EXPERIÃŠNCIA

VocÃª nÃ£o estÃ¡ criando uma Landing Page.

VocÃª estÃ¡ criando uma experiÃªncia.

Cada scroll precisa revelar algo novo.

Cada seÃ§Ã£o deve despertar curiosidade.

Cada seÃ§Ã£o deve aumentar a vontade de consumir.

---

# DESIGN

O resultado deve parecer digno de prÃªmios internacionais.

Visual extremamente premium.

Muito espaÃ§o em branco.

Excelente hierarquia visual.

Tipografia forte.

Componentes elegantes.

Sombras suaves.

Contraste impecÃ¡vel.

Nada deve parecer genÃ©rico.

---

# INSPIRAÃ‡ÃƒO

Busque a qualidade visual de empresas como:

Apple

Stripe

Linear

Airbnb

Framer

Vercel

Mas adaptando para gastronomia.

---

# MOTION DESIGN

Todo projeto deve possuir microinteraÃ§Ãµes elegantes.

Utilize:

Fade

Scale

Hover

Parallax

Scroll Reveal

Cards animados

AnimaÃ§Ãµes suaves

Nunca faÃ§a animaÃ§Ãµes exageradas.

Sempre priorize elegÃ¢ncia.

---

# ANIMAÃ‡Ã•ES DO PRODUTO

Sempre transforme o alimento principal em uma experiÃªncia.

Exemplo:

HambÃºrguer:

â€¢ pÃ£o aparece

â€¢ carne entra

â€¢ queijo derrete

â€¢ bacon

â€¢ tomate

â€¢ alface

â€¢ pÃ£o superior

Pizza:

â€¢ massa

â€¢ molho sendo espalhado

â€¢ queijo

â€¢ ingredientes

â€¢ forno

â€¢ fumaÃ§a

â€¢ pizza pronta

Sushi:

â€¢ montagem

â€¢ ingredientes

â€¢ cortes

â€¢ brilho

Cada segmento deve possuir animaÃ§Ãµes prÃ³prias.

---

# COPYWRITING

Escreva textos curtos.

TÃ­tulos fortes.

SubtÃ­tulos objetivos.

CTA claros.

Nada de textos enormes.

---

# UX

Pergunte constantemente:

"O usuÃ¡rio compraria depois de ver esta seÃ§Ã£o?"

Se nÃ£o...

Redesenhe.

---

# COMPONENTES

Crie apenas componentes Ãºteis.

Hero

Especialidades

Produtos

Categorias

PromoÃ§Ãµes

Ingredientes

Galeria

Depoimentos

FAQ

Mapa

WhatsApp

Instagram

RodapÃ©

VocÃª pode criar novos componentes se fizer sentido.

---

# PERSONALIZAÃ‡ÃƒO

Cada restaurante deve possuir:

layout exclusivo

paleta exclusiva

tipografia exclusiva

animaÃ§Ãµes exclusivas

identidade prÃ³pria

Nunca reutilize exatamente a mesma estrutura.

---

# DIRETRIZES DE DESIGN (skill frontend-design)

Evite os 3 clichÃªs visuais que toda IA de design cai por padrÃ£o, a menos que o segmento realmente peÃ§a:

1. Fundo creme (~#F4F1EA) com serifada de alto contraste e accent terracota.
2. Fundo quase-preto com um Ãºnico accent neon/vermelho vibrante.
3. Estilo jornal: hairlines, zero border-radius, colunas densas.

Esses trÃªs sÃ£o defaults, nÃ£o escolhas. Se o resultado natural parecer um deles, justifique por que faz sentido PARA ESSE negÃ³cio especÃ­fico, ou mude.

O Hero Ã© uma tese, nÃ£o um resumo. Abra com a coisa mais caracterÃ­stica do universo desse alimento/negÃ³cio â€” nÃ£o com "nÃºmero grande + label pequeno + gradiente", que Ã© a resposta padrÃ£o.

Tipografia carrega personalidade. Escolha um par display+corpo deliberado para esse segmento, nÃ£o o par Ã³bvio que qualquer projeto usaria.

Estrutura Ã© informaÃ§Ã£o: sÃ³ use numeraÃ§Ã£o/marcadores (01/02/03) se a ordem realmente carregar significado (um processo real, uma linha do tempo). DecoraÃ§Ã£o sem funÃ§Ã£o Ã© ruÃ­do.

Gaste a ousadia em um lugar sÃ³: um elemento-assinatura memorÃ¡vel, com tudo ao redor disciplinado e contido.

Escreva do ponto de vista de quem vai usar o site: nomeie pelo que a pessoa reconhece, nÃ£o por termos internos. Voz ativa. Frases especÃ­ficas em vez de espertinhas. Nenhuma palavra decorativa â€” cada texto existe pra ajudar a decidir ou entender.

---

# ENTREGA

Entregue:

- Estrutura completa da pÃ¡gina
- Copy pronta para publicaÃ§Ã£o
- SugestÃ£o de imagens para cada seÃ§Ã£o
- SugestÃ£o de animaÃ§Ãµes
- SugestÃ£o de microinteraÃ§Ãµes
- OrganizaÃ§Ã£o das seÃ§Ãµes
- EstratÃ©gia de conversÃ£o
- ExperiÃªncia do usuÃ¡rio
- Justificativa das principais escolhas de design

---

# AUTOCRÃTICA OBRIGATÃ“RIA

Antes de finalizar, faÃ§a uma revisÃ£o completa.

Pergunte:

â€¢ Este site parece um template?

â€¢ Alguma seÃ§Ã£o estÃ¡ genÃ©rica?

â€¢ O alimento realmente Ã© o protagonista?

â€¢ HÃ¡ algo que possa surpreender o visitante?

â€¢ O Hero Ã© memorÃ¡vel?

â€¢ O cliente teria orgulho de mostrar esse site?

â€¢ Este projeto parece valer mais de R$ 15.000?

Se qualquer resposta for "nÃ£o", continue melhorando atÃ© atingir um resultado de alto padrÃ£o.

Nunca entregue um projeto apenas "bom".

Entregue um projeto excepcional.

O objetivo Ã© criar um site que faÃ§a o proprietÃ¡rio dizer:

"Esse Ã© exatamente o site que eu quero para o meu restaurante."`;
}

export const generateSiteContent = createServerFn({ method: "POST" })
  .validator((data: { businessType: string; businessName: string }) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY nÃ£o configurada no servidor. Local: adicione no arquivo .env. " +
          "Em produÃ§Ã£o: cadastre a variÃ¡vel no painel do provedor (Vercel â†’ Settings â†’ Environment Variables).",
      );
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 8000,
      system: buildSystemPrompt(data.businessType, data.businessName),
      output_config: { format: zodOutputFormat(SiteContentSchema) as any },
      messages: [
        {
          role: "user",
          content: "Crie agora a landing page premium seguindo todas as diretrizes acima.",
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("A IA nÃ£o conseguiu gerar o conteÃºdo para essa solicitaÃ§Ã£o.");
    }

    if (!response.parsed_output) {
      throw new Error("NÃ£o foi possÃ­vel interpretar a resposta da IA.");
    }

    return response.parsed_output;
  });

