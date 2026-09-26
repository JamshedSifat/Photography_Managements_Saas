/**
 * Shared, isomorphic types + helpers (safe to import from client and server code).
 */

export const ROLES = ["admin", "photographer", "client"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Complete booking lifecycle. `confirmed` is a legacy value kept for backwards
 * compatibility with existing rows (it maps to `approved` in the UI).
 */
export const BOOKING_STATUSES = [
  "pending",
  "approved",
  "photographer_assigned",
  "shooting",
  "editing",
  "gallery_ready",
  "completed",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
/** Allowed forward transitions. `cancelled` is reachable from any non-terminal state. */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["approved", "cancelled"],
  approved: ["photographer_assigned", "cancelled"],
  photographer_assigned: ["shooting", "cancelled"],
  shooting: ["editing", "cancelled"],
  editing: ["gallery_ready", "cancelled"],
  gallery_ready: ["completed", "cancelled"],
  completed: [],
  cancelled: ["pending"],
};
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ["pending", "approved", "photographer_assigned", "shooting", "editing", "gallery_ready"];
export const PAYMENT_TYPES = ["advance", "balance", "full", "refund", "other"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export const PAYMENT_METHODS = ["card", "cash", "bank_transfer", "upi", "online", "bkash", "nagad", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
/**
 * Manual mobile-money flow: a client submits their own transaction details, which sit in
 * `pending_verification` until an admin verifies (→ `paid`) or rejects (→ `rejected`).
 */
export const PAYMENT_STATUSES = ["pending", "pending_verification", "paid", "rejected", "refunded", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const GALLERY_STATUSES = ["draft", "published"] as const;
export type GalleryStatus = (typeof GALLERY_STATUSES)[number];
export type PhotoProvider = "cloudinary" | "local" | "external";
export const EMAIL_TYPES = [
  "welcome",
  "booking_confirmation",
  "booking_reminder",
  "booking_rescheduled",
  "booking_cancelled",
  "gallery_ready",
  "payment_receipt",
  "contract_invite",
  "contract_otp",
  "contract_signed",
  "gallery_otp",
  "leave_status",
  "gallery_extension",
  "test",
] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];
export type EmailStatus = "sent" | "logged" | "failed";
export type ContractStatus = "draft" | "sent" | "otp_verified" | "signed" | "void";
export type SignatureType = "typed" | "drawn";
export type AvailabilityOverrideKind = "available" | "blocked" | "holiday" | "leave" | "break";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type GalleryCommentStatus = "open" | "resolved";
export type GalleryActivityType = "created" | "published" | "unpublished" | "uploaded" | "viewed" | "favorited" | "commented" | "downloaded" | "extension_requested" | "extension_approved" | "extension_rejected" | "settings_changed";
export type GalleryExtensionStatus = "pending" | "approved" | "rejected";
export type PaymentState = "unpaid" | "partial" | "paid";
export type Tone = "gold" | "emerald" | "amber" | "rose" | "sky" | "violet" | "zinc";

// ---------------------------------------------------------------- notifications & chat

export const NOTIFICATION_TYPES = [
  "booking_created",
  "booking_approved",
  "booking_rejected",
  "booking_status",
  "photographer_assigned",
  "payment_received",
  "payment_submitted",
  "payment_verified",
  "payment_rejected",
  "payment_due",
  "gallery_uploaded",
  "gallery_ready",
  "booking_cancelled",
  "chat_message",
  "review_received",
  "leave_status",
  "system",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type ChatMessageKind = "text" | "image" | "file";

// ---------------------------------------------------------------- DTOs

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  specialty: string | null;
  color: string | null;
  clientId: number | null;
  createdAt: string;
};

export type AuthResponse = { access: string; refresh: string; expiresIn: number; user: SessionUser };

export type PackageDTO = {
  id: number;
  name: string;
  category: string;
  description: string | null;
  priceCents: number;
  durationMinutes: number;
  depositPercent: number;
  features: string[];
  deliverables: string | null;
  coverUrl: string | null;
  popular: boolean;
  active: boolean;
  sortOrder: number;
  bookingsCount?: number;
};

export type ClientDTO = {
  id: number;
  userId: number | null;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  source: string | null;
  notes: string | null;
  tags: string[];
  createdAt: string;
  bookingsCount: number;
  totalSpentCents: number;
  dueCents: number;
  lastSessionDate: string | null;
  nextSessionDate: string | null;
  hasAccount: boolean;
};

export type PhotographerDTO = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  specialty: string | null;
  bio: string | null;
  color: string | null;
  avatarUrl: string | null;
  active: boolean;
  headline?: string | null;
  location?: string | null;
  experienceYears?: number;
  specialties?: string[];
  portfolio?: PortfolioItem[];
  ratingAverage?: number;
  ratingCount?: number;
  completedProjects?: number;
  stats?: { upcoming: number; today: number; thisMonth: number; completed: number };
};

export type PortfolioItem = { id: string; url: string; caption: string; category: string };

export type BookingDTO = {
  id: number;
  reference: string;
  invoiceNumber: string | null;
  title: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  status: BookingStatus;
  location: string | null;
  notes: string | null;
  internalNotes: string | null;
  totalCents: number;
  discountCents: number;
  netCents: number;
  paidCents: number;
  dueCents: number;
  depositCents: number;
  paymentStatus: PaymentState;
  client: { id: number; name: string; email: string; phone: string | null };
  package: { id: number; name: string; category: string; durationMinutes: number; depositPercent: number; priceCents: number } | null;
  photographer: { id: number; name: string; email: string; color: string | null } | null;
  gallery: { id: number; status: GalleryStatus } | null;
  reminderSentAt: string | null;
  confirmationSentAt: string | null;
  createdAt: string;
};

export type PaymentDTO = {
  id: number;
  bookingId: number;
  amountCents: number;
  type: PaymentType;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  notes: string | null;
  paidAt: string;
  createdAt: string;
  /** Manual mobile-money submission details. */
  transactionId: string | null;
  senderNumber: string | null;
  screenshotUrl: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  receiptUrl: string | null;
  booking: { id: number; reference: string; title: string; date: string; invoiceNumber: string | null } | null;
  client: { id: number; name: string; email: string } | null;
  recordedBy: string | null;
};

export type PhotoDTO = {
  id: number;
  filename: string;
  width: number | null;
  height: number | null;
  isFavorite: boolean;
  thumbUrl: string;
  previewUrl: string;
  downloadUrl: string | null;
  createdAt: string;
};

export type GalleryDTO = {
  id: number;
  title: string;
  description: string | null;
  status: GalleryStatus;
  allowDownload: boolean;
  watermark: boolean;
  expiresAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  photoCount: number;
  coverUrl: string | null;
  client: { id: number; name: string; email: string };
  booking: { id: number; reference: string; title: string; date: string } | null;
};

export type GalleryDetailDTO = GalleryDTO & {
  coverPhotoId: number | null;
  photos: PhotoDTO[];
  storage: "cloudinary" | "local";
  downloadExpiresAt: string | null;
  downloadDaysRemaining: number | null;
  downloadsEnabled: boolean;
  comments?: GalleryCommentDTO[];
  activities?: GalleryActivityDTO[];
};

export type ContractDTO = {
  id: number;
  contractNumber: string;
  bookingId: number;
  clientId: number;
  status: ContractStatus;
  signerName: string | null;
  signerEmail: string | null;
  signatureType: SignatureType | null;
  signedAt: string | null;
  pdfFilename: string | null;
  createdAt: string;
  booking: { id: number; reference: string; title: string; date: string; startMinutes: number; endMinutes: number; totalCents: number; discountCents: number; location: string | null };
  client: { id: number; name: string; email: string };
};

export type ContractPublicDTO = ContractDTO & {
  package: { name: string; category: string; durationMinutes: number; priceCents: number; features: string[]; description: string | null } | null;
  studio: { name: string; email: string; phone: string | null; address: string | null; tagline: string | null };
};

export type AvailabilitySlotDTO = {
  id: number;
  photographerId: number;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
  label: string | null;
  enabled: boolean;
};

export type AvailabilityOverrideDTO = {
  id: number;
  photographerId: number | null;
  date: string;
  kind: AvailabilityOverrideKind;
  startMinutes: number | null;
  endMinutes: number | null;
  reason: string | null;
};

export type LeaveRequestDTO = {
  id: number;
  photographerId: number;
  photographerName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type GalleryCommentDTO = {
  id: number;
  photoId: number | null;
  clientId: number;
  authorName: string;
  message: string;
  status: GalleryCommentStatus;
  createdAt: string;
};

export type GalleryActivityDTO = {
  id: number;
  type: GalleryActivityType;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type EmailLogDTO = {
  id: number;
  toEmail: string;
  toName: string | null;
  subject: string;
  type: EmailType;
  status: EmailStatus;
  provider: string | null;
  error: string | null;
  bookingId: number | null;
  galleryId: number | null;
  createdAt: string;
};

export type StudioSettingsDTO = {
  studioName: string;
  tagline: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  currency: string;
  timezone: string;
  openMinutes: number;
  closeMinutes: number;
  slotIntervalMinutes: number;
  bufferMinutes: number;
  workingDays: number[];
  minNoticeHours: number;
  maxAdvanceDays: number;
  invoicePrefix: string;
  invoiceNotes: string | null;
};

export type Paginated<T> = { results: T[]; count: number; page: number; pageSize: number; totalPages: number };

export type Slot = { start: number; end: number; available: boolean; freePhotographerIds: number[]; reason?: string };
export type DaySummary = { date: string; status: "available" | "full" | "closed" | "past"; available: number };
export type AvailabilityResponse = { date: string; closed: boolean; reason: string | null; slots: Slot[]; timezone: string };

export type AssignmentOption = { id: number; name: string; color: string | null; available: boolean };

export type BookingDetailResponse = {
  booking: BookingDTO;
  payments: PaymentDTO[];
  emails: { id: number; type: EmailType; subject: string; status: EmailStatus; toEmail: string; createdAt: string }[];
  assignment: AssignmentOption[] | null;
  events: BookingEventDTO[];
  review: ReviewDTO | null;
  chatRoomId: number | null;
  studio: { name: string; email: string; phone: string | null; address: string | null; currency: string; invoiceNotes: string | null; tagline: string | null };
};

export type BookingEventDTO = {
  id: number;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorName: string | null;
  note: string | null;
  createdAt: string;
};

export type NotificationDTO = {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  linkType: "booking" | "gallery" | "chat" | "review" | null;
  linkId: number | null;
  bookingId: number | null;
  galleryId: number | null;
  chatRoomId: number | null;
  actorName: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationListResponse = {
  results: NotificationDTO[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unread: number;
};

export type ChatParticipantDTO = { id: number; name: string; role: Role; color: string | null; avatarUrl: string | null };

export type ChatMessageDTO = {
  id: number;
  roomId: number;
  senderId: number;
  senderName: string;
  senderRole: Role;
  senderColor: string | null;
  kind: ChatMessageKind;
  body: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  attachmentBytes: number | null;
  createdAt: string;
  seenBy: number[];
};

export type ChatRoomDTO = {
  id: number;
  bookingId: number;
  bookingReference: string;
  bookingTitle: string;
  bookingDate: string;
  bookingStatus: BookingStatus;
  title: string;
  clientName: string;
  photographerName: string | null;
  lastMessageAt: string | null;
  lastMessage: string | null;
  unread: number;
  participants: ChatParticipantDTO[];
};

export type ChatRoomDetailDTO = ChatRoomDTO & {
  messages: ChatMessageDTO[];
  hasMore: boolean;
};

export type ReviewDTO = {
  id: number;
  bookingId: number;
  bookingReference: string;
  photographerId: number;
  photographerName: string;
  clientId: number;
  clientName: string;
  rating: number;
  title: string | null;
  comment: string;
  createdAt: string;
  bookingDate: string;
};

export type PhotographerProfileDTO = {
  id: number;
  name: string;
  headline: string | null;
  specialty: string | null;
  bio: string | null;
  location: string | null;
  experienceYears: number;
  specialties: string[];
  portfolio: PortfolioItem[];
  avatarUrl: string | null;
  color: string | null;
  email: string | null;
  phone: string | null;
  ratingAverage: number;
  ratingCount: number;
  completedProjects: number;
  ratingBreakdown: Record<number, number>;
  reviews: ReviewDTO[];
  availability: { weekday: number; startMinutes: number; endMinutes: number; label: string | null }[];
  nextAvailable: { date: string; slots: number } | null;
};

export type AdminDashboard = {
  role: "admin";
  today: string;
  currency: string;
  stats: {
    todayShoots: number;
    upcoming: number;
    revenueMonthCents: number;
    revenueLastMonthCents: number;
    pendingCents: number;
    pendingCount: number;
    clients: number;
    newClientsMonth: number;
    galleriesPublished: number;
    galleriesDraft: number;
  };
  todaySchedule: BookingDTO[];
  upcoming: BookingDTO[];
  recent: BookingDTO[];
  outstanding: BookingDTO[];
  revenueByMonth: { month: string; label: string; cents: number }[];
  statusBreakdown: { status: BookingStatus; count: number }[];
  team: { id: number; name: string; color: string | null; sessions: number; minutes: number }[];
  recentPayments: PaymentDTO[];
};

export type PhotographerDashboard = {
  role: "photographer";
  today: string;
  currency: string;
  stats: { todayShoots: number; weekShoots: number; monthCompleted: number; toDeliver: number };
  todaySchedule: BookingDTO[];
  upcoming: BookingDTO[];
  toDeliver: BookingDTO[];
};

export type ClientDashboard = {
  role: "client";
  today: string;
  currency: string;
  stats: { upcoming: number; dueCents: number; galleries: number; sessions: number };
  next: BookingDTO | null;
  upcoming: BookingDTO[];
  galleries: GalleryDTO[];
  payments: PaymentDTO[];
};

export type DashboardData = AdminDashboard | PhotographerDashboard | ClientDashboard;

// ---------------------------------------------------------------- helpers

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar date -> "YYYY-MM-DD" */
export function toDateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" -> local Date at midnight (never use `new Date(key)` which is UTC). */
export function parseDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isValidDateKey(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return toDateKey(parseDateKey(key)) === key;
}

export function addDaysToKey(key: string, days: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

export function dayOfWeek(key: string) {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthLabel(month: string, style: "short" | "long" = "short") {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: style,
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

/** Current wall-clock date + minutes in a given IANA timezone. */
export function zonedNow(timeZone: string, at: Date = new Date()) {
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { ...opts, timeZone }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", opts).formatToParts(at);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  return { dateKey: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + Number(get("minute")) };
}

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function minutesToTime(min: number) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function timeToMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return Number.NaN;
  return h * 60 + m;
}

export function minutesToLabel(min: number, compact = false) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (compact) return `${h12}${m ? `:${pad(m)}` : ""}${suffix.toLowerCase()}`;
  return `${h12}:${pad(m)} ${suffix}`;
}

export function timeRangeLabel(start: number, end: number) {
  return `${minutesToLabel(start)} – ${minutesToLabel(end)}`;
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} hr${h > 1 ? "s" : ""}`;
  return `${h}h ${m}m`;
}

export function formatDateKey(key: string, style: "short" | "medium" | "long" | "weekday" = "medium") {
  const d = parseDateKey(key);
  const map: Record<string, Intl.DateTimeFormatOptions> = {
    short: { month: "short", day: "numeric" },
    medium: { month: "short", day: "numeric", year: "numeric" },
    long: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
    weekday: { weekday: "short", month: "short", day: "numeric" },
  };
  return d.toLocaleDateString("en-US", map[style]);
}

export function formatDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "just now", "12 min ago", "3 hrs ago", "2 days ago" — for feeds and chat. */
export function formatRelative(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (days < 365) return formatDate(d);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function relativeDay(key: string, todayKey: string) {
  const diff = diffDays(key, todayKey);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < -1 && diff > -7) return `${-diff} days ago`;
  return formatDateKey(key, "medium");
}

export function formatMoney(cents: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

export function inputToCents(value: string) {
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && String(value).trim() !== "" ? Math.round(n * 100) : Number.NaN;
}

export function paymentStateFor(netCents: number, paidCents: number): PaymentState {
  if (netCents <= 0) return "paid";
  if (paidCents >= netCents) return "paid";
  return paidCents > 0 ? "partial" : "unpaid";
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function firstName(name: string) {
  return name.split(/\s+/)[0] ?? name;
}

export function hexToRgba(hex: string | null | undefined, alpha: number) {
  const raw = (hex ?? "#d1a95c").replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(209,169,92,${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const ROLE_LABELS: Record<Role, string> = { admin: "Administrator", photographer: "Photographer", client: "Client" };

export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; tone: Tone; color: string; short: string }> = {
  pending: { label: "Pending", tone: "amber", color: "#fbbf24", short: "Pending" },
  approved: { label: "Approved", tone: "gold", color: "#d1a95c", short: "Approved" },
  photographer_assigned: { label: "Photographer assigned", tone: "sky", color: "#7dd3fc", short: "Assigned" },
  shooting: { label: "Shooting", tone: "violet", color: "#c4b5fd", short: "Shooting" },
  editing: { label: "Editing", tone: "sky", color: "#38bdf8", short: "Editing" },
  gallery_ready: { label: "Gallery ready", tone: "emerald", color: "#34d399", short: "Gallery ready" },
  completed: { label: "Completed", tone: "emerald", color: "#34d399", short: "Completed" },
  cancelled: { label: "Cancelled", tone: "rose", color: "#fb7185", short: "Cancelled" },
};

export const BOOKING_STATUS_ORDER: BookingStatus[] = [
  "pending",
  "approved",
  "photographer_assigned",
  "shooting",
  "editing",
  "gallery_ready",
  "completed",
];

export const NOTIFICATION_TYPE_META: Record<NotificationType, { label: string; tone: Tone; icon: string }> = {
  booking_created: { label: "New booking", tone: "gold", icon: "calendar-plus" },
  booking_approved: { label: "Booking approved", tone: "emerald", icon: "circle-check" },
  booking_rejected: { label: "Booking declined", tone: "rose", icon: "circle-x" },
  booking_status: { label: "Status update", tone: "sky", icon: "activity" },
  photographer_assigned: { label: "Photographer assigned", tone: "violet", icon: "camera" },
  payment_received: { label: "Payment received", tone: "emerald", icon: "credit-card" },
  payment_submitted: { label: "Payment submitted", tone: "amber", icon: "clock" },
  payment_verified: { label: "Payment verified", tone: "emerald", icon: "circle-check" },
  payment_rejected: { label: "Payment rejected", tone: "rose", icon: "circle-x" },
  payment_due: { label: "Payment due", tone: "amber", icon: "clock" },
  gallery_uploaded: { label: "New photos", tone: "sky", icon: "images" },
  gallery_ready: { label: "Gallery ready", tone: "gold", icon: "sparkles" },
  booking_cancelled: { label: "Booking cancelled", tone: "rose", icon: "calendar-x" },
  chat_message: { label: "New message", tone: "gold", icon: "message" },
  review_received: { label: "New review", tone: "gold", icon: "star" },
  leave_status: { label: "Leave update", tone: "amber", icon: "umbrella" },
  system: { label: "System", tone: "zinc", icon: "bell" },
};

export const PAYMENT_STATE_META: Record<PaymentState, { label: string; tone: Tone }> = {
  unpaid: { label: "Unpaid", tone: "rose" },
  partial: { label: "Partially paid", tone: "amber" },
  paid: { label: "Paid in full", tone: "emerald" },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "zinc" },
  pending_verification: { label: "Pending verification", tone: "amber" },
  paid: { label: "Paid", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
  refunded: { label: "Refunded", tone: "violet" },
  failed: { label: "Failed", tone: "rose" },
};

/** Studio-operated mobile wallet that clients send manual payments to. */
export const STUDIO_MOBILE_PAYMENT = {
  number: "01966147075",
  wallets: ["bkash", "nagad"] as const,
  label: "bKash / Nagad (Personal)",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "Card",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  upi: "UPI",
  online: "Online",
  bkash: "bKash",
  nagad: "Nagad",
  other: "Other",
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  advance: "Advance",
  balance: "Balance",
  full: "Full payment",
  refund: "Refund",
  other: "Other",
};

export const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  welcome: "Welcome",
  booking_confirmation: "Booking confirmation",
  booking_reminder: "Session reminder",
  booking_rescheduled: "Rescheduled",
  booking_cancelled: "Cancellation",
  gallery_ready: "Gallery ready",
  payment_receipt: "Payment receipt",
  contract_invite: "Contract to sign",
  contract_otp: "Contract verification",
  contract_signed: "Contract signed",
  gallery_otp: "Gallery verification",
  leave_status: "Leave request update",
  gallery_extension: "Gallery extension",
  test: "Test email",
};

export const EMAIL_STATUS_META: Record<EmailStatus, { label: string; tone: Tone }> = {
  sent: { label: "Delivered", tone: "emerald" },
  logged: { label: "Logged (preview)", tone: "sky" },
  failed: { label: "Failed", tone: "rose" },
};

export const PACKAGE_CATEGORIES = ["Wedding", "Engagement", "Portrait", "Family", "Newborn", "Maternity", "Corporate", "Event", "Product"];
export const PHOTOGRAPHER_COLORS = ["#D1A95C", "#7DD3FC", "#F9A8D4", "#86EFAC", "#C4B5FD", "#FDBA74", "#FCA5A5", "#5EEAD4"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function pexels(id: number, width: number) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;
}

export const MEDIA = {
  hero: pexels(17923723, 2400),
  auth: pexels(16074867, 1600),
  photographer: pexels(31743037, 1400),
  cta: pexels(16968031, 2000),
  portfolio: [
    { id: 5595144, category: "Weddings", alt: "Bride and groom celebrating under twinkling lights" },
    { id: 34921744, category: "Portraits", alt: "Moody studio portrait in a black dress" },
    { id: 29285937, category: "Engagements", alt: "Couple holding hands in warm sunlight" },
    { id: 38079943, category: "Family", alt: "Joyful family studio portrait with a baby" },
    { id: 36720012, category: "Portraits", alt: "Black and white editorial portrait" },
    { id: 19816937, category: "Weddings", alt: "Newlyweds in a serene countryside" },
    { id: 36986688, category: "Engagements", alt: "Golden hour kiss outdoors" },
    { id: 35875037, category: "Family", alt: "Family embracing at sunset" },
    { id: 28863299, category: "Portraits", alt: "Portrait with dramatic lighting" },
  ],
};
