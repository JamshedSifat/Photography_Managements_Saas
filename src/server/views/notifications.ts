import { intParam, parseBody, type Ctx } from "@/lib/http";
import { clearReadNotifications, deleteNotification, listNotifications, markAllRead, markRead, unreadCount } from "@/lib/notifications";
import { notificationReadSchema } from "@/lib/validators";

/** Thin view layer over the notification service (keeps the router DRF-style). */
export const list = listNotifications;

export async function unread(ctx: Ctx) {
  return { unread: await unreadCount(ctx.user.id) };
}

export async function markReadView(ctx: Ctx) {
  const data = await parseBody(ctx.req, notificationReadSchema);
  if (data.all) return markAllRead(ctx);
  return markRead(ctx, data.ids ?? []);
}

export { markAllRead };

export async function remove(ctx: Ctx) {
  return deleteNotification(ctx, intParam(ctx.params.id, "notification id"));
}

export { clearReadNotifications as clearRead };
