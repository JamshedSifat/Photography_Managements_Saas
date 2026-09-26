/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight, CalendarCheck, Clock, Images, MapPin, Sparkles, Star } from "lucide-react";
import { db } from "@/db";
import { getSettings } from "@/lib/booking";
import { ensureSeeded } from "@/lib/seed";
import { pexels, cn, formatDuration, formatMoney } from "@/lib/shared";
import { listPublicProfiles, type PhotographerCard } from "@/server/views/portfolio";


export const dynamic = "force-dynamic";

export const metadata = {
  title: "Our photographers · Lumière Studio",
  description: "Browse the Lumière Studio team — experience, specialties, previous work, availability and client reviews.",
};

const SORT_LABELS: { value: string; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "rating", label: "Highest rated" },
  { value: "experience", label: "Most experienced" },
  { value: "projects", label: "Most sessions" },
];

function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const full = Math.round(value);
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("shrink-0", i <= full ? "fill-gold-400 text-gold-400" : "text-white/20", size === "md" ? "h-4 w-4" : "h-3.5 w-3.5")} />
      ))}
    </span>
  );
}

function availabilitySummary(p: PhotographerCard) {
  return p.nextAvailable ? `next opening ${p.nextAvailable}` : "availability on request";
}

export default async function PhotographersPage({ searchParams }: { searchParams: Promise<{ sort?: string; q?: string }> }) {
  const { sort = "featured", q = "" } = await searchParams;

  let list: PhotographerCard[] = [];
  let currency = "USD";
  try {
    await ensureSeeded();
    const [data, studio] = await Promise.all([listPublicProfiles(), getSettings()]);
    list = data;
    currency = studio?.currency ?? "USD";
  } catch (err) {
    console.error("[photographers] failed to load", err);
  }

  const filtered = q.trim()
    ? list.filter((p) =>
        [p.name, p.headline ?? "", p.specialty ?? "", ...p.specialties].join(" ").toLowerCase().includes(q.trim().toLowerCase()),
      )
    : list;

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "rating") return b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount;
    if (sort === "experience") return b.experienceYears - a.experienceYears;
    if (sort === "projects") return b.completedProjects - a.completedProjects;
    return b.ratingCount - a.ratingCount || b.completedProjects - a.completedProjects;
  });

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-ink-950 text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(209,169,92,0.14),transparent_60%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-16 lg:py-24">
        <header className="max-w-3xl">
          <Link href="/" className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-gold-400 transition hover:text-gold-200">
            <Sparkles className="h-3.5 w-3.5" /> Lumière Studio
          </Link>
          <h1 className="mt-5 font-display text-5xl leading-[1.05] text-white sm:text-6xl">Meet your photographer</h1>
          <p className="mt-5 text-base leading-relaxed text-white/55">
            Every session is led by a dedicated artist. Compare experience, style, availability and client reviews — then choose the photographer you&apos;d
            love to work with. Your preference is honoured whenever their calendar allows.
          </p>
        </header>

        <form className="mt-10 flex flex-wrap items-center gap-3" action="/photographers">
          <div className="relative min-w-[260px] flex-1">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by name or specialty…"
              className="h-11 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-gold-400/50"
            />
          </div>
          <select
            name="sort"
            defaultValue={sort}
            className="h-11 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-gold-400/50"
          >
            {SORT_LABELS.map((s) => (
              <option key={s.value} value={s.value} className="bg-ink-900">
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" className="h-11 rounded-2xl gold-fill px-6 text-sm font-medium text-ink-950 transition hover:brightness-110">
            Apply
          </button>
        </form>

        {!sorted.length ? (
          <p className="mt-16 rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center text-sm text-white/40">
            No photographers matched your search.
          </p>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((p) => (
              <article key={p.id} className="glass group flex flex-col overflow-hidden rounded-3xl transition duration-300 hover:-translate-y-1 hover:border-gold-400/30">
                <div className="relative h-64 overflow-hidden bg-ink-900">
                  {p.portfolio[0] ? (
                    <img src={p.portfolio[0].url} alt={`${p.name} — ${p.portfolio[0].caption}`} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  ) : (
                    <img src={pexels(18083935, 900)} alt={p.name} className="h-full w-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/25 to-transparent" />
                  <div className="absolute bottom-4 left-5 right-5">
                    <h2 className="font-display text-2xl text-white">{p.name}</h2>
                    {p.headline ? <p className="mt-1 text-xs text-gold-200/90">{p.headline}</p> : null}
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/50">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-gold-300" /> {p.experienceYears} yrs experience
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Images className="h-3.5 w-3.5 text-gold-300" /> {p.completedProjects} sessions
                    </span>
                    {p.location ? (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-gold-300" /> {p.location}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Stars value={p.ratingAverage} />
                    <span className="text-xs text-white/60">
                      {p.ratingAverage.toFixed(1)} · {p.ratingCount} review{p.ratingCount === 1 ? "" : "s"}
                    </span>
                  </div>

                  {p.bio ? <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/45">{p.bio}</p> : null}

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {p.specialties.slice(0, 4).map((s) => (
                      <span key={s} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/55">
                        {s}
                      </span>
                    ))}
                  </div>

                  <p className="mt-4 flex items-center gap-1.5 text-[11px] text-white/35">
                    <CalendarCheck className="h-3.5 w-3.5" /> Usually available {availabilitySummary(p)}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2 pt-1">
                    <Link href={`/photographers/${p.id}`} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] text-sm text-white transition hover:border-gold-400/50 hover:bg-white/[0.07]">
                      View profile <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href={`/dashboard/bookings/new?photographer=${p.id}`}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl gold-fill text-sm font-medium text-ink-950 transition hover:brightness-110"
                    >
                      Book {p.name.split(" ")[0]}
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-14 rounded-3xl border border-white/[0.07] bg-white/[0.02] p-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold-300">Ready when you are</p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/50">
            Collections start at {formatMoney(0, currency) === "$0" ? "an accessible advance" : "an accessible advance"} with a balance due before your session.
            Pick your photographer at checkout and we&apos;ll confirm within one business day.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard/bookings/new" className="inline-flex h-11 items-center gap-2 rounded-2xl gold-fill px-6 text-sm font-medium text-ink-950 transition hover:brightness-110">
              Start booking <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/#packages" className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] px-6 text-sm text-white transition hover:border-gold-400/50">
              View packages · {formatDuration(120)}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
