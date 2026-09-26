import { asc, count, eq, sql } from "drizzle-orm";
import { db, ensureMigrations } from "@/db";
import { bookingEvents, bookings, chatRooms, clients, galleries, packages, payments, photos, studioSettings, users } from "@/db/schema";
import { hashPassword } from "./auth";
import { generateReference } from "./booking";
import { notifyBookingConfirmation, notifyBookingReminder, notifyGalleryReady, notifyPaymentReceipt, sendWelcomeEmail } from "./email";
import { addDaysToKey, pexels, zonedNow, type BookingStatus, type PaymentMethod } from "./shared";

/**
 * Idempotent demo-data seeder. Runs once per process on first request and only
 * when the database has no users. Guarded by an advisory lock for multi-process safety.
 */

const TIMEZONE = "America/New_York";

const PHOTO_SETS = {
  wedding: [5595144, 19816937, 37045029, 32060316, 28687686, 38720221, 31002333, 19734123],
  portrait: [34921744, 36720012, 18390130, 26448305, 28863299, 20459101, 36448862, 16370844],
  engagement: [29285937, 36986688, 36986643, 36976257, 16968031, 9242466, 18821003, 33123014],
  family: [36026383, 38079943, 35875037, 36026418, 18857244, 18857250],
};

const PACKAGES = [
  {
    name: "Signature Wedding",
    category: "Wedding",
    priceCents: 320000,
    durationMinutes: 480,
    depositPercent: 30,
    deliverables: "600+ edited images · 8 weeks",
    features: ["Full-day coverage (8 hours)", "Lead + second photographer", "Private online gallery", "Engagement mini-session", "Heirloom linen album"],
    popular: true,
    cover: 19816937,
    description: "Complete, unhurried wedding-day coverage — from getting ready to the last dance — crafted into a timeless heirloom collection.",
  },
  {
    name: "Engagement Story",
    category: "Engagement",
    priceCents: 65000,
    durationMinutes: 120,
    depositPercent: 30,
    deliverables: "120 edited images · 2 weeks",
    features: ["2 hours, up to 2 locations", "Golden-hour scheduling", "Styling & wardrobe guide", "Private online gallery"],
    cover: 36986643,
    description: "A relaxed, cinematic session celebrating your story — perfect for save-the-dates.",
  },
  {
    name: "Studio Portrait",
    category: "Portrait",
    priceCents: 28000,
    durationMinutes: 60,
    depositPercent: 50,
    deliverables: "25 retouched images · 7 days",
    features: ["1 hour in our SoHo studio", "2 outfit changes", "Professional retouching", "Hair & makeup touch-ups"],
    cover: 26448305,
    description: "Editorial-quality portraits in our daylight studio, with dramatic lighting options.",
  },
  {
    name: "Family Heritage",
    category: "Family",
    priceCents: 45000,
    durationMinutes: 90,
    depositPercent: 30,
    deliverables: "60 edited images · 10 days",
    features: ["90 minutes in studio or outdoors", "Up to 8 family members", "Generational groupings", "Print-ready files"],
    cover: 35875037,
    description: "Warm, candid and beautifully composed family portraits you'll treasure for generations.",
  },
  {
    name: "Newborn Artistry",
    category: "Newborn",
    priceCents: 52000,
    durationMinutes: 180,
    depositPercent: 30,
    deliverables: "30 fine-art images · 2 weeks",
    features: ["Unhurried 3-hour session", "Curated wraps & props", "Parent & sibling portraits", "Heated, baby-safe studio"],
    cover: 38079943,
    description: "Gentle, baby-led newborn sessions within the first 14 days, in a calm and cosy studio.",
  },
  {
    name: "Brand & Headshots",
    category: "Corporate",
    priceCents: 39000,
    durationMinutes: 60,
    depositPercent: 50,
    deliverables: "15 retouched images · 5 days",
    features: ["Headshots + lifestyle brand images", "Backdrop & lighting options", "Commercial usage license", "48-hour express option"],
    cover: 20459101,
    description: "Polished headshots and brand imagery for founders, teams and creatives.",
  },
  {
    name: "Maternity Glow",
    category: "Maternity",
    priceCents: 42000,
    durationMinutes: 90,
    depositPercent: 30,
    deliverables: "40 edited images · 10 days",
    features: ["Studio gown wardrobe", "Partner & family portraits", "Fine-art retouching", "Private online gallery"],
    cover: 18390130,
    description: "Elegant, empowering maternity portraits with access to our couture gown collection.",
  },
  {
    name: "Event Coverage",
    category: "Event",
    priceCents: 120000,
    durationMinutes: 240,
    depositPercent: 40,
    deliverables: "300+ edited images · 7 days",
    features: ["4 hours of coverage", "Candid + staged moments", "Next-day sneak peeks", "Commercial usage license"],
    cover: 5595144,
    description: "Discreet, story-driven coverage for galas, launches and private celebrations.",
  },
];

type Pay = "full" | "advance" | "none";
// [dayOffset, startMinutes, packageIdx, photographerIdx, clientIdx, status, payment, location]
const SPECS: Array<[number, number, number, number, number, BookingStatus, Pay, string | null]> = [
  [-45, 600, 0, 0, 2, "completed", "full", "The Foundry, Long Island City"],
  [-38, 660, 2, 1, 0, "completed", "full", null],
  [-30, 600, 4, 2, 5, "completed", "full", null],
  [-24, 840, 5, 1, 8, "completed", "full", null],
  [-20, 570, 3, 2, 4, "completed", "full", "Prospect Park, Brooklyn"],
  [-14, 960, 1, 0, 0, "completed", "full", "DUMBO waterfront, Brooklyn"],
  [-10, 780, 6, 2, 3, "completed", "full", null],
  [-7, 900, 2, 1, 6, "cancelled", "none", null],
  [-5, 600, 7, 0, 8, "completed", "advance", "The Rainbow Room, Rockefeller Center"],
  [-2, 660, 3, 2, 7, "completed", "advance", null],
  [0, 600, 2, 1, 1, "approved", "advance", null],
  [0, 780, 6, 2, 3, "approved", "full", null],
  [0, 900, 1, 0, 7, "approved", "advance", "Central Park, Bethesda Terrace"],
  [1, 600, 5, 1, 4, "approved", "advance", null],
  [2, 660, 3, 2, 6, "pending", "none", null],
  [3, 600, 0, 0, 3, "approved", "advance", "Brooklyn Botanic Garden"],
  [5, 840, 2, 1, 0, "approved", "advance", null],
  [7, 570, 4, 2, 5, "approved", "advance", null],
  [9, 720, 7, 0, 8, "approved", "none", "Hudson Yards Terrace"],
  [12, 600, 1, 1, 1, "pending", "none", "The High Line"],
  [15, 600, 0, 0, 6, "approved", "advance", "Wave Hill, Bronx"],
  [21, 660, 6, 2, 7, "pending", "none", null],
];

const METHODS: PaymentMethod[] = ["card", "bank_transfer", "card", "upi", "cash", "online"];

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      await ensureMigrations();
      await runSeed();
    })().catch((err) => {
      console.error("[seed] failed:", (err as Error)?.message ?? err);
      seedPromise = null;
    });
  }
  return seedPromise;
}

const at = (key: string, hourUtc = 15) => new Date(`${key}T${String(hourUtc).padStart(2, "0")}:00:00Z`);
const minKey = (a: string, b: string) => (a < b ? a : b);

async function runSeed() {
  const [{ value }] = await db.select({ value: count() }).from(users);
  if (value > 0) return;

  const [adminHash, photoHash, clientHash] = await Promise.all([hashPassword("Admin@123"), hashPassword("Photo@123"), hashPassword("Client@123")]);
  const today = zonedNow(TIMEZONE).dateKey;

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424242)`);
    const [{ value: again }] = await tx.select({ value: count() }).from(users);
    if (again > 0) return null;

    await tx
      .insert(studioSettings)
      .values({
        id: 1,
        studioName: "Lumière Studio",
        tagline: "Fine-art portrait & wedding photography",
        email: "hello@lumiere.studio",
        phone: "+1 (212) 555-0148",
        address: "88 Mercer Street, SoHo, New York, NY 10012",
        currency: "USD",
        timezone: TIMEZONE,
        invoiceNotes:
          "Thank you for choosing Lumière Studio. Balances are due 48 hours before your session. Bank transfer: Lumière Studio LLC · Account 0042 7719 · Routing 021000021.",
      })
      .onConflictDoNothing();

    await tx.insert(users).values({
      name: "Victoria Hale",
      email: "admin@lumiere.studio",
      passwordHash: adminHash,
      role: "admin",
      phone: "+1 (212) 555-0100",
      specialty: "Studio Director",
    });
    const team = await tx
      .insert(users)
      .values([
        {
          name: "Elena Marquez",
          email: "elena@lumiere.studio",
          passwordHash: photoHash,
          role: "photographer",
          phone: "+1 (212) 555-0111",
          specialty: "Weddings & Engagements",
          color: "#D1A95C",
          bio: "Documentary storyteller with 12 years behind the lens and 300+ weddings across New York.",
          headline: "Lead wedding photographer",
          location: "SoHo studio · travels worldwide",
          experienceYears: 12,
          specialties: ["Weddings", "Engagements", "Editorial", "Golden hour"],
          portfolio: [
            { id: "elena-1", url: pexels(19816937, 1200), caption: "Vows at golden hour", category: "Weddings" },
            { id: "elena-2", url: pexels(5595144, 1200), caption: "First dance, candlelight", category: "Weddings" },
            { id: "elena-3", url: pexels(29285937, 1200), caption: "Engagement session", category: "Engagements" },
            { id: "elena-4", url: pexels(36986688, 1200), caption: "Sunset couple portrait", category: "Engagements" },
          ],
        },
        {
          name: "Marcus Chen",
          email: "marcus@lumiere.studio",
          passwordHash: photoHash,
          role: "photographer",
          phone: "+1 (212) 555-0112",
          specialty: "Portraits & Brand",
          color: "#7DD3FC",
          bio: "Editorial portrait photographer obsessed with light, texture and honest expressions.",
          headline: "Portrait & brand photographer",
          location: "SoHo studio",
          experienceYears: 9,
          specialties: ["Portraits", "Brand", "Headshots", "Studio lighting"],
          portfolio: [
            { id: "marcus-1", url: pexels(36720012, 1200), caption: "Monochrome editorial study", category: "Portraits" },
            { id: "marcus-2", url: pexels(34921744, 1200), caption: "Daylight studio portrait", category: "Portraits" },
            { id: "marcus-3", url: pexels(28863299, 1200), caption: "Dramatic single-light setup", category: "Portraits" },
            { id: "marcus-4", url: pexels(20459101, 1200), caption: "Founder brand session", category: "Brand" },
          ],
        },
        {
          name: "Aria Patel",
          email: "aria@lumiere.studio",
          passwordHash: photoHash,
          role: "photographer",
          phone: "+1 (212) 555-0113",
          specialty: "Family & Newborn",
          color: "#F9A8D4",
          bio: "Newborn-safety certified; creates calm, joyful sessions for growing families.",
          headline: "Newborn & family specialist",
          location: "SoHo studio · home visits",
          experienceYears: 7,
          specialties: ["Newborn", "Family", "Maternity", "Natural light"],
          portfolio: [
            { id: "aria-1", url: pexels(38079943, 1200), caption: "Newborn fine-art set", category: "Newborn" },
            { id: "aria-2", url: pexels(35875037, 1200), caption: "Generational family portrait", category: "Family" },
            { id: "aria-3", url: pexels(36026383, 1200), caption: "Maternity glow session", category: "Maternity" },
            { id: "aria-4", url: pexels(18390130, 1200), caption: "Quiet newborn moment", category: "Newborn" },
          ],
        },
      ])
      .returning();
    const [clientUser] = await tx
      .insert(users)
      .values({ name: "Sophia Laurent", email: "client@lumiere.studio", passwordHash: clientHash, role: "client", phone: "+1 (917) 555-0181" })
      .returning();

    const people = await tx
      .insert(clients)
      .values([
        { userId: clientUser.id, name: "Sophia Laurent", email: "client@lumiere.studio", phone: "+1 (917) 555-0181", city: "New York", source: "Instagram", tags: ["VIP"], notes: "Prefers natural light and neutral tones." },
        { name: "James Whitaker", email: "james.whitaker@example.com", phone: "+1 (646) 555-0142", city: "Brooklyn", source: "Referral", tags: [] },
        { name: "Olivia & Noah Bennett", email: "bennett.wedding@example.com", phone: "+1 (718) 555-0167", city: "Hoboken", source: "Wedding fair", tags: ["Wedding"] },
        { name: "Isabella Rossi", email: "isabella.rossi@example.com", phone: "+1 (347) 555-0120", city: "Manhattan", source: "Google", tags: ["Wedding", "VIP"] },
        { name: "Ethan Brooks", email: "ethan.brooks@example.com", phone: "+1 (212) 555-0199", city: "Queens", source: "Website", tags: [] },
        { name: "Mia Tanaka", email: "mia.tanaka@example.com", phone: "+1 (917) 555-0133", city: "Jersey City", source: "Instagram", tags: ["Newborn"] },
        { name: "Liam O'Connor", email: "liam.oconnor@example.com", phone: "+1 (646) 555-0175", city: "Manhattan", source: "Referral", tags: [] },
        { name: "Ava Richardson", email: "ava.richardson@example.com", phone: "+1 (929) 555-0158", city: "Brooklyn", source: "Instagram", tags: ["Family"] },
        { name: "Harper Collins Co.", email: "events@harpercollins-co.example.com", phone: "+1 (212) 555-0190", city: "Manhattan", source: "LinkedIn", tags: ["Corporate"], notes: "Invoice to accounts payable; PO required." },
      ])
      .returning();
    // Spread sign-up dates so CRM metrics look realistic.
    const signupDaysAgo = [210, 160, 240, 120, 95, 150, 12, 45, 180];
    for (const [i, person] of people.entries()) {
      await tx
        .update(clients)
        .set({ createdAt: new Date(Date.now() - (signupDaysAgo[i] ?? 30) * 86_400_000) })
        .where(eq(clients.id, person.id));
    }

    const pkgs = await tx
      .insert(packages)
      .values(
        PACKAGES.map((p, i) => ({
          name: p.name,
          category: p.category,
          description: p.description,
          priceCents: p.priceCents,
          durationMinutes: p.durationMinutes,
          depositPercent: p.depositPercent,
          features: p.features,
          deliverables: p.deliverables,
          coverUrl: pexels(p.cover, 1200),
          popular: Boolean(p.popular),
          sortOrder: i,
        })),
      )
      .returning();

    const bookingIds: number[] = [];
    const paymentIds: number[] = [];
    for (let i = 0; i < SPECS.length; i++) {
      const [offset, start, pi, phi, ci, status, pay, location] = SPECS[i];
      const pkg = pkgs[pi];
      const date = addDaysToKey(today, offset);
      const createdKey = minKey(addDaysToKey(date, -30), addDaysToKey(today, -(i % 4)));
      const [row] = await tx
        .insert(bookings)
        .values({
          reference: generateReference(),
          clientId: people[ci].id,
          packageId: pkg.id,
          photographerId: team[phi].id,
          title: pkg.name,
          date,
          startMinutes: start,
          endMinutes: start + pkg.durationMinutes,
          status,
          location,
          notes: i % 3 === 0 ? "Would love a mix of candid and posed shots." : null,
          internalNotes: i % 4 === 0 ? "Client prefers warm edits. Bring 85mm + reflector." : null,
          totalCents: pkg.priceCents,
          discountCents: i === 15 ? 20000 : 0,
          createdAt: new Date(at(createdKey).getTime() + i * 60_000),
          confirmationSentAt: at(createdKey),
          reminderSentAt: offset < 0 ? at(addDaysToKey(date, -1)) : null,
        })
        .returning();
      await tx
        .update(bookings)
        .set({ invoiceNumber: `INV-${date.slice(0, 4)}-${String(row.id).padStart(4, "0")}` })
        .where(eq(bookings.id, row.id));
      bookingIds.push(row.id);

      const net = row.totalCents - row.discountCents;
      const advance = Math.round((net * pkg.depositPercent) / 100);
      if (pay !== "none") {
        const [adv] = await tx
          .insert(payments)
          .values({
            bookingId: row.id,
            amountCents: advance,
            type: "advance",
            method: METHODS[i % METHODS.length],
            status: "paid",
            reference: `TXN-${(48210 + i * 37).toString(36).toUpperCase()}`,
            paidAt: at(minKey(addDaysToKey(date, -21), addDaysToKey(today, -1)), 16),
          })
          .returning({ id: payments.id });
        paymentIds.push(adv.id);
      }
      if (pay === "full") {
        const [bal] = await tx
          .insert(payments)
          .values({
            bookingId: row.id,
            amountCents: net - advance,
            type: "balance",
            method: METHODS[(i + 1) % METHODS.length],
            status: "paid",
            reference: `TXN-${(59117 + i * 41).toString(36).toUpperCase()}`,
            paidAt: at(minKey(date, today), 18),
          })
          .returning({ id: payments.id });
        paymentIds.push(bal.id);
      }
    }

    const makeGallery = async (
      specIdx: number,
      title: string,
      set: number[],
      opts: { status: "draft" | "published"; allowDownload: boolean; watermark: boolean; description: string },
    ) => {
      const [spec] = [SPECS[specIdx]];
      const date = addDaysToKey(today, spec[0]);
      const [g] = await tx
        .insert(galleries)
        .values({
          bookingId: bookingIds[specIdx],
          clientId: people[spec[4]].id,
          title,
          description: opts.description,
          status: opts.status,
          allowDownload: opts.allowDownload,
          watermark: opts.watermark,
          publishedAt: opts.status === "published" ? at(minKey(addDaysToKey(date, 7), today)) : null,
          createdAt: at(minKey(addDaysToKey(date, 3), today)),
        })
        .returning();
      const inserted = await tx
        .insert(photos)
        .values(
          set.map((pid, n) => ({
            galleryId: g.id,
            provider: "external" as const,
            publicId: `pexels-${pid}`,
            url: pexels(pid, 2000),
            thumbUrl: pexels(pid, 700),
            filename: `LUMIERE-${g.id}-${String(n + 1).padStart(3, "0")}.jpg`,
            format: "jpg",
            mimeType: "image/jpeg",
            isFavorite: n === 1 || n === 4,
            sortOrder: n,
          })),
        )
        .returning({ id: photos.id });
      await tx.update(galleries).set({ coverPhotoId: inserted[0]?.id ?? null }).where(eq(galleries.id, g.id));
      return g.id;
    };

    await makeGallery(0, "Olivia & Noah — The Wedding Day", PHOTO_SETS.wedding, {
      status: "published",
      allowDownload: true,
      watermark: false,
      description: "An autumn celebration at The Foundry. Thank you for letting us be part of your day.",
    });
    await makeGallery(1, "Sophia — Studio Portraits", PHOTO_SETS.portrait, {
      status: "published",
      allowDownload: true,
      watermark: false,
      description: "Editorial portraits from our SoHo daylight studio.",
    });
    const engagementGallery = await makeGallery(5, "Sophia & Daniel — Engagement Proofs", PHOTO_SETS.engagement, {
      status: "published",
      allowDownload: false,
      watermark: true,
      description: "Proofing gallery — tap the heart on your favourites and we'll finalise your selections.",
    });
    await makeGallery(9, "Richardson Family — Autumn Session", PHOTO_SETS.family, {
      status: "draft",
      allowDownload: true,
      watermark: false,
      description: "Currently in editing.",
    });

    // Every booking gets its private chat room and a timeline entry.
    const seeded = await tx
      .select({ id: bookings.id, reference: bookings.reference, status: bookings.status, createdAt: bookings.createdAt })
      .from(bookings)
      .orderBy(asc(bookings.id));
    for (const b of seeded) {
      await tx.insert(chatRooms).values({ bookingId: b.id, title: `Booking ${b.reference}` }).onConflictDoNothing();
      await tx
        .insert(bookingEvents)
        .values({ bookingId: b.id, fromStatus: null, toStatus: b.status, actorUserId: null, note: "Booking created", createdAt: b.createdAt })
        .onConflictDoNothing();
    }

    return {
      sophiaUpcoming: bookingIds[16],
      tomorrow: bookingIds[13],
      engagementGallery,
      samplePayment: paymentIds[paymentIds.length - 1],
    };
  });

  if (!result) return;
  const origin = process.env.APP_URL || "http://localhost:3000";
  await sendWelcomeEmail({ name: "Sophia Laurent", email: "client@lumiere.studio", role: "client" }, origin, { logOnly: true });
  await notifyBookingConfirmation(result.sophiaUpcoming, origin, { logOnly: true });
  if (result.samplePayment) await notifyPaymentReceipt(result.samplePayment, origin, { logOnly: true });
  await notifyGalleryReady(result.engagementGallery, origin, { logOnly: true });
  await notifyBookingReminder(result.tomorrow, origin, { logOnly: true });
  console.log("[seed] demo studio data created");
}
