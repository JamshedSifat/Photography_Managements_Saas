"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Download,
  MapPin,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "./providers";
import { ClientFormModal, SlotGrid } from "./forms";
import { Avatar, Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageHeader, Select, Skeleton, Textarea, Toggle } from "./ui";
import { ApiClientError, api, errorMessage } from "@/lib/client-api";
import {
  WEEKDAYS,
  cn,
  formatDateKey,
  formatDuration,
  formatMoney,
  inputToCents,
  minutesToLabel,
  pad,
  parseDateKey,
  timeRangeLabel,
  timeToMinutes,
  toDateKey,
  type AvailabilityResponse,
  type BookingDTO,
  type BookingStatus,
  type ClientDTO,
  type DaySummary,
  type PackageDTO,
  type Paginated,
  type PhotographerDTO,
  type StudioSettingsDTO,
} from "@/lib/shared";

export function downloadIcs(b: BookingDTO, studioName: string) {
  const dt = (key: string, min: number) => `${key.replace(/-/g, "")}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0];
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lumiere Studio//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${b.reference}@lumiere.studio`,
    `DTSTAMP:${stamp}Z`,
    `DTSTART:${dt(b.date, b.startMinutes)}`,
    `DTEND:${dt(b.date, b.endMinutes)}`,
    `SUMMARY:${b.title} — ${studioName}`,
    `LOCATION:${(b.location ?? studioName).replace(/,/g, "\\,")}`,
    `DESCRIPTION:Booking reference ${b.reference}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${b.reference}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

const STEPS = ["Package", "Date & time", "Details", "Review"];

function MonthPicker({
  month,
  onMonth,
  days,
  loading,
  value,
  onChange,
}: {
  month: Date;
  onMonth: (d: Date) => void;
  days: DaySummary[] | undefined;
  loading: boolean;
  value: string | null;
  onChange: (key: string) => void;
}) {
  const grid = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });
  const map = new Map(days?.map((d) => [d.date, d]) ?? []);
  const currentMonth = startOfMonth(new Date());
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="Previous month" disabled={month <= currentMonth} onClick={() => onMonth(subMonths(month, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="font-display text-2xl text-white">{format(month, "MMMM yyyy")}</p>
        <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => onMonth(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-[0.2em] text-white/35">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d.slice(0, 2)}
          </span>
        ))}
      </div>
      <div className={cn("mt-1 grid grid-cols-7 gap-1.5 transition-opacity", loading && "opacity-40")}>
        {grid.map((day) => {
          const key = toDateKey(day);
          const info = map.get(key);
          const inMonth = isSameMonth(day, month);
          const selectable = inMonth && info?.status === "available";
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              disabled={!selectable}
              onClick={() => onChange(key)}
              title={info ? (info.status === "available" ? `${info.available} times available` : info.status) : undefined}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-all duration-200",
                !inMonth && "pointer-events-none opacity-0",
                selected
                  ? "gold-fill font-semibold text-ink-950 shadow-[0_10px_30px_-12px_rgba(209,169,92,0.9)]"
                  : selectable
                    ? "border border-white/10 bg-white/[0.03] text-white hover:-translate-y-0.5 hover:border-gold-400/50 hover:bg-white/[0.07]"
                    : "text-white/20",
                inMonth && info?.status === "full" && "line-through",
              )}
            >
              {format(day, "d")}
              {selectable && !selected ? <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-gold-400" /> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-white/40">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-400" /> Available
        </span>
        <span className="line-through">Fully booked</span>
        <span className="text-white/25">Closed / past</span>
      </div>
    </div>
  );
}

export function BookingWizard({
  initialPackageId,
  initialClientId,
  initialDate,
  initialPhotographerId,
}: {
  initialPackageId?: number;
  initialClientId?: number;
  initialDate?: string;
  /** Preferred photographer, e.g. `?photographer=2` from a public profile page. */
  initialPhotographerId?: number;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { mutate } = useSWRConfig();

  const { data: pkgData, isLoading: pkgLoading } = useSWR<{ results: PackageDTO[] }>("/packages");
  const { data: teamData } = useSWR<{ results: PhotographerDTO[] }>("/photographers");
  const { data: clientData, mutate: mutateClients } = useSWR<Paginated<ClientDTO>>(isAdmin ? "/clients?pageSize=500&sort=name" : null);
  const { data: settingsData } = useSWR<{ settings: StudioSettingsDTO; today: string }>("/settings");
  const currency = settingsData?.settings.currency ?? "USD";
  const studioName = settingsData?.settings.studioName ?? "Lumière Studio";

  const [step, setStep] = useState(initialPackageId ? 1 : 0);
  const [packageId, setPackageId] = useState<number | null>(initialPackageId ?? null);
  const [photographerId, setPhotographerId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(initialDate ? parseDateKey(initialDate) : new Date()));
  const [date, setDate] = useState<string | null>(initialDate ?? null);
  const [slot, setSlot] = useState<number | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [customTime, setCustomTime] = useState("10:00");
  const [clientId, setClientId] = useState<number | null>(initialClientId ?? null);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [status, setStatus] = useState<BookingStatus>("approved");
  const [discount, setDiscount] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [clientModal, setClientModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<BookingDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const packages = pkgData?.results ?? [];
  const pkg = packages.find((p) => p.id === packageId) ?? null;
  const photographer = teamData?.results.find((p) => p.id === photographerId) ?? null;
  const selectedClient = clientData?.results.find((c) => c.id === clientId) ?? null;
  const pq = photographerId ? `&photographerId=${photographerId}` : "";
  const monthKey = format(month, "yyyy-MM");
  const { data: monthData, isLoading: monthLoading } = useSWR<{ days: DaySummary[] }>(pkg ? `/availability/month?month=${monthKey}&packageId=${pkg.id}${pq}` : null);
  const { data: dayData, isLoading: dayLoading, mutate: refreshDay } = useSWR<AvailabilityResponse>(pkg && date ? `/availability?date=${date}&packageId=${pkg.id}${pq}` : null);

  useEffect(() => {
    setSlot(null);
  }, [date, photographerId, packageId]);

  const startMinutes = useCustom && isAdmin ? timeToMinutes(customTime) : slot;
  const discountCents = isAdmin && discount ? inputToCents(discount) : 0;
  const net = pkg ? Math.max(0, pkg.priceCents - (Number.isFinite(discountCents) ? discountCents : 0)) : 0;
  const deposit = pkg ? Math.round((net * pkg.depositPercent) / 100) : 0;
  const endMinutes = pkg && startMinutes != null && Number.isFinite(startMinutes) ? startMinutes + pkg.durationMinutes : null;
  const canNext = [!!pkg, !!date && startMinutes != null && Number.isFinite(startMinutes), !isAdmin || !!clientId, true][step];

  async function submit() {
    if (!pkg || !date || startMinutes == null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ booking: BookingDTO }>("/bookings", {
        method: "POST",
        body: {
          packageId: pkg.id,
          date,
          startMinutes,
          photographerId,
          clientId: isAdmin ? clientId : undefined,
          location: location.trim() || null,
          notes: notes.trim() || null,
          internalNotes: isAdmin ? internalNotes.trim() || null : undefined,
          status: isAdmin ? status : undefined,
          discountCents: isAdmin && Number.isFinite(discountCents) ? discountCents : undefined,
          sendEmail,
        },
      });
      setCreated(res.booking);
      toast.success("Booking confirmed — confirmation email sent");
      void mutate((key) => typeof key === "string" && ["/bookings", "/dashboard", "/availability", "/payments", "/clients"].some((p) => key.startsWith(p)));
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      toast.error(msg);
      if (err instanceof ApiClientError && err.status === 409) {
        setSlot(null);
        setStep(1);
        void refreshDay();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setCreated(null);
    setStep(0);
    setPackageId(null);
    setDate(null);
    setSlot(null);
    setNotes("");
    setLocation("");
    setInternalNotes("");
    setDiscount("");
  }

  if (created) {
    return (
      <div className="mx-auto max-w-2xl animate-scale-in">
        <Card className="relative overflow-hidden p-8 text-center sm:p-12">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-gold-400/20 blur-3xl" />
          <span className="relative mx-auto grid h-20 w-20 place-items-center rounded-full gold-fill text-ink-950 shadow-[0_20px_60px_-15px_rgba(209,169,92,0.9)]">
            <Check className="h-9 w-9" strokeWidth={2.5} />
          </span>
          <p className="relative mt-6 text-[11px] uppercase tracking-[0.3em] text-gold-300">Reference {created.reference}</p>
          <h1 className="relative mt-2 font-display text-4xl text-white sm:text-5xl">{isAdmin ? "Booking created" : "You're booked!"}</h1>
          <p className="relative mx-auto mt-3 max-w-md text-sm text-white/55">
            {created.title} on {formatDateKey(created.date, "long")} at {minutesToLabel(created.startMinutes)} with {created.photographer?.name ?? "our team"}.
            {sendEmail ? " A confirmation email is on its way." : ""}
          </p>
          <div className="relative mt-8 grid gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-left text-sm sm:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Total</p>
              <p className="mt-1 text-white">{formatMoney(created.netCents, currency)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Advance to reserve</p>
              <p className="mt-1 text-gold-200">{formatMoney(created.depositCents, currency)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Invoice</p>
              <p className="mt-1 text-white">{created.invoiceNumber}</p>
            </div>
          </div>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href={`/dashboard/bookings/${created.id}`}>
              <CalendarCheck className="h-4 w-4" /> View booking
            </ButtonLink>
            <Button variant="outline" onClick={() => downloadIcs(created, studioName)}>
              <Download className="h-4 w-4" /> Add to calendar
            </Button>
            <Button variant="ghost" onClick={reset}>
              <CalendarPlus className="h-4 w-4" /> Book another
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Online booking"
        title={isAdmin ? "Create a booking" : "Book your session"}
        description="Live availability with automatic double-booking protection."
      />

      <div className="no-scrollbar mb-8 flex items-center gap-2 overflow-x-auto">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={cn(
                "flex items-center gap-2.5 whitespace-nowrap rounded-full py-1.5 pl-1.5 pr-4 text-xs transition",
                i === step ? "bg-white text-ink-950" : i < step ? "bg-white/[0.06] text-white hover:bg-white/10" : "text-white/35",
              )}
            >
              <span
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold",
                  i === step ? "gold-fill text-ink-950" : i < step ? "bg-gold-400/20 text-gold-200" : "bg-white/5",
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 ? <span className="h-px w-6 bg-white/10" /> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 animate-fade-in" key={step}>
          {step === 0 ? (
            pkgLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-64" />
                ))}
              </div>
            ) : packages.length === 0 ? (
              <EmptyState icon={Sparkles} title="No packages available" description="The studio hasn't published any packages yet." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {packages.map((p) => {
                  const selected = p.id === packageId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPackageId(p.id);
                        setDate(null);
                      }}
                      className={cn(
                        "group glass relative overflow-hidden rounded-3xl text-left transition duration-300 hover:-translate-y-0.5",
                        selected ? "border-gold-400/60 ring-2 ring-gold-400/40" : "hover:border-white/20",
                      )}
                    >
                      <div className="relative h-36 overflow-hidden">
                        {p.coverUrl ? <img src={p.coverUrl} alt={p.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : null}
                        <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/30 to-transparent" />
                        {selected ? (
                          <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full gold-fill text-ink-950">
                            <Check className="h-4 w-4" />
                          </span>
                        ) : p.popular ? (
                          <Badge tone="gold" className="absolute right-3 top-3">
                            Most loved
                          </Badge>
                        ) : null}
                        <span className="absolute bottom-3 left-4 text-[10px] uppercase tracking-[0.25em] text-gold-200">{p.category}</span>
                      </div>
                      <div className="p-5">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-display text-xl text-white">{p.name}</p>
                          <p className="font-display text-xl gold-text">{formatMoney(p.priceCents, currency)}</p>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/45">{p.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/55">
                          <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
                            <Clock className="h-3 w-3" /> {formatDuration(p.durationMinutes)}
                          </span>
                          <span className="rounded-full bg-white/5 px-2 py-0.5">{p.depositPercent}% advance</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : null}

          {step === 1 && pkg ? (
            <div className="space-y-6">
              <Card>
                <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-white/40">Photographer preference</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPhotographerId(null)}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition",
                      photographerId == null ? "border-gold-400/60 bg-gold-400/10 text-white" : "border-white/10 text-white/60 hover:border-white/25",
                    )}
                  >
                    <Users className="h-4 w-4 text-gold-300" /> Any available
                  </button>
                  {teamData?.results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPhotographerId(p.id)}
                      title={p.bio ?? undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition",
                        photographerId === p.id ? "border-gold-400/60 bg-gold-400/10 text-white" : "border-white/10 text-white/60 hover:border-white/25",
                      )}
                    >
                      <Avatar name={p.name} color={p.color} size="xs" />
                      <span className="text-left">
                        <span className="block leading-tight">{p.name}</span>
                        {p.specialty ? <span className="block text-[10px] leading-tight text-white/40">{p.specialty}</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <MonthPicker month={month} onMonth={setMonth} days={monthData?.days} loading={monthLoading} value={date} onChange={setDate} />
                </Card>
                <Card>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Available times</p>
                  <p className="mb-4 mt-1 font-display text-2xl text-white">{date ? formatDateKey(date, "long") : "Select a date"}</p>
                  {!date ? (
                    <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">Pick a highlighted day to see open times.</p>
                  ) : dayData?.closed ? (
                    <p className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100/80">{dayData.reason}</p>
                  ) : (
                    <SlotGrid
                      slots={dayData?.slots}
                      value={useCustom ? null : slot}
                      onChange={(s) => {
                        setUseCustom(false);
                        setSlot(s);
                      }}
                      loading={dayLoading}
                    />
                  )}
                  {isAdmin && date ? (
                    <div className="mt-5 space-y-3 border-t border-white/[0.06] pt-4">
                      <Toggle checked={useCustom} onChange={setUseCustom} label="Custom start time" description="Admin override — conflicts are still prevented" />
                      {useCustom ? <Input type="time" step={900} value={customTime} onChange={(e) => setCustomTime(e.target.value)} /> : null}
                    </div>
                  ) : null}
                  {dayData?.timezone ? <p className="mt-4 text-[11px] text-white/30">Times shown in studio time ({dayData.timezone}).</p> : null}
                </Card>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <Card className="space-y-5">
              {isAdmin ? (
                <Field label="Client" required hint={selectedClient ? `${selectedClient.email}${selectedClient.phone ? ` · ${selectedClient.phone}` : ""}` : undefined}>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Select value={clientId ?? ""} onChange={(e) => setClientId(Number(e.target.value) || null)}>
                        <option value="">{clientData ? "Select a client…" : "Loading clients…"}</option>
                        {clientData?.results.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} — {c.email}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button variant="outline" onClick={() => setClientModal(true)}>
                      <UserPlus className="h-4 w-4" /> New
                    </Button>
                  </div>
                </Field>
              ) : null}
              <Field label="Location" hint="Leave blank for our studio, or enter an address for on-location shoots">
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Studio" />
              </Field>
              <Field label={isAdmin ? "Client notes" : "Anything we should know?"}>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ideas, outfits, people joining, accessibility needs…" />
              </Field>
              {isAdmin ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Status">
                      <Select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus)}>
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                      </Select>
                    </Field>
                    <Field label="Discount">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
                        <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="pl-7" placeholder="0" />
                      </div>
                    </Field>
                  </div>
                  <Field label="Internal notes" hint="Visible to staff only">
                    <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="min-h-[72px]" />
                  </Field>
                </>
              ) : null}
              <Toggle checked={sendEmail} onChange={setSendEmail} label="Send confirmation email" description={isAdmin ? "Emails the client their booking details" : "We'll email your booking details"} />
            </Card>
          ) : null}

          {step === 3 && pkg && date && startMinutes != null && endMinutes != null ? (
            <Card className="space-y-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Review & confirm</p>
                <h2 className="mt-1 font-display text-3xl text-white">{pkg.name}</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: CalendarCheck, label: "Date", value: formatDateKey(date, "long") },
                  { icon: Clock, label: "Time", value: `${timeRangeLabel(startMinutes, endMinutes)} (${formatDuration(pkg.durationMinutes)})` },
                  { icon: Users, label: "Photographer", value: photographer?.name ?? "Best available — assigned automatically" },
                  { icon: MapPin, label: "Location", value: location.trim() || settingsData?.settings.address || "Studio" },
                ].map((row) => (
                  <div key={row.label} className="flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <row.icon className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{row.label}</p>
                      <p className="mt-0.5 text-sm text-white">{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              {isAdmin && selectedClient ? (
                <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <Avatar name={selectedClient.name} />
                  <div>
                    <p className="text-sm text-white">{selectedClient.name}</p>
                    <p className="text-xs text-white/45">{selectedClient.email}</p>
                  </div>
                </div>
              ) : null}
              {error ? <p className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">{error}</p> : null}
              <p className="text-xs leading-relaxed text-white/40">
                By confirming, your time is reserved immediately. A {pkg.depositPercent}% advance ({formatMoney(deposit, currency)}) secures your booking; the balance is due before your
                session.
              </p>
            </Card>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submit} loading={submitting} size="lg">
                <CircleCheck className="h-4 w-4" /> Confirm booking
              </Button>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden p-0">
            <div className="relative h-32">
              {pkg?.coverUrl ? <img src={pkg.coverUrl} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-gradient-to-br from-gold-400/20 to-transparent" />}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-900 to-transparent" />
              <p className="absolute bottom-3 left-5 text-[10px] uppercase tracking-[0.3em] text-gold-200">Your session</p>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="font-display text-2xl text-white">{pkg?.name ?? "Choose a package"}</p>
                {pkg ? <p className="text-xs text-white/45">{formatDuration(pkg.durationMinutes)} · {pkg.deliverables}</p> : null}
              </div>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2 text-white/70">
                  <CalendarCheck className="h-4 w-4 text-gold-300" /> {date ? formatDateKey(date, "weekday") : "—"}
                </p>
                <p className="flex items-center gap-2 text-white/70">
                  <Clock className="h-4 w-4 text-gold-300" />
                  {startMinutes != null && endMinutes != null ? timeRangeLabel(startMinutes, endMinutes) : "—"}
                </p>
                <p className="flex items-center gap-2 text-white/70">
                  <Users className="h-4 w-4 text-gold-300" /> {photographer?.name ?? "Any available"}
                </p>
              </div>
              {pkg ? (
                <div className="space-y-2 border-t border-white/[0.07] pt-4 text-sm">
                  <div className="flex justify-between text-white/60">
                    <span>Package</span>
                    <span>{formatMoney(pkg.priceCents, currency)}</span>
                  </div>
                  {isAdmin && Number.isFinite(discountCents) && discountCents > 0 ? (
                    <div className="flex justify-between text-emerald-300">
                      <span>Discount</span>
                      <span>−{formatMoney(Math.min(discountCents, pkg.priceCents), currency)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-white">
                    <span>Total</span>
                    <span className="font-display text-xl">{formatMoney(net, currency)}</span>
                  </div>
                  <div className="flex justify-between rounded-xl bg-gold-400/10 px-3 py-2 text-gold-100">
                    <span>Advance ({pkg.depositPercent}%)</span>
                    <span>{formatMoney(deposit, currency)}</span>
                  </div>
                </div>
              ) : null}
              {!isAdmin ? (
                <p className="text-[11px] leading-relaxed text-white/35">
                  Need help? <Link href="/dashboard/packages" className="text-gold-300">Compare packages</Link> or reply to any studio email.
                </p>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>

      <ClientFormModal
        open={clientModal}
        onClose={() => setClientModal(false)}
        onSaved={(c) => {
          void mutateClients();
          setClientId(c.id);
        }}
      />
    </div>
  );
}
