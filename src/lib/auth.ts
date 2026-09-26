import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { compare, hash } from "bcryptjs";
import type { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, users, type User } from "@/db/schema";
import type { Role, SessionUser } from "./shared";

export const ACCESS_COOKIE = "lumiere_access";
export const REFRESH_COOKIE = "lumiere_refresh";
export const ACCESS_TTL = 60 * 60; // 1 hour
export const REFRESH_TTL = 60 * 60 * 24 * 14; // 14 days
const MEDIA_WINDOW = 3 * 60 * 60; // signed media links rotate every 3h (valid up to 6h)
const ISSUER = "lumiere-studio";
const AUDIENCE = "lumiere-studio-app";

type TokenType = "access" | "refresh" | "media";

let warned = false;
function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret && !warned) {
    warned = true;
    console.warn("[auth] JWT_SECRET is not set — using an insecure development secret. Set JWT_SECRET in production.");
  }
  return new TextEncoder().encode(secret || "lumiere-dev-secret-change-me-in-production-0123456789");
}

async function sign(payload: JWTPayload, type: TokenType, ttlSeconds: number, issuedAt?: number) {
  const iat = issuedAt ?? Math.floor(Date.now() / 1000);
  return new SignJWT({ ...payload, typ: type })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttlSeconds)
    .sign(secretKey());
}

async function verify(token: string, type: TokenType): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    return payload.typ === type ? payload : null;
  } catch {
    return null;
  }
}

export async function issueTokens(user: { id: number; role: Role; name: string; email: string }) {
  const access = await sign({ sub: String(user.id), role: user.role, name: user.name, email: user.email }, "access", ACCESS_TTL);
  const refresh = await sign({ sub: String(user.id) }, "refresh", REFRESH_TTL);
  return { access, refresh, expiresIn: ACCESS_TTL };
}

export async function verifyRefreshToken(token: string) {
  const payload = await verify(token, "refresh");
  const id = Number(payload?.sub);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Signed, expiring gallery media token. Deterministic within a time window so image
 * URLs stay cache-friendly while still expiring.
 */
export async function signMediaToken(input: { galleryId: number; userId: number; role: Role; clientId: number | null; download: boolean }) {
  const bucket = Math.floor(Date.now() / 1000 / MEDIA_WINDOW) * MEDIA_WINDOW;
  return sign(
    { sub: String(input.userId), gid: input.galleryId, role: input.role, cid: input.clientId, dl: input.download },
    "media",
    MEDIA_WINDOW * 2,
    bucket,
  );
}

export async function verifyMediaToken(token: string) {
  const payload = await verify(token, "media");
  if (!payload) return null;
  return {
    userId: Number(payload.sub),
    galleryId: Number(payload.gid),
    role: payload.role as Role,
    clientId: payload.cid == null ? null : Number(payload.cid),
    download: Boolean(payload.dl),
  };
}

export function extractToken(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (header && header.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  const cookie = req.cookies.get(ACCESS_COOKIE)?.value;
  if (cookie) return cookie;
  // `EventSource` cannot set an Authorization header, so realtime streams pass the
  // access token as a query parameter. Only honoured for GET requests on stream
  // endpoints, which are side-effect free.
  if (req.method === "GET" && req.nextUrl.pathname.endsWith("/stream")) {
    const token = req.nextUrl.searchParams.get("token")?.trim();
    if (token) return token;
  }
  return null;
}

export function toSessionUser(u: User, clientId: number | null): SessionUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    specialty: u.specialty,
    color: u.color,
    clientId: clientId ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function loadSessionUser(id: number): Promise<SessionUser | null> {
  const [row] = await db
    .select({ user: users, clientId: clients.id })
    .from(users)
    .leftJoin(clients, eq(clients.userId, users.id))
    .where(eq(users.id, id))
    .limit(1);
  if (!row || !row.user.active) return null;
  return toSessionUser(row.user, row.clientId);
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const token = extractToken(req);
  if (!token) return null;
  const payload = await verify(token, "access");
  const id = Number(payload?.sub);
  if (!Number.isInteger(id) || id <= 0) return null;
  return loadSessionUser(id);
}

export function setAuthCookies(res: NextResponse, tokens: { access: string; refresh: string }, secure: boolean) {
  const base = { httpOnly: true, sameSite: "lax" as const, secure };
  res.cookies.set(ACCESS_COOKIE, tokens.access, { ...base, path: "/", maxAge: ACCESS_TTL });
  res.cookies.set(REFRESH_COOKIE, tokens.refresh, { ...base, path: "/api/auth", maxAge: REFRESH_TTL });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { path: "/api/auth", maxAge: 0 });
}

export function hashPassword(password: string) {
  return hash(password, 10);
}

export function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}
