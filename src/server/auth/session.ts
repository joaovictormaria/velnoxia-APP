import { clearSession, getSession, updateSession } from "@tanstack/react-start/server";
import { prisma } from "../db/client";
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
  role: "OWNER" | "MANAGER";
};

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const session = await getSession<AdminSessionData>(sessionConfig());
  const adminUserId = session.data.adminUserId;
  if (!adminUserId) return null;

  // Re-read from DB so a deactivated user loses access even with a valid cookie.
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!admin || !admin.isActive) return null;

  return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
}

export async function requireAdminSession(): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("UNAUTHORIZED");
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

  return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
}

export async function logoutAdmin(): Promise<void> {
  await clearSession(sessionConfig());
}
