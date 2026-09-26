/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import {
  Aperture,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarCheck,
  Check,
  CircleCheck,
  Clock,
  CreditCard,
  Images,
  Lock,
  Mail,
  MapPin,
  Phone,
  Quote,
  Sparkles,
  Star,
} from "lucide-react";
import { db } from "@/db";
import { packages, type Package } from "@/db/schema";
import { getSettings } from "@/lib/booking";
import { ensureSeeded } from "@/lib/seed";
import { MEDIA, cn, formatDuration, formatMoney, pexels } from "@/lib/shared";

export const dynamic = "force-dynamic";

const btnBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60";
const btnPrimary = `${btnBase} gold-fill text-ink-950 shadow-[0_10px_30px_-12px_rgba(209,169,92,0.75)] hover:brightness-110`;
const btnOutline = `${btnBase} border border-white/15 bg-white/[0.04] text-white hover:border-gold-400/50 hover:bg-white/[0.07]`;
const lg = "h-12 rounded-2xl px-6 text-sm";
const md = "h-10 rounded-xl px-4 text-sm";

const CATEGORIES = ["Weddings", "Engagements", "Portraits", "Family", "Newborn", "Maternity", "Brand & Headshots", "Events"];

const STEPS = [
  { title: "Reserve online in minutes", body: "Choose a collection, see live availability and lock your date instantly — double bookings are impossible by design." },
  { title: "Create together", body: "Your dedicated photographer, styling guidance and gentle direction make the session feel effortless and genuinely you." },
  { title: "Relive it in your private gallery", body: "Sneak peeks within 48 hours, then a secure, beautifully presented gallery to favourite, share and download." },
];

const FEATURES = [
  { icon: CalendarCheck, title: "Real-time booking", body: "Live slots, instant confirmation and one-tap rescheduling requests." },
  { icon: CreditCard, title: "Transparent payments", body: "Track advances, balances and invoices — always know what's due." },
  { icon: Images, title: "Private galleries", body: "Signed, expiring links keep your images secure. Favourite and download in full resolution." },
  { icon: BellRing, title: "Thoughtful reminders", body: "Confirmation, reminder and gallery-ready emails arrive exactly when you need them." },
];

const TESTIMONIALS = [
  { quote: "They captured moments we didn't even know happened. The gallery experience felt like opening a gift.", name: "Olivia & Noah", type: "Wedding" },
  { quote: "Booking took two minutes and every detail — from reminders to the invoice — was handled beautifully.", name: "Sophia Laurent", type: "Portraits" },
  { quote: "Calm, patient and incredibly talented with our newborn. The images are pure heirlooms.", name: "Mia Tanaka", type: "Newborn" },
];

async function loadData() {
  try {
    await ensureSeeded();
    const [pkgs, studio] = await Promise.all([
      db.select().from(packages).where(eq(packages.active, true)).orderBy(asc(packages.sortOrder), asc(packages.priceCents)).limit(6),
      getSettings(),
    ]);
    return { pkgs, studio };
  } catch (err) {
    console.error("[home] failed to load studio data", err);
    return { pkgs: [] as Package[], studio: null };
  }
}

function SectionTitle({ eyebrow, title, description, align = "center" }: { eyebrow: string; title: React.ReactNode; description?: string; align?: "center" | "left" }) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-gold-400">{eyebrow}</p>
      <h2 className="mt-4 font-display text-4xl leading-tight text-white sm:text-5xl">{title}</h2>
      {description ? <p className="mt-4 text-base leading-relaxed text-white/50">{description}</p> : null}
    </div>
  );
}

export default async function HomePage() {
  const { pkgs, studio } = await loadData();
  const currency = studio?.currency ?? "USD";
  const name = studio?.studioName ?? "Lumière Studio";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-ink-950 text-white">
      {/* Navigation */}
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
        <div className="glass-strong mx-auto flex max-w-7xl items-center justify-between rounded-2xl px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl gold-fill text-ink-950">
              <Aperture className="h-5 w-5" />
            </span>
            <span className="font-display text-xl tracking-[0.32em]">LUMIÈRE</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-white/60 md:flex">
            <a href="#portfolio" className="transition hover:text-white">Portfolio</a>
            <a href="#packages" className="transition hover:text-white">Packages</a>
            <a href="#experience" className="transition hover:text-white">Experience</a>
            <a href="#portal" className="transition hover:text-white">Client portal</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className={cn(btnBase, md, "text-white/70 hover:bg-white/[0.06] hover:text-white")}>
              Sign in
            </Link>
            <Link href="/dashboard/bookings/new" className={cn(btnPrimary, md, "hidden sm:inline-flex")}>
              Book a session
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-[100svh] items-center pb-16 pt-32">
        <img src={MEDIA.hero} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-ink-950/50" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-14 px-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
          <div>
            <p className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-gold-400/25 bg-gold-400/10 px-4 py-1.5 text-[11px] uppercase tracking-[0.3em] text-gold-200">
              <Sparkles className="h-3.5 w-3.5" /> Fine-art photography · New York
            </p>
            <h1 className="mt-7 animate-fade-up font-display text-[54px] leading-[0.98] sm:text-7xl lg:text-[92px]" style={{ animationDelay: "80ms" }}>
              Every frame,
              <br />
              <em className="gold-text">a legacy.</em>
            </h1>
            <p className="mt-7 max-w-xl animate-fade-up text-base leading-relaxed text-white/60 sm:text-lg" style={{ animationDelay: "160ms" }}>
              Weddings, portraits and family stories — captured with artistry and delivered through a private client portal. Book online in
              minutes, track every detail and relive your gallery anywhere.
            </p>
            <div className="mt-10 flex animate-fade-up flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
              <Link href="/dashboard/bookings/new" className={cn(btnPrimary, lg)}>
                Book your session <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#packages" className={cn(btnOutline, lg)}>
                Explore packages
              </a>
            </div>
            <dl className="mt-14 grid max-w-lg animate-fade-up grid-cols-3 gap-6" style={{ animationDelay: "320ms" }}>
              {[
                ["1,200+", "Sessions captured"],
                ["4.9", "Average rating"],
                ["48h", "Sneak peeks"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="font-display text-3xl text-white sm:text-4xl">{v}</dt>
                  <dd className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/40">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative hidden h-[540px] lg:block">
            <div className="glass absolute right-0 top-0 w-72 animate-float overflow-hidden rounded-3xl p-2 shadow-2xl">
              <img src={pexels(34921744, 700)} alt="Portrait from a private gallery" className="h-80 w-full rounded-2xl object-cover" />
              <div className="flex items-center justify-between px-3 py-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Private gallery</p>
                  <p className="text-sm text-white">Sophia — Studio Portraits</p>
                </div>
                <Lock className="h-4 w-4 text-gold-300" />
              </div>
            </div>
            <div className="glass-strong absolute bottom-16 left-0 w-72 animate-float rounded-3xl p-5 shadow-2xl" style={{ animationDelay: "1.6s" }}>
              <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300">Next available</p>
              <p className="mt-2 font-display text-2xl text-white">Tomorrow · 10:00 AM</p>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {["9:00", "10:00", "11:30", "2:00"].map((t, i) => (
                  <span key={t} className={cn("rounded-lg py-1.5 text-center text-[11px]", i === 1 ? "gold-fill font-semibold text-ink-950" : "bg-white/5 text-white/60")}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="glass absolute bottom-0 right-8 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
                <CircleCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs text-white">Booking confirmed</p>
                <p className="text-[11px] text-white/45">Confirmation email sent</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee */}
      <section className="overflow-hidden border-y border-white/[0.06] bg-white/[0.015] py-6">
        <div className="flex w-max animate-marquee gap-12 whitespace-nowrap">
          {[...CATEGORIES, ...CATEGORIES].map((c, i) => (
            <span key={`${c}-${i}`} className="flex items-center gap-12 font-display text-2xl italic text-white/35">
              {c}
              <Aperture className="h-4 w-4 text-gold-400/60" />
            </span>
          ))}
        </div>
      </section>

      {/* Portfolio */}
      <section id="portfolio" className="mx-auto max-w-7xl px-6 py-28">
        <SectionTitle
          eyebrow="Portfolio"
          title={
            <>
              Light, emotion &amp; <em className="gold-text">quiet elegance</em>
            </>
          }
          description="A glimpse of recent stories — each one planned, photographed and delivered by our small team of award-winning artists."
        />
        <div className="mt-14 columns-1 gap-5 sm:columns-2 lg:columns-3">
          {MEDIA.portfolio.map((p, i) => (
            <figure key={p.id} className="group relative mb-5 break-inside-avoid overflow-hidden rounded-3xl">
              <img
                src={pexels(p.id, 900)}
                alt={p.alt}
                loading="lazy"
                className="w-full object-cover transition duration-700 group-hover:scale-105"
                style={{ aspectRatio: i % 3 === 0 ? "4 / 5" : i % 3 === 1 ? "3 / 4" : "1 / 1" }}
              />
              <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/85 via-black/20 to-transparent p-5 opacity-0 transition duration-500 group-hover:opacity-100">
                <span>
                  <span className="block text-[10px] uppercase tracking-[0.3em] text-gold-300">{p.category}</span>
                  <span className="text-sm text-white">{p.alt}</span>
                </span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-white/80" />
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="relative py-28">
        <div className="absolute inset-0 grid-lines opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
        <div className="relative mx-auto max-w-7xl px-6">
          <SectionTitle
            eyebrow="Collections"
            title="Thoughtfully crafted packages"
            description="Transparent pricing and live availability. Reserve with a small advance and settle the balance before your session."
          />
          {pkgs.length === 0 ? (
            <p className="mt-12 text-center text-sm text-white/40">Packages will appear here once the studio publishes them.</p>
          ) : (
            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {pkgs.map((p) => (
                <article
                  key={p.id}
                  className={cn(
                    "glass group relative flex flex-col overflow-hidden rounded-3xl transition duration-500 hover:-translate-y-1 hover:border-gold-400/30",
                    p.popular && "ring-1 ring-gold-400/40",
                  )}
                >
                  <div className="relative h-52 overflow-hidden">
                    {p.coverUrl ? <img src={p.coverUrl} alt={p.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/25 to-transparent" />
                    {p.popular ? (
                      <span className="absolute right-4 top-4 rounded-full gold-fill px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-950">Most loved</span>
                    ) : null}
                    <span className="absolute bottom-4 left-5 text-[10px] uppercase tracking-[0.3em] text-gold-200">{p.category}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-display text-2xl text-white">{p.name}</h3>
                      <p className="gold-text font-display text-2xl">{formatMoney(p.priceCents, currency)}</p>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-white/50">{p.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/60">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1">
                        <Clock className="h-3 w-3" /> {formatDuration(p.durationMinutes)}
                      </span>
                      {p.deliverables ? <span className="rounded-full bg-white/5 px-2.5 py-1">{p.deliverables}</span> : null}
                    </div>
                    <ul className="mt-5 flex-1 space-y-2 text-sm text-white/65">
                      {p.features.slice(0, 4).map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> {f}
                        </li>
                      ))}
                    </ul>
                    <Link href={`/dashboard/bookings/new?packageId=${p.id}`} className={cn(p.popular ? btnPrimary : btnOutline, md, "mt-6 w-full")}>
                      Reserve this package
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Experience */}
      <section id="experience" className="mx-auto max-w-7xl px-6 py-28">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <div className="relative">
            <img src={MEDIA.photographer} alt="Photographer with camera" className="aspect-[4/5] w-full rounded-[2rem] object-cover" />
            <div className="glass-strong absolute -bottom-6 right-4 rounded-3xl p-6 sm:-right-6">
              <p className="gold-text font-display text-4xl">12 yrs</p>
              <p className="text-[11px] uppercase tracking-[0.25em] text-white/50">Crafting heirlooms</p>
            </div>
          </div>
          <div>
            <SectionTitle align="left" eyebrow="The experience" title="Effortless from first click to final frame" />
            <div className="mt-10 space-y-7">
              {STEPS.map((s, i) => (
                <div key={s.title} className="flex gap-5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-gold-400/25 bg-gold-400/10 font-display text-xl text-gold-200">
                    0{i + 1}
                  </span>
                  <div>
                    <h3 className="text-lg text-white">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/50">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Client portal */}
      <section id="portal" className="mx-auto max-w-7xl px-6 pb-28">
        <div className="glass relative overflow-hidden rounded-[2rem] p-8 sm:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold-400/10 blur-3xl" />
          <SectionTitle
            eyebrow="Client portal"
            title="Your studio, in your pocket"
            description="Every client receives a private portal to manage sessions, payments and galleries — secured with modern authentication."
          />
          <div className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6 transition duration-300 hover:-translate-y-1 hover:border-gold-400/25">
                <f.icon className="h-6 w-6 text-gold-300" />
                <h3 className="mt-4 text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-7xl px-6 pb-28">
        <div className="grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="glass flex flex-col rounded-3xl p-7">
              <Quote className="h-6 w-6 text-gold-300" />
              <blockquote className="mt-4 flex-1 font-display text-xl leading-snug text-white/90">&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption className="mt-6 flex items-center justify-between gap-3">
                <span>
                  <span className="block text-sm text-white">{t.name}</span>
                  <span className="text-xs text-white/40">{t.type}</span>
                </span>
                <span className="flex gap-0.5 text-gold-300">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-4 mb-12 overflow-hidden rounded-[2rem] sm:mx-6 lg:mx-auto lg:max-w-7xl">
        <img src={MEDIA.cta} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/95 via-ink-950/75 to-ink-950/25" />
        <div className="relative px-8 py-16 sm:px-14 sm:py-20">
          <h2 className="max-w-xl font-display text-4xl leading-tight text-white sm:text-5xl">
            Let&apos;s create something <em className="gold-text">timeless</em>.
          </h2>
          <p className="mt-4 max-w-md text-white/60">Real-time availability, instant confirmation and a private gallery for your memories.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className={cn(btnPrimary, lg)}>
              Create your account
            </Link>
            <Link href="/login" className={cn(btnOutline, lg)}>
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl gold-fill text-ink-950">
                <Aperture className="h-5 w-5" />
              </span>
              <span className="font-display text-xl tracking-[0.32em]">LUMIÈRE</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/45">{studio?.tagline ?? "Fine-art portrait & wedding photography"}.</p>
          </div>
          <div className="space-y-3 text-sm text-white/55">
            <p className="text-[11px] uppercase tracking-[0.25em] text-white/30">Visit</p>
            {studio?.address ? (
              <p className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> {studio.address}
              </p>
            ) : null}
            <p className="flex gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> {studio?.email ?? "hello@lumiere.studio"}
            </p>
            {studio?.phone ? (
              <p className="flex gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> {studio.phone}
              </p>
            ) : null}
          </div>
          <div className="space-y-3 text-sm">
            <p className="text-[11px] uppercase tracking-[0.25em] text-white/30">Portals</p>
            <Link href="/login?role=client" className="block text-white/55 transition hover:text-gold-200">Client portal</Link>
            <Link href="/login?role=photographer" className="block text-white/55 transition hover:text-gold-200">Photographer login</Link>
            <Link href="/login?role=admin" className="block text-white/55 transition hover:text-gold-200">Studio admin</Link>
          </div>
        </div>
        <div className="border-t border-white/[0.06] py-6 text-center text-xs text-white/30">
          © {new Date().getFullYear()} {name}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
