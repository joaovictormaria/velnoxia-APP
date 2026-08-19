import { clearSession, getSession, updateSession } from "@tanstack/react-start/server";
import { prisma } from "../db/client";
import { conferirAcesso, type Veredito } from "../billing/access";
import { verifyPassword } from "./password";

type AdminSessionData = {
  adminUserId?: string;
};

function sessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long");
  }
  return {
    name: "velnoxia_admin_session",
    password,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    },
  };
}

export type CurrentAdmin = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "MANAGER" | "COURIER";
  /** Tenant scope. Every admin query must be filtered by this. */
  storeId: string;
  store: {
    id: string;
    slug: string;
    name: string;
    status: "TRIAL" | "ACTIVE" | "SUSPENDED";
    trialEndsAt: Date | null;
    /** Até quando está pago. Null numa loja liberada na mão. */
    paidUntil: Date | null;
    subscriptionStatus: string | null;
    cancelAtPeriodEnd: boolean;
    /**
     * Por que a conta está (ou não está) liberada. Substitui o antigo
     * trialExpired: agora existe mais de um jeito de a loja cair, e a tela
     * precisa dizer qual foi para oferecer a saída certa.
     */
    acesso: Veredito;
    /** True when the trial window has passed — the account still exists. */
    trialExpired: boolean;
    /** A logo que o dono subiu. Null enquanto ele não subir nenhuma. */
    logoUrl: string | null;
  };
};

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const session = await getSession<AdminSessionData>(sessionConfig());
  const adminUserId = session.data.adminUserId;
  if (!adminUserId) return null;

  // Re-read from DB so a deactivated user loses access even with a valid cookie.
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      storeId: true,
      store: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          trialEndsAt: true,
          paidUntil: true,
          subscriptionStatus: true,
          cancelAtPeriodEnd: true,
          settings: { select: { logoUrl: true } },
        },
      },
    },
  });
  if (!admin || !admin.isActive) return null;

  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    storeId: admin.storeId,
    store: {
      ...admin.store,
      // A logo é do painel também, não só da vitrine: o dono se reconhece
      // no canto da tela em vez de ver o ícone genérico do sistema.
      logoUrl: admin.store.settings?.logoUrl ?? null,
      acesso: conferirAcesso(admin.store),
      trialExpired:
        admin.store.status === "TRIAL" &&
        admin.store.trialEndsAt !== null &&
        admin.store.trialEndsAt.getTime() < Date.now(),
    },
  };
}

/** Thrown separately from UNAUTHORIZED so the UI can offer to reactivate
 *  instead of bouncing the owner back to the login form. */
export class StoreInactiveError extends Error {
  constructor(public reason: Extract<Veredito, { liberado: false }>["motivo"]) {
    super(reason);
    this.name = "StoreInactiveError";
  }
}

/** Papel sem acesso ao painel: existe uma conta, mas nao e dela que o painel e. */
export class WrongRoleError extends Error {
  constructor(public role: CurrentAdmin["role"]) {
    super("WRONG_ROLE");
    this.name = "WrongRoleError";
  }
}

/** Checagens comuns a qualquer sessao: existe, e a loja pode ser usada. */
async function requireUsableSession(): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("UNAUTHORIZED");
  // Uma regra só decide: teste, pago, tolerância do cartão e suspensão saem
  // todos daqui, e a tela do painel lê o mesmo veredito.
  if (!admin.store.acesso.liberado) throw new StoreInactiveError(admin.store.acesso.motivo);
  return admin;
}

/**
 * Sessao do painel. Um entregador tem conta na mesma tabela e cookie do mesmo
 * formato, entao sem esta recusa ele chamaria qualquer funcao do dono — ver
 * faturamento, mexer no cardapio — so por estar logado. O papel dele tem sua
 * propria porta em requireCourierSession.
 */
export async function requireAdminSession(): Promise<CurrentAdmin> {
  const admin = await requireUsableSession();
  if (admin.role === "COURIER") throw new WrongRoleError(admin.role);
  return admin;
}

/** Sessao da tela de entregas: so o entregador, e so os pedidos dele. */
export async function requireCourierSession(): Promise<CurrentAdmin> {
  const admin = await requireUsableSession();
  if (admin.role !== "COURIER") throw new WrongRoleError(admin.role);
  return admin;
}

export async function loginAdmin(email: string, password: string): Promise<CurrentAdmin | null> {
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !admin.isActive) return null;

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) return null;

  await updateSession<AdminSessionData>(sessionConfig(), { adminUserId: admin.id });
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  // Re-read through getCurrentAdmin so the store payload is built in one place.
  return getCurrentAdmin();
}

/** Establishes the session for a freshly created account (signup flow). */
export async function startSessionFor(adminUserId: string): Promise<void> {
  await updateSession<AdminSessionData>(sessionConfig(), { adminUserId });
}

export async function logoutAdmin(): Promise<void> {
  await clearSession(sessionConfig());
}
