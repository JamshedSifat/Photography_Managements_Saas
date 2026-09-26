import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import type {
  BookingStatus,
  EmailStatus,
  EmailType,
  GalleryStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  PhotoProvider,
  Role,
  ContractStatus,
  SignatureType,
  AvailabilityOverrideKind,
  LeaveStatus,
  GalleryCommentStatus,
  GalleryActivityType,
  GalleryExtensionStatus,
  ChatMessageKind,
  NotificationType,
} from "@/lib/shared";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 20 }).$type<Role>().notNull().default("client"),
    phone: varchar("phone", { length: 40 }),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    specialty: varchar("specialty", { length: 120 }),
    color: varchar("color", { length: 20 }),
    active: boolean("active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    // Public photographer portfolio
    headline: varchar("headline", { length: 160 }),
    location: varchar("location", { length: 160 }),
    experienceYears: integer("experience_years").notNull().default(0),
    specialties: jsonb("specialties").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    portfolio: jsonb("portfolio").$type<PortfolioItem[]>().notNull().default(sql`'[]'::jsonb`),
    // Denormalised rating aggregate (kept in sync when reviews are created)
    ratingCount: integer("rating_count").notNull().default(0),
    ratingTotal: integer("rating_total").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

export type PortfolioItem = { id: string; url: string; caption: string; category: string };

export const clients = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "set null" })
      .unique(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    phone: varchar("phone", { length: 40 }),
    address: varchar("address", { length: 255 }),
    city: varchar("city", { length: 120 }),
    source: varchar("source", { length: 60 }),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clients_name_idx").on(t.name)],
);

export const packages = pgTable("packages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  category: varchar("category", { length: 60 }).notNull().default("Portrait"),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  depositPercent: integer("deposit_percent").notNull().default(30),
  features: jsonb("features").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  deliverables: varchar("deliverables", { length: 160 }),
  coverUrl: text("cover_url"),
  popular: boolean("popular").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Bookings store wall-clock times in the studio timezone:
 * `date` (YYYY-MM-DD) + start/end minutes from midnight. This keeps availability
 * math and double-booking checks free of timezone drift.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 20 }).notNull().unique(),
    invoiceNumber: varchar("invoice_number", { length: 40 }).unique(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    packageId: integer("package_id").references(() => packages.id, { onDelete: "set null" }),
    photographerId: integer("photographer_id").references(() => users.id, { onDelete: "set null" }),
    title: varchar("title", { length: 160 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    startMinutes: integer("start_minutes").notNull(),
    endMinutes: integer("end_minutes").notNull(),
    status: varchar("status", { length: 32 }).$type<BookingStatus>().notNull().default("approved"),
    location: varchar("location", { length: 255 }),
    notes: text("notes"),
    internalNotes: text("internal_notes"),
    totalCents: integer("total_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("bookings_date_idx").on(t.date),
    index("bookings_photographer_date_idx").on(t.photographerId, t.date),
    index("bookings_client_idx").on(t.clientId),
    index("bookings_status_idx").on(t.status),
  ],
);

/**
 * In-app notification centre. Every row is scoped to a single user and pushed live
 * over the realtime (SSE) channel as well as being persisted for history.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).$type<NotificationType>().notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    message: text("message").notNull(),
    linkType: varchar("link_type", { length: 20 }).$type<"booking" | "gallery" | "chat" | "review">(),
    linkId: integer("link_id"),
    bookingId: integer("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    galleryId: integer("gallery_id").references(() => galleries.id, { onDelete: "cascade" }),
    chatRoomId: integer("chat_room_id"),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt), index("notifications_user_unread_idx").on(t.userId, t.readAt)],
);

/** One private chat room per booking — created automatically when the booking is made. */
export const chatRooms = pgTable(
  "chat_rooms",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" })
      .unique(),
    title: varchar("title", { length: 160 }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("chat_rooms_last_message_idx").on(t.lastMessageAt)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    senderUserId: integer("sender_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 20 }).$type<ChatMessageKind>().notNull().default("text"),
    body: text("body").notNull().default(""),
    attachmentUrl: text("attachment_url"),
    attachmentName: varchar("attachment_name", { length: 255 }),
    attachmentType: varchar("attachment_type", { length: 120 }),
    attachmentBytes: integer("attachment_bytes"),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_room_idx").on(t.roomId, t.id), index("chat_messages_created_idx").on(t.createdAt)],
);

/** Per-user read/typing state, used for seen receipts and typing indicators. */
export const chatReads = pgTable(
  "chat_reads",
  {
    roomId: integer("room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadMessageId: integer("last_read_message_id").notNull().default(0),
    typingAt: timestamp("typing_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] })],
);

/** Client review left after a booking is completed (one review per booking). */
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" })
      .unique(),
    photographerId: integer("photographer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    title: varchar("title", { length: 160 }),
    comment: text("comment").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("reviews_photographer_idx").on(t.photographerId, t.createdAt), index("reviews_client_idx").on(t.clientId)],
);

/** Immutable audit trail of booking status transitions — powers the booking timeline. */
export const bookingEvents = pgTable(
  "booking_events",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    fromStatus: varchar("from_status", { length: 32 }).$type<BookingStatus | null>(),
    toStatus: varchar("to_status", { length: 32 }).$type<BookingStatus>().notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("booking_events_booking_idx").on(t.bookingId, t.id)],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    type: varchar("type", { length: 20 }).$type<PaymentType>().notNull().default("advance"),
    method: varchar("method", { length: 20 }).$type<PaymentMethod>().notNull().default("card"),
    status: varchar("status", { length: 20 }).$type<PaymentStatus>().notNull().default("paid"),
    reference: varchar("reference", { length: 120 }),
    notes: text("notes"),
    paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
    recordedById: integer("recorded_by_id").references(() => users.id, { onDelete: "set null" }),
    // ---- manual bKash / Nagad submission (no gateway API)
    /** Wallet transaction id supplied by the client. Unique to block duplicate claims. */
    transactionId: varchar("transaction_id", { length: 80 }),
    /** Wallet number the client paid from. */
    senderNumber: varchar("sender_number", { length: 40 }),
    /** Optional proof-of-payment screenshot (Cloudinary public id or local key). */
    screenshotUrl: text("screenshot_url"),
    submittedById: integer("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
    verifiedById: integer("verified_by_id").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_booking_idx").on(t.bookingId),
    index("payments_paid_at_idx").on(t.paidAt),
    index("payments_status_idx").on(t.status),
    uniqueIndex("payments_transaction_id_key").on(t.transactionId),
  ],
);

export const galleries = pgTable(
  "galleries",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 20 }).$type<GalleryStatus>().notNull().default("draft"),
    allowDownload: boolean("allow_download").notNull().default(true),
    watermark: boolean("watermark").notNull().default(false),
    coverPhotoId: integer("cover_photo_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    downloadExpiresAt: timestamp("download_expires_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("galleries_client_idx").on(t.clientId), index("galleries_booking_idx").on(t.bookingId)],
);

export const photos = pgTable(
  "photos",
  {
    id: serial("id").primaryKey(),
    galleryId: integer("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).$type<PhotoProvider>().notNull(),
    publicId: text("public_id"),
    url: text("url"),
    thumbUrl: text("thumb_url"),
    filename: varchar("filename", { length: 255 }).notNull(),
    format: varchar("format", { length: 20 }),
    mimeType: varchar("mime_type", { length: 80 }),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("photos_gallery_idx").on(t.galleryId)],
);

export const emailLogs = pgTable(
  "email_logs",
  {
    id: serial("id").primaryKey(),
    toEmail: varchar("to_email", { length: 255 }).notNull(),
    toName: varchar("to_name", { length: 120 }),
    subject: varchar("subject", { length: 255 }).notNull(),
    html: text("html").notNull(),
    type: varchar("type", { length: 40 }).$type<EmailType>().notNull(),
    status: varchar("status", { length: 20 }).$type<EmailStatus>().notNull(),
    provider: varchar("provider", { length: 20 }),
    error: text("error"),
    bookingId: integer("booking_id"),
    galleryId: integer("gallery_id"),
    createdAt: createdAt(),
  },
  (t) => [index("email_logs_created_idx").on(t.createdAt), index("email_logs_booking_idx").on(t.bookingId)],
);

export const studioSettings = pgTable("studio_settings", {
  id: integer("id").primaryKey().default(1),
  studioName: varchar("studio_name", { length: 120 }).notNull().default("Lumière Studio"),
  tagline: varchar("tagline", { length: 160 }),
  email: varchar("email", { length: 255 }).notNull().default("hello@lumiere.studio"),
  phone: varchar("phone", { length: 40 }),
  address: varchar("address", { length: 255 }),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/New_York"),
  openMinutes: integer("open_minutes").notNull().default(540),
  closeMinutes: integer("close_minutes").notNull().default(1140),
  slotIntervalMinutes: integer("slot_interval_minutes").notNull().default(60),
  bufferMinutes: integer("buffer_minutes").notNull().default(30),
  workingDays: jsonb("working_days").$type<number[]>().notNull().default(sql`'[1,2,3,4,5,6]'::jsonb`),
  minNoticeHours: integer("min_notice_hours").notNull().default(12),
  maxAdvanceDays: integer("max_advance_days").notNull().default(180),
  invoicePrefix: varchar("invoice_prefix", { length: 12 }).notNull().default("INV"),
  invoiceNotes: text("invoice_notes"),
  updatedAt: updatedAt(),
});

export const photographerWeeklyHours = pgTable(
  "photographer_weekly_hours",
  {
    id: serial("id").primaryKey(),
    photographerId: integer("photographer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMinutes: integer("start_minutes").notNull(),
    endMinutes: integer("end_minutes").notNull(),
    label: varchar("label", { length: 80 }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("weekly_hours_photographer_day_idx").on(t.photographerId, t.weekday)],
);

export const availabilityOverrides = pgTable(
  "availability_overrides",
  {
    id: serial("id").primaryKey(),
    photographerId: integer("photographer_id").references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    kind: varchar("kind", { length: 20 }).$type<AvailabilityOverrideKind>().notNull(),
    startMinutes: integer("start_minutes"),
    endMinutes: integer("end_minutes"),
    reason: varchar("reason", { length: 255 }),
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("availability_overrides_date_idx").on(t.date), index("availability_overrides_photographer_idx").on(t.photographerId, t.date)],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: serial("id").primaryKey(),
    photographerId: integer("photographer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 20 }).$type<LeaveStatus>().notNull().default("pending"),
    adminNote: text("admin_note"),
    reviewedById: integer("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("leave_requests_photographer_idx").on(t.photographerId), index("leave_requests_status_idx").on(t.status)],
);

export const contracts = pgTable(
  "contracts",
  {
    id: serial("id").primaryKey(),
    contractNumber: varchar("contract_number", { length: 40 }).notNull().unique(),
    bookingId: integer("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }).unique(),
    clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).$type<ContractStatus>().notNull().default("draft"),
    inviteTokenHash: text("invite_token_hash").notNull().unique(),
    otpHash: text("otp_hash"),
    otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
    otpAttempts: integer("otp_attempts").notNull().default(0),
    otpVerifiedAt: timestamp("otp_verified_at", { withTimezone: true }),
    signerName: varchar("signer_name", { length: 120 }),
    signerEmail: varchar("signer_email", { length: 255 }),
    signerIp: varchar("signer_ip", { length: 80 }),
    signerUserAgent: text("signer_user_agent"),
    signatureType: varchar("signature_type", { length: 20 }).$type<SignatureType>(),
    signatureData: text("signature_data"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    pdfData: text("pdf_data"),
    pdfFilename: varchar("pdf_filename", { length: 160 }),
    pdfGeneratedAt: timestamp("pdf_generated_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contracts_client_idx").on(t.clientId), index("contracts_status_idx").on(t.status)],
);

export const galleryAccessOtps = pgTable(
  "gallery_access_otps",
  {
    id: serial("id").primaryKey(),
    galleryId: integer("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("gallery_access_otps_gallery_idx").on(t.galleryId, t.createdAt)],
);

export const galleryComments = pgTable(
  "gallery_comments",
  {
    id: serial("id").primaryKey(),
    galleryId: integer("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    photoId: integer("photo_id").references(() => photos.id, { onDelete: "cascade" }),
    clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    authorUserId: integer("author_user_id").references(() => users.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    status: varchar("status", { length: 20 }).$type<GalleryCommentStatus>().notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("gallery_comments_gallery_idx").on(t.galleryId, t.createdAt)],
);

export const galleryActivities = pgTable(
  "gallery_activities",
  {
    id: serial("id").primaryKey(),
    galleryId: integer("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
    type: varchar("type", { length: 40 }).$type<GalleryActivityType>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index("gallery_activities_gallery_idx").on(t.galleryId, t.createdAt)],
);

export const galleryDownloads = pgTable(
  "gallery_downloads",
  {
    id: serial("id").primaryKey(),
    galleryId: integer("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    photoId: integer("photo_id").references(() => photos.id, { onDelete: "set null" }),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    filename: varchar("filename", { length: 255 }),
    ip: varchar("ip", { length: 80 }),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("gallery_downloads_gallery_idx").on(t.galleryId, t.createdAt)],
);

export const galleryExtensionRequests = pgTable(
  "gallery_extension_requests",
  {
    id: serial("id").primaryKey(),
    galleryId: integer("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    requestedDays: integer("requested_days").notNull(),
    status: varchar("status", { length: 20 }).$type<GalleryExtensionStatus>().notNull().default("pending"),
    note: text("note"),
    adminNote: text("admin_note"),
    reviewedById: integer("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("gallery_extension_requests_status_idx").on(t.status), index("gallery_extension_requests_gallery_idx").on(t.galleryId)],
);

export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Package = typeof packages.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Gallery = typeof galleries.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type EmailLog = typeof emailLogs.$inferSelect;
export type StudioSettings = typeof studioSettings.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ChatRoom = typeof chatRooms.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type BookingEvent = typeof bookingEvents.$inferSelect;
