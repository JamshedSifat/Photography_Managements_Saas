import { and, asc, count, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bookings, clients, galleries, users, type Client, type User } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { getSettings, queryBookings } from "@/lib/booking";
import { ApiError, created, intParam, notFound, paginated, pagination, parseBody, type Ctx } from "@/lib/http";
import { ACTIVE_BOOKING_STATUSES, PHOTOGRAPHER_COLORS, daysInMonth, pad, zonedNow, type ClientDTO, type PhotographerDTO } from "@/lib/shared";
import { ratingAverage } from "./reviews";
import { clientCreateSchema, clientUpdateSchema, photographerCreateSchema, photographerUpdateSchema } from "@/lib/validators";

async function studioToday() {
  const s = await getSettings();
  return zonedNow(s.timezone).dateKey;
}

// NOTE: correlated subqueries reference the outer table explicitly ("clients"."id") because
// Drizzle renders unqualified column names for single-table selects.
const spentExpr = sql<number>`(select coalesce(sum(case when p.type = 'refund' then -p.amount_cents else p.amount_cents end), 0)::int
  from payments p join bookings b on b.id = p.booking_id where b.client_id = "clients"."id" and p.status = 'paid')`;

function clientColumns(today: string) {
  return {
    client: clients,
    bookingsCount: sql<number>`(select count(*)::int from bookings b where b.client_id = "clients"."id" and b.status <> 'cancelled')`,
    lastSessionDate: sql<string | null>`(select max(b.date)::text from bookings b where b.client_id = "clients"."id" and b.status <> 'cancelled' and b.date <= ${today})`,
    nextSessionDate: sql<string | null>`(select min(b.date)::text from bookings b where b.client_id = "clients"."id" and b.status in ('pending', 'confirmed') and b.date >= ${today})`,
    totalSpentCents: spentExpr,
    billedCents: sql<number>`(select coalesce(sum(b.total_cents - b.discount_cents), 0)::int from bookings b where b.client_id = "clients"."id" and b.status <> 'cancelled')`,
  };
}

type ClientRow = {
  client: Client;
  bookingsCount: number;
  lastSessionDate: string | null;
  nextSessionDate: string | null;
  totalSpentCents: number;
  billedCents: number;
};

function toClientDTO(r: ClientRow): ClientDTO {
  const c = r.client;
  const spent = Number(r.totalSpentCents) || 0;
  return {
    id: c.id,
    userId: c.userId,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    city: c.city,
    source: c.source,
    notes: c.notes,
    tags: c.tags ?? [],
    createdAt: c.createdAt.toISOString(),
    bookingsCount: Number(r.bookingsCount) || 0,
    totalSpentCents: spent,
    dueCents: Math.max(0, (Number(r.billedCents) || 0) - spent),
    lastSessionDate: r.lastSessionDate,
    nextSessionDate: r.nextSessionDate,
    hasAccount: c.userId != null,
  };
}

async function getClientDTO(id: number, today: string) {
  const [row] = await db.select(clientColumns(today)).from(clients).where(eq(clients.id, id)).limit(1);
  return row ? toClientDTO(row) : null;
}

export async function listClients(ctx: Ctx) {
  const { page, pageSize, offset } = pagination(ctx.query, { pageSize: 20, max: 500 });
  const q = ctx.query.get("q")?.trim();
  const where = q
    ? or(ilike(clients.name, `%${q}%`), ilike(clients.email, `%${q}%`), ilike(clients.phone, `%${q}%`), ilike(clients.city, `%${q}%`))
    : undefined;
  const sort = ctx.query.get("sort");
  const orderBy = sort === "name" ? [asc(clients.name)] : sort === "spent" ? [desc(spentExpr), asc(clients.name)] : [desc(clients.createdAt), desc(clients.id)];
  const today = await studioToday();
  const [rows, [{ total }]] = await Promise.all([
    db.select(clientColumns(today)).from(clients).where(where).orderBy(...orderBy).limit(pageSize).offset(offset),
    db.select({ total: count() }).from(clients).where(where),
  ]);
  return paginated(rows.map(toClientDTO), total, page, pageSize);
}

export async function createClient(ctx: Ctx) {
  const data = await parseBody(ctx.req, clientCreateSchema);
  const [dupe] = await db.select({ id: clients.id }).from(clients).where(eq(clients.email, data.email)).limit(1);
  if (dupe) throw new ApiError(409, "A client with this email already exists.", { email: "Email already in use" });
  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, data.email), eq(users.role, "client")))
    .limit(1);
  const [row] = await db
    .insert(clients)
    .values({
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      source: data.source ?? null,
      notes: data.notes ?? null,
      tags: data.tags ?? [],
      userId: account?.id ?? null,
    })
    .returning();
  return created({ client: await getClientDTO(row.id, await studioToday()) });
}

export async function getClient(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const today = await studioToday();
  const client = await getClientDTO(id, today);
  if (!client) throw notFound("Client");
  const [history, gals] = await Promise.all([
    queryBookings(eq(bookings.clientId, id), { order: "desc", limit: 300 }),
    db
      .select({ id: galleries.id, title: galleries.title, status: galleries.status, createdAt: galleries.createdAt })
      .from(galleries)
      .where(eq(galleries.clientId, id))
      .orderBy(desc(galleries.createdAt)),
  ]);
  return { client, bookings: history, galleries: gals.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() })), today };
}

export async function updateClient(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const data = await parseBody(ctx.req, clientUpdateSchema);
  const [existing] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!existing) throw notFound("Client");
  if (data.email && data.email !== existing.email) {
    const [dupe] = await db.select({ id: clients.id }).from(clients).where(eq(clients.email, data.email)).limit(1);
    if (dupe) throw new ApiError(409, "A client with this email already exists.", { email: "Email already in use" });
  }
  await db
    .update(clients)
    .set({
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      city: data.city,
      source: data.source,
      notes: data.notes,
      tags: data.tags,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, id));
  return { client: await getClientDTO(id, await studioToday()) };
}

export async function deleteClient(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [existing] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).limit(1);
  if (!existing) throw notFound("Client");
  const [{ value }] = await db.select({ value: count() }).from(bookings).where(eq(bookings.clientId, id));
  if (value > 0 && ctx.query.get("force") !== "true") {
    throw new ApiError(409, `This client has ${value} booking${value === 1 ? "" : "s"}. Deleting will also remove their bookings, payments and galleries.`);
  }
  await db.delete(clients).where(eq(clients.id, id));
  return { deleted: true };
}

// ------------------------------------------------------------------ photographers

function toPhotographerDTO(u: User, viewerIsStaff: boolean, stats?: PhotographerDTO["stats"]): PhotographerDTO {
  return {
    id: u.id,
    name: u.name,
    email: viewerIsStaff ? u.email : "",
    phone: viewerIsStaff ? u.phone : null,
    specialty: u.specialty,
    bio: u.bio,
    color: u.color,
    avatarUrl: u.avatarUrl,
    active: u.active,
    headline: u.headline,
    location: u.location,
    experienceYears: u.experienceYears ?? 0,
    specialties: u.specialties?.length ? u.specialties : u.specialty ? [u.specialty] : [],
    portfolio: u.portfolio ?? [],
    ratingAverage: u.ratingCount ? Math.round((u.ratingTotal / u.ratingCount) * 10) / 10 : 0,
    ratingCount: u.ratingCount ?? 0,
    stats,
  };
}

async function upcomingCount(photographerId: number) {
  const today = await studioToday();
  const [{ value }] = await db
    .select({ value: count() })
    .from(bookings)
    .where(and(eq(bookings.photographerId, photographerId), gte(bookings.date, today), inArray(bookings.status, ACTIVE_BOOKING_STATUSES)));
  return value;
}

export async function listPhotographers(ctx: Ctx) {
  const isAdmin = ctx.user.role === "admin";
  const conds: SQL[] = [eq(users.role, "photographer")];
  if (!(isAdmin && ctx.query.get("all") === "1")) conds.push(eq(users.active, true));
  const rows = await db.select().from(users).where(and(...conds)).orderBy(asc(users.name));
  const statsMap = new Map<number, NonNullable<PhotographerDTO["stats"]>>();
  if (isAdmin && rows.length) {
    const today = await studioToday();
    const month = today.slice(0, 7);
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${pad(daysInMonth(month))}`;
    const statRows = await db
      .select({
        pid: bookings.photographerId,
        upcoming: sql<number>`(count(*) filter (where ${bookings.date} >= ${today} and ${bookings.status} <> 'cancelled' and ${bookings.status} <> 'completed'))::int`,
        today: sql<number>`(count(*) filter (where ${bookings.date} = ${today} and ${bookings.status} <> 'cancelled'))::int`,
        thisMonth: sql<number>`(count(*) filter (where ${bookings.date} between ${monthStart} and ${monthEnd} and ${bookings.status} <> 'cancelled'))::int`,
        completed: sql<number>`(count(*) filter (where ${bookings.status} = 'completed'))::int`,
      })
      .from(bookings)
      .where(inArray(bookings.photographerId, rows.map((r) => r.id)))
      .groupBy(bookings.photographerId);
    for (const s of statRows) {
      if (s.pid != null) {
        statsMap.set(s.pid, { upcoming: Number(s.upcoming), today: Number(s.today), thisMonth: Number(s.thisMonth), completed: Number(s.completed) });
      }
    }
  }
  const staff = ctx.user.role !== "client";
  return {
    results: rows.map((u) =>
      toPhotographerDTO(u, staff, isAdmin ? statsMap.get(u.id) ?? { upcoming: 0, today: 0, thisMonth: 0, completed: 0 } : undefined),
    ),
  };
}

export async function createPhotographer(ctx: Ctx) {
  const data = await parseBody(ctx.req, photographerCreateSchema);
  const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
  if (dupe) throw new ApiError(409, "An account with this email already exists.", { email: "Email already registered" });
  const used = await db.select({ color: users.color }).from(users).where(eq(users.role, "photographer"));
  const usedSet = new Set(used.map((u) => u.color?.toUpperCase()));
  const color = data.color ?? PHOTOGRAPHER_COLORS.find((c) => !usedSet.has(c.toUpperCase())) ?? PHOTOGRAPHER_COLORS[used.length % PHOTOGRAPHER_COLORS.length];
  const [row] = await db
    .insert(users)
    .values({
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(data.password),
      role: "photographer",
      phone: data.phone ?? null,
      specialty: data.specialty ?? null,
      bio: data.bio ?? null,
      color,
    })
    .returning();
  return created({ photographer: toPhotographerDTO(row, true) });
}

export async function updatePhotographer(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const data = await parseBody(ctx.req, photographerUpdateSchema);
  const [existing] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, "photographer"))).limit(1);
  if (!existing) throw notFound("Photographer");
  if (data.active === false && existing.active) {
    const upcoming = await upcomingCount(id);
    if (upcoming > 0) throw new ApiError(409, `Reassign ${upcoming} upcoming session${upcoming === 1 ? "" : "s"} before deactivating this photographer.`);
  }
  const [row] = await db
    .update(users)
    .set({
      name: data.name,
      phone: data.phone,
      specialty: data.specialty,
      bio: data.bio,
      color: data.color,
      active: data.active,
      headline: data.headline,
      location: data.location,
      experienceYears: data.experienceYears,
      specialties: data.specialties,
      portfolio: data.portfolio,
      passwordHash: data.password ? await hashPassword(data.password) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();
  return { photographer: toPhotographerDTO(row, true) };
}

export async function deactivatePhotographer(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [existing] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, "photographer"))).limit(1);
  if (!existing) throw notFound("Photographer");
  const upcoming = await upcomingCount(id);
  if (upcoming > 0) throw new ApiError(409, `Reassign ${upcoming} upcoming session${upcoming === 1 ? "" : "s"} before deactivating this photographer.`);
  await db.update(users).set({ active: false, updatedAt: new Date() }).where(eq(users.id, id));
  return { deactivated: true };
}
