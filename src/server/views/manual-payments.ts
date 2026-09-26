import { and, eq, isNotNull, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db } from "@/db";
import { bookings, clients, payments, users } from "@/db/schema";
import { getBookingDTO, getSettings } from "@/lib/booking";
import { notify, notifyBooking as notifyBookingAudience } from "@/lib/notifications";
import { ApiError, created, forbidden, intParam, notFound, parseBody, type Ctx } from "@/lib/http";
import { cloudinaryEnabled, readChatFile, storeChatFile } from "@/lib/storage";
import { formatMoney, STUDIO_MOBILE_PAYMENT, type PaymentDTO } from "@/lib/shared";
import { manualPaymentSubmitSchema, paymentVerifySchema } from "@/lib/validators";
import { paymentDTOs } from "./finance";

/**
 * Manual bKash / Nagad payments.
 *
 * The studio takes payments out-of-band on its own wallet number — there is no payment
 * gateway and no API callback to trust. A client therefore *claims* a payment by
 * submitting the transaction details, which lands as `pending_verification` and only
 * becomes `paid` once an admin confirms the money actually arrived.
 */

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

/** Public checkout details shown to clients before they pay. */
export async function paymentInstructions() {
  const settings = await getSettings();
  return {
    instructions: {
      number: STUDIO_MOBILE_PAYMENT.number,
      wallets: STUDIO_MOBILE_PAYMENT.wallets,
      label: STUDIO_MOBILE_PAYMENT.label,
      currency: settings.currency,
      steps: [
        `Open your bKash or Nagad app and choose "Send Money".`,
        `Send the amount to ${STUDIO_MOBILE_PAYMENT.number}.`,
        "Copy the Transaction ID (TrxID) from the confirmation message.",
        "Submit the transaction details below — the studio verifies it, usually within a few hours.",
      ],
    },
  };
}

/** Confirms the signed-in user is allowed to act on this booking's payments. */
async function assertBookingOwnership(ctx: Ctx, bookingId: number) {
  const [row] = await db
    .select({ clientId: bookings.clientId, photographerId: bookings.photographerId, clientUserId: clients.userId })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) throw notFound("Booking");
  if (ctx.user.role === "admin") return row;
  if (ctx.user.role === "client" && ctx.user.clientId != null && ctx.user.clientId === row.clientId) return row;
  throw forbidden("This booking belongs to another client.");
}

/**
 * Client-submitted payment claim. Stored as `pending_verification`; admins are
 * notified immediately so they can reconcile it against the wallet statement.
 */
export async function submitManualPayment(ctx: Ctx) {
  const contentType = ctx.req.headers.get("content-type") ?? "";
  let screenshot: File | null = null;
  let payload: Record<string, unknown>;

  if (contentType.includes("multipart/form-data")) {
    const form = await ctx.req.formData();
    const file = form.get("screenshot");
    if (file && typeof file !== "string") screenshot = file;
    payload = Object.fromEntries([...form.entries()].filter(([k]) => k !== "screenshot").map(([k, v]) => [k, String(v)]));
  } else {
    payload = (await ctx.req.json().catch(() => ({}))) as Record<string, unknown>;
  }

  const data = manualPaymentSubmitSchema.parse(payload);
  await assertBookingOwnership(ctx, data.bookingId);

  const booking = await getBookingDTO(data.bookingId);
  if (!booking) throw notFound("Booking");
  if (booking.status === "cancelled") throw new ApiError(400, "This booking was cancelled — no further payments are due.");

  const settings = await getSettings();

  // Reject duplicate transaction ids up-front for a friendly error; the unique index
  // below is the real guarantee against a race between two concurrent submissions.
  const [clash] = await db.select({ id: payments.id }).from(payments).where(eq(payments.transactionId, data.transactionId)).limit(1);
  if (clash) throw new ApiError(409, "That transaction ID has already been submitted.", { transactionId: "Already used" });

  const paidAt = new Date(data.paidAt);
  if (Number.isNaN(paidAt.getTime())) throw new ApiError(400, "Enter a valid payment date and time.", { paidAt: "Invalid date" });
  if (paidAt.getTime() > Date.now() + 5 * 60_000) throw new ApiError(400, "The payment date cannot be in the future.", { paidAt: "In the future" });

  // Outstanding balance ignores unverified claims, so also block over-claiming across
  // everything already awaiting verification.
  const [awaiting] = await db
    .select({ value: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.bookingId, data.bookingId), eq(payments.status, "pending_verification")));
  const remaining = Math.max(0, booking.dueCents - Number(awaiting?.value ?? 0));
  if (remaining <= 0) throw new ApiError(400, "This booking is already fully paid or awaiting verification.");
  if (data.amountCents > remaining) {
    throw new ApiError(400, `Amount exceeds the balance due (${formatMoney(remaining, settings.currency)}).`, {
      amountCents: `Maximum ${formatMoney(remaining, settings.currency)}`,
    });
  }

  let screenshotKey: string | null = null;
  if (screenshot && screenshot.size > 0) {
    if (screenshot.size > MAX_SCREENSHOT_BYTES) throw new ApiError(400, "The screenshot must be 8 MB or smaller.");
    if (!screenshot.type.startsWith("image/")) throw new ApiError(400, "The screenshot must be an image.");
    const stored = await storeChatFile(screenshot, data.bookingId);
    screenshotKey = stored.publicId;
  }

  let row: typeof payments.$inferSelect;
  try {
    [row] = await db
      .insert(payments)
      .values({
        bookingId: data.bookingId,
        amountCents: data.amountCents,
        type: data.amountCents >= booking.dueCents ? "balance" : "advance",
        method: data.method,
        status: "pending_verification",
        reference: data.transactionId,
        transactionId: data.transactionId,
        senderNumber: data.senderNumber,
        screenshotUrl: screenshotKey,
        notes: data.notes ?? null,
        paidAt,
        submittedById: ctx.user.id,
      })
      .returning();
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      throw new ApiError(409, "That transaction ID has already been submitted.", { transactionId: "Already used" });
    }
    throw err;
  }

  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true)));
  await notify(
    admins.map((a) => a.id),
    {
      type: "payment_submitted",
      title: "Payment awaiting verification",
      message: `${booking.client?.name ?? "A client"} submitted ${formatMoney(data.amountCents, settings.currency)} for ${booking.reference} (TrxID ${data.transactionId}).`,
      linkType: "booking",
      linkId: booking.id,
      bookingId: booking.id,
      actorUserId: ctx.user.id,
    },
  );

  const [dto] = await paymentDTOs(eq(payments.id, row.id), 1);
  return created({ payment: dto, booking: await getBookingDTO(booking.id) });
}

/** Admin decision on a submitted payment: verify (→ paid) or reject (→ rejected). */
export async function reviewManualPayment(ctx: Ctx) {
  const id = intParam(ctx.params.id, "payment id");
  const { approve, reason } = await parseBody(ctx.req, paymentVerifySchema);

  const [row] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  if (!row) throw notFound("Payment");
  if (row.status !== "pending_verification") throw new ApiError(400, `This payment is already ${row.status.replace("_", " ")}.`);

  const settings = await getSettings();
  const booking = await getBookingDTO(row.bookingId);
  if (!booking) throw notFound("Booking");

  if (!approve && !reason) throw new ApiError(400, "Give the client a reason for the rejection.", { reason: "Required" });

  await db
    .update(payments)
    .set({
      status: approve ? "paid" : "rejected",
      verifiedById: ctx.user.id,
      verifiedAt: new Date(),
      rejectionReason: approve ? null : (reason ?? null),
    })
    .where(eq(payments.id, id));

  // Recompute after the write so the message reflects the new balance.
  const updated = await getBookingDTO(row.bookingId);

  await notifyBookingAudience(row.bookingId, ctx.user.id, {
    type: approve ? "payment_verified" : "payment_rejected",
    title: approve ? "Payment verified" : "Payment rejected",
    message: approve
      ? `${formatMoney(row.amountCents, settings.currency)} verified for ${booking.reference}.${
          updated && updated.dueCents > 0 ? ` ${formatMoney(updated.dueCents, settings.currency)} still due.` : " Fully settled — thank you!"
        }`
      : `Your payment of ${formatMoney(row.amountCents, settings.currency)} for ${booking.reference} could not be verified. ${reason ?? ""}`.trim(),
    linkType: "booking",
    linkId: row.bookingId,
    bookingId: row.bookingId,
    actorUserId: ctx.user.id,
  });

  const [dto] = await paymentDTOs(eq(payments.id, id), 1);
  return { payment: dto, booking: updated };
}

/** Everything awaiting an admin decision, newest first. */
export async function pendingVerifications(ctx: Ctx) {
  if (ctx.user.role !== "admin") throw forbidden("Only studio admins can review payments.");
  const results = await paymentDTOs(eq(payments.status, "pending_verification"), 100);
  return { results };
}

/** Serves the proof-of-payment screenshot to the submitting client or an admin. */
export async function paymentScreenshot(ctx: Ctx) {
  const id = intParam(ctx.params.id, "payment id");
  const [row] = await db.select().from(payments).where(and(eq(payments.id, id), isNotNull(payments.screenshotUrl))).limit(1);
  if (!row || !row.screenshotUrl) throw notFound("Screenshot");
  await assertBookingOwnership(ctx, row.bookingId);

  if (cloudinaryEnabled() && !row.screenshotUrl.includes("/")) {
    const { cloudinaryImageUrl } = await import("@/lib/storage");
    return new Response(null, { status: 302, headers: { Location: cloudinaryImageUrl(row.screenshotUrl, null, "preview", null) } });
  }
  const file = await readChatFile(row.screenshotUrl);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `inline; filename="payment-${id}.jpg"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** Downloadable PDF receipt — only issued once a payment has been verified. */
export async function paymentReceipt(ctx: Ctx) {
  const id = intParam(ctx.params.id, "payment id");
  const [row] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  if (!row) throw notFound("Payment");
  await assertBookingOwnership(ctx, row.bookingId);
  if (row.status !== "paid") throw new ApiError(400, "A receipt is only available once the payment has been verified.");

  const settings = await getSettings();
  const booking = await getBookingDTO(row.bookingId);
  if (!booking) throw notFound("Booking");
  const [dto] = await paymentDTOs(eq(payments.id, id), 1);
  const pdf = await buildReceiptPdf(dto, booking, settings);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${booking.reference}-${row.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function buildReceiptPdf(
  payment: PaymentDTO,
  booking: Awaited<ReturnType<typeof getBookingDTO>>,
  settings: Awaited<ReturnType<typeof getSettings>>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 54, info: { Title: `Receipt ${payment.id}`, Author: settings.studioName, Subject: "Payment receipt" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const black = "#101014";
    const gold = "#a77a36";
    const muted = "#6b6b75";
    const line = (y: number) => doc.moveTo(54, y).lineTo(541, y).strokeColor("#e4dbc9").stroke();
    const row = (label: string, value: string) => {
      const y = doc.y;
      doc.fillColor(muted).font("Helvetica").fontSize(10).text(label, 54, y, { width: 200 });
      doc.fillColor(black).font("Helvetica-Bold").fontSize(10).text(value, 254, y, { width: 287 });
      doc.moveDown(0.6);
    };

    doc.fillColor(black).font("Helvetica-Bold").fontSize(22).text(settings.studioName.toUpperCase(), { characterSpacing: 3 });
    if (settings.tagline) doc.fillColor(gold).font("Helvetica").fontSize(9).text(settings.tagline, { characterSpacing: 1 });
    doc.moveDown(1.5);

    doc.fillColor(black).font("Helvetica-Bold").fontSize(25).text("PAYMENT RECEIPT");
    doc.fillColor(gold).font("Helvetica").fontSize(10).text(`Receipt #${String(payment.id).padStart(6, "0")}`);
    doc.moveDown();
    line(doc.y);
    doc.moveDown();

    doc.fillColor(black).font("Helvetica-Bold").fontSize(11).text("PAID BY");
    doc.font("Helvetica").fontSize(10).fillColor(muted).text(payment.client?.name ?? booking?.client?.name ?? "Client");
    if (payment.client?.email) doc.text(payment.client.email);
    doc.moveDown();

    doc.fillColor(black).font("Helvetica-Bold").fontSize(11).text("PAYMENT DETAILS");
    doc.moveDown(0.4);
    row("Booking", `${booking?.reference ?? ""} — ${booking?.title ?? ""}`);
    row("Session date", booking?.date ?? "—");
    row("Method", payment.method === "bkash" ? "bKash (manual)" : payment.method === "nagad" ? "Nagad (manual)" : payment.method);
    if (payment.transactionId) row("Transaction ID", payment.transactionId);
    if (payment.senderNumber) row("Paid from", payment.senderNumber);
    row("Paid at", new Date(payment.paidAt).toUTCString());
    if (payment.verifiedAt) row("Verified at", new Date(payment.verifiedAt).toUTCString());
    if (payment.verifiedBy) row("Verified by", payment.verifiedBy);

    doc.moveDown(0.5);
    line(doc.y);
    doc.moveDown();

    const y = doc.y;
    doc.fillColor(black).font("Helvetica-Bold").fontSize(14).text("AMOUNT PAID", 54, y);
    doc.fillColor(gold).font("Helvetica-Bold").fontSize(18).text(formatMoney(payment.amountCents, settings.currency), 254, y - 2, { width: 287, align: "right" });
    doc.moveDown(1.2);

    if (booking) {
      row("Booking total", formatMoney(booking.netCents, settings.currency));
      row("Total paid to date", formatMoney(booking.paidCents, settings.currency));
      row("Balance due", formatMoney(booking.dueCents, settings.currency));
    }

    doc.moveDown(1.5);
    line(doc.y);
    doc.moveDown();
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(8.5)
      .text(
        `This receipt confirms a manually verified mobile-wallet payment to ${settings.studioName}. Payments are received on ${STUDIO_MOBILE_PAYMENT.number} and verified by studio staff against the wallet statement.`,
        { align: "left" },
      );
    if (settings.email || settings.phone) {
      doc.moveDown(0.4);
      doc.text([settings.email, settings.phone, settings.address].filter(Boolean).join("  ·  "));
    }

    doc.end();
  });
}

/** Full payment history for one booking (used in booking details). */
export async function bookingPayments(ctx: Ctx) {
  const bookingId = intParam(ctx.params.id, "booking id");
  await assertBookingOwnership(ctx, bookingId);
  const results = await paymentDTOs(eq(payments.bookingId, bookingId), 100);
  const booking = await getBookingDTO(bookingId);
  const [awaiting] = await db
    .select({ value: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.status, "pending_verification")));
  return {
    results: results.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    dueCents: booking?.dueCents ?? 0,
    paidCents: booking?.paidCents ?? 0,
    pendingVerificationCents: Number(awaiting?.value ?? 0),
  };
}
