import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, clients, contracts, packages } from "@/db/schema";
import { ensureContract, publicContract, requestContractOtp, signContract, verifyContractOtp, contractPdf } from "@/lib/contracts";
import { sendContractInvite } from "@/lib/contracts";
import { ApiError, created, getOrigin, intParam, notFound, parseBody, type Ctx, type PublicCtx } from "@/lib/http";
import type { ContractDTO } from "@/lib/shared";
import { contractOtpRequestSchema, contractOtpVerifySchema, contractSignSchema } from "@/lib/validators";

function requestMeta(ctx: PublicCtx) {
  return { ip: ctx.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ctx.req.headers.get("x-real-ip"), userAgent: ctx.req.headers.get("user-agent") };
}

export async function publicGet(ctx: PublicCtx) {
  return publicContract(ctx.params.token, ctx.query.get("access"));
}

export async function requestOtp(ctx: PublicCtx) {
  await parseBody(ctx.req, contractOtpRequestSchema);
  return requestContractOtp(ctx.params.token, requestMeta(ctx).ip);
}

export async function verifyOtp(ctx: PublicCtx) {
  const { code } = await parseBody(ctx.req, contractOtpVerifySchema);
  return verifyContractOtp(ctx.params.token, code);
}

export async function sign(ctx: PublicCtx) {
  const data = await parseBody(ctx.req, contractSignSchema);
  return signContract(ctx.params.token, { ...data, ...requestMeta(ctx) }, getOrigin(ctx.req));
}

export async function pdf(ctx: PublicCtx) {
  const result = await contractPdf(ctx.params.token, ctx.query.get("access"));
  return new NextResponse(new Uint8Array(result.data), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${result.filename}"`, "Cache-Control": "private, no-store" } });
}

export async function sendForBooking(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [booking] = await db.select({ id: bookings.id, status: bookings.status }).from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!booking) throw notFound("Booking");
  if (booking.status === "cancelled") throw new ApiError(400, "A contract cannot be sent for a cancelled booking.");
  const ensured = await ensureContract(id);
  if (ensured.inviteToken) {
    await sendContractInvite(id, getOrigin(ctx.req));
    return { sent: true, contractNumber: ensured.contract.contractNumber };
  }
  return { sent: false, status: ensured.contract.status, contractNumber: ensured.contract.contractNumber, message: "A contract already exists. Use the original secure link or create a new booking contract." };
}

export async function list(ctx: Ctx) {
  const rows = await db.select({ contract: contracts, booking: { id: bookings.id, reference: bookings.reference, title: bookings.title, date: bookings.date }, client: { id: clients.id, name: clients.name, email: clients.email } }).from(contracts).innerJoin(bookings, eq(contracts.bookingId, bookings.id)).innerJoin(clients, eq(contracts.clientId, clients.id)).orderBy(desc(contracts.createdAt)).limit(300);
  return { results: rows.map((r) => ({ ...r.contract, createdAt: r.contract.createdAt.toISOString(), signedAt: r.contract.signedAt?.toISOString() ?? null, otpVerifiedAt: r.contract.otpVerifiedAt?.toISOString() ?? null, pdfGeneratedAt: r.contract.pdfGeneratedAt?.toISOString() ?? null, emailedAt: r.contract.emailedAt?.toISOString() ?? null, booking: r.booking, client: r.client })) };
}

export async function forBooking(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [row] = await db.select({ id: contracts.id, bookingId: contracts.bookingId, clientId: contracts.clientId }).from(contracts).where(eq(contracts.bookingId, id)).limit(1);
  if (!row) return { contract: null };
  if (ctx.user.role === "client" && ctx.user.clientId !== row.clientId) throw notFound("Contract");
  return { contract: await contractRowForDTO(row.id) };
}

async function contractRowForDTO(id: number): Promise<ContractDTO | null> {
  const [row] = await db.select({ contract: contracts, booking: bookings, client: { id: clients.id, name: clients.name, email: clients.email } }).from(contracts).innerJoin(bookings, eq(contracts.bookingId, bookings.id)).innerJoin(clients, eq(contracts.clientId, clients.id)).where(eq(contracts.id, id)).limit(1);
  if (!row) return null;
  return { id: row.contract.id, contractNumber: row.contract.contractNumber, bookingId: row.contract.bookingId, clientId: row.contract.clientId, status: row.contract.status, signerName: row.contract.signerName, signerEmail: row.contract.signerEmail, signatureType: row.contract.signatureType ?? null, signedAt: row.contract.signedAt?.toISOString() ?? null, pdfFilename: row.contract.pdfFilename, createdAt: row.contract.createdAt.toISOString(), booking: { id: row.booking.id, reference: row.booking.reference, title: row.booking.title, date: row.booking.date, startMinutes: row.booking.startMinutes, endMinutes: row.booking.endMinutes, totalCents: row.booking.totalCents, discountCents: row.booking.discountCents, location: row.booking.location }, client: row.client };
}
