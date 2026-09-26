import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { intParam } from "@/lib/http";
import { ApiError, errorResponse, type Ctx, type PublicCtx } from "@/lib/http";
import { ensureSeeded } from "@/lib/seed";
import type { Role } from "@/lib/shared";
import * as admin from "./views/admin";
import * as auth from "./views/auth";
import * as chat from "./views/chat";
import * as notifications from "./views/notifications";
import * as portfolio from "./views/portfolio";
import * as reviews from "./views/reviews";
import * as streams from "./views/streams";
import * as bookingViews from "./views/bookings";
import * as catalog from "./views/catalog";
import * as finance from "./views/finance";
import * as manualPayments from "./views/manual-payments";
import * as gallery from "./views/galleries";
import * as people from "./views/people";
import * as contracts from "./views/contracts";
import * as availability from "./views/availability";

/**
 * DRF-style URL router: each route maps to a view with declarative permissions
 * ("public" | any authenticated user | role allow-list).
 */

export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type Route =
  | { method: Method; path: string; access: "public"; handler: (ctx: PublicCtx) => Promise<unknown> }
  | { method: Method; path: string; access: "auth" | Role[]; handler: (ctx: Ctx) => Promise<unknown> };

const open = (method: Method, path: string, handler: (ctx: PublicCtx) => Promise<unknown>): Route => ({ method, path, access: "public", handler });
const authed = (method: Method, path: string, handler: (ctx: Ctx) => Promise<unknown>, roles?: Role[]): Route => ({
  method,
  path,
  access: roles ?? "auth",
  handler,
});

const ADMIN: Role[] = ["admin"];
const STAFF: Role[] = ["admin", "photographer"];
const ADMIN_CLIENT: Role[] = ["admin", "client"];

const routes: Route[] = [
  // auth
  open("POST", "/auth/register", auth.register),
  open("POST", "/auth/login", auth.login),
  open("POST", "/auth/refresh", auth.refresh),
  open("POST", "/auth/logout", auth.logout),
  authed("GET", "/auth/me", auth.me),
  authed("PATCH", "/auth/me", auth.updateMe),
  authed("POST", "/auth/password", auth.changePassword),

  // clients
  authed("GET", "/clients", people.listClients, ADMIN),
  authed("POST", "/clients", people.createClient, ADMIN),
  authed("GET", "/clients/:id", people.getClient, ADMIN),
  authed("PATCH", "/clients/:id", people.updateClient, ADMIN),
  authed("DELETE", "/clients/:id", people.deleteClient, ADMIN),

  // photographers
  authed("GET", "/photographers", people.listPhotographers),
  authed("POST", "/photographers", people.createPhotographer, ADMIN),
  authed("PATCH", "/photographers/:id", people.updatePhotographer, ADMIN),
  authed("DELETE", "/photographers/:id", people.deactivatePhotographer, ADMIN),

  // packages
  open("GET", "/packages", catalog.listPackages),
  authed("POST", "/packages", catalog.createPackage, ADMIN),
  open("GET", "/packages/:id", catalog.getPackage),
  authed("PATCH", "/packages/:id", catalog.updatePackage, ADMIN),
  authed("DELETE", "/packages/:id", catalog.deletePackage, ADMIN),

  // scheduling
  authed("GET", "/availability", bookingViews.availability),
  authed("GET", "/availability/month", bookingViews.monthAvailability),
  authed("GET", "/availability/manage", availability.manage, STAFF),
  authed("PUT", "/availability/weekly", availability.saveWeekly, STAFF),
  authed("POST", "/availability/overrides", availability.createOverride, STAFF),
  authed("DELETE", "/availability/overrides/:id", availability.deleteOverride, ADMIN),
  authed("GET", "/leaves", availability.listLeaves, STAFF),
  authed("POST", "/leaves", availability.createLeave, ["photographer"]),
  authed("PATCH", "/leaves/:id", availability.reviewLeave, ADMIN),
  authed("GET", "/bookings", bookingViews.listBookings),
  authed("POST", "/bookings", bookingViews.createBookingView, ADMIN_CLIENT),
  authed("GET", "/bookings/:id", bookingViews.getBooking),
  authed("GET", "/bookings/:id/contract", contracts.forBooking, ADMIN_CLIENT),
  authed("PATCH", "/bookings/:id", bookingViews.updateBookingView),
  authed("DELETE", "/bookings/:id", bookingViews.deleteBooking, ADMIN),
  authed("POST", "/bookings/:id/notify", bookingViews.notifyBooking, ADMIN),

  // payments
  authed("GET", "/payments", finance.listPayments, ADMIN_CLIENT),
  authed("POST", "/payments", finance.createPayment, ADMIN),
  authed("GET", "/payments/summary", finance.summary, ADMIN_CLIENT),
  authed("GET", "/payments/outstanding", finance.outstanding, ADMIN_CLIENT),
  authed("PATCH", "/payments/:id", finance.updatePayment, ADMIN),
  authed("DELETE", "/payments/:id", finance.deletePayment, ADMIN),

  // manual bKash / Nagad payments (no gateway)
  authed("GET", "/payments/instructions", () => manualPayments.paymentInstructions(), ADMIN_CLIENT),
  authed("GET", "/payments/pending-verification", manualPayments.pendingVerifications, ADMIN),
  authed("POST", "/payments/manual", manualPayments.submitManualPayment, ADMIN_CLIENT),
  authed("POST", "/payments/:id/review", manualPayments.reviewManualPayment, ADMIN),
  authed("GET", "/payments/:id/screenshot", manualPayments.paymentScreenshot, ADMIN_CLIENT),
  authed("GET", "/payments/:id/receipt", manualPayments.paymentReceipt, ADMIN_CLIENT),
  authed("GET", "/bookings/:id/payments", manualPayments.bookingPayments, ADMIN_CLIENT),

  // galleries
  authed("GET", "/galleries", gallery.listGalleries),
  open("POST", "/galleries/:id/access/otp", gallery.requestGalleryOtp),
  open("POST", "/galleries/:id/access/verify", gallery.verifyGalleryOtp),
  open("GET", "/galleries/:id/download.zip", gallery.downloadZip),
  authed("POST", "/galleries/:id/comments", gallery.createComment),
  authed("PATCH", "/galleries/:id/comments/:commentId", gallery.updateComment, STAFF),
  authed("POST", "/galleries/:id/extension-requests", gallery.requestExtension, ["client"]),
  authed("GET", "/gallery-extension-requests", gallery.listExtensions, STAFF),
  authed("PATCH", "/gallery-extension-requests/:requestId", gallery.reviewExtension, ADMIN),
  authed("POST", "/galleries", gallery.createGallery, STAFF),
  authed("GET", "/galleries/:id", gallery.getGallery),
  authed("PATCH", "/galleries/:id", gallery.updateGallery, STAFF),
  authed("DELETE", "/galleries/:id", gallery.deleteGallery, ADMIN),
  authed("POST", "/galleries/:id/photos", gallery.uploadPhotos, STAFF),
  authed("POST", "/galleries/:id/notify", gallery.notifyGallery, STAFF),
  authed("PATCH", "/photos/:id", gallery.updatePhoto),
  authed("DELETE", "/photos/:id", gallery.deletePhoto, STAFF),
  open("GET", "/photos/:id/view", gallery.viewPhoto),
  open("GET", "/photos/:id/download", gallery.downloadPhoto),

  // contracts
  open("GET", "/contracts/:token", contracts.publicGet),
  open("POST", "/contracts/:token/otp", contracts.requestOtp),
  open("POST", "/contracts/:token/verify", contracts.verifyOtp),
  open("POST", "/contracts/:token/sign", contracts.sign),
  open("GET", "/contracts/:token/pdf", contracts.pdf),
  authed("GET", "/contracts", contracts.list, ADMIN),
  authed("POST", "/bookings/:id/contract", contracts.sendForBooking, ADMIN),

  // in-app notification centre (real-time)
  authed("GET", "/me/notifications", notifications.list),
  authed("GET", "/me/notifications/unread-count", notifications.unread),
  authed("POST", "/me/notifications/read", notifications.markReadView),
  authed("POST", "/me/notifications/read-all", notifications.markAllRead),
  authed("DELETE", "/me/notifications/read", notifications.clearRead),
  authed("DELETE", "/me/notifications/:id", notifications.remove),
  authed("GET", "/me/notifications/stream", streams.notificationStream),

  // booking chat
  authed("GET", "/chat/rooms", chat.listRooms),
  authed("GET", "/chat/search", chat.searchMessages),
  authed("GET", "/chat/rooms/:id", chat.getRoom),
  authed("POST", "/chat/rooms/:id/messages", chat.sendMessage),
  authed("POST", "/chat/rooms/:id/read", chat.markRoomRead),
  authed("POST", "/chat/rooms/:id/typing", chat.setTyping),
  authed("DELETE", "/chat/messages/:id", chat.deleteMessage),
  authed("GET", "/chat/rooms/:id/stream", (ctx) => streams.chatStream(ctx, intParam(ctx.params.id, "room id"))),
  authed("GET", "/chat/files/:id", chat.chatFile),

  // reviews & ratings
  authed("GET", "/bookings/:id/review", reviews.reviewForBooking),
  authed("POST", "/bookings/:id/review", reviews.createReview),

  // public photographer portfolios
  open("GET", "/photographers/public", portfolio.publicList),
  open("GET", "/photographers/public/:id", portfolio.publicProfile),
  authed("GET", "/photographers/browse", portfolio.listForBooking),

  // admin & misc
  authed("GET", "/dashboard", admin.dashboard),
  authed("GET", "/search", admin.search, ADMIN),
  authed("GET", "/notifications", admin.listNotifications, ADMIN),
  authed("GET", "/notifications/:id", admin.getNotification, ADMIN),
  open("POST", "/notifications/reminders", admin.sendReminders),
  authed("POST", "/notifications/test", admin.testEmail, ADMIN),
  authed("GET", "/settings", admin.getSettingsView),
  authed("PATCH", "/settings", admin.updateSettings, ADMIN),
  authed("GET", "/system/status", admin.systemStatus, ADMIN),
];

const compiled = routes.map((r) => ({ ...r, segments: r.path.split("/").filter(Boolean) }));

function match(segments: string[], pattern: string[]) {
  if (segments.length !== pattern.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(segments[i]);
    else if (p !== segments[i]) return null;
  }
  return params;
}

export async function dispatch(method: Method, req: NextRequest, path: string[]) {
  try {
    await ensureSeeded();
    let methodMismatch = false;
    for (const route of compiled) {
      const params = match(path, route.segments);
      if (!params) continue;
      if (route.method !== method) {
        methodMismatch = true;
        continue;
      }
      const query = req.nextUrl.searchParams;
      const user = await getSessionUser(req);
      let result: unknown;
      if (route.access === "public") {
        result = await route.handler({ req, params, query, user });
      } else {
        if (!user) throw new ApiError(401, "Authentication credentials were not provided or have expired.");
        if (Array.isArray(route.access) && !route.access.includes(user.role)) {
          throw new ApiError(403, "You do not have permission to perform this action.");
        }
        result = await route.handler({ req, params, query, user });
      }
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    }
    if (methodMismatch) return NextResponse.json({ error: `Method "${method}" not allowed.` }, { status: 405 });
    return NextResponse.json({ error: "Endpoint not found." }, { status: 404 });
  } catch (err) {
    return errorResponse(err);
  }
}
