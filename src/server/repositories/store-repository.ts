import { prisma } from "../db/client";

/**
 * Slugs a store may never take, because a store lives at the URL root
 * (velnox.app/<slug>) and would otherwise shadow a real route. Static routes
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
