"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { CalendarCheck, FileText, ImageIcon, MessageSquare, Paperclip, Search, Send, Trash2, X } from "lucide-react";
import { api, errorMessage, tokenStore, uploadWithProgress } from "@/lib/client-api";
import { cn, formatDateTime, formatRelative, type ChatMessageDTO, type ChatRoomDTO, type ChatRoomDetailDTO } from "@/lib/shared";
import { useAuth } from "./providers";
import { Avatar, BookingStatusBadge, Button, EmptyState, PageLoader, Skeleton } from "./ui";

const MAX_BYTES = 15 * 1024 * 1024;

function sameDay(a: string, b: string) {
  return a.slice(0, 10) === b.slice(0, 10);
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function attachmentHref(m: ChatMessageDTO) {
  if (!m.attachmentUrl) return "#";
  return `/api/chat/files/${m.id}`;
}

function Attachment({ message, mine }: { message: ChatMessageDTO; mine: boolean }) {
  if (!message.attachmentUrl) return null;
  if (message.kind === "image") {
    return (
      <a href={attachmentHref(message)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-white/10">
        <img src={attachmentHref(message)} alt={message.attachmentName ?? "Shared image"} className="max-h-72 w-full object-cover transition duration-500 hover:scale-[1.02]" />
      </a>
    );
  }
  return (
    <a
      href={attachmentHref(message)}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition",
        mine ? "border-ink-950/15 bg-ink-950/5 hover:bg-ink-950/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
      )}
    >
      <FileText className="h-5 w-5 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate text-sm">{message.attachmentName ?? "Attachment"}</span>
        <span className="block text-[11px] opacity-60">{message.attachmentBytes ? `${Math.max(1, Math.round(message.attachmentBytes / 1024))} KB` : "Download"}</span>
      </span>
    </a>
  );
}

function Bubble({ message, mine, showSeen }: { message: ChatMessageDTO; mine: boolean; showSeen: boolean }) {
  return (
    <div className={cn("flex w-full gap-2.5", mine ? "justify-end" : "justify-start")}>
      {!mine ? <Avatar name={message.senderName} color={message.senderColor} size="sm" /> : null}
      <div className={cn("max-w-[min(78%,560px)]", mine ? "items-end" : "items-start")}>
        {!mine ? (
          <p className="mb-1 px-1 text-[11px] text-white/40">
            {message.senderName}
            <span className="ml-1.5 uppercase tracking-[0.14em] text-white/25">{message.senderRole}</span>
          </p>
        ) : null}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
            mine ? "gold-fill rounded-br-md text-ink-950" : "rounded-bl-md border border-white/[0.08] bg-white/[0.05] text-white",
          )}
        >
          {message.body && message.kind === "text" ? <p className="whitespace-pre-wrap break-words">{message.body}</p> : null}
          {message.attachmentUrl ? (
            <div className={cn(message.body && message.kind !== "text" ? "" : "mt-2 space-y-1.5")}>
              <Attachment message={message} mine={mine} />
              {message.body && message.kind !== "text" ? <p className={cn("text-xs", mine ? "text-ink-950/70" : "text-white/50")}>{message.body}</p> : null}
            </div>
          ) : null}
        </div>
        <p className={cn("mt-1 flex items-center gap-1.5 px-1 text-[10px] text-white/30", mine && "justify-end")}>
          <span>{timeLabel(message.createdAt)}</span>
          {mine && showSeen ? <span className="text-gold-300/80">· Seen</span> : null}
        </p>
      </div>
    </div>
  );
}

function TypingDots({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <Avatar name={name} size="sm" />
      <span className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-xs text-white/50">
        {name} is typing
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-1 animate-bounce rounded-full bg-gold-300" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </span>
      </span>
    </div>
  );
}

/** In-app booking chat: one private room per booking, live over SSE. */
export function BookingChat({ initialRoomId }: { initialRoomId?: number }) {
  const { user } = useAuth();
  const { mutate } = useSWRConfig();
  const [roomId, setRoomId] = useState<number | null>(initialRoomId ?? null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  const { data: roomsData, isLoading: roomsLoading } = useSWR<{ results: ChatRoomDTO[] }>("/chat/rooms");
  const rooms = useMemo(() => roomsData?.results ?? [], [roomsData]);
  // Fall back to the most recent conversation when nothing is explicitly selected
  // (the previous condition was inverted, leaving the pane stuck on a skeleton).
  const active = rooms.find((r) => r.id === roomId) ?? rooms[0] ?? null;
  const activeId = active?.id ?? null;

  const { data: detail, isLoading: detailLoading, mutate: refreshRoom } = useSWR<ChatRoomDetailDTO>(activeId ? `/chat/rooms/${activeId}` : null);
  const { data: searchData, isLoading: searching } = useSWR<{ results: (ChatMessageDTO & { roomId: number; bookingReference: string })[] }>(
    search.trim().length >= 2 && searchOpen ? `/chat/search?q=${encodeURIComponent(search.trim())}` : null,
  );

  const messages = useMemo(() => detail?.messages ?? [], [detail]);
  const lastMessageId = messages.length ? messages[messages.length - 1].id : 0;

  /**
   * Mark the room read when it is opened and whenever a newer message lands.
   * Keyed on the newest message id (not the `detail` object) so revalidations
   * that return identical data cannot spin up a read/mutate feedback loop.
   */
  useEffect(() => {
    if (!activeId) return;
    void api(`/chat/rooms/${activeId}/read`, { method: "POST", body: {} })
      .then(() => mutate("/chat/rooms"))
      .catch(() => {});
  }, [activeId, lastMessageId, mutate]);

  // keep the thread pinned to the newest message
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, activeId]);

  const sendTyping = useCallback(
    (typing: boolean) => {
      if (!activeId) return;
      void api(`/chat/rooms/${activeId}/typing`, { method: "POST", body: { typing } }).catch(() => {});
    },
    [activeId],
  );

  /**
   * Live message / typing / seen stream for the open room.
   *
   * The server sends *named* SSE events (`event: chat:message`), so each type needs its
   * own listener — a plain "message" listener never fires for named events, which is why
   * nothing used to sync until a manual refresh. The socket is re-established with
   * exponential backoff, and every reconnect revalidates the thread so no message that
   * arrived while offline is missed.
   */
  useEffect(() => {
    if (!activeId) return;
    let es: EventSource | null = null;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const applyMessage = (incoming: ChatMessageDTO) => {
      if (incoming.roomId !== activeId) return;
      // Merge into the cache directly so the bubble paints instantly for the sender
      // and every participant, then revalidate in the background.
     void refreshRoom(
  (current) => {
    if (!current) return current;

    const existingMessages = Array.isArray(current.messages)
      ? current.messages
      : [];

    if (existingMessages.some((m) => m.id === incoming.id)) {
      return current;
    }

    return {
      ...current,
      messages: [...existingMessages, incoming],
    };
  },
  { revalidate: false },
);
      void mutate("/chat/rooms");
    };

    const connect = () => {
      if (cancelled) return;
      const token = tokenStore.access;
      try {
        es = new EventSource(`/api/chat/rooms/${activeId}/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`, { withCredentials: true });
      } catch {
        return;
      }

      es.addEventListener("ready", () => {
        retry = 0;
        setConnected(true);
        // Re-sync after any gap in the connection.
        void refreshRoom();
        void mutate("/chat/rooms");
      });

      es.addEventListener("chat:message", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { data?: ChatMessageDTO };
          if (payload.data?.id) applyMessage(payload.data);
        } catch {
          void refreshRoom();
        }
      });

      es.addEventListener("chat:typing", (event) => {
        try {
          const { data } = JSON.parse((event as MessageEvent).data) as {
            data?: { userId?: number; name?: string; typing?: boolean; roomId?: number };
          };
          if (!data || data.roomId !== activeId) return;
          if (user && data.userId === user.id) return; // never echo our own typing back
          if (typingTimer.current) clearTimeout(typingTimer.current);
          if (data.typing === false) {
            setTypingName(null);
            return;
          }
          setTypingName(data.name ?? "Someone");
          typingTimer.current = setTimeout(() => setTypingName(null), 6000);
        } catch {
          /* ignore malformed frames */
        }
      });

      es.addEventListener("chat:seen", (event) => {
  try {
    const { data } = JSON.parse((event as MessageEvent).data) as {
      data?: { userId?: number; lastReadMessageId?: number; roomId?: number };
    };

    if (!data || data.roomId !== activeId || data.userId == null) return;

    const seenUpTo = data.lastReadMessageId ?? 0;
    const reader = data.userId;

    void refreshRoom(
      (current) => {
        if (!current) return current;

        const existingMessages = Array.isArray(current.messages)
          ? current.messages
          : [];

        return {
          ...current,
          messages: existingMessages.map((m) =>
            m.id <= seenUpTo &&
            m.senderId !== reader &&
            !m.seenBy.includes(reader)
              ? { ...m, seenBy: [...m.seenBy, reader] }
              : m
          ),
        };
      },
      { revalidate: false }
    );
  } catch {
    /* ignore malformed frames */
  }
});

     es.addEventListener("chat:deleted", (event) => {
  try {
    const { data } = JSON.parse((event as MessageEvent).data) as {
      data?: { id?: number; roomId?: number };
    };

    if (!data?.id || data.roomId !== activeId) return;

    const removed = data.id;

    void refreshRoom(
      (current) => {
        if (!current) return current;

        const existingMessages = Array.isArray(current.messages)
          ? current.messages
          : [];

        return {
          ...current,
          messages: existingMessages.filter((m) => m.id !== removed),
        };
      },
      { revalidate: false }
    );

    void mutate("/chat/rooms");
  } catch {
    /* ignore malformed frames */
  }
});

      es.onerror = () => {
        setConnected(false);
        es?.close();
        es = null;
        if (cancelled) return;
        // Exponential backoff, capped at 15s, so a dropped or expired stream always recovers.
        retry += 1;
        reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** (retry - 1), 15_000));
      };
    };

    connect();
    return () => {
      cancelled = true;
      setConnected(false);
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [activeId, refreshRoom, mutate, user]);

  async function submit() {
    if (!activeId) return;
    const text = draft.trim();
    if (!text && !attachment) return;
    setSending(true);
    setProgress(attachment ? 0 : null);
    try {
      let response: { messages: ChatMessageDTO[] } | null = null;
      if (attachment) {
        const fd = new FormData();
        fd.append("files", attachment);
        if (text) fd.append("body", text);
        response = await uploadWithProgress<{ messages: ChatMessageDTO[] }>(`/chat/rooms/${activeId}/messages`, fd, setProgress);
      } else {
        response = await api<{ messages: ChatMessageDTO[] }>(`/chat/rooms/${activeId}/messages`, { method: "POST", body: { body: text } });
      }
      setDraft("");
      setAttachment(null);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
      lastTypingSent.current = 0;
      sendTyping(false);
      // Paint the sender's own message straight away; the stream de-duplicates by id.
          const sent = response?.messages ?? [];

      if (sent.length) {
        void refreshRoom(
          (current) => {
            if (!current) return current;

            const existingMessages = Array.isArray(current.messages)
              ? current.messages
              : [];

            return {
              ...current,
              messages: [
                ...existingMessages,
                ...sent.filter(
                  (m) => !existingMessages.some((x) => x.id === m.id)
                ),
              ],
            };
          },
          { revalidate: false }
        );

        void mutate("/chat/rooms");
      } else {
        void refreshRoom();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
      setProgress(null);
    }
  }

  async function remove(id: number) {
    try {
      await api(`/chat/messages/${id}`, { method: "DELETE" });
      void refreshRoom();
      toast.success("Message deleted");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  if (roomsLoading) return <PageLoader label="Opening conversations…" />;

  if (!rooms.length) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No conversations yet"
        description="Every booking gets a private chat room linking you, your photographer and the studio. Book a session to start one."
        action={
          <Link href="/dashboard/bookings/new" className="text-sm text-gold-300 underline-offset-4 hover:underline">
            Book a session
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter conversations…"
            className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-10 pr-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-gold-400/50"
          />
        </div>
        <div className="no-scrollbar max-h-[calc(100vh-230px)] space-y-2 overflow-y-auto pr-1 lg:sticky lg:top-24">
          {rooms
            .filter((r) => {
              const q = query.trim().toLowerCase();
              if (!q) return true;
              return (
                r.bookingReference.toLowerCase().includes(q) ||
                r.bookingTitle.toLowerCase().includes(q) ||
                r.clientName.toLowerCase().includes(q) ||
                (r.photographerName ?? "").toLowerCase().includes(q)
              );
            })
            .map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRoomId(r.id)}
                className={cn(
                  "w-full rounded-2xl border p-3 text-left transition",
                  r.id === activeId ? "border-gold-400/50 bg-gold-400/[0.07]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/20",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-white">{r.bookingReference}</span>
                  <BookingStatusBadge status={r.bookingStatus} />
                  {r.unread > 0 ? <span className="ml-auto grid min-w-[20px] place-items-center rounded-full gold-fill px-1.5 text-[10px] font-bold leading-5 text-ink-950">{r.unread}</span> : null}
                </div>
                <p className="mt-1 truncate text-xs text-white/50">{r.bookingTitle}</p>
                <p className="mt-1 truncate text-[11px] text-white/35">
                  {r.clientName} · {r.photographerName ?? "unassigned"}
                </p>
                {r.lastMessage ? <p className="mt-1.5 line-clamp-1 text-[11px] text-white/45">{r.lastMessage}</p> : null}
                <p className="mt-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/25">
                  <CalendarCheck className="h-3 w-3" /> {r.bookingDate}
                </p>
              </button>
            ))}
        </div>
      </div>

      {active ? (
        <div className="glass flex min-h-[560px] flex-col overflow-hidden rounded-3xl">
          <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
            <Avatar name={active.clientName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {active.clientName}
                {active.photographerName ? <span className="text-white/40"> · {active.photographerName}</span> : null}
              </p>
              <p className="truncate text-[11px] text-white/40">
                {active.bookingTitle} · {active.bookingDate} · {active.bookingReference}
              </p>
            </div>
            <span
              title={connected ? "Live — messages arrive instantly" : "Reconnecting…"}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] transition",
                connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-300" : "animate-pulse bg-amber-300")} />
              {connected ? "Live" : "Reconnecting"}
            </span>
            <Button variant="outline" size="sm" onClick={() => setSearchOpen((v) => !v)}>
              <Search className="h-3.5 w-3.5" /> Search
            </Button>
            <Link href={`/dashboard/bookings/${active.bookingId}`}>
              <Button variant="ghost" size="sm">
                <CalendarCheck className="h-3.5 w-3.5" /> Booking
              </Button>
            </Link>
          </header>

          {searchOpen ? (
            <div className="border-b border-white/[0.07] px-4 py-3 sm:px-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search every conversation…"
                  className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-10 pr-9 text-sm text-white placeholder:text-white/30 outline-none focus:border-gold-400/50"
                />
                {search ? (
                  <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {search.trim().length >= 2 ? (
                <div className="no-scrollbar mt-3 max-h-48 space-y-1.5 overflow-y-auto">
                  {searching ? <Skeleton className="h-10" /> : null}
                  {!searching && !searchData?.results.length ? <p className="text-xs text-white/40">No messages matched “{search}”.</p> : null}
                  {searchData?.results.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setRoomId(m.roomId);
                        setSearchOpen(false);
                      }}
                      className="flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-white/5"
                    >
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-white">{m.body}</span>
                        <span className="block text-[10px] text-white/35">
                          {m.senderName} · {m.bookingReference} · {formatRelative(m.createdAt)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div ref={threadRef} className="no-scrollbar flex-1 space-y-3.5 overflow-y-auto px-4 py-4 sm:px-5">
            {detailLoading && !detail ? <Skeleton className="h-40" /> : null}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const me = user != null && m.senderId === user.id;
              return (
                <div key={m.id}>
                  {!prev || !sameDay(prev.createdAt, m.createdAt) ? (
                    <p className="my-4 text-center text-[10px] uppercase tracking-[0.24em] text-white/25">{formatDateTime(m.createdAt)}</p>
                  ) : null}
                  <div className="group relative flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <Bubble message={m} mine={me} showSeen={me && m.seenBy.length > 1} />
                    </div>
                    {me ? (
                      <button
                        type="button"
                        onClick={() => void remove(m.id)}
                        title="Delete message"
                        className="shrink-0 rounded-lg p-1.5 text-white/25 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-200 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {typingName ? <TypingDots name={typingName} /> : null}
          </div>

          <footer className="border-t border-white/[0.07] px-4 py-3 sm:px-5">
            {attachment ? (
              <div className="mb-2.5 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                {attachment.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-gold-300" /> : <Paperclip className="h-4 w-4 text-gold-300" />}
                <span className="min-w-0 flex-1 truncate text-xs text-white/70">{attachment.name}</span>
                <button type="button" onClick={() => setAttachment(null)} className="text-white/40 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            {progress != null ? (
              <div className="mb-2.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full gold-fill transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-white/40">Uploading… {progress}%</p>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" hidden multiple onChange={(e) => e.target.files?.[0] && setAttachment(e.target.files[0])} />
              <Button type="button" variant="ghost" size="icon" aria-label="Attach a file" onClick={() => fileRef.current?.click()}>
                <Paperclip className="h-4 w-4" />
              </Button>
              <textarea
                value={draft}
                rows={1}
                onChange={(e) => {
                  setDraft(e.target.value);
                  const now = Date.now();
                  if (now - lastTypingSent.current > 1800) {
                    lastTypingSent.current = now;
                    sendTyping(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                placeholder="Write a message… (Enter to send)"
                className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-gold-400/50"
              />
              <Button type="button" size="icon" aria-label="Send message" loading={sending} onClick={() => void submit()} disabled={!draft.trim() && !attachment}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-white/25">This conversation is permanently linked to booking {active.bookingReference}.</p>
          </footer>
        </div>
            ) : (
        <Skeleton className="min-h-[560px]" />
      )}
    </div>
  );
}

  