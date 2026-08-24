import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "../db/client";
import { hashPassword } from "../auth/password";
import { startSessionFor } from "../auth/session";
import { generateUniqueSlug, isEmailTaken } from "../repositories/store-repository";
import { WEEKDAYS } from "../repositories/store-settings-repository";
import { getStarterCatalog, STARTER_CATALOGS } from "../catalog/starter-catalogs";
import { permitido } from "../security/rate-limit";

/** How long a new store can use the system before it needs to be paid. */
const TRIAL_DAYS = 14;

const signupSchema = z.object({
  storeName: z.string().trim().min(2, "Informe o nome da lanchonete."),
  adminName: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail vÃ¡lido."),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
  whatsappNumber: z.string().trim().min(8, "Informe o WhatsApp da loja."),
  businessType: z.enum(Object.keys(STARTER_CATALOGS) as [string, ...string[]]),
});

/**
 * Creates the tenant and its first admin in one transaction: a store with no
 * owner, or an owner with no store, would both be unusable states.
 */
export const createStoreAccountFn = createServerFn({ method: "POST" })
  .validator(signupSchema)
  .handler(async ({ data }) => {
    console.log("ðŸ“¥ [SIGNUP] Dados recebidos:", {
      storeName: data.storeName,
      adminName: data.adminName,
      email: data.email,
      businessType: data.businessType,
    });

    const emailTaken = await isEmailTaken(data.email);
    console.log(`ðŸ“§ [SIGNUP] Email ${data.email} jÃ¡ existe?`, emailTaken);

    if (emailTaken) {
      return { ok: false as const, error: "JÃ¡ existe uma conta com este e-mail." };
    }

    // Derived from the store name plus a verifier code, so the owner never has
    // to pick an address and two lanchonetes with the same name never clash.
    const slug = await generateUniqueSlug(data.storeName);
    console.log(`ðŸ”– [SIGNUP] Slug gerado:`, slug);

    const catalog = getStarterCatalog(data.businessType);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const passwordHash = await hashPassword(data.password);

    let adminUserId: string;
    console.log(`ðŸª [SIGNUP] Iniciando transaÃ§Ã£o para criar store...`);
    try {
      const admin = await prisma.$transaction(async (tx) => {
        console.log(`ðŸ¢ [SIGNUP] Criando store: ${data.storeName} (${slug})`);
        const store = await tx.store.create({
          data: {
            slug,
            name: data.storeName,
            businessType: data.businessType,
            status: "TRIAL",
            trialEndsAt,
            settings: {
              create: {
                storeName: data.storeName,
                tagline: catalog.tagline,
                description: catalog.description,
                whatsappNumber: data.whatsappNumber,
                openingHours: { create: WEEKDAYS.map((weekday) => ({ weekday })) },
              },
            },
          },
        });


        // Starter menu, in the same transaction: a store whose catalog failed
        // halfway would show a broken cardÃ¡pio on its very first visit.
        for (const [i, category] of catalog.categories.entries()) {
          /**
           * A categoria e seus tamanhos nascem primeiro: o preÃ§o de cada
           * produto aponta para um tamanho da categoria, entÃ£o eles precisam
           * existir antes â€” e Ã© isso que garante que dois sabores de pizza
           * compartilhem exatamente o mesmo "Grande".
           */
          const created = await tx.category.create({
            data: {
              storeId: store.id,
              name: category.name,
              slug: category.slug,
              badge: category.badge ?? null,
              headline: category.headline ?? null,
              subhead: category.subhead ?? null,
              icon: category.icon,
              kind: category.kind,
              sortOrder: i + 1,
              sizes: category.sizes
                ? {
                    create: category.sizes.map((label, k) => ({ label, sortOrder: k + 1 })),
                  }
                : undefined,
            },
            include: { sizes: true },
          });

          const sizeIdByLabel = new Map(created.sizes.map((s) => [s.label, s.id]));

          for (const [j, product] of category.products.entries()) {
            await tx.product.create({
              data: {
                storeId: store.id,
                categoryId: created.id,
                name: product.name,
                slug: slugifyProduct(product.name),
                description: product.description,
                basePrice: product.basePrice,
                tag: product.tag ?? null,
                allowHalfAndHalf: product.allowHalfAndHalf ?? false,
                sortOrder: j + 1,
                sizes: product.sizes
                  ? {
                      create: product.sizes.flatMap((s) => {
                        const categorySizeId = sizeIdByLabel.get(s.label);
                        // PreÃ§o de um tamanho que a categoria nÃ£o oferece Ã©
                        // erro de catÃ¡logo; ignorar Ã© melhor que gravar Ã³rfÃ£o.
                        return categorySizeId ? [{ categorySizeId, price: s.price }] : [];
                      }),
                    }
                  : undefined,
              },
            });
          }
        }

        if (catalog.promotions.length) {
          await tx.promotion.createMany({
            data: catalog.promotions.map((p, i) => ({
              storeId: store.id,
              eyebrow: p.eyebrow,
              title: p.title,
              description: p.description,
              discount: p.discount ?? null,
              sortOrder: i + 1,
            })),
          });
        }

        if (catalog.extras.length) {
          await tx.extra.createMany({
            data: catalog.extras.map((e) => ({ storeId: store.id, ...e })),
          });
        }

        console.log(`ðŸ‘¤ [SIGNUP] Criando admin user para store ${store.id}`);
        return tx.adminUser.create({
          data: {
            storeId: store.id,
            name: data.adminName,
            email: data.email,
            passwordHash,
            role: "OWNER",
          },
          select: { id: true },
        });
      });
      adminUserId = admin.id;
      console.log(`âœ… [SIGNUP] TransaÃ§Ã£o concluÃ­da, adminUserId: ${adminUserId}`);
    } catch (error) {
      console.error(`ðŸ’¥ [SIGNUP] Erro na transaÃ§Ã£o:`, error);
      console.error(`ðŸ“‹ [SIGNUP] Message:`, (error as Error).message);
      console.error(`ðŸ“‹ [SIGNUP] Stack:`, (error as Error).stack);

      return {
        ok: false as const,
        error: "NÃ£o foi possÃ­vel criar a conta. O endereÃ§o ou e-mail pode ter sido tomado agora hÃ¡ pouco.",
      };
    }

    // Signing in immediately: asking someone to log in right after choosing a
    // password is friction with no security benefit.
    console.log(`ðŸ”‘ [SIGNUP] Iniciando sessÃ£o para adminUserId: ${adminUserId}`);
    await startSessionFor(adminUserId);

    console.log(`ðŸŽ‰ [SIGNUP] Sucesso! Loja criada: ${slug}`);
    return { ok: true as const, slug, trialEndsAt, trialDays: TRIAL_DAYS };
  });

/** Product slugs are unique per store, so the plain name is enough. */
function slugifyProduct(name: string) {
  return name
    .normalize('NFD')
    .replace(/[Ì€-Í¯]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
