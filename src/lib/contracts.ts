import { createHash, randomBytes, randomInt } from "crypto";
import PDFDocument from "pdfkit";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, clients, contracts, packages, studioSettings, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "./auth";
import { getBookingDTO, getSettings } from "./booking";
import { sendEmail } from "./email";
import { ApiError, getOrigin } from "./http";
import {
  formatDateKey,
  formatDuration,
  formatMoney,
  firstName,
  minutesToLabel,
  timeRangeLabel,
  type ContractDTO,
  type ContractPublicDTO,
  type SignatureType,
} from "./shared";

const OTP_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_SECONDS = 30 * 60;
const MAX_OTP_ATTEMPTS = 5;

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function contractAccessSecret() {
  return process.env.JWT_SECRET || "lumiere-contract-dev-secret-change-me";
}

function accessToken(contractId: number, otpVerifiedAt: Date) {
  const expires = Date.now() + ACCESS_TTL_SECONDS * 1000;
  const payload = `${contractId}.${otpVerifiedAt.getTime()}.${expires}`;
  const sig = sha(`${payload}.${contractAccessSecret()}`);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function parseAccess(token: string) {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [id, verifiedAt, expires, signature] = raw.split(".");
    if (!id || !verifiedAt || !expires || !signature || Number(expires) < Date.now()) return null;
    const expected = sha(`${id}.${verifiedAt}.${expires}.${contractAccessSecret()}`);
    if (expected !== signature) return null;
    return { contractId: Number(id), verifiedAt: new Date(Number(verifiedAt)) };
  } catch {
    return null;
  }
}

function contractNumber(bookingId: number) {
  return `CON-${new Date().getFullYear()}-${String(bookingId).padStart(5, "0")}-${randomInt(100, 999)}`;
}

function newInvite() {
  return randomBytes(32).toString("base64url");
}

function code() {
  return String(randomInt(100000, 1000000));
}

async function contractRow(id: number) {
  const [row] = await db
    .select({ contract: contracts, booking: bookings, client: { id: clients.id, name: clients.name, email: clients.email }, pkg: packages })
    .from(contracts)
    .innerJoin(bookings, eq(contracts.bookingId, bookings.id))
    .innerJoin(clients, eq(contracts.clientId, clients.id))
    .leftJoin(packages, eq(bookings.packageId, packages.id))
    .where(eq(contracts.id, id))
    .limit(1);
  return row ?? null;
}

function toDTO(row: NonNullable<Awaited<ReturnType<typeof contractRow>>>): ContractDTO {
  const c = row.contract;
  return {
    id: c.id,
    contractNumber: c.contractNumber,
    bookingId: c.bookingId,
    clientId: c.clientId,
    status: c.status,
    signerName: c.signerName,
    signerEmail: c.signerEmail,
    signatureType: c.signatureType ?? null,
    signedAt: c.signedAt?.toISOString() ?? null,
    pdfFilename: c.pdfFilename,
    createdAt: c.createdAt.toISOString(),
    booking: {
      id: row.booking.id,
      reference: row.booking.reference,
      title: row.booking.title,
      date: row.booking.date,
      startMinutes: row.booking.startMinutes,
      endMinutes: row.booking.endMinutes,
      totalCents: row.booking.totalCents,
      discountCents: row.booking.discountCents,
      location: row.booking.location,
    },
    client: row.client,
  };
}

export async function ensureContract(bookingId: number) {
  const [existing] = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.bookingId, bookingId)).limit(1);
  if (existing) {
    const row = await contractRow(existing.id);
    if (!row) throw new ApiError(404, "Contract not found");
    return { ...row, inviteToken: null as string | null };
  }
  const [booking] = await db.select({ id: bookings.id, clientId: bookings.clientId }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) throw new ApiError(404, "Booking not found");
  const token = newInvite();
  const [created] = await db
    .insert(contracts)
    .values({ bookingId, clientId: booking.clientId, contractNumber: contractNumber(bookingId), inviteTokenHash: sha(token), status: "sent" })
    .returning({ id: contracts.id });
  const row = await contractRow(created.id);
  if (!row) throw new ApiError(500, "Unable to create contract");
  return { ...row, inviteToken: token };
}

export async function sendContractInvite(bookingId: number, origin: string) {
  const ensured = await ensureContract(bookingId);
  const row = ensured;
  const token = ensured.inviteToken ?? null;
  if (!token) return;
  const settings = await getSettings();
  const b = row.booking;
  const link = `${origin}/contract/${token}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#222;max-width:620px;margin:auto"><h1 style="font-family:Georgia,serif;font-weight:400">Your booking agreement is ready</h1><p>Hi ${firstName(row.client.name)}, before your <strong>${b.title}</strong> session on <strong>${formatDateKey(b.date, "long")}</strong>, please review and sign your photography agreement.</p><div style="background:#faf7f0;padding:20px;border-radius:16px;margin:24px 0"><p style="margin:0;color:#8b6b35;text-transform:uppercase;letter-spacing:2px;font-size:11px">Contract</p><p style="font-size:20px;margin:8px 0">${row.contract.contractNumber}</p><p style="margin:0;color:#666">${formatMoney(Math.max(0, b.totalCents - b.discountCents), settings.currency)} · ${timeRangeLabel(b.startMinutes, b.endMinutes)}</p></div><a href="${link}" style="display:inline-block;background:#0b0b0c;color:#ecd39c;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Review & sign agreement →</a><p style="margin-top:24px;color:#777;font-size:12px">This secure link only identifies your contract. A one-time code sent to this email is required before the contract can be viewed.</p></div>`;
  await sendEmail({ to: row.client.email, toName: row.client.name, subject: `Agreement ready · ${b.reference}`, html, type: "contract_invite", bookingId });
  return { contractNumber: row.contract.contractNumber, link };
}

export async function requestContractOtp(token: string, ip: string | null) {
  const [row] = await db.select().from(contracts).where(eq(contracts.inviteTokenHash, sha(token))).limit(1);
  if (!row || row.status === "void") throw new ApiError(404, "This contract link is invalid or has expired.");
  const detail = await contractRow(row.id);
  if (!detail) throw new ApiError(404, "Contract not found");
  const otp = code();
  await db.update(contracts).set({ otpHash: await hashPassword(otp), otpExpiresAt: new Date(Date.now() + OTP_TTL_MS), otpAttempts: 0, updatedAt: new Date() }).where(eq(contracts.id, row.id));
  const settings = await getSettings();
  await sendEmail({
    to: detail.client.email,
    toName: detail.client.name,
    subject: `Your verification code · ${detail.contract.contractNumber}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2 style="font-family:Georgia,serif;font-weight:400">Verify your contract access</h2><p>Enter this code to securely review your ${detail.booking.title} agreement:</p><div style="font-size:38px;letter-spacing:10px;font-weight:bold;color:#a77a36;margin:26px 0">${otp}</div><p style="font-size:12px;color:#777">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p><p style="font-size:12px;color:#777">${settings.studioName}</p></div>`,
    type: "contract_otp",
    bookingId: detail.booking.id,
  });
  return { sent: true, email: detail.client.email.replace(/(^.).*(@.*$)/, "$1••••$2"), expiresIn: OTP_TTL_MS / 1000, ip };
}

export async function verifyContractOtp(token: string, otp: string) {
  const [row] = await db.select().from(contracts).where(eq(contracts.inviteTokenHash, sha(token))).limit(1);
  if (!row || !row.otpHash || !row.otpExpiresAt) throw new ApiError(400, "Request a new verification code.");
  if (row.otpExpiresAt.getTime() < Date.now()) throw new ApiError(400, "This code has expired. Request a new one.");
  if (row.otpAttempts >= MAX_OTP_ATTEMPTS) throw new ApiError(429, "Too many attempts. Request a new verification code.");
  if (!(await verifyPassword(otp, row.otpHash))) {
    await db.update(contracts).set({ otpAttempts: row.otpAttempts + 1 }).where(eq(contracts.id, row.id));
    throw new ApiError(400, "That code is incorrect.");
  }
  const verifiedAt = new Date();
  await db.update(contracts).set({ status: row.status === "signed" ? "signed" : "otp_verified", otpVerifiedAt: verifiedAt, otpAttempts: 0, updatedAt: verifiedAt }).where(eq(contracts.id, row.id));
  return { accessToken: accessToken(row.id, verifiedAt), contractId: row.id };
}

export async function publicContract(token: string, access: string | null): Promise<ContractPublicDTO> {
  const [row] = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.inviteTokenHash, sha(token))).limit(1);
  if (!row) throw new ApiError(404, "This contract link is invalid or has expired.");
  const parsed = access ? parseAccess(access) : null;
  const detail = await contractRow(row.id);
  if (!detail) throw new ApiError(404, "Contract not found");
  const base = toDTO(detail);
  const settings = await getSettings();
  const unlocked = parsed?.contractId === row.id;
  if (!unlocked) {
    return { ...base, signerName: null, signerEmail: null, signatureType: null, signedAt: null, package: null, studio: { name: settings.studioName, email: settings.email, phone: settings.phone, address: settings.address, tagline: settings.tagline } };
  }
  return {
    ...base,
    package: detail.pkg ? { name: detail.pkg.name, category: detail.pkg.category, durationMinutes: detail.pkg.durationMinutes, priceCents: detail.pkg.priceCents, features: detail.pkg.features ?? [], description: detail.pkg.description } : null,
    studio: { name: settings.studioName, email: settings.email, phone: settings.phone, address: settings.address, tagline: settings.tagline },
  };
}

function generatePdf(input: { contract: ContractDTO; pkg: ContractPublicDTO["package"]; studio: ContractPublicDTO["studio"]; signatureType: SignatureType; signatureData: string; signerName: string; signerEmail: string }) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 54, info: { Title: input.contract.contractNumber, Author: input.studio.name, Subject: "Photography Services Agreement" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const black = "#101014";
    const gold = "#a77a36";
    const line = (y: number) => doc.moveTo(54, y).lineTo(541, y).strokeColor("#e4dbc9").stroke();
    doc.fillColor(black).font("Helvetica-Bold").fontSize(22).text(input.studio.name.toUpperCase(), { characterSpacing: 3 });
    doc.fillColor(gold).font("Helvetica").fontSize(9).text(input.studio.tagline ?? "Photography services agreement", { characterSpacing: 1 });
    doc.moveDown(2);
    doc.fillColor(black).font("Helvetica-Bold").fontSize(25).text("PHOTOGRAPHY SERVICES AGREEMENT");
    doc.fillColor(gold).font("Helvetica").fontSize(10).text(input.contract.contractNumber);
    doc.moveDown();
    line(doc.y);
    doc.moveDown();
    doc.fillColor(black).font("Helvetica-Bold").fontSize(11).text("1. PARTIES");
    doc.font("Helvetica").fontSize(10).text(`This agreement is between ${input.studio.name} (the “Studio”) and ${input.signerName} (the “Client”), ${input.signerEmail}.`);
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(11).text("2. SESSION DETAILS");
    doc.font("Helvetica").fontSize(10).text(`${input.contract.booking.title} · ${formatDateKey(input.contract.booking.date, "long")} · ${timeRangeLabel(input.contract.booking.startMinutes, input.contract.booking.endMinutes)} (${formatDuration(input.contract.booking.endMinutes - input.contract.booking.startMinutes)})`);
    doc.text(`Location: ${input.contract.booking.location ?? input.studio.address ?? "Studio"}`);
    doc.text(`Package: ${input.pkg?.name ?? input.contract.booking.title}`);
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(11).text("3. SERVICES & DELIVERY");
    doc.font("Helvetica").fontSize(10).text(input.pkg?.description ?? "The Studio will provide professional photography services for the session described above.");
    for (const feature of input.pkg?.features ?? []) doc.text(`• ${feature}`);
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(11).text("4. PAYMENT & CANCELLATION");
    doc.font("Helvetica").fontSize(10).text(`The total session fee is ${formatMoney(Math.max(0, input.contract.booking.totalCents - input.contract.booking.discountCents), "USD")}. The Client agrees to the payment schedule shown on the invoice. The date is reserved once the required advance is received. Rescheduling is subject to availability and the Studio’s published cancellation policy.`);
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(11).text("5. COPYRIGHT & USAGE");
    doc.font("Helvetica").fontSize(10).text("The Studio retains copyright in all images. The Client receives a personal, non-exclusive license for private use. Commercial use, resale or alteration requires written permission. The Studio will not use images for portfolio or promotional purposes without the Client’s consent where required by law.");
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(11).text("6. ACCEPTANCE");
    doc.font("Helvetica").fontSize(10).text("By signing below, the Client confirms they have read, understood and agree to this Photography Services Agreement and the booking details above.");
    doc.moveDown(2);
    line(doc.y);
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(11).text("CLIENT SIGNATURE");
    if (input.signatureType === "typed") doc.font("Times-Italic").fontSize(24).fillColor("#202020").text(input.signatureData);
    else doc.font("Helvetica").fontSize(10).fillColor("#555").text("Digital signature captured electronically");
    doc.font("Helvetica").fontSize(9).fillColor("#666").text(`Signed by ${input.signerName} · ${input.signerEmail} · ${new Date().toISOString()}`);
    doc.moveDown();
    doc.fillColor(gold).font("Helvetica-Bold").fontSize(9).text(`Contract ID: ${input.contract.contractNumber} · Digitally executed via ${input.studio.name}`);
    doc.end();
  });
}

export async function signContract(token: string, data: { accessToken: string; signerName: string; signerEmail: string; signatureType: SignatureType; signatureData: string; ip: string | null; userAgent: string | null }, origin: string) {
  const [row] = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.inviteTokenHash, sha(token))).limit(1);
  if (!row) throw new ApiError(404, "Contract not found");
  const access = parseAccess(data.accessToken);
  if (!access || access.contractId !== row.id) throw new ApiError(403, "Verify the email code before signing.");
  const detail = await contractRow(row.id);
  if (!detail) throw new ApiError(404, "Contract not found");
  if (detail.contract.status === "signed") return { contract: toDTO(detail), alreadySigned: true };
  if (data.signerEmail.toLowerCase() !== detail.client.email.toLowerCase()) throw new ApiError(400, "The signer email must match the booking email.");
  const settings = await getSettings();
  const dto = toDTO(detail);
  const pdf = await generatePdf({ contract: dto, pkg: detail.pkg ? { name: detail.pkg.name, category: detail.pkg.category, durationMinutes: detail.pkg.durationMinutes, priceCents: detail.pkg.priceCents, features: detail.pkg.features ?? [], description: detail.pkg.description } : null, studio: { name: settings.studioName, email: settings.email, phone: settings.phone, address: settings.address, tagline: settings.tagline }, signatureType: data.signatureType, signatureData: data.signatureData, signerName: data.signerName, signerEmail: data.signerEmail });
  const now = new Date();
  const filename = `${detail.contract.contractNumber}-signed.pdf`;
  await db.update(contracts).set({ status: "signed", signerName: data.signerName, signerEmail: data.signerEmail, signerIp: data.ip, signerUserAgent: data.userAgent, signatureType: data.signatureType, signatureData: data.signatureData, signedAt: now, pdfData: pdf.toString("base64"), pdfFilename: filename, pdfGeneratedAt: now, updatedAt: now }).where(eq(contracts.id, row.id));
  const admin = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.role, "admin")).limit(1);
  const attachment = [{ filename, content: pdf, contentType: "application/pdf" }];
  const signedHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2 style="font-family:Georgia,serif;font-weight:400">Contract signed</h2><p>${data.signerName} signed contract <strong>${detail.contract.contractNumber}</strong> for ${detail.booking.title}.</p><p>The signed PDF is attached for your records.</p><a href="${origin}/dashboard/bookings/${detail.booking.id}" style="display:inline-block;background:#0b0b0c;color:#ecd39c;padding:12px 22px;border-radius:999px;text-decoration:none">Open booking</a></div>`;
  await sendEmail({ to: detail.client.email, toName: detail.client.name, subject: `Signed agreement · ${detail.contract.contractNumber}`, html: signedHtml, type: "contract_signed", bookingId: detail.booking.id, attachments: attachment });
  if (admin[0]) await sendEmail({ to: admin[0].email, toName: admin[0].name, subject: `Contract signed · ${detail.contract.contractNumber}`, html: signedHtml, type: "contract_signed", bookingId: detail.booking.id, attachments: attachment });
  await db.update(contracts).set({ emailedAt: new Date() }).where(eq(contracts.id, row.id));
  const refreshed = await contractRow(row.id);
  return { contract: refreshed ? toDTO(refreshed) : dto, pdfFilename: filename };
}

export async function contractPdf(token: string, access: string | null) {
  const [row] = await db.select().from(contracts).where(eq(contracts.inviteTokenHash, sha(token))).limit(1);
  if (!row?.pdfData) throw new ApiError(404, "Signed PDF is not available yet.");
  const parsed = access ? parseAccess(access) : null;
  if (!parsed || parsed.contractId !== row.id) throw new ApiError(403, "Verify the email code to access this document.");
  return { data: Buffer.from(row.pdfData, "base64"), filename: row.pdfFilename ?? `${row.contractNumber}.pdf` };
}

export function contractFromAccess(access: string | null) {
  return access ? parseAccess(access) : null;
}
