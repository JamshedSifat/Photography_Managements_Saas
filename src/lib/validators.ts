import { z } from "zod";
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUSES,
  GALLERY_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  ROLES,
  isValidDateKey,
  isValidTimezone,
} from "./shared";

// NOTE: schemas intentionally avoid `.default()` so `.partial()` PATCH schemas never
// inject values for absent keys. Defaults are applied in the views.

const text = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

const email = z.string().trim().toLowerCase().max(255).email("Enter a valid email address");
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");
const cents = z.coerce.number().int("Invalid amount").min(0, "Cannot be negative").max(100_000_000, "Amount is too large");
const id = z.coerce.number().int().positive();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format").refine(isValidDateKey, "Enter a valid date");
const minutes = z.coerce.number().int().min(0).max(1439);

export const photographerProfileShape = {
  headline: optionalText(160),
  location: optionalText(160),
  experienceYears: z.coerce.number().int().min(0, "Cannot be negative").max(70, "Enter a realistic number of years").optional(),
  specialties: z.array(text(60).min(1)).max(12, "Up to 12 specialties").optional(),
  portfolio: z
    .array(
      z.object({
        id: text(60).min(1),
        url: text(1000).min(1, "Image URL is required"),
        caption: optionalText(200).transform((v) => v ?? ""),
        category: optionalText(60).transform((v) => v ?? "Portfolio"),
      }),
    )
    .max(24, "Up to 24 portfolio images")
    .optional(),
};

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
  role: z.enum(ROLES).optional(),
});

export const registerSchema = z.object({
  name: text(120).min(2, "Please enter your full name"),
  email,
  password,
  phone: optionalText(40),
  role: z.enum(ROLES).optional(),
  inviteCode: optionalText(60),
});

export const profileSchema = z.object({
  name: text(120).min(2, "Please enter your full name").optional(),
  phone: optionalText(40),
  bio: optionalText(1000),
  specialty: optionalText(120),
  avatarUrl: optionalText(1000),
  ...photographerProfileShape,
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: password,
});

const clientShape = {
  name: text(120).min(2, "Name is required"),
  email,
  phone: optionalText(40),
  address: optionalText(255),
  city: optionalText(120),
  source: optionalText(60),
  notes: optionalText(2000),
  tags: z.array(text(30).min(1)).max(10, "Up to 10 tags").optional(),
};
export const clientCreateSchema = z.object(clientShape);
export const clientUpdateSchema = z.object(clientShape).partial();

const packageShape = {
  name: text(120).min(2, "Name is required"),
  category: text(60).min(2, "Category is required"),
  description: optionalText(2000),
  priceCents: cents,
  durationMinutes: z.coerce.number().int().min(15, "Minimum duration is 15 minutes").max(720, "Maximum duration is 12 hours"),
  depositPercent: z.coerce.number().int().min(0, "0–100%").max(100, "0–100%"),
  features: z.array(text(120).min(1)).max(20, "Up to 20 features"),
  deliverables: optionalText(160),
  coverUrl: optionalText(1000),
  popular: z.boolean(),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
};
export const packageCreateSchema = z.object(packageShape).partial({
  description: true,
  depositPercent: true,
  features: true,
  deliverables: true,
  coverUrl: true,
  popular: true,
  active: true,
  sortOrder: true,
});
export const packageUpdateSchema = z.object(packageShape).partial();

export const bookingCreateSchema = z.object({
  packageId: id,
  date: dateKey,
  startMinutes: minutes,
  photographerId: id.nullish(),
  clientId: id.optional(),
  location: optionalText(255),
  notes: optionalText(2000),
  internalNotes: optionalText(2000),
  status: z.enum(ACTIVE_BOOKING_STATUSES).optional(),
  discountCents: cents.optional(),
  sendEmail: z.boolean().optional(),
});

export const bookingUpdateSchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  statusNote: optionalText(500),
  date: dateKey.optional(),
  startMinutes: minutes.optional(),
  photographerId: id.nullable().optional(),
  packageId: id.optional(),
  location: optionalText(255),
  notes: optionalText(2000),
  internalNotes: optionalText(2000),
  discountCents: cents.optional(),
  totalCents: cents.optional(),
  notify: z.boolean().optional(),
});
export type BookingUpdateInput = z.output<typeof bookingUpdateSchema>;

export const bookingNotifySchema = z.object({ type: z.enum(["confirmation", "reminder"]) });

const paidAt = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date");

export const paymentCreateSchema = z.object({
  bookingId: id,
  amountCents: z.coerce.number().int().positive("Amount must be greater than zero").max(100_000_000, "Amount is too large"),
  type: z.enum(PAYMENT_TYPES),
  method: z.enum(PAYMENT_METHODS),
  status: z.enum(PAYMENT_STATUSES),
  reference: optionalText(120),
  notes: optionalText(1000),
  paidAt,
  sendReceipt: z.boolean().optional(),
});

/**
 * Manual mobile-money submission made by a client after paying the studio wallet
 * out-of-band. No gateway is involved, so every field is client-attested and must be
 * verified by an admin before the payment counts.
 */
export const manualPaymentSubmitSchema = z.object({
  bookingId: id,
  amountCents: z.coerce.number().int().positive("Enter the amount you paid").max(100_000_000, "Amount is too large"),
  method: z.enum(["bkash", "nagad"], { message: "Choose bKash or Nagad" }),
  transactionId: z
    .string()
    .trim()
    .min(4, "Enter the transaction ID from your payment confirmation")
    .max(80, "Transaction ID is too long")
    .regex(/^[A-Za-z0-9-]+$/, "Transaction IDs contain only letters, numbers and dashes")
    .transform((v) => v.toUpperCase()),
  senderNumber: z
    .string()
    .trim()
    .regex(/^01[0-9]{9}$/, "Enter the 11-digit wallet number you paid from"),
  paidAt: z.string().min(1, "Enter the date and time you paid"),
  notes: optionalText(1000),
});

export const paymentVerifySchema = z.object({
  approve: z.boolean(),
  reason: optionalText(500),
});

export const paymentUpdateSchema = z.object({
  amountCents: z.coerce.number().int().positive("Amount must be greater than zero").max(100_000_000).optional(),
  type: z.enum(PAYMENT_TYPES).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  reference: optionalText(120),
  notes: optionalText(1000),
  paidAt,
});

export const galleryCreateSchema = z.object({
  bookingId: id.nullish(),
  clientId: id.nullish(),
  title: text(160).min(2, "Title is required"),
  description: optionalText(2000),
  allowDownload: z.boolean().optional(),
  watermark: z.boolean().optional(),
  expiresAt: dateKey.nullish(),
});

export const galleryUpdateSchema = z.object({
  title: text(160).min(2, "Title is required").optional(),
  description: optionalText(2000),
  allowDownload: z.boolean().optional(),
  watermark: z.boolean().optional(),
  status: z.enum(GALLERY_STATUSES).optional(),
  expiresAt: dateKey.nullish(),
  coverPhotoId: id.nullish(),
  notify: z.boolean().optional(),
});

export const photoUpdateSchema = z.object({
  isFavorite: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #D1A95C");

export const photographerCreateSchema = z.object({
  name: text(120).min(2, "Name is required"),
  email,
  password,
  phone: optionalText(40),
  specialty: optionalText(120),
  bio: optionalText(1000),
  color: hexColor.optional(),
});


export const photographerUpdateSchema = z.object({
  name: text(120).min(2, "Name is required").optional(),
  phone: optionalText(40),
  specialty: optionalText(120),
  bio: optionalText(1000),
  color: hexColor.optional(),
  active: z.boolean().optional(),
  password: password.optional(),
  ...photographerProfileShape,
});

/** Self-service profile update (photographers can curate their public portfolio). */
export const myProfileSchema = z.object({
  name: text(120).min(2, "Please enter your full name").optional(),
  phone: optionalText(40),
  bio: optionalText(1000),
  specialty: optionalText(120),
  avatarUrl: optionalText(1000),
  ...photographerProfileShape,
});

export const contractOtpRequestSchema = z.object({ email: email.optional() });
export const contractOtpVerifySchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });
export const contractSignSchema = z.object({
  accessToken: z.string().min(20, "Contract access is required"),
  signerName: text(120).min(2, "Signer name is required"),
  signerEmail: email,
  signatureType: z.enum(["typed", "drawn"]),
  signatureData: z.string().min(2, "Signature is required").max(200000, "Signature is too large"),
});

export const availabilitySlotSchema = z.object({
  photographerId: id.optional(),
  weekday: z.coerce.number().int().min(0).max(6),
  startMinutes: minutes,
  endMinutes: z.coerce.number().int().min(1).max(1440),
  label: optionalText(80),
  enabled: z.boolean().optional(),
});
export const availabilityOverrideSchema = z.object({
  photographerId: id.nullish(),
  date: dateKey,
  kind: z.enum(["available", "blocked", "holiday", "leave", "break"]),
  startMinutes: minutes.nullish(),
  endMinutes: z.coerce.number().int().min(1).max(1440).nullish(),
  reason: optionalText(255),
});
export const leaveCreateSchema = z.object({
  startDate: dateKey,
  endDate: dateKey,
  reason: text(1000).min(2, "Reason is required"),
});
export const leaveReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  adminNote: optionalText(1000),
});
export const galleryOtpRequestSchema = z.object({ email: email.optional() });
export const galleryOtpVerifySchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });
export const galleryCommentSchema = z.object({ photoId: id.nullish(), message: text(1200).min(2, "Comment is required") });
export const galleryCommentUpdateSchema = z.object({ status: z.enum(["open", "resolved"]) });
export const extensionRequestSchema = z.object({ requestedDays: z.coerce.number().int().refine((v) => [7, 15, 30].includes(v), "Choose 7, 15 or 30 days"), note: optionalText(1000) });
export const extensionReviewSchema = z.object({ status: z.enum(["approved", "rejected"]), adminNote: optionalText(1000) });

export const settingsUpdateSchema = z
  .object({
    studioName: text(120).min(2, "Studio name is required"),
    tagline: optionalText(160),
    email,
    phone: optionalText(40),
    address: optionalText(255),
    currency: z.string().trim().toUpperCase().length(3, "Use a 3-letter currency code"),
    timezone: z.string().trim().refine(isValidTimezone, "Unknown timezone"),
    openMinutes: minutes,
    closeMinutes: z.coerce.number().int().min(1).max(1440),
    slotIntervalMinutes: z.coerce.number().int().min(5, "Minimum 5 minutes").max(240),
    bufferMinutes: z.coerce.number().int().min(0).max(240),
    workingDays: z.array(z.number().int().min(0).max(6)).min(1, "Select at least one working day").max(7),
    minNoticeHours: z.coerce.number().int().min(0).max(720),
    maxAdvanceDays: z.coerce.number().int().min(1).max(730),
    invoicePrefix: text(12).min(1, "Prefix is required"),
    invoiceNotes: optionalText(1000),
  })
  .partial();

export const reviewCreateSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a rating from 1 to 5").max(5, "Choose a rating from 1 to 5"),
  title: optionalText(160),
  comment: text(2000).min(10, "Please share at least a sentence about your session"),
});

export const chatMessageSchema = z.object({
  body: text(4000),
});

export const chatTypingSchema = z.object({
  typing: z.boolean().optional().default(true),
});

export const notificationReadSchema = z.object({
  ids: z.array(id).max(200, "Too many notifications at once").optional(),
  all: z.boolean().optional(),
});

export const photographerProfileSchema = z.object({
  headline: optionalText(160),
  location: optionalText(160),
  experienceYears: z.coerce.number().int().min(0, "Cannot be negative").max(70, "Enter a realistic number of years").optional(),
  specialties: z.array(text(60).min(1)).max(12, "Up to 12 specialties").optional(),
  portfolio: z
    .array(
      z.object({
        id: text(60).min(1),
        url: text(1000).min(1, "Image URL is required"),
        caption: optionalText(200).transform((v) => v ?? ""),
        category: optionalText(60).transform((v) => v ?? "Portfolio"),
      }),
    )
    .max(24, "Up to 24 portfolio images")
    .optional(),
});
