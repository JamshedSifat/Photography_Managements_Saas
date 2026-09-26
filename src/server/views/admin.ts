import { and, count, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bookings, clients, emailLogs, galleries, payments, studioSettings, users, type StudioSettings } from "@/db/schema";
import { ensureClientRecord, getSettings, outstandingSummary, queryBookings } from "@/lib/booking";
import { emailProvider, sendDueReminders, sendTestEmail } from "@/lib/email";
import { ApiError, getOrigin, intParam, notFound, paginated, pagination, parseBody, type Ctx, type PublicCtx } from "@/lib/http";
import { cloudinaryEnabled } from "@/lib/storage";
import {
  ACTIVE_BOOKING_STATUSES,
  EMAIL_TYPES,
  addDaysToKey,
  daysInMonth,
  monthLabel,
  pad,
  shiftMonth,
  zonedNow,
  type AdminDashboard,
  type BookingStatus,
  type ClientDashboard,
  type EmailType,
  type PhotographerDashboard,
  type SessionUser,
  type StudioSettingsDTO,
} from "@/lib/shared";
import { settingsUpdateSchema } from "@/lib/validators";
import { paymentDTOs } from "./finance";
import { galleryDTOs } from "./galleries";

const ACTIVE: BookingStatus[] = ACTIVE_BOOKING_STATUSES;

function monthBounds(today: string) {
  const month = today.slice(0, 7);
  return { month, start: `${month}-01`, end: `${month}-${pad(daysInMonth(month))}` };
}

// ------------------------------------------------------------------ dashboard

export async function dashboard(ctx: Ctx) {
  const settings = await getSettings();
  const today = zonedNow(settings.timezone).dateKey;
  if (ctx.user.role === "admin") return adminDashboard(today, settings);
  if (ctx.user.role === "photographer") return photographerDashboard(ctx.user, today, settings);
  return clientDashboard(ctx.user, today, settings);
}

async function adminDashboard(today: string, settings: StudioSettings): Promise<AdminDashboard> {
  const { month, start, end } = monthBounds(today);
  const active = inArray(bookings.status, ACTIVE);
  const [todaySchedule, upcoming, recent, upcomingCount, revenue, statusRows, team, clientStats, galleryRows, outstanding, recentPayments] =
    await Promise.all([
      queryBookings(and(eq(bookings.date, today), ne(bookings.status, "cancelled"))),
      queryBookings(and(gte(bookings.date, today), active), { limit: 6 }),
      queryBookings(undefined, { order: "created", limit: 6 }),
      db.select({ value: count() }).from(bookings).where(and(gte(bookings.date, today), active)),
      db.execute<{ month: string; cents: number }>(sql`
        select to_char(date_trunc('month', ${payments.paidAt} at time zone ${settings.timezone}), 'YYYY-MM') as month,
               coalesce(sum(case when ${payments.type} = 'refund' then -${payments.amountCents} else ${payments.amountCents} end), 0)::int as cents
        from ${payments}
        where ${payments.status} = 'paid' and ${payments.paidAt} >= now() - interval '8 months'
        group by 1 order by 1`),
      db.select({ status: bookings.status, value: count() }).from(bookings).groupBy(bookings.status),
      db
        .select({
          id: users.id,
          name: users.name,
          color: users.color,
          sessions: sql<number>`count(${bookings.id})::int`,
          minutes: sql<number>`coalesce(sum(${bookings.endMinutes} - ${bookings.startMinutes}), 0)::int`,
        })
        .from(users)
        .leftJoin(
          bookings,
          and(eq(bookings.photographerId, users.id), gte(bookings.date, start), lte(bookings.date, end), ne(bookings.status, "cancelled")),
        )
        .where(and(eq(users.role, "photographer"), eq(users.active, true)))
        .groupBy(users.id, users.name, users.color)
        .orderBy(desc(sql`count(${bookings.id})`)),
      db
        .select({
          total: count(),
          newThisMonth: sql<number>`(count(*) filter (where ${clients.createdAt} >= date_trunc('month', now())))::int`,
        })
        .from(clients),
      db.select({ status: galleries.status, value: count() }).from(galleries).groupBy(galleries.status),
      outstandingSummary(),
      paymentDTOs(undefined, 6),
    ]);

  const revenueMap = new Map(revenue.rows.map((r) => [r.month, Number(r.cents)]));
  const revenueByMonth = Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonth(month, i - 5);
    return { month: m, label: monthLabel(m), cents: revenueMap.get(m) ?? 0 };
  });
  const outstandingBookings = outstanding.ids.length ? await queryBookings(inArray(bookings.id, outstanding.ids.slice(0, 6))) : [];
  const galleryCount = (s: string) => galleryRows.find((g) => g.status === s)?.value ?? 0;

  return {
    role: "admin",
    today,
    currency: settings.currency,
    stats: {
      todayShoots: todaySchedule.length,
      upcoming: upcomingCount[0]?.value ?? 0,
      revenueMonthCents: revenueMap.get(month) ?? 0,
      revenueLastMonthCents: revenueMap.get(shiftMonth(month, -1)) ?? 0,
      pendingCents: outstanding.totalDueCents,
      pendingCount: outstanding.count,
      clients: clientStats[0]?.total ?? 0,
      newClientsMonth: Number(clientStats[0]?.newThisMonth ?? 0),
      galleriesPublished: galleryCount("published"),
      galleriesDraft: galleryCount("draft"),
    },
    todaySchedule,
    upcoming,
    recent,
    outstanding: outstandingBookings,
    revenueByMonth,
    statusBreakdown: statusRows.map((s) => ({ status: s.status, count: s.value })),
    team: team.map((t) => ({ ...t, sessions: Number(t.sessions), minutes: Number(t.minutes) })),
    recentPayments,
  };
}

async function photographerDashboard(user: SessionUser, today: string, settings: StudioSettings): Promise<PhotographerDashboard> {
  const mine = eq(bookings.photographerId, user.id);
  const { start, end } = monthBounds(today);
  const deliverWhere = and(
    mine,
    eq(bookings.status, "completed"),
    sql`not exists (select 1 from galleries g where g.booking_id = "bookings"."id" and g.status = 'published')`,
  );
  const [todaySchedule, upcoming, week, monthDone, toDeliver, toDeliverCount] = await Promise.all([
    queryBookings(and(mine, eq(bookings.date, today), ne(bookings.status, "cancelled"))),
    queryBookings(and(mine, gte(bookings.date, today), inArray(bookings.status, ACTIVE)), { limit: 8 }),
    db
      .select({ value: count() })
      .from(bookings)
      .where(and(mine, gte(bookings.date, today), lte(bookings.date, addDaysToKey(today, 6)), ne(bookings.status, "cancelled"))),
    db
      .select({ value: count() })
      .from(bookings)
      .where(and(mine, eq(bookings.status, "completed"), gte(bookings.date, start), lte(bookings.date, end))),
    queryBookings(deliverWhere, { order: "desc", limit: 6 }),
    db.select({ value: count() }).from(bookings).where(deliverWhere),
  ]);
  return {
    role: "photographer",
    today,
    currency: settings.currency,
    stats: {
      todayShoots: todaySchedule.length,
      weekShoots: week[0]?.value ?? 0,
      monthCompleted: monthDone[0]?.value ?? 0,
      toDeliver: toDeliverCount[0]?.value ?? 0,
    },
    todaySchedule,
    upcoming,
    toDeliver,
  };
}

async function clientDashboard(user: SessionUser, today: string, settings: StudioSettings): Promise<ClientDashboard> {
  const clientId = user.clientId ?? (await ensureClientRecord(user));
  const mine = eq(bookings.clientId, clientId);
  const scopedUser = { ...user, clientId };
  const [upcoming, done, due, gals, pays] = await Promise.all([
    queryBookings(and(mine, gte(bookings.date, today), inArray(bookings.status, ACTIVE)), { limit: 6 }),
    db.select({ value: count() }).from(bookings).where(and(mine, eq(bookings.status, "completed"))),
    outstandingSummary(clientId),
    galleryDTOs(and(eq(galleries.clientId, clientId), eq(galleries.status, "published")), scopedUser, 6),
    paymentDTOs(eq(bookings.clientId, clientId), 5),
  ]);
  return {
    role: "client",
    today,
    currency: settings.currency,
    stats: { upcoming: upcoming.length, dueCents: due.totalDueCents, galleries: gals.length, sessions: done[0]?.value ?? 0 },
    next: upcoming[0] ? { ...upcoming[0], internalNotes: null } : null,
    upcoming: upcoming.map((b) => ({ ...b, internalNotes: null })),
    galleries: gals,
    payments: pays,
  };
}

// ------------------------------------------------------------------ search

export async function search(ctx: Ctx) {
  const q = ctx.query.get("q")?.trim() ?? "";
  if (q.length < 2) return { clients: [], bookings: [], galleries: [] };
  const like = `%${q}%`;
  const [clientRows, bookingRows, galleryRows] = await Promise.all([
    db
      .select({ id: clients.id, name: clients.name, email: clients.email })
      .from(clients)
      .where(or(ilike(clients.name, like), ilike(clients.email, like), ilike(clients.phone, like)))
      .limit(5),
    queryBookings(or(ilike(bookings.reference, like), ilike(bookings.title, like), ilike(clients.name, like)), { order: "desc", limit: 5 }),
    db
      .select({ id: galleries.id, title: galleries.title, status: galleries.status })
      .from(galleries)
      .where(ilike(galleries.title, like))
      .limit(4),
  ]);
  return {
    clients: clientRows,
    bookings: bookingRows.map((b) => ({ id: b.id, reference: b.reference, title: b.title, date: b.date, clientName: b.client.name, status: b.status })),
    galleries: galleryRows,
  };
}

// ------------------------------------------------------------------ notifications

export async function listNotifications(ctx: Ctx) {
  const { page, pageSize, offset } = pagination(ctx.query, { pageSize: 25, max: 100 });
  const conds: SQL[] = [];
  const type = ctx.query.get("type");
  if (type && (EMAIL_TYPES as readonly string[]).includes(type)) conds.push(eq(emailLogs.type, type as EmailType));
  const status = ctx.query.get("status");
  if (status === "sent" || status === "logged" || status === "failed") conds.push(eq(emailLogs.status, status));
  const q = ctx.query.get("q")?.trim();
  if (q) {
    const cond = or(ilike(emailLogs.toEmail, `%${q}%`), ilike(emailLogs.subject, `%${q}%`), ilike(emailLogs.toName, `%${q}%`));
    if (cond) conds.push(cond);
  }
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ total }], stats] = await Promise.all([
    db
      .select({
        id: emailLogs.id,
        toEmail: emailLogs.toEmail,
        toName: emailLogs.toName,
        subject: emailLogs.subject,
        type: emailLogs.type,
        status: emailLogs.status,
        provider: emailLogs.provider,
        error: emailLogs.error,
        bookingId: emailLogs.bookingId,
        galleryId: emailLogs.galleryId,
        createdAt: emailLogs.createdAt,
      })
      .from(emailLogs)
      .where(where)
      .orderBy(desc(emailLogs.createdAt), desc(emailLogs.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(emailLogs).where(where),
    db.select({ status: emailLogs.status, value: count() }).from(emailLogs).groupBy(emailLogs.status),
  ]);
  return {
    ...paginated(
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total,
      page,
      pageSize,
    ),
    stats: Object.fromEntries(stats.map((s) => [s.status, s.value])),
    provider: emailProvider(),
  };
}

export async function getNotification(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [row] = await db.select().from(emailLogs).where(eq(emailLogs.id, id)).limit(1);
  if (!row) throw notFound("Notification");
  return { notification: { ...row, createdAt: row.createdAt.toISOString() } };
}

/** Reminder job: callable by admins, or by a scheduler with `x-cron-secret: $CRON_SECRET`. */
export async function sendReminders(ctx: PublicCtx) {
  const secret = process.env.CRON_SECRET;
  const viaCron = Boolean(secret) && ctx.req.headers.get("x-cron-secret") === secret;
  if (!viaCron) {
    if (!ctx.user) throw new ApiError(401, "Authentication credentials were not provided or have expired.");
    if (ctx.user.role !== "admin") throw new ApiError(403, "You do not have permission to perform this action.");
  }
  return sendDueReminders(getOrigin(ctx.req));
}

export async function testEmail(ctx: Ctx) {
  const result = await sendTestEmail(ctx.user.email, ctx.user.name, getOrigin(ctx.req));
  return { ...result, provider: emailProvider(), to: ctx.user.email };
}

// ------------------------------------------------------------------ settings & system

function toSettingsDTO(s: StudioSettings): StudioSettingsDTO {
  return {
    studioName: s.studioName,
    tagline: s.tagline,
    email: s.email,
    phone: s.phone,
    address: s.address,
    currency: s.currency,
    timezone: s.timezone,
    openMinutes: s.openMinutes,
    closeMinutes: s.closeMinutes,
    slotIntervalMinutes: s.slotIntervalMinutes,
    bufferMinutes: s.bufferMinutes,
    workingDays: s.workingDays,
    minNoticeHours: s.minNoticeHours,
    maxAdvanceDays: s.maxAdvanceDays,
    invoicePrefix: s.invoicePrefix,
    invoiceNotes: s.invoiceNotes,
  };
}

export async function getSettingsView() {
  const s = await getSettings();
  return { settings: toSettingsDTO(s), today: zonedNow(s.timezone).dateKey };
}

export async function updateSettings(ctx: Ctx) {
  const data = await parseBody(ctx.req, settingsUpdateSchema);
  const current = await getSettings();
  const open = data.openMinutes ?? current.openMinutes;
  const close = data.closeMinutes ?? current.closeMinutes;
  if (open >= close) throw new ApiError(400, "Closing time must be after opening time.", { closeMinutes: "Must be after opening time" });
  if (close - open < 30) throw new ApiError(400, "Studio must be open for at least 30 minutes.");
  const [row] = await db
    .update(studioSettings)
    .set({ ...data, workingDays: data.workingDays ? [...new Set(data.workingDays)].sort() : undefined, updatedAt: new Date() })
    .where(eq(studioSettings.id, 1))
    .returning();
  return { settings: toSettingsDTO(row) };
}

export async function systemStatus() {
  return {
    storage: cloudinaryEnabled() ? "cloudinary" : "local",
    cloudinary: cloudinaryEnabled(),
    email: emailProvider(),
    jwtSecretConfigured: Boolean(process.env.JWT_SECRET),
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    appUrl: process.env.APP_URL ?? null,
  };
}
