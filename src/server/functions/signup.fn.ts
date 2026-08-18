import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "../db/client";
import { hashPassword } from "../auth/password";
import { startSessionFor } from "../auth/session";
import { generateUniqueSlug, isEmailTaken } from "../repositories/store-repository";
import { WEEKDAYS } from "../repositories/store-settings-repository";

/** How long a new store can use the system before it needs to be paid. */
const TRIAL_DAYS = 14;

const signupSchema = z.object({
  storeName: z.string().trim().min(2, "Informe o nome da lanchonete."),
  adminName: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
  whatsappNumber: z.string().trim().min(8, "Informe o WhatsApp da loja."),
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

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const passwordHash = await hashPassword(data.password);

    let adminUserId: string;
    try {
      const admin = await prisma.$transaction(async (tx) => {
        const store = await tx.store.create({
          data: {
            slug,
            name: data.storeName,
            status: "TRIAL",
            trialEndsAt,
            settings: {
              create: {
                storeName: data.storeName,
                whatsappNumber: data.whatsappNumber,
                openingHours: { create: WEEKDAYS.map((weekday) => ({ weekday })) },
              },
            },
          },
        });

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
