import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, clients, notifications, users } from "@/db/schema";
import { ApiError, notFound, paginated, pagination, type Ctx } from "./http";
import { publishToUsers } from "./realtime";
import type { NotificationDTO, NotificationType, SessionUser } from "./shared";

/**
 * In-app notification centre.
 *
 * Every notification is persisted (so there is always a full history) and pushed live
 * to the recipient's SSE channel. Recipients are resolved by role: admins see studio-wide
 * events, photographers only their own, clients only their own.
 */

export type NotifyInput = {
  type: NotificationType;
  title: string;
  message: string;
  linkType?: "booking" | "gallery" | "chat" | "review";
  linkId?: number | null;
  bookingId?: number | null;
  galleryId?: number | null;
  chatRoomId?: number | null;
  actorUserId?: number | null;
};

async function adminIds(): Promise<number[]> {
  const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true)));
  return rows.map((r) => r.id);
}

async function photographerIdForBooking(bookingId: number): Promise<number | null> {
  const [row] = await db.select({ photographerId: bookings.photographerId }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  return row?.photographerId ?? null;
}

/** Resolves the users who should be told about a booking, excluding the actor. */
export async function bookingAudience(bookingId: number, actorUserId: number | null): Promise<number[]> {
  const [row] = await db
    .select({ clientUserId: clients.userId, photographerId: bookings.photographerId })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return [];
  const ids = [...(await adminIds()), row.photographerId, row.clientUserId].filter((v): v is number => v != null);
  return [...new Set(ids)].filter((id) => id !== actorUserId);
}

/** Creates one notification per recipient and pushes them over the realtime channel. */
export async function notify(userIds: number[], input: NotifyInput) {
  const targets = [...new Set(userIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (!targets.length) return [];
  const rows = await db
    .insert(notifications)
    .values(
      targets.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        linkType: input.linkType ?? null,
        linkId: input.linkId ?? null,
        bookingId: input.bookingId ?? null,
        galleryId: input.galleryId ?? null,
        chatRoomId: input.chatRoomId ?? null,
        actorUserId: input.actorUserId ?? null,
      })),
    )
    .returning({ id: notifications.id, userId: notifications.userId });

  const byUser = new Map<number, number[]>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r.id]);
  publishToUsers(targets, "notification", { ids: rows.map((r) => r.id) });
  return rows;
}

/** Notifies everyone involved in a booking (admins, photographer, client) except the actor. */
export async function notifyBooking(bookingId: number, actorUserId: number | null, input: NotifyInput) {
  return notify(await bookingAudience(bookingId, actorUserId), { ...input, bookingId: input.bookingId ?? bookingId });
}

/** Notifies a single user (used for direct messages and reminders). */
export async function notifyUser(userId: number, input: NotifyInput) {
  return notify([userId], input);
}

export async function unreadCount(userId: number) {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.value ?? 0);
}

export function notificationDTO(n: typeof notifications.$inferSelect, actorName: string | null): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    linkType: n.linkType ?? null,
    linkId: n.linkId ?? null,
    bookingId: n.bookingId ?? null,
    galleryId: n.galleryId ?? null,
    chatRoomId: n.chatRoomId ?? null,
    actorName,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listNotifications(ctx: Ctx) {
  const { page, pageSize, offset } = pagination(ctx.query, { pageSize: 20, max: 100 });
  const where = and(
    eq(notifications.userId, ctx.user.id),
    ctx.query.get("unread") === "1" ? isNull(notifications.readAt) : undefined,
  );
  const type = ctx.query.get("type");
  const [rows, [{ total }], unread] = await Promise.all([
    db
      .select({ notification: notifications, actorName: users.name })
      .from(notifications)
      .leftJoin(users, eq(notifications.actorUserId, users.id))
      .where(type ? and(where, eq(notifications.type, type as NotificationType)) : where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(notifications).where(where),
    unreadCount(ctx.user.id),
  ]);
  return {
    ...paginated(
      rows.map((r) => notificationDTO(r.notification, r.actorName)),
      Number(total ?? 0),
      page,
      pageSize,
    ),
    unread,
  };
}

export async function markRead(ctx: Ctx, ids: number[]) {
  if (!ids.length) return { updated: 0 };
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, ctx.user.id), inArray(notifications.id, ids), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  publishToUsers([ctx.user.id], "notifications:read", { ids: updated.map((u) => u.id) });
  return { updated: updated.length, unread: await unreadCount(ctx.user.id) };
}

export async function markAllRead(ctx: Ctx) {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  publishToUsers([ctx.user.id], "notifications:read", { all: true });
  return { updated: updated.length, unread: 0 };
}

export async function deleteNotification(ctx: Ctx, id: number) {
  const [row] = await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, ctx.user.id)))
    .returning({ id: notifications.id });
  if (!row) throw notFound("Notification");
  return { deleted: true, unread: await unreadCount(ctx.user.id) };
}

/** Clears the history of already-read notifications (unread ones are kept). */
export async function clearReadNotifications(ctx: Ctx) {
  const removed = await db
    .delete(notifications)
    .where(and(eq(notifications.userId, ctx.user.id), sql`${notifications.readAt} is not null`))
    .returning({ id: notifications.id });
  return { cleared: removed.length };
}

/** Deep link target for a notification, resolved lazily so links never go stale. */
export async function notificationLink(n: NotificationDTO): Promise<string | null> {
  if (n.linkType === "gallery" && (n.linkId ?? n.galleryId)) return `/dashboard/galleries/${n.linkId ?? n.galleryId}`;
  if (n.linkType === "chat" && (n.linkId ?? n.chatRoomId)) return `/dashboard/chat/${n.linkId ?? n.chatRoomId}`;
  if (n.linkType === "review" && n.bookingId) return `/dashboard/bookings/${n.bookingId}`;
  if (n.linkType === "booking" && (n.linkId ?? n.bookingId)) return `/dashboard/bookings/${n.linkId ?? n.bookingId}`;
  if (n.galleryId) return `/dashboard/galleries/${n.galleryId}`;
  if (n.chatRoomId) return `/dashboard/chat/${n.chatRoomId}`;
  if (n.bookingId) return `/dashboard/bookings/${n.bookingId}`;
  return null;
}

