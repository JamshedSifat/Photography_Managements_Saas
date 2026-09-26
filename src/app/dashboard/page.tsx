"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  Camera,
  CircleCheck,
  Clock,
  CreditCard,
  Images,
  MapPin,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/components/providers";
import { PaymentFormModal } from "@/components/forms";
import {
  Avatar,
  Badge,
  BookingStatusBadge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  PaymentStateBadge,
  ProgressBar,
  Skeleton,
  StatCard,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/client-api";
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUS_META,
  PAYMENT_METHOD_LABELS,
  cn,
  diffDays,
  firstName,
  formatDate,
  formatDateKey,
  formatDuration,
  formatMoney,
  minutesToLabel,
  relativeDay,
  timeRangeLabel,
  type AdminDashboard,
  type BookingDTO,
  type BookingStatus,
  type ClientDashboard,
  type DashboardData,
  type PhotographerDashboard,
} from "@/lib/shared";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function OverviewPage() {
  const { user } = useAuth();
  const { data, error, isLoading, mutate } = useSWR<DashboardData>("/dashboard");
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />;
  if (isLoading || !data || !user) return <OverviewSkeleton />;
  if (data.role === "admin") return <AdminView data={data} name={user.name} onChange={() => mutate()} />;
  if (data.role === "photographer") return <PhotographerView data={data} name={user.name} />;
  return <ClientView data={data} name={user.name} />;
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-80" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-80 xl:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ shared widgets

function Timeline({ bookings, empty }: { bookings: BookingDTO[]; empty: string }) {
  if (!bookings.length) return <EmptyState icon={Camera} title="All clear" description={empty} className="py-10" />;
  return (
    <ol className="relative space-y-3">
      <span className="absolute bottom-3 left-[77px] top-3 w-px bg-white/10" />
      {bookings.map((b) => (
        <li key={b.id}>
          <Link href={`/dashboard/bookings/${b.id}`} className="group flex items-stretch gap-4">
            <div className="w-14 shrink-0 pt-3.5 text-right">
              <p className="text-sm text-white">{minutesToLabel(b.startMinutes, true)}</p>
              <p className="text-[11px] text-white/35">{formatDuration(b.endMinutes - b.startMinutes)}</p>
            </div>
            <span className="relative z-10 mt-5 h-3 w-3 shrink-0 rounded-full ring-4 ring-ink-900" style={{ background: b.photographer?.color ?? "#d1a95c" }} />
            <div className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition duration-300 group-hover:border-gold-400/30 group-hover:bg-white/[0.05]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">{b.client.name}</p>
                  <p className="text-xs text-white/45">
                    {b.title} · {timeRangeLabel(b.startMinutes, b.endMinutes)}
                  </p>
                </div>
                <BookingStatusBadge status={b.status} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/45">
                {b.photographer ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar name={b.photographer.name} color={b.photographer.color} size="xs" /> {b.photographer.name}
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {b.location ?? "Studio"}
                </span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function BookingList({ bookings, today, empty, showClient = true }: { bookings: BookingDTO[]; today: string; empty: string; showClient?: boolean }) {
  if (!bookings.length) return <EmptyState icon={CalendarCheck} title="Nothing here yet" description={empty} className="py-10" />;
  return (
    <div className="divide-y divide-white/[0.06]">
      {bookings.map((b) => (
        <Link key={b.id} href={`/dashboard/bookings/${b.id}`} className="flex items-center gap-4 py-3.5 transition hover:opacity-80">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-center">
            <span className="text-[10px] uppercase leading-none text-gold-300">{formatDateKey(b.date, "short").split(" ")[0]}</span>
            <span className="font-display text-lg leading-none text-white">{b.date.slice(8)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-white">{showClient ? `${b.client.name} · ${b.title}` : b.title}</p>
            <p className="truncate text-xs text-white/45">
              {relativeDay(b.date, today)} · {timeRangeLabel(b.startMinutes, b.endMinutes)}
              {b.photographer ? ` · ${b.photographer.name}` : ""}
            </p>
          </div>
          <BookingStatusBadge status={b.status} />
        </Link>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ admin

function RevenueChart({ data, currency }: { data: AdminDashboard["revenueByMonth"]; currency: string }) {
  const max = Math.max(...data.map((d) => d.cents), 1);
  const total = data.reduce((s, d) => s + d.cents, 0);
  return (
    <div>
      <div className="mb-6 flex items-end gap-3">
        <p className="font-display text-3xl text-white">{formatMoney(total, currency)}</p>
        <p className="pb-1 text-xs text-white/40">collected in 6 months</p>
      </div>
      <div className="flex h-56 items-end gap-3 sm:gap-5">
        {data.map((d, i) => {
          const current = i === data.length - 1;
          return (
            <div key={d.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
              <span className="whitespace-nowrap text-[11px] text-white/0 transition group-hover:text-white/70">{formatMoney(d.cents, currency)}</span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={cn(
                    "w-full rounded-b-md rounded-t-xl transition-all duration-700",
                    current ? "gold-fill shadow-[0_0_40px_-10px_rgba(209,169,92,0.7)]" : "bg-white/10 group-hover:bg-white/20",
                  )}
                  style={{ height: `${Math.max(3, (d.cents / max) * 100)}%` }}
                />
              </div>
              <span className={cn("text-[11px] uppercase tracking-wider", current ? "text-gold-300" : "text-white/40")}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusDonut({ data }: { data: AdminDashboard["statusBreakdown"] }) {
  const order: BookingStatus[] = ["pending", ...ACTIVE_BOOKING_STATUSES.filter((s) => s !== "pending"), "completed", "cancelled"];
  const total = data.reduce((s, d) => s + d.count, 0);
  let acc = 0;
  const segments = order.map((status) => {
    const count = data.find((d) => d.status === status)?.count ?? 0;
    const start = total ? (acc / total) * 360 : 0;
    acc += count;
    const end = total ? (acc / total) * 360 : 0;
    return { status, count, start, end };
  });
  const gradient = total
    ? `conic-gradient(${segments.map((s) => `${BOOKING_STATUS_META[s.status].color} ${s.start}deg ${s.end}deg`).join(", ")})`
    : "rgba(255,255,255,0.08)";
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-44 w-44 rounded-full transition-transform duration-700 hover:rotate-6" style={{ background: gradient }}>
        <div className="absolute inset-[18px] grid place-items-center rounded-full bg-ink-900">
          <div className="text-center">
            <p className="font-display text-4xl text-white">{total}</p>
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/40">Bookings</p>
          </div>
        </div>
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        {segments.map((s) => (
          <div key={s.status} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-xs">
            <span className="flex items-center gap-2 text-white/60">
              <span className="h-2 w-2 rounded-full" style={{ background: BOOKING_STATUS_META[s.status].color }} />
              {BOOKING_STATUS_META[s.status].label}
            </span>
            <span className="text-white">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminView({ data, name, onChange }: { data: AdminDashboard; name: string; onChange: () => void }) {
  const { stats, currency } = data;
  const [paying, setPaying] = useState<BookingDTO | null>(null);
  const [sending, setSending] = useState(false);
  const trend =
    stats.revenueLastMonthCents > 0 ? Math.round(((stats.revenueMonthCents - stats.revenueLastMonthCents) / stats.revenueLastMonthCents) * 100) : null;
  const nextShoot = data.todaySchedule.find((b) => ACTIVE_BOOKING_STATUSES.includes(b.status));
  const maxMinutes = Math.max(...data.team.map((t) => t.minutes), 1);

  async function sendReminders() {
    setSending(true);
    try {
      const r = await api<{ sent: number }>("/notifications/reminders", { method: "POST" });
      toast.success(r.sent ? `Sent ${r.sent} reminder email${r.sent === 1 ? "" : "s"}` : "Everyone with an upcoming session has been reminded");
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatDateKey(data.today, "long")}
        title={
          <>
            {greeting()}, <span className="gold-text">{firstName(name)}</span>
          </>
        }
        description="Here's what's happening at the studio today."
        actions={
          <>
            <Button variant="outline" onClick={sendReminders} loading={sending}>
              <BellRing className="h-4 w-4" /> Send reminders
            </Button>
            <ButtonLink href="/dashboard/bookings/new">
              <CalendarPlus className="h-4 w-4" /> New booking
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's shoots"
          value={stats.todayShoots}
          icon={Camera}
          hint={nextShoot ? `Next ${minutesToLabel(nextShoot.startMinutes)} · ${nextShoot.client.name}` : "No more sessions today"}
        />
        <StatCard label="Upcoming bookings" value={stats.upcoming} icon={CalendarCheck} hint="Pending & confirmed" delay={60} />
        <StatCard
          label="Revenue this month"
          value={formatMoney(stats.revenueMonthCents, currency)}
          icon={TrendingUp}
          trend={trend == null ? null : { label: `${trend >= 0 ? "+" : ""}${trend}% vs last month`, positive: trend >= 0 }}
          delay={120}
        />
        <StatCard
          label="Pending payments"
          value={formatMoney(stats.pendingCents, currency)}
          icon={Wallet}
          hint={`${stats.pendingCount} booking${stats.pendingCount === 1 ? "" : "s"} with a balance`}
          delay={180}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={TrendingUp}
            title="Revenue"
            description="Payments collected over the last 6 months"
            action={
              <Link href="/dashboard/payments" className="text-xs text-gold-300 hover:text-gold-200">
                View payments →
              </Link>
            }
          />
          <RevenueChart data={data.revenueByMonth} currency={currency} />
        </Card>
        <Card>
          <CardHeader icon={CalendarClock} title="Booking pipeline" description={`${stats.clients} clients · ${stats.newClientsMonth} new this month`} />
          <StatusDonut data={data.statusBreakdown} />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={Camera}
            title="Today's schedule"
            description={formatDateKey(data.today, "long")}
            action={
              <Link href="/dashboard/calendar" className="text-xs text-gold-300 hover:text-gold-200">
                Open calendar →
              </Link>
            }
          />
          <Timeline bookings={data.todaySchedule} empty="No shoots scheduled today — a perfect day for editing." />
        </Card>
        <Card>
          <CardHeader icon={Wallet} title="Pending payments" description="Balances awaiting collection" />
          {data.outstanding.length === 0 ? (
            <EmptyState icon={CircleCheck} title="All settled" description="Every booking is paid in full." className="py-8" />
          ) : (
            <div className="space-y-3">
              {data.outstanding.map((b) => (
                <div key={b.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/dashboard/bookings/${b.id}`} className="min-w-0">
                      <p className="truncate text-sm text-white">{b.client.name}</p>
                      <p className="truncate text-[11px] text-white/40">
                        {b.reference} · {formatDateKey(b.date, "short")}
                      </p>
                    </Link>
                    <p className="shrink-0 font-display text-lg text-gold-200">{formatMoney(b.dueCents, currency)}</p>
                  </div>
                  <ProgressBar value={b.netCents ? (b.paidCents / b.netCents) * 100 : 0} className="mt-3" />
                  <div className="mt-2.5 flex items-center justify-between">
                    <PaymentStateBadge state={b.paymentStatus} />
                    <button onClick={() => setPaying(b)} className="text-xs text-gold-300 transition hover:text-gold-200">
                      Record payment →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={Sparkles}
            title="Recent bookings"
            action={
              <Link href="/dashboard/bookings" className="text-xs text-gold-300 hover:text-gold-200">
                All bookings →
              </Link>
            }
          />
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-white/35">
                  <th className="px-2 pb-3 font-medium">Client</th>
                  <th className="px-2 pb-3 font-medium">Session</th>
                  <th className="px-2 pb-3 font-medium">Date</th>
                  <th className="px-2 pb-3 font-medium">Status</th>
                  <th className="px-2 pb-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.recent.map((b) => (
                  <tr key={b.id} className="transition hover:bg-white/[0.02]">
                    <td className="px-2 py-3">
                      <Link href={`/dashboard/bookings/${b.id}`} className="flex items-center gap-2.5">
                        <Avatar name={b.client.name} size="sm" />
                        <span className="text-white">{b.client.name}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-white/60">{b.title}</td>
                    <td className="px-2 py-3 text-white/60">{formatDateKey(b.date, "medium")}</td>
                    <td className="px-2 py-3">
                      <BookingStatusBadge status={b.status} />
                    </td>
                    <td className="px-2 py-3 text-right text-white">{formatMoney(b.netCents, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader icon={Users} title="Team this month" description="Sessions & hours per photographer" />
          <div className="space-y-4">
            {data.team.map((t) => (
              <div key={t.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5 text-sm text-white">
                    <Avatar name={t.name} color={t.color} size="sm" /> {t.name}
                  </span>
                  <span className="text-xs text-white/45">
                    {t.sessions} sessions · {formatDuration(t.minutes)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(t.minutes / maxMinutes) * 100}%`, background: t.color ?? "#d1a95c" }} />
                </div>
              </div>
            ))}
            {!data.team.length ? <p className="text-sm text-white/40">No active photographers yet.</p> : null}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Galleries live</p>
              <p className="mt-1 font-display text-2xl text-white">{stats.galleriesPublished}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">In editing</p>
              <p className="mt-1 font-display text-2xl text-white">{stats.galleriesDraft}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader icon={CreditCard} title="Latest transactions" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.recentPayments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{p.client?.name}</p>
                <p className="truncate text-[11px] text-white/40">
                  {PAYMENT_METHOD_LABELS[p.method]} · {formatDate(p.paidAt)}
                </p>
              </div>
              <p className={cn("font-display text-lg", p.type === "refund" ? "text-rose-300" : "text-emerald-300")}>
                {p.type === "refund" ? "−" : "+"}
                {formatMoney(p.amountCents, currency)}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <PaymentFormModal
        open={!!paying}
        booking={paying}
        onClose={() => setPaying(null)}
        onSaved={() => {
          setPaying(null);
          onChange();
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ photographer

function PhotographerView({ data, name }: { data: PhotographerDashboard; name: string }) {
  const { stats } = data;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatDateKey(data.today, "long")}
        title={
          <>
            {greeting()}, <span className="gold-text">{firstName(name)}</span>
          </>
        }
        description="Your shoots, assignments and deliveries at a glance."
        actions={
          <ButtonLink href="/dashboard/calendar" variant="outline">
            <CalendarClock className="h-4 w-4" /> My schedule
          </ButtonLink>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's shoots" value={stats.todayShoots} icon={Camera} />
        <StatCard label="Next 7 days" value={stats.weekShoots} icon={CalendarCheck} delay={60} />
        <StatCard label="Completed this month" value={stats.monthCompleted} icon={CircleCheck} delay={120} />
        <StatCard label="Galleries to deliver" value={stats.toDeliver} icon={Images} hint="Completed sessions awaiting a gallery" delay={180} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader icon={Camera} title="Today's schedule" description={formatDateKey(data.today, "long")} />
          <Timeline bookings={data.todaySchedule} empty="No shoots today. Time to cull and edit!" />
        </Card>
        <Card>
          <CardHeader icon={CalendarClock} title="Upcoming assignments" />
          <BookingList bookings={data.upcoming} today={data.today} empty="No upcoming assignments." />
        </Card>
      </div>
      <Card>
        <CardHeader icon={Images} title="Ready for delivery" description="Completed sessions that still need a published gallery" />
        {data.toDeliver.length === 0 ? (
          <EmptyState icon={Sparkles} title="You're all caught up" description="Every completed session has a published gallery." className="py-8" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.toDeliver.map((b) => (
              <div key={b.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                <p className="text-sm text-white">{b.client.name}</p>
                <p className="text-xs text-white/45">
                  {b.title} · {formatDateKey(b.date)}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  {b.gallery ? <Badge tone="amber">Draft gallery</Badge> : <Badge>No gallery yet</Badge>}
                  <Link
                    href={b.gallery ? `/dashboard/galleries/${b.gallery.id}` : `/dashboard/galleries?new=1&bookingId=${b.id}`}
                    className="text-xs text-gold-300 hover:text-gold-200"
                  >
                    {b.gallery ? "Continue →" : "Create gallery →"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ client

function ClientView({ data, name }: { data: ClientDashboard; name: string }) {
  const { stats, currency, next } = data;
  const days = next ? diffDays(next.date, data.today) : null;
  return (
    <div className="space-y-6">
      <div className="glass relative animate-fade-up overflow-hidden rounded-[2rem] p-6 sm:p-9">
        <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-gold-400/15 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold-400">{formatDateKey(data.today, "long")}</p>
            <h1 className="mt-3 font-display text-4xl text-white sm:text-5xl">
              {greeting()}, <span className="gold-text">{firstName(name)}</span>
            </h1>
            <p className="mt-3 max-w-md text-sm text-white/55">Manage your sessions, payments and private galleries — all in one elegant place.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/dashboard/bookings/new" size="lg">
                <CalendarPlus className="h-4 w-4" /> Book a session
              </ButtonLink>
              <ButtonLink href="/dashboard/galleries" variant="outline" size="lg">
                <Images className="h-4 w-4" /> My galleries
              </ButtonLink>
            </div>
          </div>
          {next ? (
            <Link href={`/dashboard/bookings/${next.id}`} className="glass-strong group block rounded-3xl p-6 transition hover:border-gold-400/30">
              <p className="text-[10px] uppercase tracking-[0.3em] text-gold-300">Your next session</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <p className="font-display text-3xl text-white">{next.title}</p>
                  <p className="mt-1 text-sm text-white/55">
                    {formatDateKey(next.date, "long")}
                    <br />
                    {timeRangeLabel(next.startMinutes, next.endMinutes)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-5xl gold-text">{days === 0 ? "Today" : days}</p>
                  {days !== 0 ? <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">day{days === 1 ? "" : "s"} to go</p> : null}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-white/50">
                {next.photographer ? (
                  <span className="flex items-center gap-2">
                    <Avatar name={next.photographer.name} color={next.photographer.color} size="xs" /> {next.photographer.name}
                  </span>
                ) : null}
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {next.location ?? "Studio"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> {formatDuration(next.endMinutes - next.startMinutes)}
                </span>
              </div>
            </Link>
          ) : (
            <div className="glass-strong rounded-3xl p-6 text-center">
              <CalendarPlus className="mx-auto h-8 w-8 text-gold-300" />
              <p className="mt-3 font-display text-2xl text-white">No upcoming sessions</p>
              <p className="mt-1 text-sm text-white/45">Pick a package and reserve your date in minutes.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Upcoming sessions" value={stats.upcoming} icon={CalendarCheck} />
        <StatCard label="Balance due" value={formatMoney(stats.dueCents, currency)} icon={Wallet} hint={stats.dueCents ? "View invoices in Payments" : "You're all paid up"} delay={60} />
        <StatCard label="Private galleries" value={stats.galleries} icon={Images} delay={120} />
        <StatCard label="Completed sessions" value={stats.sessions} icon={Sparkles} delay={180} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={Images}
            title="Your galleries"
            action={
              <Link href="/dashboard/galleries" className="text-xs text-gold-300 hover:text-gold-200">
                View all →
              </Link>
            }
          />
          {data.galleries.length === 0 ? (
            <EmptyState icon={Images} title="No galleries yet" description="Your images will appear here as soon as they're ready." className="py-10" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.galleries.slice(0, 4).map((g) => (
                <Link key={g.id} href={`/dashboard/galleries/${g.id}`} className="group relative block aspect-[4/3] overflow-hidden rounded-2xl">
                  {g.coverUrl ? (
                    <img src={g.coverUrl} alt={g.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="h-full w-full bg-white/5" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="font-display text-xl text-white">{g.title}</p>
                    <p className="text-xs text-white/60">{g.photoCount} photos</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader
            icon={CalendarClock}
            title="Upcoming"
            action={
              <Link href="/dashboard/bookings" className="text-xs text-gold-300 hover:text-gold-200">
                All →
              </Link>
            }
          />
          <BookingList bookings={data.upcoming} today={data.today} empty="Book your next session to see it here." showClient={false} />
          {data.payments.length ? (
            <div className="mt-6 border-t border-white/[0.06] pt-5">
              <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-white/35">Recent payments</p>
              <div className="space-y-2">
                {data.payments.slice(0, 3).map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-white/60">
                      {p.booking?.title} · {formatDate(p.paidAt)}
                    </span>
                    <span className="text-emerald-300">{formatMoney(p.amountCents, currency)}</span>
                  </div>
                ))}
              </div>
              <Link href="/dashboard/payments" className="mt-4 inline-flex items-center gap-1 text-xs text-gold-300 hover:text-gold-200">
                Payments & invoices <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
