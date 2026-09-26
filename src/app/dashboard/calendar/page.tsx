"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Mail, MapPin, Phone, User } from "lucide-react";
import { Calendar, rangeTitle, shiftCursor, visibleRange, type CalendarView } from "@/components/calendar";
import { useAuth } from "@/components/providers";
import {
  Avatar,
  BookingStatusBadge,
  Button,
  ButtonLink,
  Card,
  Drawer,
  ErrorState,
  InfoRow,
  PageHeader,
  PaymentStateBadge,
  Select,
  Skeleton,
  Tabs,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/client-api";
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUSES,
  BOOKING_STATUS_META,
  formatDateKey,
  formatDuration,
  formatMoney,
  parseDateKey,
  timeRangeLabel,
  toDateKey,
  type BookingDTO,
  type BookingStatus,
  type Paginated,
  type PhotographerDTO,
  type StudioSettingsDTO,
} from "@/lib/shared";

export default function CalendarPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const [view, setView] = useState<CalendarView>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [photographerId, setPhotographerId] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState<BookingDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const { from, to } = visibleRange(view, cursor);
  const params = new URLSearchParams({ from: toDateKey(from), to: toDateKey(to), pageSize: "1000" });
  if (!showCancelled) params.set("status", [...ACTIVE_BOOKING_STATUSES, "completed"].join(","));
  if (photographerId) params.set("photographerId", photographerId);
  const { data, error, isLoading, mutate } = useSWR<Paginated<BookingDTO>>(`/bookings?${params}`);
  const { data: settingsData } = useSWR<{ settings: StudioSettingsDTO; today: string }>("/settings");
  const { data: team } = useSWR<{ results: PhotographerDTO[] }>(isAdmin ? "/photographers" : null);

  const settings = settingsData?.settings;
  const bookings = data?.results ?? [];
  const visiblePhotographers = team?.results.filter((p) => !photographerId || String(p.id) === photographerId);

  async function markCompleted(b: BookingDTO) {
    setBusy(true);
    try {
      await api(`/bookings/${b.id}`, { method: "PATCH", body: { status: "completed" } });
      toast.success("Session marked as completed");
      setSelected(null);
      void mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const counts = bookings.reduce<Record<BookingStatus, number>>(
    (acc, b) => ({ ...acc, [b.status]: (acc[b.status] ?? 0) + 1 }),
    Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0])) as Record<BookingStatus, number>,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Scheduling"
        title={isAdmin ? "Studio calendar" : "My schedule"}
        description={isAdmin ? "Day, week and month views across every photographer. Double-click an empty slot to book." : "Your assigned sessions across the week and month."}
        actions={
          isAdmin ? (
            <ButtonLink href="/dashboard/bookings/new">
              <CalendarPlus className="h-4 w-4" /> New booking
            </ButtonLink>
          ) : null
        }
      />

      <Card className="p-4 sm:p-5">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
              Today
            </Button>
            <div className="flex">
              <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => setCursor((c) => shiftCursor(view, c, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next" onClick={() => setCursor((c) => shiftCursor(view, c, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="font-display text-2xl text-white">{rangeTitle(view, cursor)}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <div className="w-48">
                <Select value={photographerId} onChange={(e) => setPhotographerId(e.target.value)} className="h-9 text-xs">
                  <option value="">All photographers</option>
                  {team?.results.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setShowCancelled((v) => !v)}
              className="h-9 rounded-xl border border-white/10 px-3 text-xs text-white/60 transition hover:border-white/25 hover:text-white"
            >
              {showCancelled ? "Hide" : "Show"} cancelled
            </button>
            <Tabs
              value={view}
              onChange={setView}
              options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/50">
          {isAdmin && team?.results.length
            ? team.results.map((p) => (
                <span key={p.id} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color ?? "#d1a95c" }} /> {p.name}
                </span>
              ))
            : null}
          <span className="ml-auto flex flex-wrap gap-3">
            {(Object.keys(counts) as BookingStatus[])
              .filter((s) => showCancelled || s !== "cancelled")
              .map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: BOOKING_STATUS_META[s].color }} />
                  {BOOKING_STATUS_META[s].label} · {counts[s]}
                </span>
              ))}
          </span>
        </div>

        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />
        ) : isLoading && !data ? (
          <Skeleton className="h-[640px]" />
        ) : (
          <div className="animate-fade-in">
            <Calendar
              view={view}
              cursor={cursor}
              bookings={bookings}
              photographers={view === "day" && isAdmin ? visiblePhotographers : undefined}
              openMinutes={settings?.openMinutes ?? 540}
              closeMinutes={settings?.closeMinutes ?? 1140}
              onSelectBooking={setSelected}
              onSelectDay={(d) => {
                setCursor(d);
                setView("day");
              }}
              onCreateAt={isAdmin ? (dateKey) => router.push(`/dashboard/bookings/new?date=${dateKey}`) : undefined}
            />
          </div>
        )}
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Session details"
        footer={
          selected ? (
            <>
              <ButtonLink href={`/dashboard/bookings/${selected.id}`} className="flex-1">
                Open booking
              </ButtonLink>
              {selected.status === "approved" && selected.date <= toDateKey(new Date()) ? (
                <Button variant="outline" loading={busy} onClick={() => markCompleted(selected)}>
                  Mark completed
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-6">
            <div>
              <div className="flex flex-wrap gap-2">
                <BookingStatusBadge status={selected.status} />
                {user?.role !== "photographer" ? <PaymentStateBadge state={selected.paymentStatus} /> : null}
              </div>
              <h3 className="mt-3 font-display text-3xl text-white">{selected.title}</h3>
              <p className="mt-1 text-sm text-white/50">{selected.reference}</p>
            </div>
            <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm">
              <p className="flex items-center gap-2 text-white">
                <Clock className="h-4 w-4 text-gold-300" /> {formatDateKey(selected.date, "long")}
              </p>
              <p className="pl-6 text-white/55">
                {timeRangeLabel(selected.startMinutes, selected.endMinutes)} · {formatDuration(selected.endMinutes - selected.startMinutes)}
              </p>
              <p className="flex items-center gap-2 pt-1 text-white/70">
                <MapPin className="h-4 w-4 text-gold-300" /> {selected.location ?? "Studio"}
              </p>
            </div>
            <div>
              <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-white/35">Client</p>
              <div className="flex items-center gap-3">
                <Avatar name={selected.client.name} />
                <div className="text-sm">
                  <p className="text-white">{selected.client.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-white/45">
                    <Mail className="h-3 w-3" /> {selected.client.email}
                  </p>
                  {selected.client.phone ? (
                    <p className="flex items-center gap-1.5 text-xs text-white/45">
                      <Phone className="h-3 w-3" /> {selected.client.phone}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="divide-y divide-white/[0.06]">
              <InfoRow label="Photographer">
                {selected.photographer ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: selected.photographer.color ?? "#d1a95c" }} /> {selected.photographer.name}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-white/50">
                    <User className="h-3.5 w-3.5" /> Unassigned
                  </span>
                )}
              </InfoRow>
              {user?.role !== "photographer" ? (
                <>
                  <InfoRow label="Total">{formatMoney(selected.netCents, settings?.currency)}</InfoRow>
                  <InfoRow label="Paid">{formatMoney(selected.paidCents, settings?.currency)}</InfoRow>
                  <InfoRow label="Balance due">
                    <span className="text-gold-200">{formatMoney(selected.dueCents, settings?.currency)}</span>
                  </InfoRow>
                </>
              ) : null}
            </div>
            {selected.notes ? (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/35">Client notes</p>
                <p className="rounded-2xl bg-white/[0.03] p-3 text-sm text-white/70">{selected.notes}</p>
              </div>
            ) : null}
            {selected.internalNotes ? (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/35">Internal notes</p>
                <p className="rounded-2xl bg-gold-400/[0.06] p-3 text-sm text-gold-100/80">{selected.internalNotes}</p>
              </div>
            ) : null}
            <Link href={`/dashboard/calendar`} onClick={() => { setCursor(parseDateKey(selected.date)); setView("day"); setSelected(null); }} className="text-xs text-gold-300 hover:text-gold-200">
              View this day →
            </Link>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
