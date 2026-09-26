/**
 * Real-time transport.
 *
 * The studio stack runs on Next.js route handlers, which cannot upgrade an HTTP
 * request into a raw WebSocket, so live updates are pushed over **Server-Sent
 * Events** (a standards-based, one-way push channel that needs no extra server or
 * proxy configuration). Clients POST mutations over the normal REST API and receive
 * the resulting events instantly on their open stream — the same pattern Django
 * Channels uses, expressed with the primitives this stack supports.
 *
 * A tiny in-process pub/sub fans events out to the connected browsers. Events are
 * always persisted first (notifications, chat messages), so a client that reconnects
 * simply re-syncs from the REST API and never loses history.
 */

export type RealtimeEvent = {
  id: string;
  channel: string;
  type: string;
  data: unknown;
  at: string;
};

type Listener = (event: RealtimeEvent) => void;

const channels = new Map<string, Set<Listener>>();
let counter = 0;

export function channelForUser(userId: number) {
  return `user:${userId}`;
}

/** Subscribes to a channel. Returns an unsubscribe function. */
export function subscribe(channel: string, listener: Listener) {
  const set = channels.get(channel) ?? new Set<Listener>();
  set.add(listener);
  channels.set(channel, set);
  return () => {
    const current = channels.get(channel);
    if (!current) return;
    current.delete(listener);
    if (!current.size) channels.delete(channel);
  };
}

/** Publishes an event to every subscriber of a channel (and mirrors it to a room fan-out). */
export function publish(channel: string, type: string, data: unknown) {
  const event: RealtimeEvent = { id: `${Date.now()}-${++counter}`, channel, type, data, at: new Date().toISOString() };
  const listeners = channels.get(channel);
  if (!listeners?.size) return 0;
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (err) {
      console.warn("[realtime] listener failed", (err as Error)?.message);
    }
  }
  return listeners.size;
}

export function publishToUsers(userIds: number[], type: string, data: unknown) {
  let delivered = 0;
  for (const id of new Set(userIds)) delivered += publish(channelForUser(id), type, data);
  return delivered;
}

export function connectedChannels() {
  return [...channels.keys()].filter((c) => (channels.get(c)?.size ?? 0) > 0);
}

/** Formats an SSE frame. */
export function sseFrame(event: RealtimeEvent | { type: "ping" }) {
  return `id: ${"id" in event ? event.id : "ping"}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
