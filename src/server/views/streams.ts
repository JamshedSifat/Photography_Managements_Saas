import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, chatMessages, chatReads, chatRooms, clients, users } from "@/db/schema";
import { ApiError, forbidden, type Ctx } from "@/lib/http";
import { channelForUser, publish, sseFrame, subscribe } from "@/lib/realtime";
import { unreadCount } from "@/lib/notifications";
import type { SessionUser } from "@/lib/shared";

/**
 * Server-Sent Events endpoints. Both streams start by replaying the current state so a
 * freshly opened (or reconnected) tab is immediately in sync, then push live deltas.
 */

const encoder = new TextEncoder();

function eventStream(send: (frame: string) => void, onClose: () => void) {
  let closed = false;
  const keepAlive = setInterval(() => {
    if (!closed) send(": ping\n\n");
  }, 20_000);
  return {
    push: (frame: string) => {
      if (!closed) send(frame);
    },
    close: () => {
      if (closed) return;
      closed = true;
      clearInterval(keepAlive);
      onClose();
    },
  };
}

function sseResponse(open: (push: (frame: string) => void) => () => void) {
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (frame: string) => {
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          /* stream already closed */
        }
      };
      cleanup = open(push);
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Live notification stream for the signed-in user. */
export async function notificationStream(ctx: Ctx) {
  const userId = ctx.user.id;
  const channel = channelForUser(userId);
  return sseResponse((push) => {
    void (async () => {
      const unread = await unreadCount(userId);
      push(sseFrame({ id: "init", channel, type: "ready", data: { unread }, at: new Date().toISOString() }));
    })();
    const unsubscribe = subscribe(channel, (event) => {
      if (event.type === "notification" || event.type === "notifications:read") {
        push(sseFrame(event));
        if (event.type === "notifications:read") {
          void unreadCount(userId).then((u) => push(sseFrame({ id: `u-${Date.now()}`, channel, type: "unread", data: { unread: u }, at: new Date().toISOString() })));
        }
      }
    });
    return () => unsubscribe();
  });
}

// ------------------------------------------------------------------ chat streams

async function chatAccess(user: SessionUser, bookingId: number) {
  const [row] = await db
    .select({ bookingId: bookings.id, photographerId: bookings.photographerId, clientId: bookings.clientId, clientUserId: clients.userId })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) throw new ApiError(404, "Booking not found");
  if (user.role === "admin") return row;
  if (user.role === "photographer" && row.photographerId === user.id) return row;
  if (user.role === "client" && user.clientId != null && row.clientId === user.clientId) return row;
  throw forbidden("This conversation belongs to another booking.");
}

async function roomParticipants(roomId: number): Promise<number[]> {
  const [row] = await db
    .select({ photographerId: bookings.photographerId, clientUserId: clients.userId })
    .from(chatRooms)
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(eq(chatRooms.id, roomId))
    .limit(1);
  if (!row) return [];
  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true)));
  return [...new Set([...admins.map((a) => a.id), row.photographerId, row.clientUserId].filter((v): v is number => v != null))];
}

/** Live message / typing / seen stream for one booking conversation. */
export async function chatStream(ctx: Ctx, roomId: number) {
  const [room] = await db
    .select({ room: chatRooms, booking: bookings })
    .from(chatRooms)
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .where(eq(chatRooms.id, roomId))
    .limit(1);
  if (!room) throw new ApiError(404, "Conversation not found");
  await chatAccess(ctx.user, room.booking.id);

  const userId = ctx.user.id;
  // Only listen on *this* user's channel. `publishRoomEvent` already fans every event
  // out to each participant individually, so subscribing to the other participants'
  // channels too delivered one duplicate copy of every message per participant.
  const channels = [channelForUser(userId)];
  const unsubscribes: Array<() => void> = [];

  return sseResponse((push) => {
    void (async () => {
      const [unread] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(chatMessages)
        .leftJoin(chatReads, and(eq(chatReads.roomId, chatMessages.roomId), eq(chatReads.userId, userId)))
        .where(
          and(
            eq(chatMessages.roomId, roomId),
            gt(chatMessages.id, sql`coalesce(${chatReads.lastReadMessageId}, 0)`),
            sql`${chatMessages.senderUserId} <> ${userId}`,
          ),
        );
      push(
        sseFrame({
          id: "init",
          channel: channelForUser(userId),
          type: "ready",
          data: { roomId, unread: Number(unread?.value ?? 0) },
          at: new Date().toISOString(),
        }),
      );
    })();

    for (const channel of channels) {
      unsubscribes.push(
        subscribe(channel, (event) => {
          const data = event.data as { roomId?: number } | null;
          if (data?.roomId != null && data.roomId !== roomId) return;
          push(sseFrame(event));
        }),
      );
    }
    return () => unsubscribes.forEach((u) => u());
  });
}

/** Broadcasts a chat event to everyone in the room (sender included, for multi-tab sync). */
export async function publishRoomEvent(roomId: number, type: string, data: unknown) {
  const viewers = await roomParticipants(roomId);
  for (const id of viewers) publish(channelForUser(id), type, { ...(data as object), roomId });
}

/** Unread message count per room for a user (only rooms they may access). */
export async function chatUnreadFor(userId: number, clientId: number | null) {
  const scope =
    clientId != null
      ? eq(bookings.clientId, clientId)
      : sql`${bookings.photographerId} = ${userId} or exists (select 1 from ${users} u where u.role = 'admin' and u.id = ${userId})`;
  const rows = await db
    .select({ roomId: chatRooms.id, unread: sql<number>`count(${chatMessages.id})::int` })
    .from(chatRooms)
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .innerJoin(chatMessages, eq(chatMessages.roomId, chatRooms.id))
    .leftJoin(chatReads, and(eq(chatReads.roomId, chatRooms.id), eq(chatReads.userId, userId)))
    .where(and(scope, sql`${chatMessages.senderUserId} <> ${userId}`, gt(chatMessages.id, sql`coalesce(${chatReads.lastReadMessageId}, 0)`)))
    .groupBy(chatRooms.id);
  return new Map(rows.map((r) => [r.roomId, Number(r.unread)]));
}
