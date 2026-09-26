import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, packages, type Package } from "@/db/schema";
import { created, intParam, notFound, parseBody, type Ctx, type PublicCtx } from "@/lib/http";
import type { PackageDTO } from "@/lib/shared";
import { packageCreateSchema, packageUpdateSchema } from "@/lib/validators";

function toPackageDTO(p: Package, bookingsCount?: number): PackageDTO {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description,
    priceCents: p.priceCents,
    durationMinutes: p.durationMinutes,
    depositPercent: p.depositPercent,
    features: p.features ?? [],
    deliverables: p.deliverables,
    coverUrl: p.coverUrl,
    popular: p.popular,
    active: p.active,
    sortOrder: p.sortOrder,
    bookingsCount,
  };
}

export async function listPackages(ctx: PublicCtx) {
  const isAdmin = ctx.user?.role === "admin";
  const includeInactive = isAdmin && ctx.query.get("all") === "1";
  const rows = await db
    .select({ pkg: packages, bookingsCount: sql<number>`(select count(*)::int from bookings b where b.package_id = "packages"."id")` })
    .from(packages)
    .where(includeInactive ? undefined : eq(packages.active, true))
    .orderBy(asc(packages.sortOrder), asc(packages.priceCents));
  return { results: rows.map((r) => toPackageDTO(r.pkg, isAdmin ? Number(r.bookingsCount) : undefined)) };
}

export async function getPackage(ctx: PublicCtx) {
  const id = intParam(ctx.params.id);
  const [row] = await db.select().from(packages).where(eq(packages.id, id)).limit(1);
  if (!row || (!row.active && ctx.user?.role !== "admin")) throw notFound("Package");
  return { package: toPackageDTO(row) };
}

export async function createPackage(ctx: Ctx) {
  const data = await parseBody(ctx.req, packageCreateSchema);
  const [row] = await db
    .insert(packages)
    .values({
      name: data.name,
      category: data.category,
      description: data.description ?? null,
      priceCents: data.priceCents,
      durationMinutes: data.durationMinutes,
      depositPercent: data.depositPercent ?? 30,
      features: data.features ?? [],
      deliverables: data.deliverables ?? null,
      coverUrl: data.coverUrl ?? null,
      popular: data.popular ?? false,
      active: data.active ?? true,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();
  return created({ package: toPackageDTO(row, 0) });
}

export async function updatePackage(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const data = await parseBody(ctx.req, packageUpdateSchema);
  const [row] = await db
    .update(packages)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(packages.id, id))
    .returning();
  if (!row) throw notFound("Package");
  return { package: toPackageDTO(row) };
}

export async function deletePackage(ctx: Ctx) {
  const id = intParam(ctx.params.id);
  const [existing] = await db.select({ id: packages.id }).from(packages).where(eq(packages.id, id)).limit(1);
  if (!existing) throw notFound("Package");
  const [{ value }] = await db.select({ value: count() }).from(bookings).where(eq(bookings.packageId, id));
  if (value > 0) {
    // Preserve booking history: archive instead of deleting.
    await db.update(packages).set({ active: false, updatedAt: new Date() }).where(eq(packages.id, id));
    return { archived: true, message: `Package archived — it is referenced by ${value} booking${value === 1 ? "" : "s"}.` };
  }
  await db.delete(packages).where(eq(packages.id, id));
  return { deleted: true };
}
