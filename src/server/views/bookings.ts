import { and, asc, desc, eq, gte, ilike, inArray, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bookingEvents, bookings, chatRooms, clients, emailLogs, packages, payments, users } from "@/db/schema";
import {
  announceBookingStatus,
  bookingScope,
  countBookings,
  createBooking,
  ensureBookingChatRoom,
  ensureClientRecord,
  getBookingDTO,
  getDayAvailability,
  getMonthAvailability,
  getSettings,
  photographerOptions,
  queryBookings,
  updateBooking,
  type BookingChanges,
} from "@/lib/booking";
import { notifyBookingCancelled, notifyBookingConfirmation, notifyBookingReminder, notifyBookingRescheduled } from "@/lib/email";
import { notifyBooking as notifyBookingAudience } from "@/lib/notifications";
import { sendContractInvite } from "@/lib/contracts";
import { ApiError, created, forbidden, getOrigin, intParam, notFound, optionalInt, paginated, pagination, parseBody, type Ctx } from "@/lib/http";
import {
  BOOKING_STATUSES,
  BOOKING_TRANSITIONS,
  BOOKING_STATUS_META,
  isValidDateKey,
  zonedNow,
  type AssignmentOption,
  type BookingDTO,
  type BookingDetailResponse,
  type BookingEventDTO,
  type BookingStatus,
  type SessionUser,
} from "@/lib/shared";
import { bookingCreateSchema, bookingNotifySchema, bookingUpdateSchema, type BookingUpdateInput } from "@/lib/validators";
import { reviewForBooking } from "./reviews";
import { paymentDTOs } from "./finance";

function present(b: BookingDTO, user: SessionUser): BookingDTO {
  return user.role === "client" ? { ...b, internalNotes: null } : b;
}

function assertAccess(user: SessionUser, b: BookingDTO) {
  if (user.role === "admin") return;
  if (user.role === "photographer" && b.photographer?.id === user.id) return;
  if (user.role === "client" && user.clientId != null && b.client.id === user.clientId) return;
  throw notFound("Booking");
}

function isStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value);
}

async function studioToday() {
  const s = await getSettings();
  return zonedNow(s.timezone).dateKey;
}

async function resolveDuration(query: URLSearchParams) {
  const packageId = optionalInt(query.get("packageId"));
  if (packageId) {
    const [pkg] = await db.select({ duration: packages.durationMinutes }).from(packages).where(eq(packages.id, packageId)).limit(1);
    if (!pkg) throw notFound("Package");
    return pkg.duration;
  }
  const duration = optionalInt(query.get("duration"));
  if (duration && duration >= 15 && duration <= 720) return duration;
  throw new ApiError(400, "Provide a packageId or a duration in minutes.");
}

export async function availability(ctx: Ctx) {
  const date = ctx.query.get("date") ?? "";
  if (!isValidDateKey(date)) throw new ApiError(400, "Provide a valid date (YYYY-MM-DD).");
  const duration = await resolveDuration(ctx.query);
  return getDayAvailability(db, {
    date,
    duration,
    photographerId: optionalInt(ctx.query.get("photographerId")) ?? null,
    excludeBookingId: optionalInt(ctx.query.get("excludeBookingId")),
    enforceRules: ctx.user.role !== "admin",
  });
}

export async function monthAvailability(ctx: Ctx) {
  const month = ctx.query.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, "Provide a valid month (YYYY-MM).");
  const duration = await resolveDuration(ctx.query);
  const days = await getMonthAvailability(db, {
    month,
    duration,
    photographerId: optionalInt(ctx.query.get("photographerId")) ?? null,
    enforceRules: ctx.user.role !== "admin",
  });
  return { month, days };
}

export async function listBookings(ctx: Ctx) {
  const q = ctx.query;
  const { page, pageSize, offset } = pagination(q, { pageSize: 20, max: 1000 });
  const conds: SQL[] = [];
  const scope = bookingScope(ctx.user);
  if (scope) conds.push(scope);

  const from = q.get("from");
  const to = q.get("to");
  if (from && isValidDateKey(from)) conds.push(gte(bookings.date, from));
  if (to && isValidDateKey(to)) conds.push(lt(bookings.date, addOne(to)));

  const statuses = (q.get("status") ?? "").split(",").filter(isStatus);
  if (statuses.length) conds.push(inArray(bookings.status, statuses));

  const photographerId = optionalInt(q.get("photographerId"));
  if (photographerId) conds.push(eq(bookings.photographerId, photographerId));
  const clientId = optionalInt(q.get("clientId"));
  if (clientId) conds.push(eq(bookings.clientId, clientId));

  const scopeParam = q.get("scope");
  if (scopeParam) {
    const today = await studioToday();
    if (scopeParam === "upcoming") conds.push(gte(bookings.date, today));
    else if (scopeParam === "past") conds.push(lt(bookings.date, today));
    else if (scopeParam === "today") conds.push(eq(bookings.date, today));
  }

  const search = q.get("q")?.trim();
  if (search) {
    const like = `%${search}%`;
    const cond = or(ilike(clients.name, like), ilike(clients.email, like), ilike(bookings.reference, like), ilike(bookings.title, like));
    if (cond) conds.push(cond);
  }

  const where = conds.length ? and(...conds) : undefined;
  const order = q.get("order") === "desc" || scopeParam === "past" ? "desc" : q.get("order") === "created" ? "created" : "asc";
  const [results, total] = await Promise.all([queryBookings(where, { order, limit: pageSize, offset }), countBookings(where)]);
  return paginated(
    results.map((b) => present(b, ctx.user)),
    total,
    page,
    pageSize,
  );
}

function addOne(key: string) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function createBookingView(ctx: Ctx) {
  const data = await parseBody(ctx.req, bookingCreateSchema);
  const isAdmin = ctx.user.role === "admin";
  let clientId: number;
  if (isAdmin) {
    if (!data.clientId) throw new ApiError(400, "Select a client for this booking.", { clientId: "Client is required" });
    clientId = data.clientId;
  } else {
    clientId = ctx.user.clientId ?? (await ensureClientRecord(ctx.user));
  }

  const booking = await createBooking({
    clientId,
    packageId: data.packageId,
    date: data.date,
    startMinutes: data.startMinutes,
    photographerId: data.photographerId ?? null,
    location: data.location ?? null,
    notes: data.notes ?? null,
    internalNotes: isAdmin ? (data.internalNotes ?? null) : null,
    status: isAdmin ? (data.status ?? "approved") : "pending",
    discountCents: isAdmin ? (data.discountCents ?? 0) : 0,
    createdById: ctx.user.id,
    enforceRules: !isAdmin,
  });

  if (data.sendEmail !== false) {
    await notifyBookingConfirmation(booking.id, getOrigin(ctx.req));
    if (booking.status === "approved") await sendContractInvite(booking.id, getOrigin(ctx.req));
  }
  await ensureBookingChatRoom(booking.id, booking.reference);
  const dto = await getBookingDTO(booking.id);
  await notifyBookingAudience(booking.id, ctx.user.id, {
    type: "booking_created",
    title: isAdmin ? "New booking created" : "Booking request received",
    message: isAdmin
      ? `${dto?.client.name ?? "A client"} requested ${booking.title} on ${booking.date}.`
      : `We received your request for ${booking.title} on ${booking.date}. The studio will confirm shortly.`,
    linkType: "booking",
    linkId: booking.id,
    bookingId: booking.id,
    actorUserId: ctx.user.id,
  });
  return created({ booking: dto ? present(dto, ctx.user) : null });
}

export async function getBooking(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const booking = await getBookingDTO(id);
  if (!booking) throw notFound("Booking");
  assertAccess(ctx.user, booking);
  const settings = await getSettings();

  const paymentList = ctx.user.role === "photographer" ? [] : await paymentDTOs(eq(payments.bookingId, id), 100);

  let emails: BookingDetailResponse["emails"] = [];
  if (ctx.user.role === "admin") {
    const rows = await db
      .select({
        id: emailLogs.id,
        type: emailLogs.type,
        subject: emailLogs.subject,
        status: emailLogs.status,
        toEmail: emailLogs.toEmail,
        createdAt: emailLogs.createdAt,
      })
      .from(emailLogs)
      .where(eq(emailLogs.bookingId, id))
      .orderBy(desc(emailLogs.createdAt))
      .limit(20);
    emails = rows.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
  }

  let assignment: AssignmentOption[] | null = null;
  if (ctx.user.role === "admin" && booking.status !== "cancelled") {
    assignment = await photographerOptions({ id, date: booking.date, startMinutes: booking.startMinutes, endMinutes: booking.endMinutes });
  }

  const [eventRows, review, room] = await Promise.all([
    db
      .select({ event: bookingEvents, actorName: users.name })
      .from(bookingEvents)
      .leftJoin(users, eq(bookingEvents.actorUserId, users.id))
      .where(eq(bookingEvents.bookingId, id))
      .orderBy(asc(bookingEvents.id))
      .limit(100),
    reviewForBooking(ctx),
    db.select({ id: chatRooms.id }).from(chatRooms).where(eq(chatRooms.bookingId, id)).limit(1),
  ]);
  const events: BookingEventDTO[] = eventRows.map((e) => ({
    id: e.event.id,
    fromStatus: e.event.fromStatus ?? null,
    toStatus: e.event.toStatus,
    actorName: e.actorName,
    note: e.event.note,
    createdAt: e.event.createdAt.toISOString(),
  }));

  const response: BookingDetailResponse = {
    booking: present(booking, ctx.user),
    payments: paymentList,
    emails,
    assignment,
    events,
    review: review.review,
    chatRoomId: room[0]?.id ?? null,
    studio: {
      name: settings.studioName,
      email: settings.email,
      phone: settings.phone,
      address: settings.address,
      currency: settings.currency,
      invoiceNotes: settings.invoiceNotes,
      tagline: settings.tagline,
    },
  };
  return response;
}

function assertStatusFlow(user: SessionUser, existing: BookingDTO, next: BookingStatus | undefined) {
  if (!next || next === existing.status) return;
  const allowed = BOOKING_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(next)) {
    throw new ApiError(400, `A ${BOOKING_STATUS_META[existing.status].label.toLowerCase()} booking cannot move to ${BOOKING_STATUS_META[next].label.toLowerCase()}.`);
  }
  if (user.role === "client") {
    if (next !== "cancelled") throw forbidden("Clients can only cancel a booking.");
    return;
  }
  if (user.role === "photographer") {
    const photographerAllowed: BookingStatus[] = ["shooting", "editing", "gallery_ready", "completed"];
    if (!photographerAllowed.includes(next)) {
      throw forbidden("Photographers can move a session to shooting, editing, gallery ready or completed.");
    }
    return;
  }
}

function allowedChanges(user: SessionUser, existing: BookingDTO, data: BookingUpdateInput, today: string): BookingChanges {
  const { notify: _notify, ...rest } = data;
  void _notify;
  if (user.role === "admin") {
    assertStatusFlow(user, existing, rest.status);
    return rest;
  }
  const keys = Object.entries(rest)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);

  if (user.role === "photographer") {
    const disallowed = keys.filter((k) => !["status", "internalNotes", "statusNote"].includes(k));
    if (disallowed.length) throw forbidden("Photographers can only update the session status and internal notes.");
    assertStatusFlow(user, existing, rest.status);
    return { status: rest.status, internalNotes: rest.internalNotes, statusNote: rest.statusNote };
  }

  const disallowed = keys.filter((k) => !["status", "notes", "location"].includes(k));
  if (disallowed.length) throw forbidden("Please contact the studio to make this change.");
  if (existing.status === "cancelled" || existing.status === "completed") throw new ApiError(400, "This booking can no longer be modified.");
  assertStatusFlow(user, existing, rest.status);
  if (rest.status === "cancelled" && existing.date < today) throw new ApiError(400, "Past sessions cannot be cancelled online.");
  return { status: rest.status, notes: rest.notes, location: rest.location };
}

export async function updateBookingView(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const data = await parseBody(ctx.req, bookingUpdateSchema);
  const existing = await getBookingDTO(id);
  if (!existing) throw notFound("Booking");
  assertAccess(ctx.user, existing);

  const changes = allowedChanges(ctx.user, existing, data, await studioToday());
  const result = await updateBooking(id, { ...changes, actorUserId: ctx.user.id }, { enforceRules: ctx.user.role !== "admin" });

  if (data.notify !== false) {
    const origin = getOrigin(ctx.req);
    const { before, after } = result;
    if (after.status === "cancelled" && before.status !== "cancelled") await notifyBookingCancelled(id, origin);
    else if (result.scheduleChanged && after.status !== "cancelled") await notifyBookingRescheduled(id, origin);
    else if (before.status === "pending" && after.status === "approved") {
      await notifyBookingConfirmation(id, origin);
      await sendContractInvite(id, origin);
    }
  }
  if (result.statusChanged) await announceBookingStatus(id, result.after.status, ctx.user.id);
  if (changes.photographerId && changes.photographerId !== existing.photographer?.id) {
    await notifyBookingAudience(id, ctx.user.id, {
      type: "photographer_assigned",
      title: "Photographer assigned",
      message: `${existing.client.name}'s session now has a photographer assigned.`,
      linkType: "booking",
      linkId: id,
      bookingId: id,
      actorUserId: ctx.user.id,
    });
  }

  const dto = await getBookingDTO(id);
  return { booking: dto ? present(dto, ctx.user) : null };
}

export async function deleteBooking(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [row] = await db.delete(bookings).where(eq(bookings.id, id)).returning({ id: bookings.id });
  if (!row) throw notFound("Booking");
  return { deleted: true };
}

export async function notifyBooking(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const { type } = await parseBody(ctx.req, bookingNotifySchema);
  const booking = await getBookingDTO(id);
  if (!booking) throw notFound("Booking");
  if (booking.status === "cancelled") throw new ApiError(400, "Notifications can't be sent for a cancelled booking.");
  const origin = getOrigin(ctx.req);
  if (type === "reminder") await notifyBookingReminder(id, origin);
  else await notifyBookingConfirmation(id, origin);
  return { sent: true, booking: await getBookingDTO(id) };
}
