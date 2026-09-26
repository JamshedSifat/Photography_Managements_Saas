"use client";

import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { useEffect, useState, type ReactNode } from "react";
import { cn, hexToRgba, minutesToLabel, timeRangeLabel, toDateKey, type BookingDTO } from "@/lib/shared";

export type CalendarView = "day" | "week" | "month";

const WEEK_OPTS = { weekStartsOn: 1 as const };
const HOUR_PX = 64;

export function visibleRange(view: CalendarView, cursor: Date) {
  if (view === "day") return { from: cursor, to: cursor };
  if (view === "week") {
    const from = startOfWeek(cursor, WEEK_OPTS);
    return { from, to: addDays(from, 6) };
  }
  return { from: startOfWeek(startOfMonth(cursor), WEEK_OPTS), to: endOfWeek(endOfMonth(cursor), WEEK_OPTS) };
}

export function shiftCursor(view: CalendarView, cursor: Date, dir: 1 | -1) {
  if (view === "day") return addDays(cursor, dir);
  if (view === "week") return addWeeks(cursor, dir);
  return addMonths(cursor, dir);
}

export function rangeTitle(view: CalendarView, cursor: Date) {
  if (view === "day") return format(cursor, "EEEE, MMMM d, yyyy");
  if (view === "month") return format(cursor, "MMMM yyyy");
  const { from, to } = visibleRange("week", cursor);
  return `${format(from, "MMM d")} – ${format(to, isSameMonth(from, to) ? "d, yyyy" : "MMM d, yyyy")}`;
}

function colorOf(b: BookingDTO) {
  return b.photographer?.color ?? "#d1a95c";
}

function chipStyle(b: BookingDTO) {
  const c = colorOf(b);
  return {
    background: `linear-gradient(135deg, ${hexToRgba(c, b.status === "cancelled" ? 0.06 : 0.22)}, ${hexToRgba(c, b.status === "cancelled" ? 0.03 : 0.1)})`,
    borderColor: hexToRgba(c, b.status === "cancelled" ? 0.25 : 0.55),
  };
}

/** Assigns overlapping bookings to side-by-side lanes. */
function layoutColumn(items: BookingDTO[]) {
  const sorted = [...items].sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);
  const result: { booking: BookingDTO; lane: number; lanes: number }[] = [];
  let cluster: { booking: BookingDTO; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const c of cluster) result.push({ ...c, lanes });
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };
  for (const b of sorted) {
    if (cluster.length && b.startMinutes >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= b.startMinutes);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.endMinutes);
    } else laneEnds[lane] = b.endMinutes;
    cluster.push({ booking: b, lane });
    clusterEnd = Math.max(clusterEnd, b.endMinutes);
  }
  if (cluster.length) flush();
  return result;
}

type Column = { key: string; dateKey: string; label: ReactNode; today?: boolean; match: (b: BookingDTO) => boolean };

function TimeGrid({
  columns,
  bookings,
  startHour,
  endHour,
  onSelect,
  onCreate,
}: {
  columns: Column[];
  bookings: BookingDTO[];
  startHour: number;
  endHour: number;
  onSelect: (b: BookingDTO) => void;
  onCreate?: (dateKey: string, minutes: number) => void;
}) {
  const hours = Array.from({ length: Math.max(1, endHour - startHour) }, (_, i) => startHour + i);
  const height = hours.length * HOUR_PX;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const minCol = columns.length > 3 ? 120 : 180;
  const template = `56px repeat(${columns.length}, minmax(${minCol}px, 1fr))`;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.015]">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 56 + columns.length * minCol }}>
          <div className="grid border-b border-white/[0.08] bg-white/[0.02]" style={{ gridTemplateColumns: template }}>
            <div />
            {columns.map((c) => (
              <div key={c.key} className={cn("border-l border-white/[0.06] px-2 py-3 text-center", c.today && "bg-gold-400/[0.07]")}>
                {c.label}
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: template, height }}>
            <div className="relative">
              {hours.map((h, i) =>
                i === 0 ? null : (
                  <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-white/35" style={{ top: i * HOUR_PX }}>
                    {minutesToLabel(h * 60, true)}
                  </span>
                ),
              )}
            </div>
            {columns.map((col) => {
              const items = layoutColumn(bookings.filter(col.match));
              return (
                <div
                  key={col.key}
                  className={cn("relative border-l border-white/[0.06]", col.today && "bg-gold-400/[0.025]", onCreate && "cursor-crosshair")}
                  onDoubleClick={(e) => {
                    if (!onCreate) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const minutes = startHour * 60 + Math.floor(((y / HOUR_PX) * 60) / 30) * 30;
                    onCreate(col.dateKey, minutes);
                  }}
                >
                  {hours.map((h, i) => (
                    <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-white/[0.05]" style={{ top: i * HOUR_PX }} />
                  ))}
                  {hours.map((h, i) => (
                    <div key={`${h}-half`} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/[0.025]" style={{ top: i * HOUR_PX + HOUR_PX / 2 }} />
                  ))}
                  {col.today && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 ? (
                    <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: ((nowMinutes - startHour * 60) / 60) * HOUR_PX }}>
                      <span className="-ml-1 h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.9)]" />
                      <span className="h-px flex-1 bg-rose-400/70" />
                    </div>
                  ) : null}
                  {items.map(({ booking: b, lane, lanes }) => {
                    const top = ((b.startMinutes - startHour * 60) / 60) * HOUR_PX;
                    const h = Math.max(24, ((b.endMinutes - b.startMinutes) / 60) * HOUR_PX - 3);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onSelect(b)}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className={cn(
                          "absolute z-10 overflow-hidden rounded-xl border px-2 py-1.5 text-left text-[11px] leading-tight text-white backdrop-blur-sm transition duration-200 hover:z-30 hover:shadow-2xl hover:brightness-125",
                          b.status === "pending" && "border-dashed",
                          b.status === "cancelled" && "opacity-50",
                        )}
                        style={{ top: top + 1, height: h, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)`, ...chipStyle(b) }}
                      >
                        <span className="absolute inset-y-1 left-0 w-[3px] rounded-r-full" style={{ background: colorOf(b) }} />
                        <p className={cn("truncate pl-1 font-medium", b.status === "cancelled" && "line-through")}>{b.client.name}</p>
                        {h > 36 ? <p className="truncate pl-1 text-white/70">{b.title}</p> : null}
                        {h > 54 ? <p className="truncate pl-1 text-white/50">{timeRangeLabel(b.startMinutes, b.endMinutes)}</p> : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  cursor,
  bookings,
  onSelect,
  onSelectDay,
}: {
  cursor: Date;
  bookings: BookingDTO[];
  onSelect: (b: BookingDTO) => void;
  onSelectDay?: (d: Date) => void;
}) {
  const { from, to } = visibleRange("month", cursor);
  const days = eachDayOfInterval({ start: from, end: to });
  const byDay = new Map<string, BookingDTO[]>();
  for (const b of bookings) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b]);
  for (const list of byDay.values()) list.sort((a, b) => a.startMinutes - b.startMinutes);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
      <div className="grid grid-cols-7 border-b border-white/[0.08] bg-white/[0.02]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-2.5 text-center text-[10px] uppercase tracking-[0.22em] text-white/40 sm:text-left sm:px-3">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = toDateKey(day);
          const items = byDay.get(key) ?? [];
          const inMonth = isSameMonth(day, cursor);
          return (
            <div
              key={key}
              onClick={() => onSelectDay?.(day)}
              className={cn(
                "min-h-[84px] cursor-pointer border-b border-r border-white/[0.05] p-1.5 transition hover:bg-white/[0.03] sm:min-h-[124px] sm:p-2",
                !inMonth && "bg-black/25",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full text-xs",
                    isToday(day) ? "gold-fill font-semibold text-ink-950" : inMonth ? "text-white/80" : "text-white/25",
                  )}
                >
                  {format(day, "d")}
                </span>
                {items.length ? <span className="text-[10px] text-white/35">{items.length}</span> : null}
              </div>
              <div className="mt-1 hidden space-y-1 sm:block">
                {items.slice(0, 3).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(b);
                    }}
                    className={cn("block w-full truncate rounded-md border px-1.5 py-1 text-left text-[11px] text-white transition hover:brightness-125", b.status === "cancelled" && "line-through opacity-50")}
                    style={chipStyle(b)}
                  >
                    <span className="text-white/60">{minutesToLabel(b.startMinutes, true)}</span> {b.client.name}
                  </button>
                ))}
                {items.length > 3 ? <p className="px-1.5 text-[10px] text-white/40">+{items.length - 3} more</p> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1 sm:hidden">
                {items.slice(0, 4).map((b) => (
                  <span key={b.id} className="h-1.5 w-1.5 rounded-full" style={{ background: colorOf(b) }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Calendar({
  view,
  cursor,
  bookings,
  photographers,
  openMinutes,
  closeMinutes,
  onSelectBooking,
  onSelectDay,
  onCreateAt,
}: {
  view: CalendarView;
  cursor: Date;
  bookings: BookingDTO[];
  photographers?: { id: number; name: string; color: string | null }[];
  openMinutes: number;
  closeMinutes: number;
  onSelectBooking: (b: BookingDTO) => void;
  onSelectDay?: (d: Date) => void;
  onCreateAt?: (dateKey: string, minutes: number) => void;
}) {
  if (view === "month") return <MonthGrid cursor={cursor} bookings={bookings} onSelect={onSelectBooking} onSelectDay={onSelectDay} />;

  const relevant = view === "day" ? bookings.filter((b) => b.date === toDateKey(cursor)) : bookings;
  const startHour = Math.min(Math.floor(openMinutes / 60), ...relevant.map((b) => Math.floor(b.startMinutes / 60)));
  const endHour = Math.max(Math.ceil(closeMinutes / 60), ...relevant.map((b) => Math.ceil(b.endMinutes / 60)));

  let columns: Column[];
  if (view === "week") {
    const { from } = visibleRange("week", cursor);
    columns = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(from, i);
      const key = toDateKey(d);
      return {
        key,
        dateKey: key,
        today: isToday(d),
        match: (b: BookingDTO) => b.date === key,
        label: (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{format(d, "EEE")}</p>
            <p className={cn("mt-0.5 font-display text-xl", isToday(d) ? "gold-text" : "text-white")}>{format(d, "d")}</p>
          </div>
        ),
      };
    });
  } else {
    const key = toDateKey(cursor);
    const today = isToday(cursor);
    if (photographers?.length) {
      columns = photographers.map((p) => ({
        key: `p-${p.id}`,
        dateKey: key,
        today,
        match: (b: BookingDTO) => b.date === key && b.photographer?.id === p.id,
        label: (
          <div className="flex items-center justify-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color ?? "#d1a95c" }} />
            <span className="truncate text-xs text-white">{p.name}</span>
          </div>
        ),
      }));
      if (relevant.some((b) => !b.photographer || !photographers.some((p) => p.id === b.photographer?.id))) {
        columns.push({
          key: "unassigned",
          dateKey: key,
          today,
          match: (b: BookingDTO) => b.date === key && (!b.photographer || !photographers.some((p) => p.id === b.photographer?.id)),
          label: <span className="text-xs text-white/50">Unassigned</span>,
        });
      }
    } else {
      columns = [
        {
          key,
          dateKey: key,
          today,
          match: (b: BookingDTO) => b.date === key,
          label: <span className="text-xs text-white/70">{format(cursor, "EEEE, MMM d")}</span>,
        },
      ];
    }
  }

  return <TimeGrid columns={columns} bookings={relevant} startHour={startHour} endHour={endHour} onSelect={onSelectBooking} onCreate={onCreateAt} />;
}
