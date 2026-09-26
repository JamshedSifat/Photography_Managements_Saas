import { and, desc, eq, gt, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, chatMessages, chatReads, chatRooms, clients, users } from "@/db/schema";
import { ApiError, created, forbidden, intParam, notFound, type Ctx, type PublicCtx } from "@/lib/http";
import { chatFileUrl, chatImageUrl, deleteChatAttachment, readChatFile, storeChatFile } from "@/lib/storage";
import { cloudinaryEnabled } from "@/lib/storage";
import { notifyBooking as notifyBookingAudience } from "@/lib/notifications";
import { publishRoomEvent } from "./streams";
import {
  type ChatMessageDTO,
  type ChatParticipantDTO,
  type ChatRoomDTO,
  type ChatRoomDetailDTO,
  type Role,
  type SessionUser,
} from "@/lib/shared";
import { chatMessageSchema, chatTypingSchema } from "@/lib/validators";

/**
 * Booking-scoped chat. One private room is created automatically for every booking and
 * only the related client, the assigned photographer and studio admins can open it.
 */

const PAGE_SIZE = 60;
const MAX_FILES = 6;
const MAX_BYTES = 15 * 1024 * 1024;

type BookingAccess = { photographerId: number | null; clientId: number; clientUserId: number | null };

export async function loadBookingAccess(user: SessionUser, bookingId: number): Promise<BookingAccess> {
  const [row] = await db
    .select({ photographerId: bookings.photographerId, clientId: bookings.clientId, clientUserId: clients.userId })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) throw notFound("Booking");
  const allowed =
    user.role === "admin" || (user.role === "photographer" && row.photographerId === user.id) || (user.role === "client" && user.clientId === row.clientId);
  if (!allowed) throw forbidden("This conversation belongs to another booking.");
  return row;
}

/** Creates (or returns) the private chat room for a booking. Idempotent. */
export async function ensureChatRoom(bookingId: number) {
  const [existing] = await db.select({ id: chatRooms.id }).from(chatRooms).where(eq(chatRooms.bookingId, bookingId)).limit(1);
  if (existing) return existing.id;
  const [booking] = await db.select({ reference: bookings.reference }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  const [row] = await db.insert(chatRooms).values({ bookingId, title: booking ? `Booking ${booking.reference}` : `Booking #${bookingId}` }).returning({ id: chatRooms.id });
  return row.id;
}

async function roomParticipants(roomId: number): Promise<ChatParticipantDTO[]> {
  const [row] = await db
    .select({ photographerId: bookings.photographerId, clientUserId: clients.userId })
    .from(chatRooms)
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(eq(chatRooms.id, roomId))
    .limit(1);
  if (!row) return [];
  const ids = [
    ...(await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true)))),
    row.photographerId ? { id: row.photographerId } : null,
    row.clientUserId ? { id: row.clientUserId } : null,
  ].filter((v): v is { id: number } => v != null);
  const unique = [...new Set(ids.map((i) => i.id))];
  if (!unique.length) return [];
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role, color: users.color, avatarUrl: users.avatarUrl })
    .from(users)
    .where(inArray(users.id, unique));
  const order: Role[] = ["admin", "photographer", "client"];
  return rows
    .map((u) => ({ id: u.id, name: u.name, role: u.role, color: u.color, avatarUrl: u.avatarUrl }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}

function messageDTO(
  m: typeof chatMessages.$inferSelect,
  sender: { name: string; role: Role; color: string | null },
  seenBy: number[],
): ChatMessageDTO {
  const isImage = m.kind === "image";
  return {
    id: m.id,
    roomId: m.roomId,
    senderId: m.senderUserId,
    senderName: sender.name,
    senderRole: sender.role,
    senderColor: sender.color,
    kind: m.kind,
    body: m.body,
    attachmentUrl: m.attachmentUrl ? (isImage ? chatImageUrl(m.id) : chatFileUrl(m.id)) : null,
    attachmentName: m.attachmentName,
    attachmentType: m.attachmentType,
    attachmentBytes: m.attachmentBytes,
    createdAt: m.createdAt.toISOString(),
    seenBy,
  };
}

/**
 * Loads a page of messages for a room.
 *
 * Always returns the **newest** `limit` messages (ascending for rendering). When
 * `before` is supplied it pages backwards through history, which is what an
 * infinite-scroll thread needs — previously this used `gt` (newer than) combined
 * with an ascending limit, so a room with more than `limit` messages only ever
 * returned its oldest page and new messages never appeared.
 */
async function messagesFor(roomId: number, before?: number, limit = PAGE_SIZE) {
  const page = await db
    .select({ message: chatMessages, sender: { name: users.name, role: users.role, color: users.color } })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.senderUserId, users.id))
    .where(before ? and(eq(chatMessages.roomId, roomId), lt(chatMessages.id, before)) : eq(chatMessages.roomId, roomId))
    .orderBy(desc(chatMessages.id))
    .limit(limit);
  const rows = page.reverse();
  const ids = rows.map((r) => r.message.id);
  const seen = ids.length
    ? await db.execute<{ message_id: number; user_id: number }>(sql`
        select r.user_id, r.last_read_message_id as message_id
        from chat_reads r where r.room_id = ${roomId}`)
    : { rows: [] as { message_id: number; user_id: number }[] };
  const seenByMessage = new Map<number, number[]>();
  for (const r of seen.rows) {
    const seenId = Number(r.message_id);
    for (const id of ids) if (id <= seenId) seenByMessage.set(id, [...(seenByMessage.get(id) ?? []), Number(r.user_id)]);
  }
  return rows.map((r) => messageDTO(r.message, r.sender, (seenByMessage.get(r.message.id) ?? []).filter((u) => u !== r.message.senderUserId)));
}

export async function listRooms(ctx: Ctx) {
  const scope =
    ctx.user.role === "client"
      ? ctx.user.clientId != null
        ? eq(bookings.clientId, ctx.user.clientId)
        : sql`false`
      : ctx.user.role === "photographer"
        ? eq(bookings.photographerId, ctx.user.id)
        : undefined;
  const rooms = await db
    .select({
      room: chatRooms,
      booking: bookings,
      client: { id: clients.id, name: clients.name },
      photographer: { id: users.id, name: users.name },
    })
    .from(chatRooms)
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .leftJoin(users, eq(bookings.photographerId, users.id))
    .where(scope)
    .orderBy(desc(sql`coalesce(${chatRooms.lastMessageAt}, ${chatRooms.createdAt})`))
    .limit(100);

  if (!rooms.length) return { results: [] as ChatRoomDTO[] };

  const roomIds = rooms.map((r) => r.room.id);
  const lastMessages = await db
    .select({ roomId: chatMessages.roomId, body: chatMessages.body, kind: chatMessages.kind, createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .innerJoin(chatRooms, eq(chatMessages.roomId, chatRooms.id))
    .where(inArray(chatMessages.roomId, roomIds))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(400);
  const lastByRoom = new Map<number, { body: string; kind: string; createdAt: Date }>();
  for (const m of lastMessages) if (!lastByRoom.has(m.roomId)) lastByRoom.set(m.roomId, m);

  const unreadRows = await db
    .select({ roomId: chatMessages.roomId, value: sql<number>`count(*)::int` })
    .from(chatMessages)
    .innerJoin(chatRooms, eq(chatMessages.roomId, chatRooms.id))
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .leftJoin(chatReads, and(eq(chatReads.roomId, chatMessages.roomId), eq(chatReads.userId, ctx.user.id)))
    .where(
      and(
        inArray(chatMessages.roomId, roomIds),
        sql`${chatMessages.senderUserId} <> ${ctx.user.id}`,
        gt(chatMessages.id, sql`coalesce(${chatReads.lastReadMessageId}, 0)`),
      ),
    )
    .groupBy(chatMessages.roomId);
  const unreadMap = new Map(unreadRows.map((r) => [r.roomId, Number(r.value)]));

  const results: ChatRoomDTO[] = [];
  for (const r of rooms) {
    const last = lastByRoom.get(r.room.id);
    results.push({
      id: r.room.id,
      bookingId: r.booking.id,
      bookingReference: r.booking.reference,
      bookingTitle: r.booking.title,
      bookingDate: r.booking.date,
      bookingStatus: r.booking.status,
      title: r.room.title ?? `Booking ${r.booking.reference}`,
      clientName: r.client.name,
      photographerName: r.photographer?.name ?? null,
      lastMessageAt: (r.room.lastMessageAt ?? last?.createdAt ?? r.room.createdAt).toISOString(),
      lastMessage: last ? (last.kind === "text" ? last.body : last.kind === "image" ? "📷 Photo" : "📎 File") : null,
      unread: unreadMap.get(r.room.id) ?? 0,
      participants: await roomParticipants(r.room.id),
    });
  }
  return { results };
}

export async function getRoom(ctx: Ctx) {
  const roomId = intParam(ctx.params.id, "room id");
  const [row] = await db
    .select({ room: chatRooms, booking: bookings, client: { id: clients.id, name: clients.name }, photographer: { id: users.id, name: users.name } })
    .from(chatRooms)
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .leftJoin(users, eq(bookings.photographerId, users.id))
    .where(eq(chatRooms.id, roomId))
    .limit(1);
  if (!row) throw notFound("Conversation");
  await loadBookingAccess(ctx.user, row.booking.id);
  const before = ctx.query.get("before") ? Number(ctx.query.get("before")) : undefined;
  const messages = await messagesFor(roomId, before && before > 0 ? before : undefined);
  const base: ChatRoomDTO = {
    id: row.room.id,
    bookingId: row.booking.id,
    bookingReference: row.booking.reference,
    bookingTitle: row.booking.title,
    bookingDate: row.booking.date,
    bookingStatus: row.booking.status,
    title: row.room.title ?? `Booking ${row.booking.reference}`,
    clientName: row.client.name,
    photographerName: row.photographer?.name ?? null,
    lastMessageAt: (row.room.lastMessageAt ?? row.room.createdAt).toISOString(),
    lastMessage: null,
    unread: 0,
    participants: await roomParticipants(roomId),
  };
  const detail: ChatRoomDetailDTO = { ...base, messages, hasMore: messages.length >= PAGE_SIZE };
  return { room: detail };
}

export async function sendMessage(ctx: Ctx) {
  const roomId = intParam(ctx.params.id, "room id");
  const [row] = await db
    .select({ bookingId: chatRooms.bookingId })
    .from(chatRooms)
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .where(eq(chatRooms.id, roomId))
    .limit(1);
  if (!row) throw notFound("Conversation");
  const access = await loadBookingAccess(ctx.user, row.bookingId);

  const contentType = ctx.req.headers.get("content-type") ?? "";
  const form = contentType.includes("multipart/form-data") ? await ctx.req.formData().catch(() => null) : null;
  const files = form ? form.getAll("files").filter((f): f is File => typeof f !== "string") : [];
  if (files.length > MAX_FILES) throw new ApiError(400, `Attach up to ${MAX_FILES} files per message.`);
  for (const file of files) if (file.size > MAX_BYTES) throw new ApiError(400, `"${file.name}" exceeds the 15 MB limit.`);

  // Plain JSON `{ body }` is accepted as well as multipart (which the composer uses when attaching files).
  const jsonBody = !form && contentType.includes("application/json") ? await ctx.req.json().catch(() => null) : null;
  const rawBody = form && typeof form.get("body") === "string" ? String(form.get("body")) : (jsonBody?.body as string | undefined) ?? "";
  const parsed = chatMessageSchema.parse({ body: rawBody.trim() });
  if (!parsed.body && !files.length) throw new ApiError(400, "Write a message or attach a file.");

  const created_messages: ChatMessageDTO[] = [];
  if (files.length) {
    for (const file of files) {
      const stored = await storeChatFile(file, roomId);
      const kind = file.type.startsWith("image/") ? "image" : "file";
      const [inserted] = await db
        .insert(chatMessages)
        .values({
          roomId,
          senderUserId: ctx.user.id,
          kind,
          body: kind === "image" ? parsed.body : parsed.body || file.name,
          attachmentUrl: stored.publicId,
          attachmentName: file.name.slice(0, 250),
          attachmentType: stored.mimeType,
          attachmentBytes: stored.bytes,
        })
        .returning();
      created_messages.push(
        messageDTO(inserted, { name: ctx.user.name, role: ctx.user.role, color: ctx.user.color }, []),
      );
    }
  } else {
    const [inserted] = await db
      .insert(chatMessages)
      .values({ roomId, senderUserId: ctx.user.id, kind: "text", body: parsed.body })
      .returning();
    created_messages.push(messageDTO(inserted, { name: ctx.user.name, role: ctx.user.role, color: ctx.user.color }, []));
  }

  await db.update(chatRooms).set({ lastMessageAt: new Date() }).where(eq(chatRooms.id, roomId));
  await db
    .insert(chatReads)
    .values({ roomId, userId: ctx.user.id, lastReadMessageId: created_messages[created_messages.length - 1].id })
    .onConflictDoUpdate({ target: [chatReads.roomId, chatReads.userId], set: { lastReadMessageId: created_messages[created_messages.length - 1].id, updatedAt: new Date() } });

  for (const message of created_messages) {
    await publishRoomEvent(roomId, "chat:message", message);
    const preview = message.kind === "text" ? message.body : message.kind === "image" ? "sent a photo" : `sent a file (${message.attachmentName})`;
    await notifyBookingAudience(row.bookingId, ctx.user.id, {
      type: "chat_message",
      title: "New chat message",
      message: `${ctx.user.name}: ${preview.slice(0, 120)}`,
      linkType: "chat",
      linkId: roomId,
      chatRoomId: roomId,
      actorUserId: ctx.user.id,
    });
  }
  return created({ messages: created_messages });
}

export async function markRoomRead(ctx: Ctx) {
  const roomId = intParam(ctx.params.id, "room id");
  const [row] = await db
    .select({ bookingId: chatRooms.bookingId })
    .from(chatRooms)
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .where(eq(chatRooms.id, roomId))
    .limit(1);
  if (!row) throw notFound("Conversation");
  await loadBookingAccess(ctx.user, row.bookingId);
  const [latest] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(eq(chatMessages.roomId, roomId))
    .orderBy(desc(chatMessages.id))
    .limit(1);
  const lastId = latest?.id ?? 0;
  await db
    .insert(chatReads)
    .values({ roomId, userId: ctx.user.id, lastReadMessageId: lastId })
    .onConflictDoUpdate({ target: [chatReads.roomId, chatReads.userId], set: { lastReadMessageId: lastId, updatedAt: new Date() } });
  await publishRoomEvent(roomId, "chat:seen", { userId: ctx.user.id, lastReadMessageId: lastId });
  return { read: true, lastReadMessageId: lastId };
}

export async function setTyping(ctx: Ctx) {
  const roomId = intParam(ctx.params.id, "room id");
  const [row] = await db
    .select({ bookingId: chatRooms.bookingId })
    .from(chatRooms)
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .where(eq(chatRooms.id, roomId))
    .limit(1);
  if (!row) throw notFound("Conversation");
  await loadBookingAccess(ctx.user, row.bookingId);
  const { typing } = chatTypingSchema.parse(await ctx.req.json().catch(() => ({ typing: true })));
  const until = new Date(Date.now() + 8000);
  await db
    .insert(chatReads)
    .values({ roomId, userId: ctx.user.id, typingAt: typing ? until : null })
    .onConflictDoUpdate({ target: [chatReads.roomId, chatReads.userId], set: { typingAt: typing ? until : null, updatedAt: new Date() } });
  await publishRoomEvent(roomId, "chat:typing", { userId: ctx.user.id, name: ctx.user.name, typing });
  return { ok: true };
}

export async function searchMessages(ctx: Ctx) {
  const q = ctx.query.get("q")?.trim() ?? "";
  if (q.length < 2) return { results: [] };
  const scope =
    ctx.user.role === "client"
      ? ctx.user.clientId != null
        ? eq(bookings.clientId, ctx.user.clientId)
        : sql`false`
      : ctx.user.role === "photographer"
        ? eq(bookings.photographerId, ctx.user.id)
        : undefined;
  const rows = await db
    .select({
      message: chatMessages,
      room: chatRooms,
      booking: bookings,
      sender: { name: users.name, role: users.role, color: users.color },
    })
    .from(chatMessages)
    .innerJoin(chatRooms, eq(chatMessages.roomId, chatRooms.id))
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .innerJoin(users, eq(chatMessages.senderUserId, users.id))
    .where(and(scope, or(ilike(chatMessages.body, `%${q}%`), ilike(chatMessages.attachmentName, `%${q}%`))))
    .orderBy(desc(chatMessages.createdAt))
    .limit(60);
  return {
    results: rows.map((r) => ({
      ...messageDTO(r.message, r.sender, []),
      bookingReference: r.booking.reference,
      bookingTitle: r.booking.title,
    })),
  };
}

/** Authorised delivery of chat attachments (Cloudinary signed URL or private local file). */
export async function chatFile(ctx: PublicCtx) {
  const id = intParam(ctx.params.id, "message id");
  const [row] = await db
    .select({ message: chatMessages, room: chatRooms, booking: bookings, client: { id: clients.id } })
    .from(chatMessages)
    .innerJoin(chatRooms, eq(chatMessages.roomId, chatRooms.id))
    .innerJoin(bookings, eq(chatRooms.bookingId, bookings.id))
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(eq(chatMessages.id, id))
    .limit(1);
  if (!row || !row.message.attachmentUrl) throw notFound("Attachment");
  if (!ctx.user) throw new ApiError(401, "Authentication required.");
  await loadBookingAccess(ctx.user, row.booking.id);
  const inline = ctx.query.get("inline") === "1";

  if (row.message.attachmentType?.startsWith("image/") && cloudinaryEnabled()) {
    const { cloudinaryImageUrl } = await import("@/lib/storage");
    return new Response(null, { status: 302, headers: { Location: cloudinaryImageUrl(row.message.attachmentUrl, null, "preview", null) } });
  }
  const file = await readChatFile(row.message.attachmentUrl);
  const safeName = (row.message.attachmentName ?? "attachment").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "attachment";
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": row.message.attachmentType ?? "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function deleteMessage(ctx: Ctx) {
  const id = intParam(ctx.params.id, "message id");
  const [row] = await db
    .select({ message: chatMessages, room: chatRooms })
    .from(chatMessages)
    .innerJoin(chatRooms, eq(chatMessages.roomId, chatRooms.id))
    .where(eq(chatMessages.id, id))
    .limit(1);
  if (!row) throw notFound("Message");
  const isStaff = ctx.user.role !== "client";
  if (!isStaff && row.message.senderUserId !== ctx.user.id) throw forbidden("You can only delete your own messages.");
  await db.delete(chatMessages).where(eq(chatMessages.id, id));
  if (row.message.attachmentUrl) await deleteChatAttachment({ provider: "local", publicId: row.message.attachmentUrl });
  await publishRoomEvent(row.room.id, "chat:deleted", { id });
  return { deleted: true };
}
