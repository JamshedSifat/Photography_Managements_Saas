import { randomInt } from "crypto";
import { and, asc, count, desc, eq, gte, inArray, lte, ne, sql, type SQL } from "drizzle-orm";
import { alias, type PgDatabase } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { db } from "@/db";
import { bookingEvents, bookings, chatRooms, clients, galleries, packages, payments, studioSettings, users, type Booking, type StudioSettings } from "@/db/schema";
import { upsertDefaultHours, windowsForDate } from "./availability";
import { ApiError } from "./http";
import { notifyBooking } from "./notifications";
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUS_META,
  addDaysToKey,
  dayOfWeek,
  daysInMonth,
  minutesToLabel,
  paymentStateFor,
  zonedNow,
  type AssignmentOption,
  type BookingDTO,
  type BookingStatus,
  type DaySummary,
  type GalleryStatus,
  type SessionUser,
  type Slot,
} from "./shared";

export type DbLike = PgDatabase<NodePgQueryResultHKT>;

/** Postgres advisory lock key used to serialize all schedule mutations (double-booking guard). */
const BOOKING_LOCK_KEY = 7_331_001;

// ------------------------------------------------------------------ settings

export async function getSettings(exec: DbLike = db): Promise<StudioSettings> {
  const [row] = await exec.select().from(studioSettings).where(eq(studioSettings.id, 1)).limit(1);
  if (row) return row;
  await exec.insert(studioSettings).values({ id: 1 }).onConflictDoNothing();
  const [created] = await exec.select().from(studioSettings).where(eq(studioSettings.id, 1)).limit(1);
  return created;
}

// ------------------------------------------------------------------ status history & chat rooms

/** Appends an immutable status transition to the booking timeline. */
export async function recordBookingEvent(
  bookingId: number,
  from: BookingStatus | null,
  to: BookingStatus,
  actorUserId: number | null,
  note?: string | null,
  exec: DbLike = db,
) {
  await exec.insert(bookingEvents).values({ bookingId, fromStatus: from, toStatus: to, actorUserId: actorUserId ?? null, note: note ?? null });
}

/** Creates the private chat room for a booking (idempotent). */
export async function ensureBookingChatRoom(bookingId: number, reference?: string, exec: DbLike = db) {
  const [existing] = await exec.select({ id: chatRooms.id }).from(chatRooms).where(eq(chatRooms.bookingId, bookingId)).limit(1);
  if (existing) return existing.id;
  const [row] = await exec
    .insert(chatRooms)
    .values({ bookingId, title: reference ? `Booking ${reference}` : `Booking #${bookingId}` })
    .returning({ id: chatRooms.id });
  return row.id;
}

/** Notifies the client, the assigned photographer and admins about a status change. */
export async function announceBookingStatus(
  bookingId: number,
  status: BookingStatus,
  actorUserId: number | null,
) {
  const label = BOOKING_STATUS_META[status].label;
  await notifyBooking(bookingId, actorUserId, {
    type: status === "cancelled" ? "booking_cancelled" : status === "approved" ? "booking_approved" : "booking_status",
    title: `Booking ${label.toLowerCase()}`,
    message: `Booking status is now “${label}”.`,
    linkType: "booking",
    linkId: bookingId,
    bookingId,
    actorUserId,
  });
}

// ------------------------------------------------------------------ availability

type BusyBlock = { id: number; photographerId: number | null; date: string; startMinutes: number; endMinutes: number };

async function activePhotographers(exec: DbLike) {
  return exec
    .select({ id: users.id, name: users.name, color: users.color })
    .from(users)
    .where(and(eq(users.role, "photographer"), eq(users.active, true)))
    .orderBy(asc(users.id));
}

async function busyBlocks(exec: DbLike, from: string, to: string, excludeBookingId?: number): Promise<BusyBlock[]> {
  const conds: SQL[] = [gte(bookings.date, from), lte(bookings.date, to), ne(bookings.status, "cancelled")];
  if (excludeBookingId) conds.push(ne(bookings.id, excludeBookingId));
  return exec
    .select({
      id: bookings.id,
      photographerId: bookings.photographerId,
      date: bookings.date,
      startMinutes: bookings.startMinutes,
      endMinutes: bookings.endMinutes,
    })
    .from(bookings)
    .where(and(...conds));
}

function conflicts(start: number, end: number, block: BusyBlock, buffer: number) {
  return start < block.endMinutes + buffer && end + buffer > block.startMinutes;
}

function evaluate(start: number, end: number, photographerIds: number[], blocks: BusyBlock[], buffer: number) {
  const free = photographerIds.filter((pid) => !blocks.some((b) => b.photographerId === pid && conflicts(start, end, b, buffer)));
  const unassigned = blocks.filter((b) => b.photographerId == null && start < b.endMinutes && end > b.startMinutes).length;
  return { free, unassigned };
}

function bookable(free: number[], unassigned: number, preferred?: number | null) {
  if (preferred) return free.includes(preferred) && free.length > unassigned;
  return free.length > unassigned;
}

type Now = { dateKey: string; minutes: number };

function dayRule(settings: StudioSettings, date: string, now: Now): { ok: true } | { ok: false; reason: string; status: DaySummary["status"] } {
  if (date < now.dateKey) return { ok: false, reason: "This date has already passed.", status: "past" };
  if (!settings.workingDays.includes(dayOfWeek(date))) return { ok: false, reason: "The studio is closed on this day.", status: "closed" };
  if (date > addDaysToKey(now.dateKey, settings.maxAdvanceDays))
    return { ok: false, reason: `Bookings open up to ${settings.maxAdvanceDays} days in advance.`, status: "closed" };
  return { ok: true };
}

/** Minutes-from-midnight on `date` before which a session is too soon (minimum notice). */
function noticeCutoff(settings: StudioSettings, date: string, now: Now) {
  const total = now.minutes + settings.minNoticeHours * 60;
  const cutoffDate = addDaysToKey(now.dateKey, Math.floor(total / 1440));
  if (date < cutoffDate) return Number.POSITIVE_INFINITY;
  if (date === cutoffDate) return total % 1440;
  return -1;
}

function buildSlots(settings: StudioSettings, duration: number, ids: number[], blocks: BusyBlock[], preferred: number | null | undefined, cutoff: number, windows?: Map<number, { startMinutes: number; endMinutes: number }[]>) {
  const slots: Slot[] = [];
  for (let start = settings.openMinutes; start + duration <= settings.closeMinutes; start += settings.slotIntervalMinutes) {
    const end = start + duration;
    const eligible = windows ? ids.filter((id) => windows.get(id)?.some((w) => start >= w.startMinutes && end <= w.endMinutes)) : ids;
    const { free, unassigned } = evaluate(start, end, eligible, blocks, settings.bufferMinutes);
    let available = bookable(free, unassigned, preferred);
    let reason: string | undefined;
    if (start < cutoff) {
      available = false;
      reason = "Too soon";
    } else if (!available) {
      reason = preferred && !free.includes(preferred) ? "Photographer busy" : "Fully booked";
    }
    slots.push({ start, end, available, freePhotographerIds: free, reason });
  }
  return slots;
}

export async function getDayAvailability(
  exec: DbLike,
  opts: { date: string; duration: number; photographerId?: number | null; excludeBookingId?: number; enforceRules: boolean },
) {
  const settings = await getSettings(exec);
  await upsertDefaultHours(exec);
  const now = zonedNow(settings.timezone);
  if (opts.enforceRules) {
    const rule = dayRule(settings, opts.date, now);
    if (!rule.ok) return { date: opts.date, closed: true, reason: rule.reason, slots: [] as Slot[], timezone: settings.timezone };
  }
  const photographers = await activePhotographers(exec);
  const blocks = await busyBlocks(exec, opts.date, opts.date, opts.excludeBookingId);
  const cutoff = opts.enforceRules ? noticeCutoff(settings, opts.date, now) : -1;
  const windows = new Map<number, { startMinutes: number; endMinutes: number }[]>();
  await Promise.all(photographers.map(async (p) => windows.set(p.id, await windowsForDate(exec, p.id, opts.date, settings))));
  const slots = buildSlots(settings, opts.duration, photographers.map((p) => p.id), blocks, opts.photographerId, cutoff, windows);
  return { date: opts.date, closed: false, reason: null, slots, timezone: settings.timezone };
}

export async function getMonthAvailability(
  exec: DbLike,
  opts: { month: string; duration: number; photographerId?: number | null; enforceRules: boolean },
): Promise<DaySummary[]> {
  const settings = await getSettings(exec);
  const now = zonedNow(settings.timezone);
  const total = daysInMonth(opts.month);
  const first = `${opts.month}-01`;
  const last = `${opts.month}-${String(total).padStart(2, "0")}`;
  const photographers = await activePhotographers(exec);
  const ids = photographers.map((p) => p.id);
  const blocks = await busyBlocks(exec, first, last);
  const days: DaySummary[] = [];
  for (let d = 1; d <= total; d++) {
    const date = `${opts.month}-${String(d).padStart(2, "0")}`;
    if (opts.enforceRules) {
      const rule = dayRule(settings, date, now);
      if (!rule.ok) {
        days.push({ date, status: rule.status, available: 0 });
        continue;
      }
    }
    const cutoff = opts.enforceRules ? noticeCutoff(settings, date, now) : -1;
    const windows = new Map<number, { startMinutes: number; endMinutes: number }[]>();
    await Promise.all(photographers.map(async (p) => windows.set(p.id, await windowsForDate(exec, p.id, date, settings))));
    const slots = buildSlots(settings, opts.duration, ids, blocks.filter((b) => b.date === date), opts.photographerId, cutoff, windows);
    const available = slots.filter((s) => s.available).length;
    days.push({ date, status: available > 0 ? "available" : "full", available });
  }
  return days;
}

function assertBookableTime(settings: StudioSettings, date: string, start: number, end: number) {
  const now = zonedNow(settings.timezone);
  const rule = dayRule(settings, date, now);
  if (!rule.ok) throw new ApiError(400, rule.reason);
  if (start < settings.openMinutes || end > settings.closeMinutes) {
    throw new ApiError(
      400,
      `Sessions must fit within studio hours (${minutesToLabel(settings.openMinutes)} – ${minutesToLabel(settings.closeMinutes)}).`,
    );
  }
  if ((start - settings.openMinutes) % settings.slotIntervalMinutes !== 0) {
    throw new ApiError(400, "Please choose one of the available time slots.");
  }
  if (start < noticeCutoff(settings, date, now)) {
    throw new ApiError(400, `Online bookings require at least ${settings.minNoticeHours} hours notice.`);
  }
}

/** Picks (or validates) a photographer for a slot. Must be called inside the booking lock. */
async function resolvePhotographer(
  exec: DbLike,
  opts: { date: string; start: number; end: number; preferred: number | null | undefined; excludeBookingId?: number; settings: StudioSettings },
) {
  const photographers = await activePhotographers(exec);
  const windows = new Map<number, { startMinutes: number; endMinutes: number }[]>();
  await Promise.all(photographers.map(async (p) => windows.set(p.id, await windowsForDate(exec, p.id, opts.date, opts.settings))));
  const ids = photographers.filter((p) => windows.get(p.id)?.some((w) => opts.start >= w.startMinutes && opts.end <= w.endMinutes)).map((p) => p.id);
  const blocks = await busyBlocks(exec, opts.date, opts.date, opts.excludeBookingId);
  const { free, unassigned } = evaluate(opts.start, opts.end, ids, blocks, opts.settings.bufferMinutes);
  if (opts.preferred) {
    if (!ids.includes(opts.preferred)) throw new ApiError(400, "The selected photographer is not accepting bookings.");
    if (!free.includes(opts.preferred)) {
      throw new ApiError(409, "Double booking prevented: this photographer already has a session at that time.");
    }
    return opts.preferred;
  }
  if (!ids.length) throw new ApiError(409, "No photographers are currently available. Please contact the studio.");
  if (free.length <= unassigned) {
    throw new ApiError(409, "Double booking prevented: this time slot is no longer available. Please choose another time.");
  }
  const load = (pid: number) => blocks.filter((b) => b.photographerId === pid).reduce((sum, b) => sum + b.endMinutes - b.startMinutes, 0);
  return [...free].sort((a, b) => load(a) - load(b) || a - b)[0];
}

export async function photographerOptions(b: { id?: number; date: string; startMinutes: number; endMinutes: number }): Promise<AssignmentOption[]> {
  const settings = await getSettings();
  const list = await activePhotographers(db);
  const blocks = await busyBlocks(db, b.date, b.date, b.id);
  const windows = new Map<number, { startMinutes: number; endMinutes: number }[]>();
  await Promise.all(list.map(async (p) => windows.set(p.id, await windowsForDate(db, p.id, b.date, settings))));
  return list.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    available: Boolean(windows.get(p.id)?.some((w) => b.startMinutes >= w.startMinutes && b.endMinutes <= w.endMinutes)) && !blocks.some((x) => x.photographerId === p.id && conflicts(b.startMinutes, b.endMinutes, x, settings.bufferMinutes)),
  }));
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateReference() {
  let s = "";
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `LS-${s}`;
}

export type CreateBookingInput = {
  clientId: number;
  packageId: number;
  date: string;
  startMinutes: number;
  photographerId?: number | null;
  location?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  status?: BookingStatus;
  discountCents?: number;
  createdById: number | null;
  enforceRules: boolean;
};

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`);
    const settings = await getSettings(tx);
    const [client] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, input.clientId)).limit(1);
    if (!client) throw new ApiError(400, "Client not found.", { clientId: "Select a valid client" });
    const [pkg] = await tx.select().from(packages).where(eq(packages.id, input.packageId)).limit(1);
    if (!pkg || (!pkg.active && input.enforceRules)) {
      throw new ApiError(400, "This package is not available.", { packageId: "Select an available package" });
    }
    const start = input.startMinutes;
    const end = start + pkg.durationMinutes;
    if (end > 24 * 60) throw new ApiError(400, "The session must finish on the same day.");
    if (input.enforceRules) assertBookableTime(settings, input.date, start, end);

    const photographerId = await resolvePhotographer(tx, {
      date: input.date,
      start,
      end,
      preferred: input.photographerId,
      settings,
    });

    const [row] = await tx
      .insert(bookings)
      .values({
        reference: generateReference(),
        clientId: input.clientId,
        packageId: pkg.id,
        photographerId,
        title: pkg.name,
        date: input.date,
        startMinutes: start,
        endMinutes: end,
        status: input.status ?? "approved",
        location: input.location ?? null,
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        totalCents: pkg.priceCents,
        discountCents: Math.min(input.discountCents ?? 0, pkg.priceCents),
        createdById: input.createdById,
      })
      .returning();
    const invoiceNumber = `${settings.invoicePrefix}-${input.date.slice(0, 4)}-${String(row.id).padStart(4, "0")}`;
    const [updated] = await tx.update(bookings).set({ invoiceNumber }).where(eq(bookings.id, row.id)).returning();
    await recordBookingEvent(row.id, null, updated.status, input.createdById, "Booking created", tx);
    await ensureBookingChatRoom(row.id, updated.reference, tx);
    return updated;
  });
}

export type BookingChanges = {
  status?: BookingStatus;
  statusNote?: string | null;
  actorUserId?: number | null;
  date?: string;
  startMinutes?: number;
  photographerId?: number | null;
  packageId?: number;
  location?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  discountCents?: number;
  totalCents?: number;
};

/** Reschedule / reassign / update a booking with the same double-booking guarantees as creation. */
export async function updateBooking(id: number, changes: BookingChanges, opts: { enforceRules: boolean }) {
  const input = { actorUserId: changes.actorUserId ?? null, statusNote: changes.statusNote ?? null };
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`);
    const [current] = await tx.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!current) throw new ApiError(404, "Booking not found");
    const settings = await getSettings(tx);

    let duration = current.endMinutes - current.startMinutes;
    let totalCents = changes.totalCents ?? current.totalCents;
    let title = current.title;
    let packageId = current.packageId;
    if (changes.packageId && changes.packageId !== current.packageId) {
      const [pkg] = await tx.select().from(packages).where(eq(packages.id, changes.packageId)).limit(1);
      if (!pkg) throw new ApiError(400, "Package not found.", { packageId: "Select a valid package" });
      duration = pkg.durationMinutes;
      totalCents = changes.totalCents ?? pkg.priceCents;
      title = pkg.name;
      packageId = pkg.id;
    }

    const date = changes.date ?? current.date;
    const start = changes.startMinutes ?? current.startMinutes;
    const end = start + duration;
    const status = changes.status ?? current.status;
    const scheduleChanged = date !== current.date || start !== current.startMinutes || end !== current.endMinutes;
    const photographerChanged = changes.photographerId !== undefined && changes.photographerId !== current.photographerId;
    const reactivated = current.status === "cancelled" && status !== "cancelled";
    let photographerId = changes.photographerId !== undefined ? changes.photographerId : current.photographerId;

    if (status !== "cancelled" && (scheduleChanged || photographerChanged || reactivated)) {
      if (end > 24 * 60) throw new ApiError(400, "The session must finish on the same day.");
      if (opts.enforceRules && scheduleChanged) assertBookableTime(settings, date, start, end);
      photographerId = await resolvePhotographer(tx, {
        date,
        start,
        end,
        preferred: photographerId,
        excludeBookingId: id,
        settings,
      });
    }

    const discountCents = changes.discountCents !== undefined ? Math.min(changes.discountCents, totalCents) : undefined;
    const [after] = await tx
      .update(bookings)
      .set({
        packageId,
        title,
        totalCents,
        discountCents,
        date,
        startMinutes: start,
        endMinutes: end,
        photographerId,
        status,
        location: changes.location,
        notes: changes.notes,
        internalNotes: changes.internalNotes,
        reminderSentAt: scheduleChanged ? null : undefined,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, id))
      .returning();
    if (after.status !== current.status) {
      await recordBookingEvent(id, current.status, after.status, input.actorUserId ?? null, changes.statusNote ?? null, tx);
      await ensureBookingChatRoom(id, after.reference, tx);
    }
    return { before: current, after, scheduleChanged, statusChanged: after.status !== current.status };
  });
}

// ------------------------------------------------------------------ queries & DTOs

export async function paidTotals(exec: DbLike, bookingIds: number[]) {
  const map = new Map<number, number>();
  if (!bookingIds.length) return map;
  const rows = await exec
    .select({
      bookingId: payments.bookingId,
      total: sql<number>`coalesce(sum(case when ${payments.type} = 'refund' then -${payments.amountCents} else ${payments.amountCents} end), 0)::int`,
    })
    .from(payments)
    .where(and(inArray(payments.bookingId, bookingIds), eq(payments.status, "paid")))
    .groupBy(payments.bookingId);
  for (const r of rows) map.set(r.bookingId, Number(r.total));
  return map;
}

const photographerUser = alias(users, "photographer_user");

export async function queryBookings(
  where?: SQL,
  opts: { order?: "asc" | "desc" | "created"; limit?: number; offset?: number } = {},
): Promise<BookingDTO[]> {
  const orderBy =
    opts.order === "created"
      ? [desc(bookings.createdAt), desc(bookings.id)]
      : opts.order === "desc"
        ? [desc(bookings.date), desc(bookings.startMinutes)]
        : [asc(bookings.date), asc(bookings.startMinutes)];
  const rows = await db
    .select({
      booking: bookings,
      client: { id: clients.id, name: clients.name, email: clients.email, phone: clients.phone },
      pkg: {
        id: packages.id,
        name: packages.name,
        category: packages.category,
        durationMinutes: packages.durationMinutes,
        depositPercent: packages.depositPercent,
        priceCents: packages.priceCents,
      },
      photographer: { id: photographerUser.id, name: photographerUser.name, email: photographerUser.email, color: photographerUser.color },
    })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .leftJoin(packages, eq(bookings.packageId, packages.id))
    .leftJoin(photographerUser, eq(bookings.photographerId, photographerUser.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(opts.limit ?? 500)
    .offset(opts.offset ?? 0);
  if (!rows.length) return [];

  const ids = rows.map((r) => r.booking.id);
  const [paid, gals] = await Promise.all([
    paidTotals(db, ids),
    db.select({ id: galleries.id, bookingId: galleries.bookingId, status: galleries.status }).from(galleries).where(inArray(galleries.bookingId, ids)),
  ]);
  const galleryByBooking = new Map<number, { id: number; status: GalleryStatus }>();
  for (const g of gals) {
    if (g.bookingId != null && !galleryByBooking.has(g.bookingId)) galleryByBooking.set(g.bookingId, { id: g.id, status: g.status });
  }

  return rows.map(({ booking: b, client, pkg, photographer }) => {
    const paidCents = paid.get(b.id) ?? 0;
    const netCents = Math.max(0, b.totalCents - b.discountCents);
    return {
      id: b.id,
      reference: b.reference,
      invoiceNumber: b.invoiceNumber,
      title: b.title,
      date: b.date,
      startMinutes: b.startMinutes,
      endMinutes: b.endMinutes,
      status: b.status,
      location: b.location,
      notes: b.notes,
      internalNotes: b.internalNotes,
      totalCents: b.totalCents,
      discountCents: b.discountCents,
      netCents,
      paidCents,
      dueCents: b.status === "cancelled" ? 0 : Math.max(0, netCents - paidCents),
      depositCents: Math.round((netCents * (pkg?.depositPercent ?? 30)) / 100),
      paymentStatus: paymentStateFor(netCents, paidCents),
      client,
      package: pkg,
      photographer,
      gallery: galleryByBooking.get(b.id) ?? null,
      reminderSentAt: b.reminderSentAt ? b.reminderSentAt.toISOString() : null,
      confirmationSentAt: b.confirmationSentAt ? b.confirmationSentAt.toISOString() : null,
      createdAt: b.createdAt.toISOString(),
    };
  });
}

export async function countBookings(where?: SQL) {
  const [r] = await db.select({ value: count() }).from(bookings).innerJoin(clients, eq(bookings.clientId, clients.id)).where(where);
  return r?.value ?? 0;
}

export async function getBookingDTO(id: number) {
  const [b] = await queryBookings(eq(bookings.id, id), { limit: 1 });
  return b ?? null;
}

/** Row-level scoping for bookings based on role. */
export function bookingScope(user: SessionUser): SQL | undefined {
  if (user.role === "admin") return undefined;
  if (user.role === "photographer") return eq(bookings.photographerId, user.id);
  return user.clientId ? eq(bookings.clientId, user.clientId) : sql`false`;
}

/** Bookings with an outstanding balance (optionally for one client). */
export async function outstandingSummary(clientId?: number) {
  const res = await db.execute<{ id: number; due: number }>(sql`
    select b.id, (b.total_cents - b.discount_cents - coalesce(p.paid, 0))::int as due
    from bookings b
    left join (
      select booking_id, sum(case when type = 'refund' then -amount_cents else amount_cents end) as paid
      from payments where status = 'paid' group by booking_id
    ) p on p.booking_id = b.id
    where b.status <> 'cancelled'
      and (b.total_cents - b.discount_cents - coalesce(p.paid, 0)) > 0
      ${clientId ? sql`and b.client_id = ${clientId}` : sql``}
    order by b.date asc, b.start_minutes asc
  `);
  const rows = res.rows.map((r) => ({ id: Number(r.id), due: Number(r.due) }));
  return { ids: rows.map((r) => r.id), totalDueCents: rows.reduce((s, r) => s + r.due, 0), count: rows.length };
}

/** Links (or creates) the client profile for a client-role user. */
export async function ensureClientRecord(user: { id: number; name: string; email: string; phone: string | null }): Promise<number> {
  const [linked] = await db.select({ id: clients.id }).from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (linked) return linked.id;
  const [byEmail] = await db.select({ id: clients.id, userId: clients.userId }).from(clients).where(eq(clients.email, user.email)).limit(1);
  if (byEmail && byEmail.userId == null) {
    await db.update(clients).set({ userId: user.id, updatedAt: new Date() }).where(eq(clients.id, byEmail.id));
    return byEmail.id;
  }
  const [row] = await db
    .insert(clients)
    .values({ userId: user.id, name: user.name, email: user.email, phone: user.phone, source: "Online signup" })
    .returning({ id: clients.id });
  return row.id;
}
