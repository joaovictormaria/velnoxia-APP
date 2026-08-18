import { randomBytes } from "node:crypto";
import { prisma } from "../db/client";

/**
 * Slugs a store may never take, because a store lives at the URL root
 * (velnox.app.br/<slug>) and would otherwise shadow a real route. Static routes
 * win over the dynamic segment in the router, so the store would simply become
 * unreachable — a confusing failure to debug after the fact.
 */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "analise",
  "criar-site",
  "preview",
  "login",
  "cadastro",
  "signup",
  "conta",
  "assets",
  "static",
  "public",
  "_build",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export type SlugCheck = { ok: true } | { ok: false; error: string };

export function validateSlug(slug: string): SlugCheck {
  if (slug.length < 3) return { ok: false, error: "O endereço precisa ter ao menos 3 caracteres." };
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: "Use apenas letras minúsculas, números e hífens (sem acentos ou espaços).",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "Este endereço é reservado pelo sistema. Escolha outro." };
  }
  return { ok: true };
}

/**
 * Alphabet for the verifier code: no 0/O/1/l/i, so a slug read off a printed
 * menu or dictated over the phone cannot be mistyped into another store.
 */
const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const CODE_LENGTH = 4;

function verifierCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Builds the public address from the store name plus a per-store verifier code
 * — "Lanche do Zé" becomes lanche-do-ze-7kqm.
 *
 * The code is what makes two lanchonetes with the same (or nearly the same)
 * name safe to create: the slug is unique by construction, so signup never has
 * to ask the owner to invent a different address, and two people registering
 * "Lanche do Zé" at the same instant cannot collide.
 */
export async function generateUniqueSlug(name: string): Promise<string> {
  // Leaves room for the "-code" suffix inside the 40-char budget, and gives a
  // usable base for names made only of symbols or emoji.
  const base = slugify(name).slice(0, 30) || "loja";

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${base}-${verifierCode()}`;
    if (RESERVED_SLUGS.has(candidate)) continue;
    if (!(await isSlugTaken(candidate))) return candidate;
  }
  // 8 collisions on a 923k-combination space means something is wrong; a longer
  // code is better than handing back a slug that is already taken.
  return `${base}-${verifierCode()}${verifierCode()}`;
}

export function getStoreBySlug(slug: string) {
  return prisma.store.findUnique({ where: { slug } });
}

export function isSlugTaken(slug: string) {
  return prisma.store.findUnique({ where: { slug }, select: { id: true } }).then(Boolean);
}

export function isEmailTaken(email: string) {
  return prisma.adminUser
    .findUnique({ where: { email }, select: { id: true } })
    .then(Boolean);
}

/** A store is only servable to customers while it is paid up or in trial. */
export function isStoreServable(store: {
  status: string;
  trialEndsAt: Date | null;
}): boolean {
  if (store.status === "SUSPENDED") return false;
  if (store.status === "TRIAL" && store.trialEndsAt && store.trialEndsAt.getTime() < Date.now()) {
    return false;
  }
  return true;
}
