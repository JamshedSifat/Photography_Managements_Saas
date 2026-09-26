/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Award, CalendarCheck, Camera, Clock, Images, MapPin, MessageSquare, Quote, Sparkles, Star } from "lucide-react";
import { ensureSeeded } from "@/lib/seed";
import { getPhotographerProfile } from "@/server/views/portfolio";
import { WEEKDAYS, cn, formatDateKey, formatRelative, minutesToLabel } from "@/lib/shared";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const p = await getPhotographerProfile(Number(id));
    return { title: `${p.name} · Lumière Studio`, description: `${p.headline ?? "Photographer"} — ${p.experienceYears} years, ${p.completedProjects} sessions, ${p.ratingAverage.toFixed(1)}★ from ${p.ratingCount} reviews.` };
  } catch {
    return { title: "Photographer · Lumière Studio" };
  }
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} style={{ width: size, height: size }} className={cn("shrink-0", i <= Math.round(value) ? "fill-gold-400 text-gold-400" : "text-white/20")} />
      ))}
    </span>
  );
}

export default async function PhotographerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureSeeded();
  let photographer;
  try {
    photographer = await getPhotographerProfile(Number(id));
  } catch {
    notFound();
  }

  const p = photographer;
  const categories = [...new Set(p.portfolio.map((i) => i.category))];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-ink-950 text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(209,169,92,0.15),transparent_65%)]" />

      <div className="relative mx-auto max-w-7xl px-6 py-14 lg:py-20">
        <Link href="/photographers" className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-gold-400 transition hover:text-gold-200">
          <Camera className="h-3.5 w-3.5" /> All photographers
        </Link>

        <header className="mt-6 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-end">
          <div>
            <h1 className="font-display text-5xl leading-[1.05] text-white sm:text-6xl">{p.name}</h1>
            {p.headline ? <p className="mt-3 text-sm uppercase tracking-[0.24em] text-gold-300">{p.headline}</p> : null}
            {p.bio ? <p className="mt-5 max-w-xl text-base leading-relaxed text-white/55">{p.bio}</p> : null}

            <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm text-white/55">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gold-300" /> {p.experienceYears} years experience
              </span>
              <span className="flex items-center gap-2">
                <Images className="h-4 w-4 text-gold-300" /> {p.completedProjects} completed sessions
              </span>
              <span className="flex items-center gap-2">
                <Star className="h-4 w-4 text-gold-300" /> {p.ratingAverage.toFixed(1)} / 5 · {p.ratingCount} review{p.ratingCount === 1 ? "" : "s"}
              </span>
              {p.location ? (
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gold-300" /> {p.location}
                </span>
              ) : null}
            </div>

            {p.specialties.length ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {p.specialties.map((s) => (
                  <span key={s} className="rounded-full border border-gold-400/25 bg-gold-400/[0.08] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-gold-100">
                    {s}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={`/dashboard/bookings/new?photographer=${p.id}`}
                className="inline-flex h-12 items-center gap-2 rounded-2xl gold-fill px-7 text-sm font-medium text-ink-950 transition hover:brightness-110"
              >
                Book with {p.name.split(" ")[0]} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard/bookings/new"
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] px-7 text-sm text-white transition hover:border-gold-400/50 hover:bg-white/[0.07]"
              >
                <MessageSquare className="h-4 w-4" /> Check availability
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="glass rounded-3xl p-5">
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-gold-300">
                <Award className="h-3.5 w-3.5" /> Client rating
              </p>
              <p className="mt-3 font-display text-5xl text-white">{p.ratingAverage.toFixed(1)}</p>
              <Stars value={p.ratingAverage} size={16} />
              <p className="mt-3 text-xs text-white/40">from {p.ratingCount} verified session review{p.ratingCount === 1 ? "" : "s"}</p>
              {Object.keys(p.ratingBreakdown).length ? (
                <div className="mt-4 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((n) => {
                    const total = p.ratingCount || 1;
                    const pct = Math.round(((p.ratingBreakdown[n] ?? 0) / total) * 100);
                    return (
                      <div key={n} className="flex items-center gap-2 text-[11px] text-white/45">
                        <span className="w-3">{n}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                          <span className="block h-full rounded-full gold-fill" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="w-8 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="glass rounded-3xl p-5">
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-gold-300">
                <CalendarCheck className="h-3.5 w-3.5" /> Weekly availability
              </p>
              {p.availability.length ? (
                <ul className="mt-3 space-y-1.5">
                  {p.availability.map((a) => (
                    <li key={`${a.weekday}-${a.startMinutes}`} className="flex items-center justify-between text-xs text-white/55">
                      <span>{WEEKDAYS[a.weekday] ?? "Day"}</span>
                      <span className="text-white/75">
                        {minutesToLabel(a.startMinutes)} – {minutesToLabel(a.endMinutes)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-white/45">Availability is arranged per booking.</p>
              )}
              {p.nextAvailable ? (
                <p className="mt-4 rounded-xl bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-100">Next openings from {formatDateKey(p.nextAvailable.date)}</p>
              ) : null}
            </div>
          </div>
        </header>

        <section className="mt-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-gold-400">Previous work</p>
              <h2 className="mt-3 font-display text-4xl text-white">Selected portfolio</h2>
            </div>
            {categories.length ? <p className="hidden text-xs text-white/35 sm:block">{categories.join(" · ")}</p> : null}
          </div>

          {p.portfolio.length ? (
            <div className="mt-8 columns-1 gap-4 sm:columns-2 lg:columns-3">
              {p.portfolio.map((item, i) => (
                <figure key={item.id} className="group relative mb-4 break-inside-avoid overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.02]">
                  <img
                    src={item.url}
                    alt={item.caption || `${p.name} portfolio`}
                    loading={i < 3 ? "eager" : "lazy"}
                    className="w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                  />
                  <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 transition duration-300 group-hover:opacity-100">
                    <p className="text-sm text-white">{item.caption}</p>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gold-200/80">{item.category}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="mt-8 rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center text-sm text-white/40">Portfolio coming soon.</p>
          )}
        </section>

        <section className="mt-16">
          <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-gold-400">Reviews &amp; ratings</p>
          <h2 className="mt-3 font-display text-4xl text-white">What clients say</h2>

          {p.reviews.length ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {p.reviews.map((r) => (
                <blockquote key={r.id} className="glass flex h-full flex-col rounded-3xl p-6">
                  <Quote className="h-6 w-6 text-gold-400/60" />
                  <div className="mt-3 flex items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="text-[11px] text-white/35">{formatRelative(r.createdAt)}</span>
                  </div>
                  {r.title ? <p className="mt-3 font-display text-lg text-white">{r.title}</p> : null}
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-white/55">{r.comment}</p>
                  <footer className="mt-4 border-t border-white/[0.06] pt-3 text-xs text-white/40">
                    {r.clientName} · {r.bookingReference} · {formatDateKey(r.bookingDate)}
                  </footer>
                </blockquote>
              ))}
            </div>
          ) : (
            <p className="mt-8 rounded-3xl border border-dashed border-white/10 px-6 py-14 text-center text-sm text-white/40">
              No reviews yet — be the first to work with {p.name.split(" ")[0]}.
            </p>
          )}
        </section>

        <section className="mt-16 overflow-hidden rounded-[2rem] border border-gold-400/20 bg-gradient-to-br from-gold-400/[0.1] via-white/[0.02] to-transparent p-8 text-center sm:p-12">
          <Sparkles className="mx-auto h-7 w-7 text-gold-300" />
          <h2 className="mt-4 font-display text-4xl text-white sm:text-5xl">Let&apos;s make something timeless</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/55">
            Choose {p.name.split(" ")[0]} as your preferred photographer during booking. The studio confirms every request within one business day.
          </p>
          <Link
            href={`/dashboard/bookings/new?photographer=${p.id}`}
            className="mt-7 inline-flex h-12 items-center gap-2 rounded-2xl gold-fill px-8 text-sm font-medium text-ink-950 transition hover:brightness-110"
          >
            Start your booking <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </div>
  );
}
