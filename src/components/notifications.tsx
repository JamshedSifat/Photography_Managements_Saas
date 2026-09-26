"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import {
  Activity,
  Bell,
  BellOff,
  CalendarPlus,
  CalendarX,
  Camera,
  CheckCheck,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  CreditCard,
  Images,
  MessageSquare,
  Sparkles,
  Star,
  Umbrella,
  X,
  type LucideIcon,
} from "lucide-react";
import { api, errorMessage, tokenStore } from "@/lib/client-api";
import { cn, formatRelative, NOTIFICATION_TYPE_META, type NotificationDTO, type NotificationListResponse, type NotificationType } from "@/lib/shared";

const ICONS: Record<string, LucideIcon> = {
  "calendar-plus": CalendarPlus,
  "calendar-x": CalendarX,
  "circle-check": CircleCheck,
  "circle-x": CircleX,
  activity: Activity,
  camera: Camera,
  "credit-card": CreditCard,
  clock: Clock,
  images: Images,
  sparkles: Sparkles,
  message: MessageSquare,
  star: Star,
  umbrella: Umbrella,
  bell: Bell,
};

function iconFor(type: NotificationType) {
  return ICONS[NOTIFICATION_TYPE_META[type]?.icon ?? "bell"] ?? Bell;
}

/** Resolves a notification to the page it belongs to. */
export function notificationHref(n: NotificationDTO): string {
  if (n.linkType === "booking" && n.linkId) return `/dashboard/bookings/${n.linkId}`;
  if (n.linkType === "gallery" && n.linkId) return `/dashboard/galleries/${n.linkId}`;
  if (n.linkType === "chat" && n.linkId) return `/dashboard/chat?room=${n.linkId}`;
  if (n.linkType === "review" && n.linkId) return `/photographers/${n.linkId}`;
  if (n.bookingId) return `/dashboard/bookings/${n.bookingId}`;
  if (n.galleryId) return `/dashboard/galleries/${n.galleryId}`;
  if (n.chatRoomId) return `/dashboard/chat?room=${n.chatRoomId}`;
  return "/dashboard";
}

function relative(iso: string) {
  try {
    return formatRelative(iso);
  } catch {
    return "";
  }
}

/**
 * Live notification centre: bell with unread badge plus a dropdown of history.
 * A Server-Sent Events connection keeps the badge in sync in real time.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const pathname = usePathname();

  const { data, mutate: refresh } = useSWR<NotificationListResponse>(open ? `/me/notifications?limit=25${filter === "unread" ? "&unread=1" : ""}` : null, {
    revalidateOnFocus: true,
  });
  const { data: unreadData } = useSWR<{ unread: number }>("/me/notifications/unread-count", { revalidateOnFocus: true });

  const unread = unreadData?.unread ?? data?.unread ?? 0;
  const items = data?.results ?? [];

  // Live updates over SSE; falls back to polling when the stream is unavailable.
  useEffect(() => {
    const token = tokenStore.access;
    const url = `/api/me/notifications/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    let es: EventSource | null = null;
    try {
      es = new EventSource(url, { withCredentials: true });
    } catch {
      es = null;
    }
    const onMessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { type: string; data?: { unread?: number } };
        if (typeof payload.data?.unread === "number") {
          void mutate("/me/notifications/unread-count", { unread: payload.data.unread }, { revalidate: false });
        }
        void refresh();
      } catch {
        /* ignore malformed frames */
      }
    };
    if (es) {
      es.addEventListener("notification", onMessage as EventListener);
      es.addEventListener("unread", onMessage as EventListener);
      es.addEventListener("notifications:read", onMessage as EventListener);
    }
    const poll = setInterval(() => {
      void mutate("/me/notifications/unread-count");
    }, 60_000);
    return () => {
      es?.close();
      clearInterval(poll);
    };
  }, [mutate, refresh]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const markRead = useCallback(
    async (id: number) => {
      setBusy(true);
      try {
        await api("/me/notifications/read", { method: "POST", body: { ids: [id] } });
        void refresh();
        void mutate("/me/notifications/unread-count");
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh, mutate],
  );

  const markAll = useCallback(async () => {
    setBusy(true);
    try {
      await api("/me/notifications/read-all", { method: "POST", body: {} });
      void refresh();
      void mutate("/me/notifications/unread-count");
      toast.success("All notifications marked as read");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [refresh, mutate]);

  const clearHistory = useCallback(async () => {
    setBusy(true);
    try {
      await api("/me/notifications/read", { method: "DELETE" });
      void refresh();
      toast.success("Cleared read notifications");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const openItem = useCallback(
    async (n: NotificationDTO) => {
      setOpen(false);
      if (!n.readAt) await markRead(n.id).catch(() => {});
      router.push(notificationHref(n));
    },
    [markRead, router],
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications — ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className={cn(
          "relative grid h-10 w-10 place-items-center rounded-xl border transition",
          open ? "border-gold-400/50 bg-gold-400/10 text-gold-200" : "border-white/[0.08] bg-white/[0.03] text-white/70 hover:border-white/20 hover:text-white",
        )}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full gold-fill px-1 text-[10px] font-bold leading-[18px] text-ink-950 shadow-[0_4px_14px_-4px_rgba(209,169,92,0.9)]">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="glass-strong absolute right-0 top-12 z-50 flex max-h-[min(76vh,620px)] w-[min(94vw,420px)] animate-scale-in flex-col overflow-hidden rounded-2xl shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
            <p className="font-display text-lg text-white">Notifications</p>
            {unread > 0 ? <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-semibold text-gold-200">{unread} new</span> : null}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilter((f) => (f === "all" ? "unread" : "all"))}
                className={cn("rounded-lg px-2 py-1 text-[11px] transition", filter === "unread" ? "bg-white/10 text-white" : "text-white/50 hover:text-white")}
              >
                {filter === "unread" ? "Unread" : "All"}
              </button>
              <button type="button" onClick={() => void markAll()} disabled={busy || !unread} title="Mark all as read" className="grid h-8 w-8 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-30">
                <CheckCheck className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} title="Close" className="grid h-8 w-8 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto">
            {!items.length ? (
              <div className="px-6 py-14 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-white/30">
                  <BellOff className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm text-white/60">You&apos;re all caught up</p>
                <p className="mt-1 text-xs text-white/35">Booking, payment, gallery and chat alerts will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {items.map((n) => {
                  const Icon = iconFor(n.type);
                  const meta = NOTIFICATION_TYPE_META[n.type];
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void openItem(n)}
                        className={cn("group flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]", !n.readAt && "bg-gold-400/[0.04]")}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border",
                            meta?.tone === "emerald"
                              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                              : meta?.tone === "rose"
                                ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
                                : meta?.tone === "sky"
                                  ? "border-sky-400/25 bg-sky-400/10 text-sky-200"
                                  : meta?.tone === "amber"
                                    ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
                                    : meta?.tone === "violet"
                                      ? "border-violet-400/25 bg-violet-400/10 text-violet-200"
                                      : "border-gold-400/25 bg-gold-400/10 text-gold-200",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-medium text-white">{n.title}</span>
                            {!n.readAt ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" /> : null}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-white/50">{n.message}</span>
                          <span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-white/30">{relative(n.createdAt)}</span>
                        </span>
                        {!n.readAt ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              void markRead(n.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.stopPropagation();
                                void markRead(n.id);
                              }
                            }}
                            title="Mark as read"
                            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/30 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-white/[0.07] px-3 py-2.5">
            <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-[11px] text-white/50 transition hover:text-white">
              Email history
            </Link>
            <button type="button" onClick={() => void clearHistory()} disabled={busy} className="ml-auto rounded-lg px-2 py-1 text-[11px] text-white/40 transition hover:text-rose-200 disabled:opacity-30">
              Clear read
            </button>
          </div>
        </div>
      ) : null}
      <span className="hidden" data-pathname={pathname} />
    </div>
  );
}
