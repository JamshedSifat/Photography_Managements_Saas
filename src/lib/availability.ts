import { and, asc, eq, inArray, isNull, lte, gte, or } from "drizzle-orm";
import { db } from "@/db";
import { availabilityOverrides, leaveRequests, photographerWeeklyHours, studioSettings, users } from "@/db/schema";
import { dayOfWeek, type AvailabilityOverrideKind, type AvailabilitySlotDTO, type AvailabilityOverrideDTO, type SessionUser } from "./shared";
import type { DbLike } from "./booking";

export type Window = { startMinutes: number; endMinutes: number; label?: string | null };

export async function weeklyHours(exec: DbLike, photographerId?: number) {
  const rows = await exec
    .select()
    .from(photographerWeeklyHours)
    .where(photographerId ? eq(photographerWeeklyHours.photographerId, photographerId) : undefined)
    .orderBy(asc(photographerWeeklyHours.photographerId), asc(photographerWeeklyHours.weekday), asc(photographerWeeklyHours.startMinutes));
  return rows;
}

function subtractWindows(windows: Window[], start: number, end: number) {
  const out: Window[] = [];
  for (const w of windows) {
    if (end <= w.startMinutes || start >= w.endMinutes) {
      out.push(w);
      continue;
    }
    if (start > w.startMinutes) out.push({ ...w, endMinutes: Math.min(start, w.endMinutes) });
    if (end < w.endMinutes) out.push({ ...w, startMinutes: Math.max(end, w.startMinutes) });
  }
  return out.filter((w) => w.endMinutes > w.startMinutes);
}

/** Resolves a photographer's real working windows for one wall-clock date. */
export async function windowsForDate(exec: DbLike, photographerId: number, date: string, defaults: { openMinutes: number; closeMinutes: number }) {
  const weekday = dayOfWeek(date);
  const weekly = await exec
    .select()
    .from(photographerWeeklyHours)
    .where(and(eq(photographerWeeklyHours.photographerId, photographerId), eq(photographerWeeklyHours.weekday, weekday), eq(photographerWeeklyHours.enabled, true)))
    .orderBy(asc(photographerWeeklyHours.startMinutes));
  let windows: Window[] = weekly.length
    ? weekly.map((w) => ({ startMinutes: w.startMinutes, endMinutes: w.endMinutes, label: w.label }))
    : [{ startMinutes: defaults.openMinutes, endMinutes: defaults.closeMinutes }];

  const overrides = await exec
    .select()
    .from(availabilityOverrides)
    .where(and(eq(availabilityOverrides.date, date), or(isNull(availabilityOverrides.photographerId), eq(availabilityOverrides.photographerId, photographerId))))
    .orderBy(asc(availabilityOverrides.photographerId));
  const hardBlock = overrides.some((o) => ["blocked", "holiday", "leave"].includes(o.kind));
  if (hardBlock) return [];
  const available = overrides.filter((o) => o.kind === "available" && o.startMinutes != null && o.endMinutes != null);
  if (available.length) windows = available.map((o) => ({ startMinutes: o.startMinutes!, endMinutes: o.endMinutes!, label: o.reason }));
  for (const b of overrides.filter((o) => o.kind === "break" && o.startMinutes != null && o.endMinutes != null)) {
    windows = subtractWindows(windows, b.startMinutes!, b.endMinutes!);
  }
  return windows.filter((w) => w.endMinutes > w.startMinutes);
}

export async function photographerAvailableAt(exec: DbLike, photographerId: number, date: string, start: number, end: number, defaults: { openMinutes: number; closeMinutes: number }) {
  const windows = await windowsForDate(exec, photographerId, date, defaults);
  return windows.some((w) => start >= w.startMinutes && end <= w.endMinutes);
}

export async function availabilitySlots(exec: DbLike, photographerId: number, weekday?: number): Promise<AvailabilitySlotDTO[]> {
  const rows = await exec
    .select()
    .from(photographerWeeklyHours)
    .where(and(eq(photographerWeeklyHours.photographerId, photographerId), weekday == null ? undefined : eq(photographerWeeklyHours.weekday, weekday)))
    .orderBy(asc(photographerWeeklyHours.weekday), asc(photographerWeeklyHours.startMinutes));
  return rows.map((r) => ({ id: r.id, photographerId: r.photographerId, weekday: r.weekday, startMinutes: r.startMinutes, endMinutes: r.endMinutes, label: r.label, enabled: r.enabled }));
}

export async function overridesFor(exec: DbLike, photographerId?: number, from?: string, to?: string): Promise<AvailabilityOverrideDTO[]> {
  const conds = [photographerId ? or(isNull(availabilityOverrides.photographerId), eq(availabilityOverrides.photographerId, photographerId)) : undefined, from ? gte(availabilityOverrides.date, from) : undefined, to ? lte(availabilityOverrides.date, to) : undefined].filter(Boolean);
  const rows = await exec.select().from(availabilityOverrides).where(conds.length ? and(...(conds as Parameters<typeof and>)) : undefined).orderBy(asc(availabilityOverrides.date));
  return rows.map((r) => ({ id: r.id, photographerId: r.photographerId, date: r.date, kind: r.kind, startMinutes: r.startMinutes, endMinutes: r.endMinutes, reason: r.reason }));
}

export async function upsertDefaultHours(exec: DbLike = db) {
  const photographers = await exec.select({ id: users.id }).from(users).where(and(eq(users.role, "photographer"), eq(users.active, true)));
  for (const p of photographers) {
    const existing = await exec.select({ id: photographerWeeklyHours.id }).from(photographerWeeklyHours).where(eq(photographerWeeklyHours.photographerId, p.id)).limit(1);
    if (!existing.length) {
      await exec.insert(photographerWeeklyHours).values([1, 2, 3, 4, 5, 6].map((weekday) => ({ photographerId: p.id, weekday, startMinutes: 540, endMinutes: 1140, label: "Studio hours" })));
    }
  }
}

export async function leaveCreatesOverrides(exec: DbLike, leave: { photographerId: number; startDate: string; endDate: string; id?: number; createdById?: number | null }) {
  const start = new Date(`${leave.startDate}T00:00:00Z`);
  const end = new Date(`${leave.endDate}T00:00:00Z`);
  const rows: Array<typeof availabilityOverrides.$inferInsert> = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    rows.push({ photographerId: leave.photographerId, date: d.toISOString().slice(0, 10), kind: "leave", reason: `Approved leave${leave.id ? ` #${leave.id}` : ""}`, createdById: leave.createdById ?? null });
  }
  if (rows.length) await exec.insert(availabilityOverrides).values(rows);
}
