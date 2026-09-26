import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { availabilityOverrides, bookings, galleries, photographerWeeklyHours, photos, reviews, users } from "@/db/schema";
import { getSettings } from "@/lib/booking";
import { windowsForDate } from "@/lib/availability";
import { intParam, notFound, type Ctx, type PublicCtx } from "@/lib/http";
import { addDaysToKey, dayOfWeek, zonedNow, type PhotographerProfileDTO, type PortfolioItem, type ReviewDTO } from "@/lib/shared";
import { listPhotographerReviews, ratingAverage, ratingBreakdown } from "./reviews";

/**
 * Public photographer profiles: portfolio, experience, specialties, completed projects,
 * ratings/reviews and the live availability schedule shown during booking.
 */

const PORTFOLIO_FALLBACK: PortfolioItem[] = [
  { id: "p1", url: "https://images.pexels.com/photos/19816937/pexels-photo-19816937.jpeg?auto=compress&cs=tinysrgb&w=1200", caption: "Golden hour vows", category: "Weddings" },
  { id: "p2", url: "https://images.pexels.com/photos/36720012/pexels-photo-36720012.jpeg?auto=compress&cs=tinysrgb&w=1200", caption: "Editorial portrait study", category: "Portraits" },
  { id: "p3", url: "https://images.pexels.com/photos/29285937/pexels-photo-29285937.jpeg?auto=compress&cs=tinysrgb&w=1200", caption: "Engagement session", category: "Engagements" },
  { id: "p4", url: "https://images.pexels.com/photos/38079943/pexels-photo-38079943.jpeg?auto=compress&cs=tinysrgb&w=1200", caption: "Family studio moment", category: "Family" },
  { id: "p5", url: "https://images.pexels.com/photos/28863299/pexels-photo-28863299.jpeg?auto=compress&cs=tinysrgb&w=1200", caption: "Dramatic light portrait", category: "Portraits" },
  { id: "p6", url: "https://images.pexels.com/photos/36986688/pexels-photo-36986688.jpeg?auto=compress&cs=tinysrgb&w=1200", caption: "Sunset couple session", category: "Engagements" },
];

export async function getPhotographerProfile(id: number): Promise<PhotographerProfileDTO> {
  const [user] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, "photographer"))).limit(1);
  if (!user) throw notFound("Photographer");

  const settings = await getSettings();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [reviews, breakdown, completed, weekly, galleryWork] = await Promise.all([
    listPhotographerReviews(id),
    ratingBreakdown(id),
    db
      .select({ value: count() })
      .from(bookings)
      .where(and(eq(bookings.photographerId, id), eq(bookings.status, "completed"))),
    db
      .select()
      .from(photographerWeeklyHours)
      .where(and(eq(photographerWeeklyHours.photographerId, id), eq(photographerWeeklyHours.enabled, true)))
      .orderBy(asc(photographerWeeklyHours.weekday), asc(photographerWeeklyHours.startMinutes)),
    db
      .select({ id: photos.id, url: photos.url, thumbUrl: photos.thumbUrl, publicId: photos.publicId, provider: photos.provider })
      .from(photos)
      .innerJoin(galleries, eq(photos.galleryId, galleries.id))
      .innerJoin(bookings, eq(galleries.bookingId, bookings.id))
      .where(and(eq(bookings.photographerId, id), eq(galleries.status, "published")))
      .orderBy(desc(photos.id))
      .limit(12),
  ]);

  const portfolio: PortfolioItem[] = user.portfolio?.length
    ? user.portfolio
    : galleryWork.length
      ? galleryWork.map((p, i) => ({
          id: String(p.id),
          url: p.thumbUrl ?? p.url ?? PORTFOLIO_FALLBACK[i % PORTFOLIO_FALLBACK.length].url,
          caption: "Delivered client work",
          category: "Portfolio",
        }))
      : PORTFOLIO_FALLBACK;

  // First upcoming date with at least one genuinely available slot.
  let nextAvailable: { date: string; slots: number } | null = null;
  for (let i = 0; i < 21 && !nextAvailable; i++) {
    const date = addDaysToKey(todayKey, i);
    if (!settings.workingDays.includes(dayOfWeek(date))) continue;
    const windows = await windowsForDate(db, id, date, settings);
    if (!windows.length) continue;
    const busy = await db
      .select({ startMinutes: bookings.startMinutes, endMinutes: bookings.endMinutes })
      .from(bookings)
      .where(and(eq(bookings.photographerId, id), eq(bookings.date, date), sql`${bookings.status} <> 'cancelled'`));
    let slots = 0;
    for (let start = settings.openMinutes; start + 60 <= settings.closeMinutes; start += settings.slotIntervalMinutes) {
      const end = start + 60;
      const inWindow = windows.some((w) => start >= w.startMinutes && end <= w.endMinutes);
      const free = !busy.some((b) => start < b.endMinutes && end > b.startMinutes);
      if (inWindow && free) slots++;
    }
    if (slots > 0) nextAvailable = { date, slots };
  }

  return {
    id: user.id,
    name: user.name,
    headline: user.headline,
    specialty: user.specialty,
    bio: user.bio,
    location: user.location,
    experienceYears: user.experienceYears ?? 0,
    specialties: user.specialties?.length ? user.specialties : user.specialty ? [user.specialty] : [],
    portfolio,
    avatarUrl: user.avatarUrl,
    color: user.color,
    email: null,
    phone: null,
    ratingAverage: ratingAverage(user),
    ratingCount: user.ratingCount,
    completedProjects: Number(completed[0]?.value ?? 0),
    ratingBreakdown: breakdown,
    reviews: reviews as ReviewDTO[],
    availability: weekly.map((w) => ({ weekday: w.weekday, startMinutes: w.startMinutes, endMinutes: w.endMinutes, label: w.label })),
    nextAvailable,
  };
}

export async function publicProfile(ctx: PublicCtx) {
  return { photographer: await getPhotographerProfile(intParam(ctx.params.id, "photographer id")) };
}

export type PhotographerCard = {
  id: number;
  name: string;
  headline: string | null;
  specialty: string | null;
  bio: string | null;
  location: string | null;
  experienceYears: number;
  specialties: string[];
  avatarUrl: string | null;
  color: string | null;
  ratingAverage: number;
  ratingCount: number;
  completedProjects: number;
  portfolio: PortfolioItem[];
  nextAvailable: string | null;
};

export async function listPublicProfiles(): Promise<PhotographerCard[]> {
  const rows = await db.select().from(users).where(and(eq(users.role, "photographer"), eq(users.active, true))).orderBy(asc(users.name));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [completed, rated, work] = await Promise.all([
    db
      .select({ photographerId: bookings.photographerId, value: count() })
      .from(bookings)
      .where(and(inArray(bookings.photographerId, ids), eq(bookings.status, "completed")))
      .groupBy(bookings.photographerId),
    db.select().from(reviews).where(inArray(reviews.photographerId, ids)).orderBy(desc(reviews.createdAt)),
    db
      .select({ photographerId: bookings.photographerId, url: photos.url, thumbUrl: photos.thumbUrl })
      .from(photos)
      .innerJoin(galleries, eq(photos.galleryId, galleries.id))
      .innerJoin(bookings, eq(galleries.bookingId, bookings.id))
      .where(and(inArray(bookings.photographerId, ids), eq(galleries.status, "published")))
      .orderBy(desc(photos.id))
      .limit(60),
  ]);
  const doneMap = new Map(completed.map((c) => [c.photographerId, Number(c.value)]));
  const reviewMap = new Map<number, { total: number; count: number }>();
  for (const r of rated) {
    const entry = reviewMap.get(r.photographerId) ?? { total: 0, count: 0 };
    entry.total += r.rating;
    entry.count += 1;
    reviewMap.set(r.photographerId, entry);
  }
  const workMap = new Map<number, string[]>();
  for (const w of work) {
    if (w.photographerId == null) continue;
    const list = workMap.get(w.photographerId) ?? [];
    if (list.length < 3) list.push(w.thumbUrl ?? w.url ?? "");
    workMap.set(w.photographerId, list);
  }

  return rows.map((u) => {
    const rating = reviewMap.get(u.id);
    const images = workMap.get(u.id) ?? [];
    const portfolio: PortfolioItem[] = u.portfolio?.length
      ? u.portfolio.slice(0, 3)
      : images.filter(Boolean).map((url, i) => ({ id: `${u.id}-${i}`, url, caption: "Client work", category: "Portfolio" }));
    return {
      id: u.id,
      name: u.name,
      headline: u.headline,
      specialty: u.specialty,
      bio: u.bio,
      location: u.location,
      experienceYears: u.experienceYears ?? 0,
      specialties: u.specialties?.length ? u.specialties : u.specialty ? [u.specialty] : [],
      avatarUrl: u.avatarUrl,
      color: u.color,
      ratingAverage: rating?.count ? Math.round((rating.total / rating.count) * 10) / 10 : 0,
      ratingCount: rating?.count ?? 0,
      completedProjects: doneMap.get(u.id) ?? 0,
      portfolio,
      nextAvailable: null,
    };
  });
}

export async function publicList(ctx: PublicCtx) {
  void ctx;
  const cards = await listPublicProfiles();
  if (!cards.length) return { results: [] };

  const settings = await getSettings();
  const todayKey = zonedNow(settings.timezone).dateKey;
  const ids = cards.map((c) => c.id);
  const [overrides, weekly] = await Promise.all([
    db
      .select({ photographerId: availabilityOverrides.photographerId, date: availabilityOverrides.date, kind: availabilityOverrides.kind })
      .from(availabilityOverrides)
      .where(and(inArray(availabilityOverrides.photographerId, ids), gte(availabilityOverrides.date, todayKey))),
    db
      .select({ photographerId: photographerWeeklyHours.photographerId, weekday: photographerWeeklyHours.weekday })
      .from(photographerWeeklyHours)
      .where(and(inArray(photographerWeeklyHours.photographerId, ids), eq(photographerWeeklyHours.enabled, true))),
  ]);

  const workingDays = new Map<number, Set<number>>();
  for (const w of weekly) {
    if (w.photographerId == null) continue;
    const set = workingDays.get(w.photographerId) ?? new Set<number>();
    set.add(w.weekday);
    workingDays.set(w.photographerId, set);
  }

  for (const card of cards) {
    const days = workingDays.get(card.id);
    for (let i = 0; i < 45; i++) {
      const date = addDaysToKey(todayKey, i);
      if (!settings.workingDays.includes(dayOfWeek(date))) continue;
      // No explicit weekly hours means the studio default hours apply.
      if (days && !days.has(dayOfWeek(date))) continue;
      const blocked = overrides.some((o) => o.photographerId === card.id && o.date === date && ["blocked", "holiday", "leave"].includes(o.kind));
      if (blocked) continue;
      card.nextAvailable = date;
      break;
    }
  }
  return { results: cards };
}

/** Photographer directory for the booking flow (authenticated clients and staff). */
export async function listForBooking(ctx: Ctx) {
  return publicList(ctx as unknown as PublicCtx);
}
