import { NextResponse } from "next/server";
import { PassThrough } from "stream";
import * as archiver from "archiver";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bookings, clients, galleryAccessOtps, galleryActivities, galleryComments, galleryDownloads, galleryExtensionRequests, galleries, photos, users, type Gallery, type Photo } from "@/db/schema";
import { signMediaToken, verifyMediaToken } from "@/lib/auth";
import { notifyGalleryReady } from "@/lib/email";
import { notify, notifyBooking as notifyBookingAudience } from "@/lib/notifications";
import { ApiError, created, forbidden, getOrigin, intParam, notFound, optionalInt, parseBody, type Ctx, type PublicCtx } from "@/lib/http";
import { cloudinaryDownloadUrl, cloudinaryEnabled, cloudinaryImageUrl, deleteStoredPhoto, readLocalPhoto, storePhoto } from "@/lib/storage";
import type { GalleryDTO, GalleryDetailDTO, Role, SessionUser } from "@/lib/shared";
import { galleryCommentSchema, galleryCommentUpdateSchema, galleryCreateSchema, extensionRequestSchema, galleryOtpRequestSchema, galleryOtpVerifySchema, galleryUpdateSchema, photoUpdateSchema, extensionReviewSchema } from "@/lib/validators";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { randomInt } from "crypto";
import { sendEmail } from "@/lib/email";

const MAX_FILES = 20;
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Only the studio admin and the photographer assigned to the session may upload.
 * Every other role (including other photographers) is rejected before any file is read.
 */
async function assertUploadAccess(user: SessionUser, galleryId: number) {
  if (user.role === "admin") return;
  if (user.role !== "photographer") throw forbidden("Only the studio team can upload photos to a gallery.");
  const [row] = await db
    .select({ createdById: galleries.createdById, photographerId: bookings.photographerId })
    .from(galleries)
    .leftJoin(bookings, eq(galleries.bookingId, bookings.id))
    .where(eq(galleries.id, galleryId))
    .limit(1);
  if (!row) throw notFound("Gallery");
  if (row.photographerId !== user.id && row.createdById !== user.id) {
    throw forbidden("Only the photographer assigned to this session can upload photos.");
  }
}

const galleryColumns = {
  gallery: galleries,
  client: { id: clients.id, name: clients.name, email: clients.email },
  booking: { id: bookings.id, reference: bookings.reference, title: bookings.title, date: bookings.date },
  photoCount: sql<number>`(select count(*)::int from photos p where p.gallery_id = "galleries"."id")`,
  firstPhotoId: sql<number | null>`(select p.id from photos p where p.gallery_id = "galleries"."id" order by p.sort_order, p.id limit 1)`,
};

type GalleryRow = {
  gallery: Gallery;
  client: { id: number; name: string; email: string };
  booking: { id: number; reference: string; title: string; date: string } | null;
  photoCount: number;
  firstPhotoId: number | null;
};

const endOfDay = (key: string) => new Date(`${key}T23:59:59Z`);

function downloadsEnabled(g: Gallery) {
  return g.allowDownload && (!g.downloadExpiresAt || g.downloadExpiresAt.getTime() > Date.now());
}

function canDownload(user: { role: Role }, g: Gallery) {
  return user.role !== "client" || downloadsEnabled(g);
}

async function logActivity(galleryId: number, type: "created" | "published" | "unpublished" | "uploaded" | "viewed" | "favorited" | "commented" | "downloaded" | "extension_requested" | "extension_approved" | "extension_rejected" | "settings_changed", actorUserId: number | null, clientId: number | null, metadata: Record<string, unknown> = {}) {
  await db.insert(galleryActivities).values({ galleryId, type, actorUserId, clientId, metadata });
}

function mediaToken(user: SessionUser, g: Gallery) {
  return signMediaToken({ galleryId: g.id, userId: user.id, role: user.role, clientId: user.clientId, download: canDownload(user, g) });
}

function photoUrls(id: number, token: string, download: boolean) {
  const t = encodeURIComponent(token);
  return {
    thumbUrl: `/api/photos/${id}/view?variant=thumb&t=${t}`,
    previewUrl: `/api/photos/${id}/view?variant=preview&t=${t}`,
    downloadUrl: download ? `/api/photos/${id}/download?t=${t}` : null,
  };
}

async function toGalleryDTO(r: GalleryRow, user: SessionUser): Promise<GalleryDTO> {
  const g = r.gallery;
  const token = await mediaToken(user, g);
  const coverId = g.coverPhotoId ?? (r.firstPhotoId == null ? null : Number(r.firstPhotoId));
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    status: g.status,
    allowDownload: g.allowDownload,
    watermark: g.watermark,
    expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
    publishedAt: g.publishedAt ? g.publishedAt.toISOString() : null,
    createdAt: g.createdAt.toISOString(),
    photoCount: Number(r.photoCount) || 0,
    coverUrl: coverId ? photoUrls(coverId, token, false).thumbUrl : null,
    client: r.client,
    booking: r.booking,
  };
}

function baseQuery() {
  return db
    .select(galleryColumns)
    .from(galleries)
    .innerJoin(clients, eq(galleries.clientId, clients.id))
    .leftJoin(bookings, eq(galleries.bookingId, bookings.id));
}

export async function galleryDTOs(where: SQL | undefined, user: SessionUser, limit = 100) {
  const rows = await baseQuery().where(where).orderBy(desc(galleries.createdAt), desc(galleries.id)).limit(limit);
  return Promise.all(rows.map((r) => toGalleryDTO(r, user)));
}

function scopeFor(user: SessionUser): SQL | undefined {
  if (user.role === "client") {
    return and(user.clientId ? eq(galleries.clientId, user.clientId) : sql`false`, eq(galleries.status, "published"));
  }
  if (user.role === "photographer") return or(eq(galleries.createdById, user.id), eq(bookings.photographerId, user.id));
  return undefined;
}

async function loadGallery(id: number, user: SessionUser) {
  const [row] = await baseQuery().where(eq(galleries.id, id)).limit(1);
  if (!row) throw notFound("Gallery");
  if (user.role === "client") {
    if (row.gallery.clientId !== user.clientId || row.gallery.status !== "published") throw notFound("Gallery");
    if (row.gallery.expiresAt && row.gallery.expiresAt.getTime() < Date.now()) {
      throw forbidden("This gallery has expired. Please contact the studio to restore access.");
    }
  }
  return row;
}

export async function listGalleries(ctx: Ctx) {
  const conds: SQL[] = [];
  const scope = scopeFor(ctx.user);
  if (scope) conds.push(scope);
  const status = ctx.query.get("status");
  if (status === "draft" || status === "published") conds.push(eq(galleries.status, status));
  const clientId = optionalInt(ctx.query.get("clientId"));
  if (clientId) conds.push(eq(galleries.clientId, clientId));
  const bookingId = optionalInt(ctx.query.get("bookingId"));
  if (bookingId) conds.push(eq(galleries.bookingId, bookingId));
  const q = ctx.query.get("q")?.trim();
  if (q) {
    const cond = or(ilike(galleries.title, `%${q}%`), ilike(clients.name, `%${q}%`));
    if (cond) conds.push(cond);
  }
  return { results: await galleryDTOs(conds.length ? and(...conds) : undefined, ctx.user) };
}

export async function getGallery(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const row = await loadGallery(id, ctx.user);
  const token = await mediaToken(ctx.user, row.gallery);
  const download = canDownload(ctx.user, row.gallery);
  const list = await db.select().from(photos).where(eq(photos.galleryId, id)).orderBy(asc(photos.sortOrder), asc(photos.id));
  const [comments, activities] = await Promise.all([
    db.select({ comment: galleryComments, authorName: sql<string>`coalesce(${users.name}, ${clients.name}, 'Client')` }).from(galleryComments).leftJoin(users, eq(galleryComments.authorUserId, users.id)).innerJoin(clients, eq(galleryComments.clientId, clients.id)).where(eq(galleryComments.galleryId, id)).orderBy(asc(galleryComments.createdAt)),
    db.select({ activity: galleryActivities, actorName: users.name }).from(galleryActivities).leftJoin(users, eq(galleryActivities.actorUserId, users.id)).where(eq(galleryActivities.galleryId, id)).orderBy(desc(galleryActivities.createdAt)).limit(60),
  ]);
  if (ctx.user.role === "client") await logActivity(id, "viewed", null, ctx.user.clientId, {});
  const base = await toGalleryDTO(row, ctx.user);
  const downloadRemaining = row.gallery.downloadExpiresAt ? Math.max(0, Math.ceil((row.gallery.downloadExpiresAt.getTime() - Date.now()) / 86_400_000)) : null;
  const gallery: GalleryDetailDTO = {
    ...base,
    coverPhotoId: row.gallery.coverPhotoId,
    storage: cloudinaryEnabled() ? "cloudinary" : "local",
    downloadExpiresAt: row.gallery.downloadExpiresAt?.toISOString() ?? null,
    downloadDaysRemaining: downloadRemaining,
    downloadsEnabled: downloadsEnabled(row.gallery),
    comments: comments.map((c) => ({ id: c.comment.id, photoId: c.comment.photoId, clientId: c.comment.clientId, authorName: c.authorName, message: c.comment.message, status: c.comment.status, createdAt: c.comment.createdAt.toISOString() })),
    activities: activities.map((a) => ({ id: a.activity.id, type: a.activity.type, actorName: a.actorName, metadata: a.activity.metadata ?? {}, createdAt: a.activity.createdAt.toISOString() })),
    photos: list.map((p) => ({
      id: p.id,
      filename: p.filename,
      width: p.width,
      height: p.height,
      isFavorite: p.isFavorite,
      createdAt: p.createdAt.toISOString(),
      ...photoUrls(p.id, token, download),
    })),
  };
  return { gallery };
}

export async function createGallery(ctx: Ctx) {
  const data = await parseBody(ctx.req, galleryCreateSchema);
  let clientId = data.clientId ?? null;
  const bookingId = data.bookingId ?? null;
  if (bookingId) {
    const [b] = await db
      .select({ clientId: bookings.clientId, photographerId: bookings.photographerId })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!b) throw new ApiError(400, "Booking not found.", { bookingId: "Select a valid booking" });
    if (ctx.user.role === "photographer" && b.photographerId !== ctx.user.id) {
      throw forbidden("You can only create galleries for your own sessions.");
    }
    clientId = b.clientId;
  } else if (ctx.user.role === "photographer") {
    throw forbidden("Photographers must link galleries to one of their sessions.");
  }
  if (!clientId) throw new ApiError(400, "Select a booking or client for this gallery.", { bookingId: "Required" });
  const [row] = await db
    .insert(galleries)
    .values({
      bookingId,
      clientId,
      title: data.title,
      description: data.description ?? null,
      allowDownload: data.allowDownload ?? true,
      watermark: data.watermark ?? false,
      expiresAt: data.expiresAt ? endOfDay(data.expiresAt) : null,
      createdById: ctx.user.id,
    })
    .returning({ id: galleries.id });
  await logActivity(row.id, "created", ctx.user.id, null, { title: data.title });
  return created({ gallery: { id: row.id } });
}

export async function updateGallery(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const data = await parseBody(ctx.req, galleryUpdateSchema);
  const [existing] = await db.select().from(galleries).where(eq(galleries.id, id)).limit(1);
  if (!existing) throw notFound("Gallery");
  if (data.coverPhotoId) {
    const [p] = await db
      .select({ id: photos.id })
      .from(photos)
      .where(and(eq(photos.id, data.coverPhotoId), eq(photos.galleryId, id)))
      .limit(1);
    if (!p) throw new ApiError(400, "The cover photo must belong to this gallery.");
  }
  const publishing = data.status === "published" && existing.status !== "published";
  if (publishing) {
    const [{ value }] = await db.select({ value: count() }).from(photos).where(eq(photos.galleryId, id));
    if (value === 0) throw new ApiError(400, "Upload at least one photo before publishing this gallery.");
  }
  await db
    .update(galleries)
    .set({
      title: data.title,
      description: data.description,
      allowDownload: data.allowDownload,
      watermark: data.watermark,
      status: data.status,
      expiresAt: data.expiresAt === undefined ? undefined : data.expiresAt ? endOfDay(data.expiresAt) : null,
      downloadExpiresAt: publishing ? new Date(Date.now() + 30 * 86_400_000) : undefined,
      coverPhotoId: data.coverPhotoId === undefined ? undefined : data.coverPhotoId,
      publishedAt: publishing ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(galleries.id, id));
  let notified = false;
  if (publishing && data.notify !== false) {
    await notifyGalleryReady(id, getOrigin(ctx.req));
    notified = true;
    if (existing.bookingId) {
      await notifyBookingAudience(existing.bookingId, ctx.user.id, {
        type: "gallery_ready",
        title: "Your gallery is ready",
        message: `“${existing.title}” has been published — your photos are waiting.`,
        linkType: "gallery",
        linkId: id,
        galleryId: id,
        bookingId: existing.bookingId,
        actorUserId: ctx.user.id,
      });
    }
  }
  return { ok: true, notified };
}

export async function deleteGallery(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const assets = await db.select({ provider: photos.provider, publicId: photos.publicId }).from(photos).where(eq(photos.galleryId, id));
  const [row] = await db.delete(galleries).where(eq(galleries.id, id)).returning({ id: galleries.id });
  if (!row) throw notFound("Gallery");
  await Promise.all(assets.map((a) => deleteStoredPhoto(a)));
  return { deleted: true };
}

export async function uploadPhotos(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [gallery] = await db.select().from(galleries).where(eq(galleries.id, id)).limit(1);
  if (!gallery) throw notFound("Gallery");
  await assertUploadAccess(ctx.user, id);
  let form: FormData;
  try {
    form = await ctx.req.formData();
  } catch {
    throw new ApiError(400, "Upload must be sent as multipart/form-data.");
  }
  const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
  if (!files.length) throw new ApiError(400, "Select at least one image to upload.");
  if (files.length > MAX_FILES) throw new ApiError(400, `Upload up to ${MAX_FILES} images at a time.`);
  for (const file of files) {
    if (!file.type.startsWith("image/")) throw new ApiError(400, `"${file.name}" is not an image.`);
    if (file.size > MAX_BYTES) throw new ApiError(400, `"${file.name}" exceeds the 25 MB limit.`);
  }
  const [{ value: existingCount }] = await db.select({ value: count() }).from(photos).where(eq(photos.galleryId, id));
  const inserted: Photo[] = [];
  for (const [i, file] of files.entries()) {
    const stored = await storePhoto(file, id);
    const [row] = await db
      .insert(photos)
      .values({
        galleryId: id,
        provider: stored.provider,
        publicId: stored.publicId,
        url: stored.url,
        filename: file.name.slice(0, 250) || `photo-${Date.now()}.jpg`,
        format: stored.format,
        mimeType: stored.mimeType,
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
        sortOrder: existingCount + i,
      })
      .returning();
    inserted.push(row);
  }
  if (!gallery.coverPhotoId && inserted[0]) {
    await db.update(galleries).set({ coverPhotoId: inserted[0].id, updatedAt: new Date() }).where(eq(galleries.id, id));
  }
  await logActivity(id, "uploaded", ctx.user.id, null, { count: inserted.length });

  // Tell the client (published galleries) and the rest of the studio team.
  if (gallery.bookingId) {
    await notifyBookingAudience(gallery.bookingId, ctx.user.id, {
      type: "gallery_uploaded",
      title: "New photos uploaded",
      message: `${inserted.length} new photo${inserted.length === 1 ? "" : "s"} were added to “${gallery.title}”.`,
      linkType: "gallery",
      linkId: id,
      galleryId: id,
      bookingId: gallery.bookingId,
      actorUserId: ctx.user.id,
    });
  } else {
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true)));
    await notify(admins.map((a) => a.id), {
      type: "gallery_uploaded",
      title: "New photos uploaded",
      message: `${inserted.length} photo${inserted.length === 1 ? "" : "s"} added to “${gallery.title}”.`,
      linkType: "gallery",
      linkId: id,
      galleryId: id,
      actorUserId: ctx.user.id,
    });
  }
  return created({ uploaded: inserted.length, storage: cloudinaryEnabled() ? "cloudinary" : "local" });
}

export async function notifyGallery(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [g] = await db.select({ status: galleries.status }).from(galleries).where(eq(galleries.id, id)).limit(1);
  if (!g) throw notFound("Gallery");
  if (g.status !== "published") throw new ApiError(400, "Publish the gallery before notifying the client.");
  await notifyGalleryReady(id, getOrigin(ctx.req));
  return { sent: true };
}

export async function updatePhoto(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const data = await parseBody(ctx.req, photoUpdateSchema);
  const [row] = await db
    .select({ photo: photos, gallery: galleries })
    .from(photos)
    .innerJoin(galleries, eq(photos.galleryId, galleries.id))
    .where(eq(photos.id, id))
    .limit(1);
  if (!row) throw notFound("Photo");
  if (ctx.user.role === "client") {
    if (row.gallery.clientId !== ctx.user.clientId || row.gallery.status !== "published") throw notFound("Photo");
    if (data.sortOrder !== undefined) throw forbidden();
  }
  const [updated] = await db
    .update(photos)
    .set({ isFavorite: data.isFavorite, sortOrder: data.sortOrder })
    .where(eq(photos.id, id))
    .returning();
  return { photo: { id: updated.id, isFavorite: updated.isFavorite, sortOrder: updated.sortOrder } };
}

export async function deletePhoto(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [p] = await db.delete(photos).where(eq(photos.id, id)).returning();
  if (!p) throw notFound("Photo");
  await db
    .update(galleries)
    .set({ coverPhotoId: null })
    .where(and(eq(galleries.id, p.galleryId), eq(galleries.coverPhotoId, id)));
  await deleteStoredPhoto(p);
  return { deleted: true };
}

// ------------------------------------------------------------------ secure media delivery

async function authorizeMedia(ctx: PublicCtx, action: "view" | "download") {
  const id = intParam(ctx.params.id, "photo id");
  const [row] = await db
    .select({ photo: photos, gallery: galleries })
    .from(photos)
    .innerJoin(galleries, eq(photos.galleryId, galleries.id))
    .where(eq(photos.id, id))
    .limit(1);
  if (!row) throw notFound("Photo");

  let viewer: { role: Role; clientId: number | null } | null = null;
  let downloadAllowed = false;
  const token = ctx.query.get("t");
  if (token) {
    const claims = await verifyMediaToken(token);
    if (!claims || claims.galleryId !== row.gallery.id) {
      throw new ApiError(403, "This secure link has expired. Refresh the gallery to continue.");
    }
    viewer = { role: claims.role, clientId: claims.clientId };
    downloadAllowed = claims.download;
  } else if (ctx.user) {
    viewer = { role: ctx.user.role, clientId: ctx.user.clientId };
    downloadAllowed = canDownload(ctx.user, row.gallery);
  }
  if (!viewer) throw new ApiError(401, "Authentication required.");

  if (viewer.role === "client") {
    if (row.gallery.clientId !== viewer.clientId || row.gallery.status !== "published") throw notFound("Photo");
    if (row.gallery.expiresAt && row.gallery.expiresAt.getTime() < Date.now()) throw forbidden("This gallery has expired.");
    if (action === "download" && !row.gallery.allowDownload) throw forbidden("Downloads are disabled for this gallery.");
  }
  if (action === "download" && !downloadAllowed) throw forbidden("Downloads are disabled for this gallery.");
  return { ...row, viewer };
}

function safeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "photo.jpg";
}

export async function viewPhoto(ctx: PublicCtx) {
  const { photo, gallery, viewer } = await authorizeMedia(ctx, "view");
  const variant = ctx.query.get("variant") === "preview" ? "preview" : "thumb";
  const cache = { "Cache-Control": "private, max-age=3600" };

  if (photo.provider === "external") {
    const url = variant === "thumb" ? (photo.thumbUrl ?? photo.url) : photo.url;
    if (!url) throw notFound("Image");
    return NextResponse.redirect(url, { status: 302, headers: cache });
  }
  if (photo.provider === "cloudinary") {
    if (!photo.publicId) throw notFound("Image");
    const watermark = gallery.watermark && viewer.role === "client" ? "PROOF" : null;
    return NextResponse.redirect(cloudinaryImageUrl(photo.publicId, photo.format, variant, watermark), { status: 302, headers: cache });
  }
  if (!photo.publicId) throw notFound("Image");
  const file = await readLocalPhoto(photo.publicId);
  return new NextResponse(new Uint8Array(file), {
    headers: { ...cache, "Content-Type": photo.mimeType ?? "image/jpeg", "X-Content-Type-Options": "nosniff" },
  });
}

export async function downloadPhoto(ctx: PublicCtx) {
  const { photo } = await authorizeMedia(ctx, "download");
  const filename = safeFilename(photo.filename);
  const disposition = `attachment; filename="${filename}"`;

  if (photo.provider === "cloudinary" && photo.publicId) {
    return NextResponse.redirect(cloudinaryDownloadUrl(photo.publicId, photo.format), { status: 302 });
  }
  if (photo.provider === "external" && photo.url) {
    const upstream = await fetch(photo.url);
    if (!upstream.ok || !upstream.body) throw new ApiError(502, "Unable to fetch the original image.");
    return new NextResponse(upstream.body, {
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg", "Content-Disposition": disposition, "Cache-Control": "private, no-store" },
    });
  }
  if (!photo.publicId) throw notFound("Image");
  const file = await readLocalPhoto(photo.publicId);
  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": photo.mimeType ?? "application/octet-stream", "Content-Disposition": disposition, "Cache-Control": "private, no-store" },
  });
}

// ------------------------------------------------------------------ client proofing, OTP access, ZIP delivery and extensions

export async function requestGalleryOtp(ctx: PublicCtx) {
  const id = intParam(ctx.params.id, "gallery id");
  const data = await parseBody(ctx.req, galleryOtpRequestSchema);
  const [row] = await db.select({ gallery: galleries, client: clients }).from(galleries).innerJoin(clients, eq(galleries.clientId, clients.id)).where(and(eq(galleries.id, id), eq(galleries.status, "published"))).limit(1);
  if (!row) throw notFound("Gallery");
  if (data.email && data.email.toLowerCase() !== row.client.email.toLowerCase()) throw new ApiError(404, "No published gallery was found for that email.");
  const otp = String(randomInt(100000, 1000000));
  await db.insert(galleryAccessOtps).values({ galleryId: id, clientId: row.client.id, email: row.client.email, codeHash: await hashPassword(otp), expiresAt: new Date(Date.now() + 10 * 60_000), attempts: 0 });
  await sendEmail({ to: row.client.email, toName: row.client.name, subject: `Gallery access code · ${row.gallery.title}`, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2 style="font-family:Georgia,serif;font-weight:400">Secure gallery access</h2><p>Enter this code to open <strong>${row.gallery.title}</strong>:</p><div style="font-size:38px;letter-spacing:10px;font-weight:bold;color:#a77a36;margin:26px 0">${otp}</div><p style="font-size:12px;color:#777">This code expires in 10 minutes.</p></div>`, type: "gallery_otp", galleryId: id });
  return { sent: true, email: row.client.email.replace(/(^.).*(@.*$)/, "$1••••$2"), expiresIn: 600 };
}

export async function verifyGalleryOtp(ctx: PublicCtx) {
  const id = intParam(ctx.params.id, "gallery id");
  const { code } = await parseBody(ctx.req, galleryOtpVerifySchema);
  const [row] = await db.select({ otp: galleryAccessOtps, gallery: galleries, client: clients }).from(galleryAccessOtps).innerJoin(galleries, eq(galleryAccessOtps.galleryId, galleries.id)).innerJoin(clients, eq(galleryAccessOtps.clientId, clients.id)).where(and(eq(galleryAccessOtps.galleryId, id), eq(galleries.status, "published"))).orderBy(desc(galleryAccessOtps.createdAt)).limit(1);
  if (!row || row.otp.expiresAt.getTime() < Date.now()) throw new ApiError(400, "That code has expired. Request a new one.");
  if (row.otp.attempts >= 5) throw new ApiError(429, "Too many attempts. Request a new code.");
  if (!(await verifyPassword(code, row.otp.codeHash))) {
    await db.update(galleryAccessOtps).set({ attempts: row.otp.attempts + 1 }).where(eq(galleryAccessOtps.id, row.otp.id));
    throw new ApiError(400, "That code is incorrect.");
  }
  await db.update(galleryAccessOtps).set({ verifiedAt: new Date() }).where(eq(galleryAccessOtps.id, row.otp.id));
  const token = await signMediaToken({ galleryId: id, userId: row.client.userId ?? row.client.id, role: "client", clientId: row.client.id, download: downloadsEnabled(row.gallery) });
  return { verified: true, token, galleryId: id };
}

export async function createComment(ctx: Ctx) {
  const id = intParam(ctx.params.id, "gallery id");
  const data = await parseBody(ctx.req, galleryCommentSchema);
  const [g] = await db.select().from(galleries).where(and(eq(galleries.id, id), eq(galleries.status, "published"))).limit(1);
  if (!g) throw notFound("Gallery");
  const clientId = ctx.user.clientId ?? g.clientId;
  if (ctx.user.role === "client" && clientId !== g.clientId) throw notFound("Gallery");
  if (data.photoId) {
    const [p] = await db.select({ id: photos.id }).from(photos).where(and(eq(photos.id, data.photoId), eq(photos.galleryId, id))).limit(1);
    if (!p) throw new ApiError(400, "Photo does not belong to this gallery.");
  }
  const [row] = await db.insert(galleryComments).values({ galleryId: id, photoId: data.photoId ?? null, clientId: g.clientId, authorUserId: ctx.user.role === "client" ? ctx.user.id : ctx.user.id, message: data.message }).returning();
  await logActivity(id, "commented", ctx.user.id, ctx.user.role === "client" ? ctx.user.clientId : null, { photoId: data.photoId ?? null });
  return created({ comment: { id: row.id, photoId: row.photoId, clientId: row.clientId, authorName: ctx.user.name, message: row.message, status: row.status, createdAt: row.createdAt.toISOString() } });
}

export async function updateComment(ctx: Ctx) {
  const id = intParam(ctx.params.commentId, "comment id");
  const data = await parseBody(ctx.req, galleryCommentUpdateSchema);
  if (ctx.user.role === "client") throw forbidden("Only studio staff can resolve edit requests.");
  const [row] = await db.update(galleryComments).set({ status: data.status, updatedAt: new Date() }).where(eq(galleryComments.id, id)).returning();
  if (!row) throw notFound("Comment");
  return { comment: { id: row.id, status: row.status } };
}

export async function requestExtension(ctx: Ctx) {
  const id = intParam(ctx.params.id, "gallery id");
  if (ctx.user.role !== "client" || !ctx.user.clientId) throw forbidden("Only the gallery client can request an extension.");
  const data = await parseBody(ctx.req, extensionRequestSchema);
  const [g] = await db.select().from(galleries).where(and(eq(galleries.id, id), eq(galleries.clientId, ctx.user.clientId))).limit(1);
  if (!g) throw notFound("Gallery");
  const [pending] = await db.select({ id: galleryExtensionRequests.id }).from(galleryExtensionRequests).where(and(eq(galleryExtensionRequests.galleryId, id), eq(galleryExtensionRequests.status, "pending"))).limit(1);
  if (pending) throw new ApiError(409, "You already have an extension request waiting for review.");
  const [row] = await db.insert(galleryExtensionRequests).values({ galleryId: id, clientId: ctx.user.clientId, requestedDays: data.requestedDays, note: data.note ?? null }).returning();
  await logActivity(id, "extension_requested", ctx.user.id, ctx.user.clientId, { requestedDays: data.requestedDays });
  return created({ request: { id: row.id, status: row.status, requestedDays: row.requestedDays } });
}

export async function listExtensions(ctx: Ctx) {
  const rows = await db.select({ request: galleryExtensionRequests, galleryTitle: galleries.title, clientName: clients.name }).from(galleryExtensionRequests).innerJoin(galleries, eq(galleryExtensionRequests.galleryId, galleries.id)).innerJoin(clients, eq(galleryExtensionRequests.clientId, clients.id)).where(ctx.user.role === "client" ? eq(galleryExtensionRequests.clientId, ctx.user.clientId ?? -1) : undefined).orderBy(desc(galleryExtensionRequests.createdAt)).limit(200);
  return { results: rows.map((r) => ({ ...r.request, createdAt: r.request.createdAt.toISOString(), reviewedAt: r.request.reviewedAt?.toISOString() ?? null, galleryTitle: r.galleryTitle, clientName: r.clientName })) };
}

export async function reviewExtension(ctx: Ctx) {
  if (ctx.user.role !== "admin") throw forbidden();
  const id = intParam(ctx.params.requestId, "request id");
  const data = await parseBody(ctx.req, extensionReviewSchema);
  const [row] = await db.select({ request: galleryExtensionRequests, gallery: galleries, client: clients }).from(galleryExtensionRequests).innerJoin(galleries, eq(galleryExtensionRequests.galleryId, galleries.id)).innerJoin(clients, eq(galleryExtensionRequests.clientId, clients.id)).where(eq(galleryExtensionRequests.id, id)).limit(1);
  if (!row) throw notFound("Extension request");
  if (row.request.status !== "pending") throw new ApiError(400, "This extension request has already been reviewed.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(galleryExtensionRequests).set({ status: data.status, adminNote: data.adminNote ?? null, reviewedById: ctx.user.id, reviewedAt: now }).where(eq(galleryExtensionRequests.id, id));
    if (data.status === "approved") {
      const base = row.gallery.downloadExpiresAt && row.gallery.downloadExpiresAt.getTime() > Date.now() ? row.gallery.downloadExpiresAt : new Date();
      const expiry = new Date(base.getTime() + row.request.requestedDays * 86_400_000);
      await tx.update(galleries).set({ allowDownload: true, downloadExpiresAt: expiry, updatedAt: now }).where(eq(galleries.id, row.gallery.id));
    }
  });
  await logActivity(row.gallery.id, data.status === "approved" ? "extension_approved" : "extension_rejected", ctx.user.id, row.client.id, { days: row.request.requestedDays });
  await sendEmail({ to: row.client.email, toName: row.client.name, subject: `Gallery extension ${data.status} · ${row.gallery.title}`, html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2 style="font-family:Georgia,serif;font-weight:400">Gallery extension ${data.status}</h2><p>Your request for ${row.request.requestedDays} extra days for <strong>${row.gallery.title}</strong> was ${data.status}.</p>${data.adminNote ? `<p>${data.adminNote}</p>` : ""}</div>`, type: "gallery_extension", galleryId: row.gallery.id });
  return { reviewed: true, status: data.status };
}

async function galleryDownloadAuthorization(ctx: PublicCtx, id: number) {
  const [row] = await db.select({ gallery: galleries, client: clients }).from(galleries).innerJoin(clients, eq(galleries.clientId, clients.id)).where(eq(galleries.id, id)).limit(1);
  if (!row) throw notFound("Gallery");
  let clientId: number | null = ctx.user?.clientId ?? null;
  const token = ctx.query.get("t");
  if (token) {
    const claims = await verifyMediaToken(token);
    if (!claims || claims.galleryId !== id) throw forbidden("This secure gallery link has expired.");
    clientId = claims.clientId;
  } else if (!ctx.user) throw new ApiError(401, "Authentication required.");
  if (ctx.user?.role === "client" && ctx.user.clientId !== row.gallery.clientId) throw notFound("Gallery");
  if (clientId !== row.client.id && ctx.user?.role !== "admin" && ctx.user?.role !== "photographer") throw notFound("Gallery");
  if (ctx.user?.role === "client" && !downloadsEnabled(row.gallery)) throw forbidden("Downloads for this gallery have expired. Request an extension to continue.");
  return row;
}

async function asBuffer(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new ApiError(502, "Unable to fetch an image for the ZIP.");
  return Buffer.from(await r.arrayBuffer());
}

export async function downloadZip(ctx: PublicCtx) {
  const id = intParam(ctx.params.id, "gallery id");
  const row = await galleryDownloadAuthorization(ctx, id);
  const list = await db.select().from(photos).where(eq(photos.galleryId, id)).orderBy(asc(photos.sortOrder), asc(photos.id));
  if (!list.length) throw new ApiError(404, "This gallery has no photos yet.");
  const archive = new archiver.ZipArchive({ zlib: { level: 6 } });
  const pass = new PassThrough();
  const chunks: Buffer[] = [];
  pass.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<void>((resolve, reject) => { pass.on("end", resolve); pass.on("error", reject); archive.on("error", reject); });
  archive.pipe(pass);
  for (const photo of list) {
    let data: Buffer;
    if (photo.provider === "external" && photo.url) data = await asBuffer(photo.url);
    else if (photo.provider === "cloudinary" && photo.publicId) data = await asBuffer(cloudinaryDownloadUrl(photo.publicId, photo.format));
    else if (photo.publicId) data = await readLocalPhoto(photo.publicId);
    else continue;
    archive.append(data, { name: photo.filename.replace(/[^a-zA-Z0-9._-]/g, "_") });
  }
  await archive.finalize();
  await finished;
  await db.insert(galleryDownloads).values({ galleryId: id, clientId: row.client.id, userId: ctx.user?.id ?? null, filename: `${row.gallery.title}.zip`, ip: ctx.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: ctx.req.headers.get("user-agent") });
  await logActivity(id, "downloaded", ctx.user?.id ?? null, row.client.id, { format: "zip", count: list.length });
  return new NextResponse(new Uint8Array(Buffer.concat(chunks)), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${row.gallery.title.replace(/[^a-zA-Z0-9._-]/g, "_")}.zip"`, "Cache-Control": "private, no-store" } });
}
