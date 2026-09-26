import { and, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { bookings, clients, payments, users } from "@/db/schema";
import { getBookingDTO, getSettings, outstandingSummary, queryBookings } from "@/lib/booking";
import { notifyPaymentReceipt } from "@/lib/email";
import { notifyBooking as notifyBookingAudience } from "@/lib/notifications";
import { ApiError, created, getOrigin, intParam, notFound, optionalInt, paginated, pagination, parseBody, type Ctx } from "@/lib/http";
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  addDaysToKey,
  formatMoney,
  isValidDateKey,
  type PaymentDTO,
} from "@/lib/shared";
import { paymentCreateSchema, paymentUpdateSchema } from "@/lib/validators";

function oneOf<T extends string>(list: readonly T[], value: string | null): value is T {
  return value != null && (list as readonly string[]).includes(value);
}

function parsePaidAt(value: string) {
  return isValidDateKey(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
}

/** Separate alias so a payment can join both its recorder and its verifier. */
const verifier = alias(users, "verifier");

const signedAmount = sql<number>`case when ${payments.type} = 'refund' then -${payments.amountCents} else ${payments.amountCents} end`;

export async function paymentDTOs(where: SQL | undefined, limit = 50, offset = 0): Promise<PaymentDTO[]> {
  const rows = await db
    .select({
      payment: payments,
      booking: { id: bookings.id, reference: bookings.reference, title: bookings.title, date: bookings.date, invoiceNumber: bookings.invoiceNumber },
      client: { id: clients.id, name: clients.name, email: clients.email },
      recordedBy: users.name,
      verifiedBy: verifier.name,
    })
    .from(payments)
    .innerJoin(bookings, eq(payments.bookingId, bookings.id))
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .leftJoin(users, eq(payments.recordedById, users.id))
    .leftJoin(verifier, eq(payments.verifiedById, verifier.id))
    .where(where)
    .orderBy(desc(payments.paidAt), desc(payments.id))
    .limit(limit)
    .offset(offset);
  return rows.map(({ payment: p, booking, client, recordedBy, verifiedBy }) => ({
    id: p.id,
    bookingId: p.bookingId,
    amountCents: p.amountCents,
    type: p.type,
    method: p.method,
    status: p.status,
    reference: p.reference,
    notes: p.notes,
    paidAt: p.paidAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    transactionId: p.transactionId,
    senderNumber: p.senderNumber,
    screenshotUrl: p.screenshotUrl ? `/api/payments/${p.id}/screenshot` : null,
    verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
    verifiedBy,
    rejectionReason: p.rejectionReason,
    receiptUrl: p.status === "paid" ? `/api/payments/${p.id}/receipt` : null,
    booking,
    client,
    recordedBy,
  }));
}

export async function listPayments(ctx: Ctx) {
  const q = ctx.query;
  const { page, pageSize, offset } = pagination(q, { pageSize: 25, max: 200 });
  const conds: SQL[] = [];
  if (ctx.user.role === "client") conds.push(ctx.user.clientId ? eq(bookings.clientId, ctx.user.clientId) : sql`false`);
  const status = q.get("status");
  if (oneOf(PAYMENT_STATUSES, status)) conds.push(eq(payments.status, status));
  const method = q.get("method");
  if (oneOf(PAYMENT_METHODS, method)) conds.push(eq(payments.method, method));
  const type = q.get("type");
  if (oneOf(PAYMENT_TYPES, type)) conds.push(eq(payments.type, type));
  const bookingId = optionalInt(q.get("bookingId"));
  if (bookingId) conds.push(eq(payments.bookingId, bookingId));
  const from = q.get("from");
  const to = q.get("to");
  if (from && isValidDateKey(from)) conds.push(gte(payments.paidAt, new Date(`${from}T00:00:00Z`)));
  if (to && isValidDateKey(to)) conds.push(lt(payments.paidAt, new Date(`${addDaysToKey(to, 1)}T00:00:00Z`)));
  const search = q.get("q")?.trim();
  if (search) {
    const like = `%${search}%`;
    const cond = or(ilike(clients.name, like), ilike(bookings.reference, like), ilike(payments.reference, like), ilike(bookings.invoiceNumber, like));
    if (cond) conds.push(cond);
  }
  const where = conds.length ? and(...conds) : undefined;
  const [results, [{ total }]] = await Promise.all([
    paymentDTOs(where, pageSize, offset),
    db
      .select({ total: count() })
      .from(payments)
      .innerJoin(bookings, eq(payments.bookingId, bookings.id))
      .innerJoin(clients, eq(bookings.clientId, clients.id))
      .where(where),
  ]);
  return paginated(results, total, page, pageSize);
}

export async function summary(ctx: Ctx) {
  const settings = await getSettings();
  if (ctx.user.role === "client") {
    const clientId = ctx.user.clientId;
    if (!clientId) return { role: "client", paidCents: 0, dueCents: 0, outstandingCount: 0, currency: settings.currency };
    const [paid] = await db
      .select({ total: sql<number>`coalesce(sum(${signedAmount}), 0)::int` })
      .from(payments)
      .innerJoin(bookings, eq(payments.bookingId, bookings.id))
      .where(and(eq(bookings.clientId, clientId), eq(payments.status, "paid")));
    const out = await outstandingSummary(clientId);
    return { role: "client", paidCents: Number(paid?.total ?? 0), dueCents: out.totalDueCents, outstandingCount: out.count, currency: settings.currency };
  }
  const tz = settings.timezone;
  const [totals] = await db
    .select({
      collectedTotal: sql<number>`coalesce(sum(case when ${payments.status} = 'paid' then ${signedAmount} else 0 end), 0)::int`,
      collectedMonth: sql<number>`coalesce(sum(case when ${payments.status} = 'paid' and date_trunc('month', ${payments.paidAt} at time zone ${tz}) = date_trunc('month', now() at time zone ${tz}) then ${signedAmount} else 0 end), 0)::int`,
      pending: sql<number>`coalesce(sum(case when ${payments.status} = 'pending' then ${payments.amountCents} else 0 end), 0)::int`,
      transactions: sql<number>`count(*)::int`,
    })
    .from(payments);
  const byMethod = await db
    .select({ method: payments.method, cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.status, "paid"), sql`${payments.type} <> 'refund'`))
    .groupBy(payments.method);
  const out = await outstandingSummary();
  return {
    role: "admin",
    currency: settings.currency,
    collectedTotalCents: Number(totals?.collectedTotal ?? 0),
    collectedMonthCents: Number(totals?.collectedMonth ?? 0),
    pendingPaymentsCents: Number(totals?.pending ?? 0),
    transactions: Number(totals?.transactions ?? 0),
    outstandingCents: out.totalDueCents,
    outstandingCount: out.count,
    byMethod: byMethod.map((m) => ({ method: m.method, cents: Number(m.cents) })),
  };
}

export async function outstanding(ctx: Ctx) {
  const clientId = ctx.user.role === "client" ? (ctx.user.clientId ?? -1) : undefined;
  const out = await outstandingSummary(clientId);
  const results = out.ids.length ? await queryBookings(inArray(bookings.id, out.ids.slice(0, 200))) : [];
  return {
    results: results.map((b) => (ctx.user.role === "client" ? { ...b, internalNotes: null } : b)),
    totalDueCents: out.totalDueCents,
    count: out.count,
  };
}

export async function createPayment(ctx: Ctx) {
  const data = await parseBody(ctx.req, paymentCreateSchema);
  const booking = await getBookingDTO(data.bookingId);
  if (!booking) throw new ApiError(400, "Booking not found.", { bookingId: "Select a valid booking" });
  const settings = await getSettings();
  if (data.status === "paid") {
    if (data.type === "refund") {
      if (data.amountCents > booking.paidCents) {
        throw new ApiError(400, `A refund cannot exceed the amount paid (${formatMoney(booking.paidCents, settings.currency)}).`, {
          amountCents: "Exceeds amount paid",
        });
      }
    } else {
      const remaining = Math.max(0, booking.netCents - booking.paidCents);
      if (data.amountCents > remaining) {
        throw new ApiError(400, `Amount exceeds the balance due (${formatMoney(remaining, settings.currency)}).`, {
          amountCents: `Maximum ${formatMoney(remaining, settings.currency)}`,
        });
      }
    }
  }
  const [row] = await db
    .insert(payments)
    .values({
      bookingId: booking.id,
      amountCents: data.amountCents,
      type: data.type,
      method: data.method,
      status: data.status,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      paidAt: data.paidAt ? parsePaidAt(data.paidAt) : new Date(),
      recordedById: ctx.user.id,
    })
    .returning();
  if (row.status === "paid" && data.sendReceipt !== false) await notifyPaymentReceipt(row.id, getOrigin(ctx.req));
  if (row.status === "paid") {
    const paidNow = await getBookingDTO(booking.id);
    await notifyBookingAudience(booking.id, ctx.user.id, {
      type: "payment_received",
      title: "Payment received",
      message: `${formatMoney(row.amountCents, settings.currency)} received for ${booking.reference}.${
        paidNow && paidNow.dueCents > 0 ? ` ${formatMoney(paidNow.dueCents, settings.currency)} still due.` : " Fully settled — thank you!"
      }`,
      linkType: "booking",
      linkId: booking.id,
      bookingId: booking.id,
      actorUserId: ctx.user.id,
    });
  }
  const [dto] = await paymentDTOs(eq(payments.id, row.id), 1);
  return created({ payment: dto, booking: await getBookingDTO(booking.id) });
}

export async function updatePayment(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const data = await parseBody(ctx.req, paymentUpdateSchema);
  const [row] = await db
    .update(payments)
    .set({
      amountCents: data.amountCents,
      type: data.type,
      method: data.method,
      status: data.status,
      reference: data.reference,
      notes: data.notes,
      paidAt: data.paidAt ? parsePaidAt(data.paidAt) : undefined,
    })
    .where(eq(payments.id, id))
    .returning();
  if (!row) throw notFound("Payment");
  const [dto] = await paymentDTOs(eq(payments.id, id), 1);
  return { payment: dto, booking: await getBookingDTO(row.bookingId) };
}

export async function deletePayment(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [row] = await db.delete(payments).where(eq(payments.id, id)).returning({ id: payments.id, bookingId: payments.bookingId });
  if (!row) throw notFound("Payment");
  return { deleted: true, booking: await getBookingDTO(row.bookingId) };
}
