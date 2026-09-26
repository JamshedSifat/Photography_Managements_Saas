import { and, asc, desc, eq, gte, ilike, lte, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { availabilityOverrides, leaveRequests, photographerWeeklyHours, users } from "@/db/schema";
import { availabilitySlots, leaveCreatesOverrides, overridesFor, upsertDefaultHours } from "@/lib/availability";
import { getSettings } from "@/lib/booking";
import { sendEmail } from "@/lib/email";
import { ApiError, created, forbidden, intParam, notFound, parseBody, type Ctx } from "@/lib/http";
import { formatDateKey, type AvailabilitySlotDTO, type LeaveRequestDTO } from "@/lib/shared";
import { availabilityOverrideSchema, availabilitySlotSchema, leaveCreateSchema, leaveReviewSchema } from "@/lib/validators";

function photographerId(ctx: Ctx, requested?: number) {
  if (ctx.user.role === "photographer") return ctx.user.id;
  if (!requested) throw new ApiError(400, "Select a photographer.");
  return requested;
}

function validRange(start: number, end: number) {
  if (end <= start) throw new ApiError(400, "End time must be after start time.");
  if (start % 5 !== 0 || end % 5 !== 0) throw new ApiError(400, "Times must use 5-minute increments.");
}

export async function manage(ctx: Ctx) {
  await upsertDefaultHours();
  const pid = photographerId(ctx, Number(ctx.query.get("photographerId")) || undefined);
  const from = ctx.query.get("from") ?? undefined;
  const to = ctx.query.get("to") ?? undefined;
  const [photographer, slots, overrides, leaves] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, color: users.color }).from(users).where(and(eq(users.id, pid), eq(users.role, "photographer"))).limit(1),
    availabilitySlots(db, pid),
    overridesFor(db, pid, from, to),
    leaveListFor(ctx, pid, from, to),
  ]);
  if (!photographer[0]) throw notFound("Photographer");
  return { photographer: photographer[0], slots, overrides, leaves };
}

export async function saveWeekly(ctx: Ctx) {
  const body = (await ctx.req.json()) as { photographerId?: number; slots?: unknown };
  const pid = photographerId(ctx, Number(body.photographerId) || undefined);
  const list = Array.isArray(body.slots) ? body.slots.map((s) => availabilitySlotSchema.parse({ ...(s as Record<string, unknown>), photographerId: pid })) : [];
  for (const slot of list) validRange(slot.startMinutes, slot.endMinutes);
  if (list.some((s) => s.weekday == null)) throw new ApiError(400, "Each weekly slot needs a weekday.");
  await db.transaction(async (tx) => {
    await tx.delete(photographerWeeklyHours).where(eq(photographerWeeklyHours.photographerId, pid));
    if (list.length) await tx.insert(photographerWeeklyHours).values(list.map((s) => ({ photographerId: pid, weekday: s.weekday, startMinutes: s.startMinutes, endMinutes: s.endMinutes, label: s.label ?? null, enabled: s.enabled ?? true })));
  });
  return { slots: await availabilitySlots(db, pid) };
}

export async function createOverride(ctx: Ctx) {
  const data = await parseBody(ctx.req, availabilityOverrideSchema);
  const pid = data.photographerId == null ? null : photographerId(ctx, data.photographerId);
  if (data.startMinutes != null || data.endMinutes != null) {
    if (data.startMinutes == null || data.endMinutes == null) throw new ApiError(400, "Provide both start and end times for a partial override.");
    validRange(data.startMinutes, data.endMinutes);
  }
  if (["blocked", "holiday", "leave"].includes(data.kind) && data.startMinutes != null) throw new ApiError(400, "Full-day blocks cannot include a time range.");
  const [row] = await db.insert(availabilityOverrides).values({ photographerId: pid, date: data.date, kind: data.kind, startMinutes: data.startMinutes ?? null, endMinutes: data.endMinutes ?? null, reason: data.reason ?? null, createdById: ctx.user.id }).returning();
  return created({ override: { id: row.id, photographerId: row.photographerId, date: row.date, kind: row.kind, startMinutes: row.startMinutes, endMinutes: row.endMinutes, reason: row.reason } });
}

export async function deleteOverride(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [row] = await db.delete(availabilityOverrides).where(eq(availabilityOverrides.id, id)).returning({ id: availabilityOverrides.id });
  if (!row) throw notFound("Availability override");
  return { deleted: true };
}

async function leaveListFor(ctx: Ctx, pid?: number, from?: string, to?: string) {
  const conds = [ctx.user.role === "photographer" ? eq(leaveRequests.photographerId, ctx.user.id) : pid ? eq(leaveRequests.photographerId, pid) : undefined, from ? gte(leaveRequests.endDate, from) : undefined, to ? lte(leaveRequests.startDate, to) : undefined].filter(Boolean);
  const rows = await db.select({ leave: leaveRequests, photographerName: users.name }).from(leaveRequests).innerJoin(users, eq(leaveRequests.photographerId, users.id)).where(conds.length ? and(...(conds as Parameters<typeof and>)) : undefined).orderBy(desc(leaveRequests.createdAt));
  return rows.map((r): LeaveRequestDTO => ({ id: r.leave.id, photographerId: r.leave.photographerId, photographerName: r.photographerName, startDate: r.leave.startDate, endDate: r.leave.endDate, reason: r.leave.reason, status: r.leave.status, adminNote: r.leave.adminNote, reviewedAt: r.leave.reviewedAt?.toISOString() ?? null, createdAt: r.leave.createdAt.toISOString() }));
}

export async function listLeaves(ctx: Ctx) {
  return { results: await leaveListFor(ctx, ctx.user.role === "photographer" ? ctx.user.id : Number(ctx.query.get("photographerId")) || undefined, ctx.query.get("from") ?? undefined, ctx.query.get("to") ?? undefined) };
}

export async function createLeave(ctx: Ctx) {
  if (ctx.user.role !== "photographer") throw forbidden("Only photographers can submit leave requests.");
  const data = await parseBody(ctx.req, leaveCreateSchema);
  if (data.endDate < data.startDate) throw new ApiError(400, "End date must be on or after start date.");
  const [overlap] = await db.select({ id: leaveRequests.id }).from(leaveRequests).where(and(eq(leaveRequests.photographerId, ctx.user.id), inDate(data.startDate, data.endDate), or(eq(leaveRequests.status, "pending"), eq(leaveRequests.status, "approved")))).limit(1);
  if (overlap) throw new ApiError(409, "You already have a pending or approved leave request overlapping these dates.");
  const [row] = await db.insert(leaveRequests).values({ photographerId: ctx.user.id, startDate: data.startDate, endDate: data.endDate, reason: data.reason }).returning();
  return created({ leave: (await leaveListFor(ctx, ctx.user.id)).find((l) => l.id === row.id) });
}

function inDate(start: string, end: string) {
  return sql`${leaveRequests.startDate} <= ${end} and ${leaveRequests.endDate} >= ${start}`;
}

async function notifyLeave(leaveId: number, status: "approved" | "rejected", adminNote: string | null) {
  const [row] = await db.select({ leave: leaveRequests, photographer: { name: users.name, email: users.email } }).from(leaveRequests).innerJoin(users, eq(leaveRequests.photographerId, users.id)).where(eq(leaveRequests.id, leaveId)).limit(1);
  if (!row) return;
  const s = await getSettings();
  await sendEmail({ to: row.photographer.email, toName: row.photographer.name, subject: `Leave request ${status} · ${formatDateKey(row.leave.startDate, "short")} – ${formatDateKey(row.leave.endDate, "short")}`, html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2 style="font-family:Georgia,serif;font-weight:400">Leave request ${status}</h2><p>Hi ${row.photographer.name.split(" ")[0]}, your leave request for <strong>${formatDateKey(row.leave.startDate, "long")} – ${formatDateKey(row.leave.endDate, "long")}</strong> was <strong>${status}</strong>.</p>${adminNote ? `<p>Admin note: ${adminNote}</p>` : ""}<p style="color:#777">${s.studioName}</p></div>`, type: "leave_status" });
}

export async function reviewLeave(ctx: Ctx) {
  if (ctx.user.role !== "admin") throw forbidden();
  const id = intParam(ctx.params.id);
  const data = await parseBody(ctx.req, leaveReviewSchema);
  const [leave] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!leave) throw notFound("Leave request");
  if (leave.status !== "pending") throw new ApiError(400, "This leave request has already been reviewed.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(leaveRequests).set({ status: data.status, adminNote: data.adminNote ?? null, reviewedById: ctx.user.id, reviewedAt: now, updatedAt: now }).where(eq(leaveRequests.id, id));
    if (data.status === "approved") await leaveCreatesOverrides(tx, { photographerId: leave.photographerId, startDate: leave.startDate, endDate: leave.endDate, id, createdById: ctx.user.id });
  });
  await notifyLeave(id, data.status, data.adminNote ?? null);
  return { leave: (await leaveListFor(ctx, leave.photographerId)).find((l) => l.id === id) };
}
