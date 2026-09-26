import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { and, count, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { bookings, clients, emailLogs, galleries, payments, photos, type StudioSettings } from "@/db/schema";
import { getBookingDTO, getSettings } from "./booking";
import {
  ACTIVE_BOOKING_STATUSES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  ROLE_LABELS,
  addDaysToKey,
  firstName,
  formatDate,
  formatDateKey,
  formatDuration,
  formatMoney,
  timeRangeLabel,
  zonedNow,
  type BookingDTO,
  type EmailStatus,
  type EmailType,
  type Role,
} from "./shared";

export type EmailProvider = "smtp" | "resend" | "log";

export function emailProvider(): EmailProvider {
  if (process.env.SMTP_HOST) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return "log";
}

let transporter: Transporter | null = null;
function smtpTransport(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

type EmailAttachment = { filename: string; content: Buffer; contentType?: string };
type Message = {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  type: EmailType;
  bookingId?: number | null;
  galleryId?: number | null;
  attachments?: EmailAttachment[];
};
type SendOptions = { logOnly?: boolean };

/** Sends via SMTP / Resend when configured, otherwise records to the outbox (preview mode). Never throws. */
export async function sendEmail(msg: Message, opts: SendOptions = {}): Promise<{ status: EmailStatus; error: string | null }> {
  const provider: EmailProvider = opts.logOnly ? "log" : emailProvider();
  let status: EmailStatus = "logged";
  let error: string | null = null;
  try {
    const settings = await getSettings();
    const from = process.env.EMAIL_FROM || `${settings.studioName} <no-reply@lumiere.studio>`;
    const to = msg.toName ? `"${msg.toName.replace(/"/g, "")}" <${msg.to}>` : msg.to;
    if (provider === "smtp") {
      await smtpTransport().sendMail({ from, to, subject: msg.subject, html: msg.html, replyTo: settings.email, attachments: msg.attachments });
      status = "sent";
    } else if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          reply_to: settings.email,
          attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
        }),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
      status = "sent";
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
    console.error("[email] delivery failed:", error);
  }
  try {
    await db.insert(emailLogs).values({
      toEmail: msg.to,
      toName: msg.toName ?? null,
      subject: msg.subject,
      html: msg.html,
      type: msg.type,
      status,
      provider,
      error,
      bookingId: msg.bookingId ?? null,
      galleryId: msg.galleryId ?? null,
    });
  } catch (err) {
    console.error("[email] failed to write outbox log", err);
  }
  return { status, error };
}

// ------------------------------------------------------------------ templates

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function details(rows: Array<[string, string]>) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #efe4cc;border-radius:16px;background:#fcfaf5;margin:0 0 28px;border-collapse:separate;overflow:hidden;">${rows
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:13px 18px;font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:#9a7b3f;width:38%;${i < rows.length - 1 ? "border-bottom:1px solid #f3ead8;" : ""}">${esc(k)}</td><td style="padding:13px 18px;font-size:14px;color:#1b1b1b;${i < rows.length - 1 ? "border-bottom:1px solid #f3ead8;" : ""}">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

function paragraph(text: string) {
  return `<p style="font-size:14px;line-height:1.75;color:#555;margin:0 0 20px;">${text}</p>`;
}

function layout(
  studio: StudioSettings,
  o: { preheader: string; heading: string; intro: string; body?: string; cta?: { label: string; url: string } },
) {
  const footer = [studio.address, studio.email, studio.phone].filter(Boolean).map((s) => esc(String(s))).join(" &nbsp;·&nbsp; ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:#f3efe6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1b1b1b;">
<span style="display:none!important;opacity:0;color:transparent;max-height:0;overflow:hidden;">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe6;padding:36px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(20,16,8,.10);">
<tr><td style="background:#0b0b0c;padding:30px 38px;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:7px;color:#ffffff;">${esc(studio.studioName.toUpperCase())}</div>
<div style="height:2px;width:54px;background:linear-gradient(90deg,#f0dcaa,#b3843c);margin-top:14px;"></div>
${studio.tagline ? `<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#b9a27a;margin-top:12px;">${esc(studio.tagline)}</div>` : ""}
</td></tr>
<tr><td style="padding:40px 38px 34px;">
<h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:30px;line-height:1.25;margin:0 0 14px;color:#111;">${esc(o.heading)}</h1>
<p style="font-size:15px;line-height:1.75;color:#4a4a4a;margin:0 0 26px;">${o.intro}</p>
${o.body ?? ""}
${o.cta ? `<a href="${esc(o.cta.url)}" style="display:inline-block;background:#0b0b0c;color:#ecd39c;text-decoration:none;padding:15px 30px;border-radius:999px;font-weight:600;font-size:14px;letter-spacing:.6px;">${esc(o.cta.label)} &rarr;</a>` : ""}
</td></tr>
<tr><td style="padding:22px 38px;background:#faf7f0;border-top:1px solid #f0e8d6;font-size:12px;line-height:1.7;color:#8a8170;">${footer}<br/>You are receiving this email because you have an account or booking with ${esc(studio.studioName)}.</td></tr>
</table></td></tr></table></body></html>`;
}

function sessionRows(b: BookingDTO, studio: StudioSettings): Array<[string, string]> {
  return [
    ["Reference", b.reference],
    ["Session", b.title],
    ["Date", formatDateKey(b.date, "long")],
    ["Time", `${timeRangeLabel(b.startMinutes, b.endMinutes)} (${formatDuration(b.endMinutes - b.startMinutes)})`],
    ["Photographer", b.photographer?.name ?? "To be assigned"],
    ["Location", b.location ?? studio.address ?? "Our studio"],
  ];
}

// ------------------------------------------------------------------ notifications

export async function notifyBookingConfirmation(bookingId: number, origin: string, opts: SendOptions = {}) {
  const b = await getBookingDTO(bookingId);
  if (!b) return;
  const s = await getSettings();
  const advanceDue = Math.max(0, b.depositCents - b.paidCents);
  const pending = b.status === "pending";
  const html = layout(s, {
    preheader: `${b.title} · ${formatDateKey(b.date, "medium")} at ${timeRangeLabel(b.startMinutes, b.endMinutes)}`,
    heading: pending ? "We've received your booking" : "Your session is confirmed",
    intro: `Hi ${esc(firstName(b.client.name))}, thank you for choosing ${esc(s.studioName)}. ${pending ? "Your requested time is reserved while our team reviews the details." : "We can't wait to create something beautiful with you."} Here's everything you need to know.`,
    body:
      details([
        ...sessionRows(b, s),
        ["Total", formatMoney(b.netCents, s.currency)],
        ["Advance due", advanceDue > 0 ? formatMoney(advanceDue, s.currency) : "Received — thank you"],
      ]) + paragraph("Need to reschedule? Reply to this email or reach us by phone — we're happy to help."),
    cta: { label: "View your booking", url: `${origin}/dashboard/bookings/${b.id}` },
  });
  await sendEmail(
    {
      to: b.client.email,
      toName: b.client.name,
      subject: `${pending ? "Booking received" : "Booking confirmed"} · ${b.title} on ${formatDateKey(b.date, "short")}`,
      html,
      type: "booking_confirmation",
      bookingId: b.id,
    },
    opts,
  );
  await db.update(bookings).set({ confirmationSentAt: new Date() }).where(eq(bookings.id, b.id));
}

export async function notifyBookingReminder(bookingId: number, origin: string, opts: SendOptions = {}) {
  const b = await getBookingDTO(bookingId);
  if (!b || b.status === "cancelled") return;
  const s = await getSettings();
  const today = zonedNow(s.timezone).dateKey;
  const when = b.date === today ? "today" : b.date === addDaysToKey(today, 1) ? "tomorrow" : `on ${formatDateKey(b.date, "long")}`;
  const html = layout(s, {
    preheader: `Your ${b.title} session is ${when}`,
    heading: `See you ${when}!`,
    intro: `Hi ${esc(firstName(b.client.name))}, this is a friendly reminder about your upcoming session with ${esc(b.photographer?.name ?? "our team")}.`,
    body:
      details(sessionRows(b, s)) +
      paragraph(
        "<strong>A few tips:</strong> arrive 10 minutes early, bring any outfit changes on hangers, and don't worry about posing — we'll guide you every step of the way.",
      ) +
      (b.dueCents > 0 ? paragraph(`Outstanding balance: <strong>${formatMoney(b.dueCents, s.currency)}</strong>.`) : ""),
    cta: { label: "View session details", url: `${origin}/dashboard/bookings/${b.id}` },
  });
  await sendEmail({ to: b.client.email, toName: b.client.name, subject: `Reminder: your ${b.title} session is ${when}`, html, type: "booking_reminder", bookingId: b.id }, opts);
  await db.update(bookings).set({ reminderSentAt: new Date() }).where(eq(bookings.id, b.id));
}

export async function notifyBookingRescheduled(bookingId: number, origin: string, opts: SendOptions = {}) {
  const b = await getBookingDTO(bookingId);
  if (!b) return;
  const s = await getSettings();
  const html = layout(s, {
    preheader: `New time: ${formatDateKey(b.date, "medium")} at ${timeRangeLabel(b.startMinutes, b.endMinutes)}`,
    heading: "Your session has a new time",
    intro: `Hi ${esc(firstName(b.client.name))}, your booking has been rescheduled. The updated details are below.`,
    body: details(sessionRows(b, s)),
    cta: { label: "View booking", url: `${origin}/dashboard/bookings/${b.id}` },
  });
  await sendEmail({ to: b.client.email, toName: b.client.name, subject: `Rescheduled · ${b.title} on ${formatDateKey(b.date, "short")}`, html, type: "booking_rescheduled", bookingId: b.id }, opts);
}

export async function notifyBookingCancelled(bookingId: number, origin: string, opts: SendOptions = {}) {
  const b = await getBookingDTO(bookingId);
  if (!b) return;
  const s = await getSettings();
  const html = layout(s, {
    preheader: `Booking ${b.reference} has been cancelled`,
    heading: "Your session has been cancelled",
    intro: `Hi ${esc(firstName(b.client.name))}, your ${esc(b.title)} session on ${esc(formatDateKey(b.date, "long"))} has been cancelled. If this wasn't expected, please get in touch.`,
    body: paragraph("We'd love to find another time that works for you — our calendar is updated in real time."),
    cta: { label: "Book a new session", url: `${origin}/dashboard/bookings/new` },
  });
  await sendEmail({ to: b.client.email, toName: b.client.name, subject: `Booking cancelled · ${b.reference}`, html, type: "booking_cancelled", bookingId: b.id }, opts);
}

export async function notifyGalleryReady(galleryId: number, origin: string, opts: SendOptions = {}) {
  const [row] = await db
    .select({ gallery: galleries, client: { name: clients.name, email: clients.email } })
    .from(galleries)
    .innerJoin(clients, eq(galleries.clientId, clients.id))
    .where(eq(galleries.id, galleryId))
    .limit(1);
  if (!row) return;
  const [{ value: photoCount }] = await db.select({ value: count() }).from(photos).where(eq(photos.galleryId, galleryId));
  const s = await getSettings();
  const g = row.gallery;
  const html = layout(s, {
    preheader: `${photoCount} images are waiting for you`,
    heading: "Your private gallery is ready",
    intro: `Hi ${esc(firstName(row.client.name))}, the moment you've been waiting for — your images from <strong>${esc(g.title)}</strong> are ready to view in your private, secure gallery.`,
    body:
      details([
        ["Gallery", g.title],
        ["Images", String(photoCount)],
        ["Downloads", g.allowDownload ? "Enabled — full resolution" : "Proofing only (select your favourites)"],
        ["Available until", g.expiresAt ? formatDate(g.expiresAt) : "No expiry"],
      ]) + paragraph("Tap the heart on your favourites so we know which images you love most."),
    cta: { label: "Open your gallery", url: `${origin}/dashboard/galleries/${g.id}` },
  });
  await sendEmail({ to: row.client.email, toName: row.client.name, subject: `Your gallery is ready · ${g.title}`, html, type: "gallery_ready", galleryId: g.id, bookingId: g.bookingId }, opts);
}

export async function notifyPaymentReceipt(paymentId: number, origin: string, opts: SendOptions = {}) {
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!p) return;
  const b = await getBookingDTO(p.bookingId);
  if (!b) return;
  const s = await getSettings();
  const html = layout(s, {
    preheader: `We received ${formatMoney(p.amountCents, s.currency)} for ${b.reference}`,
    heading: p.type === "refund" ? "Your refund has been issued" : "Payment received — thank you",
    intro: `Hi ${esc(firstName(b.client.name))}, ${p.type === "refund" ? "we've processed a refund for your booking." : "we've received your payment. Here's your receipt for your records."}`,
    body: details([
      ["Invoice", b.invoiceNumber ?? b.reference],
      ["Session", `${b.title} · ${formatDateKey(b.date, "medium")}`],
      ["Amount", formatMoney(p.amountCents, s.currency)],
      ["Payment", `${PAYMENT_TYPE_LABELS[p.type]} · ${PAYMENT_METHOD_LABELS[p.method]}`],
      ["Paid on", formatDate(p.paidAt)],
      ["Balance remaining", formatMoney(b.dueCents, s.currency)],
    ]),
    cta: { label: "View invoice", url: `${origin}/dashboard/invoices/${b.id}` },
  });
  await sendEmail({ to: b.client.email, toName: b.client.name, subject: `Receipt · ${formatMoney(p.amountCents, s.currency)} for ${b.reference}`, html, type: "payment_receipt", bookingId: b.id }, opts);
}

export async function sendWelcomeEmail(user: { name: string; email: string; role: Role }, origin: string, opts: SendOptions = {}) {
  const s = await getSettings();
  const intro =
    user.role === "client"
      ? "Your client portal is ready. Book sessions in real time, track payments and invoices, and view your private galleries — all in one place."
      : `Your ${ROLE_LABELS[user.role].toLowerCase()} account is active. Your schedule, assignments and galleries are waiting in the studio dashboard.`;
  const html = layout(s, {
    preheader: `Welcome to ${s.studioName}`,
    heading: `Welcome, ${firstName(user.name)}`,
    intro: esc(intro),
    cta: { label: user.role === "client" ? "Book your first session" : "Open dashboard", url: `${origin}${user.role === "client" ? "/dashboard/bookings/new" : "/dashboard"}` },
  });
  await sendEmail({ to: user.email, toName: user.name, subject: `Welcome to ${s.studioName}`, html, type: "welcome" }, opts);
}

export async function sendTestEmail(to: string, name: string, origin: string) {
  const s = await getSettings();
  const html = layout(s, {
    preheader: "Your email configuration works",
    heading: "Email delivery is working",
    intro: `Hi ${esc(firstName(name))}, this is a test message from ${esc(s.studioName)}. Provider: <strong>${emailProvider().toUpperCase()}</strong>.`,
    cta: { label: "Back to dashboard", url: `${origin}/dashboard/notifications` },
  });
  return sendEmail({ to, toName: name, subject: `Test email · ${s.studioName}`, html, type: "test" });
}

/** Sends reminders for today's remaining and tomorrow's sessions that haven't been reminded. */
export async function sendDueReminders(origin: string) {
  const s = await getSettings();
  const now = zonedNow(s.timezone);
  const tomorrow = addDaysToKey(now.dateKey, 1);
  const due = await db
    .select({ id: bookings.id, date: bookings.date, startMinutes: bookings.startMinutes })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ACTIVE_BOOKING_STATUSES),
        gte(bookings.date, now.dateKey),
        lte(bookings.date, tomorrow),
        isNull(bookings.reminderSentAt),
      ),
    );
  let sent = 0;
  for (const b of due) {
    if (b.date === now.dateKey && b.startMinutes <= now.minutes) continue;
    await notifyBookingReminder(b.id, origin);
    sent++;
  }
  return { sent, checked: due.length };
}
