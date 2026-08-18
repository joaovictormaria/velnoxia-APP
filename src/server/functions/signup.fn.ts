import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "../db/client";
import { hashPassword } from "../auth/password";
import { startSessionFor } from "../auth/session";
import { generateUniqueSlug, isEmailTaken } from "../repositories/store-repository";
import { WEEKDAYS } from "../repositories/store-settings-repository";
import { getStarterCatalog, STARTER_CATALOGS } from "../catalog/starter-catalogs";

/** How long a new store can use the system before it needs to be paid. */
const TRIAL_DAYS = 14;

const signupSchema = z.object({
  storeName: z.string().trim().min(2, "Informe o nome da lanchonete."),
  adminName: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
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
    if (await isEmailTaken(data.email)) {
      return { ok: false as const, error: "Já existe uma conta com este e-mail." };
    }

    // Derived from the store name plus a verifier code, so the owner never has
    // to pick an address and two lanchonetes with the same name never clash.
    const slug = await generateUniqueSlug(data.storeName);

    const catalog = getStarterCatalog(data.businessType);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const passwordHash = await hashPassword(data.password);

    let adminUserId: string;
    try {
      const admin = await prisma.$transaction(async (tx) => {
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
        // halfway would show a broken cardápio on its very first visit.
        for (const [i, category] of catalog.categories.entries()) {
          await tx.category.create({
            data: {
              storeId: store.id,
              name: category.name,
              slug: category.slug,
              icon: category.icon,
              kind: category.kind,
              sortOrder: i + 1,
              products: {
                create: category.products.map((product, j) => ({
                  storeId: store.id,
                  name: product.name,
                  slug: slugifyProduct(product.name),
                  description: product.description,
                  basePrice: product.basePrice,
                  tag: product.tag ?? null,
                  allowHalfAndHalf: product.allowHalfAndHalf ?? false,
                  sortOrder: j + 1,
                  sizes: product.sizes ? { create: product.sizes } : undefined,
                })),
              },
            },
          });
        }

        if (catalog.extras.length) {
          await tx.extra.createMany({
            data: catalog.extras.map((e) => ({ storeId: store.id, ...e })),
          });
        }

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
    } catch {
      // Almost always a unique-index collision from a concurrent signup.
      return {
        ok: false as const,
        error: "Não foi possível criar a conta. O endereço ou e-mail pode ter sido tomado agora há pouco.",
      };
    }

    // Signing in immediately: asking someone to log in right after choosing a
    // password is friction with no security benefit.
    await startSessionFor(adminUserId);

    return { ok: true as const, slug, trialEndsAt, trialDays: TRIAL_DAYS };
  });

/** Product slugs are unique per store, so the plain name is enough. */
function slugifyProduct(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
