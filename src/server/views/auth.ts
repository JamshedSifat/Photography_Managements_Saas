import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, users } from "@/db/schema";
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  hashPassword,
  issueTokens,
  loadSessionUser,
  setAuthCookies,
  verifyPassword,
  verifyRefreshToken,
} from "@/lib/auth";
import { ensureClientRecord } from "@/lib/booking";
import { sendWelcomeEmail } from "@/lib/email";
import { ApiError, getOrigin, isHttps, parseBody, type Ctx, type PublicCtx } from "@/lib/http";
import { PHOTOGRAPHER_COLORS, ROLE_LABELS } from "@/lib/shared";
import { loginSchema, myProfileSchema, passwordSchema, registerSchema } from "@/lib/validators";

async function authResponse(ctx: PublicCtx, userId: number, status = 200) {
  const user = await loadSessionUser(userId);
  if (!user) throw new ApiError(403, "This account is inactive. Please contact the studio.");
  const tokens = await issueTokens(user);
  const res = NextResponse.json({ access: tokens.access, refresh: tokens.refresh, expiresIn: tokens.expiresIn, user }, { status });
  setAuthCookies(res, tokens, isHttps(ctx.req));
  return res;
}

export async function register(ctx: PublicCtx) {
  const data = await parseBody(ctx.req, registerSchema);
  const role = data.role ?? "client";
  if (role !== "client") {
    const expected =
      role === "admin" ? process.env.ADMIN_INVITE_CODE || "LUMIERE-ADMIN" : process.env.PHOTOGRAPHER_INVITE_CODE || "LUMIERE-TEAM";
    if (!data.inviteCode || data.inviteCode.trim() !== expected) {
      throw new ApiError(400, `A valid studio invite code is required to register as ${ROLE_LABELS[role].toLowerCase()}.`, {
        inviteCode: "Invalid invite code",
      });
    }
  }
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
  if (existing) throw new ApiError(409, "An account with this email already exists.", { email: "This email is already registered" });

  const passwordHash = await hashPassword(data.password);
  let color: string | null = null;
  if (role === "photographer") {
    const [{ value }] = await db.select({ value: count() }).from(users).where(eq(users.role, "photographer"));
    color = PHOTOGRAPHER_COLORS[value % PHOTOGRAPHER_COLORS.length];
  }
  const [created] = await db
    .insert(users)
    .values({ name: data.name, email: data.email, passwordHash, role, phone: data.phone ?? null, color })
    .returning();
  if (role === "client") await ensureClientRecord(created);

  await sendWelcomeEmail({ name: created.name, email: created.email, role }, getOrigin(ctx.req));
  return authResponse(ctx, created.id, 201);
}

export async function login(ctx: PublicCtx) {
  const data = await parseBody(ctx.req, loginSchema);
  const [user] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
    throw new ApiError(401, "Invalid email or password.", { password: "Invalid email or password" });
  }
  if (!user.active) throw new ApiError(403, "This account has been deactivated. Please contact the studio.");
  if (data.role && data.role !== user.role) {
    throw new ApiError(403, `This account belongs to the ${ROLE_LABELS[user.role]} portal. Switch the portal tab and try again.`, {
      role: `Registered as ${ROLE_LABELS[user.role]}`,
    });
  }
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  if (user.role === "client") await ensureClientRecord(user);
  return authResponse(ctx, user.id);
}

export async function refresh(ctx: PublicCtx) {
  let token: string | undefined;
  try {
    const body = (await ctx.req.json()) as { refresh?: unknown } | null;
    if (body && typeof body.refresh === "string") token = body.refresh;
  } catch {
    // empty body is fine — fall back to cookie
  }
  token = token || ctx.req.cookies.get(REFRESH_COOKIE)?.value;
  if (!token) throw new ApiError(401, "Refresh token missing.");
  const userId = await verifyRefreshToken(token);
  if (!userId) throw new ApiError(401, "Refresh token is invalid or expired.");
  return authResponse(ctx, userId);
}

export async function logout() {
  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
}

export async function me(ctx: Ctx) {
  return { user: ctx.user };
}

export async function updateMe(ctx: Ctx) {
  const data = await parseBody(ctx.req, myProfileSchema);
  const isPhotographer = ctx.user.role === "photographer";
  await db
    .update(users)
    .set({
      name: data.name,
      phone: data.phone,
      bio: data.bio,
      specialty: ctx.user.role === "client" ? undefined : data.specialty,
      avatarUrl: data.avatarUrl,
      // Photographers curate their own public portfolio from their profile page.
      headline: isPhotographer ? data.headline : undefined,
      location: isPhotographer ? data.location : undefined,
      experienceYears: isPhotographer ? data.experienceYears : undefined,
      specialties: isPhotographer ? data.specialties : undefined,
      portfolio: isPhotographer ? data.portfolio : undefined,
      updatedAt: new Date(),
    })
    .where(eq(users.id, ctx.user.id));
  if (ctx.user.role === "client" && ctx.user.clientId) {
    await db
      .update(clients)
      .set({ name: data.name, phone: data.phone, updatedAt: new Date() })
      .where(eq(clients.id, ctx.user.clientId));
  }
  return { user: await loadSessionUser(ctx.user.id) };
}

export async function changePassword(ctx: Ctx) {
  const data = await parseBody(ctx.req, passwordSchema);
  const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
  if (!user || !(await verifyPassword(data.currentPassword, user.passwordHash))) {
    throw new ApiError(400, "Your current password is incorrect.", { currentPassword: "Incorrect password" });
  }
  if (data.currentPassword === data.newPassword) {
    throw new ApiError(400, "Choose a password you haven't used before.", { newPassword: "Must differ from current password" });
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, ctx.user.id));
  return { ok: true };
}
