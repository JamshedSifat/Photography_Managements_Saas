import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, clients, reviews, users } from "@/db/schema";
import { ApiError, created, forbidden, intParam, notFound, parseBody, type Ctx } from "@/lib/http";
import { notify } from "@/lib/notifications";
import type { ReviewDTO } from "@/lib/shared";
import { reviewCreateSchema } from "@/lib/validators";

/**
 * Client reviews & ratings. A review can only be left once a booking is completed, and
 * the photographer's aggregate rating is recalculated in the same transaction.
 */

export async function createReview(ctx: Ctx) {
  if (ctx.user.role !== "client" || !ctx.user.clientId) throw forbidden("Only clients can review a completed session.");
  const bookingId = intParam(ctx.params.id, "booking id");
  const data = await parseBody(ctx.req, reviewCreateSchema);

  const [row] = await db
    .select({ booking: bookings, client: { id: clients.id } })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(and(eq(bookings.id, bookingId), eq(clients.id, ctx.user.clientId)))
    .limit(1);
  if (!row) throw notFound("Booking");
  if (row.booking.status !== "completed") throw new ApiError(400, "You can review a session once it is completed.");
  if (!row.booking.photographerId) throw new ApiError(400, "This session has no photographer to review yet.");
  const [existing] = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.bookingId, bookingId)).limit(1);
  if (existing) throw new ApiError(409, "You have already reviewed this session.");

  const [review] = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(reviews)
      .values({
        bookingId,
        photographerId: row.booking.photographerId!,
        clientId: row.client.id,
        rating: data.rating,
        title: data.title ?? null,
        comment: data.comment,
      })
      .returning();
    // Keep the denormalised aggregate in sync with the review rows.
    await tx
      .update(users)
      .set({
        ratingCount: sql`(select count(*)::int from ${reviews} where ${reviews.photographerId} = ${row.booking.photographerId})`,
        ratingTotal: sql`(select coalesce(sum(${reviews.rating}), 0)::int from ${reviews} where ${reviews.photographerId} = ${row.booking.photographerId})`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, row.booking.photographerId!));
    return [inserted];
  });

  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true)));
  await notify(
    [row.booking.photographerId, ...admins.map((a) => a.id)],
    {
      type: "review_received",
      title: "New review received",
      message: `${ctx.user.name} rated your session ${data.rating}/5`,
      linkType: "review",
      linkId: bookingId,
      bookingId,
      actorUserId: ctx.user.id,
    },
  );
  return created({ review: toReviewDTO(review, row.booking, ctx.user.name) });
}

export async function reviewForBooking(ctx: Ctx) {
  const bookingId = intParam(ctx.params.id, "booking id");
  const [row] = await db
    .select({ review: reviews, booking: bookings, client: { name: clients.name }, photographer: { name: users.name } })
    .from(reviews)
    .innerJoin(bookings, eq(reviews.bookingId, bookings.id))
    .innerJoin(clients, eq(reviews.clientId, clients.id))
    .innerJoin(users, eq(reviews.photographerId, users.id))
    .where(eq(reviews.bookingId, bookingId))
    .limit(1);
  if (!row) return { review: null };
  return { review: toReviewDTO(row.review, row.booking, row.client.name, row.photographer.name) };
}

function toReviewDTO(r: typeof reviews.$inferSelect, b: typeof bookings.$inferSelect, clientName: string, photographerName = ""): ReviewDTO {
  return {
    id: r.id,
    bookingId: r.bookingId,
    bookingReference: b.reference,
    photographerId: r.photographerId,
    photographerName,
    clientId: r.clientId,
    clientName,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    bookingDate: b.date,
  };
}

export async function listPhotographerReviews(photographerId: number) {
  const rows = await db
    .select({ review: reviews, booking: bookings, client: { name: clients.name }, photographer: { name: users.name } })
    .from(reviews)
    .innerJoin(bookings, eq(reviews.bookingId, bookings.id))
    .innerJoin(clients, eq(reviews.clientId, clients.id))
    .innerJoin(users, eq(reviews.photographerId, users.id))
    .where(eq(reviews.photographerId, photographerId))
    .orderBy(desc(reviews.createdAt))
    .limit(100);
  return rows.map((r) => toReviewDTO(r.review, r.booking, r.client.name, r.photographer.name));
}

export async function ratingBreakdown(photographerId: number) {
  const rows = await db
    .select({ rating: reviews.rating, value: count() })
    .from(reviews)
    .where(eq(reviews.photographerId, photographerId))
    .groupBy(reviews.rating);
  const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) breakdown[r.rating] = Number(r.value);
  return breakdown;
}

export function ratingAverage(user: { ratingCount: number; ratingTotal: number }) {
  return user.ratingCount ? Math.round((user.ratingTotal / user.ratingCount) * 10) / 10 : 0;
}
