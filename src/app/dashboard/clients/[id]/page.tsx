"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ArrowLeft, CalendarCheck, CalendarPlus, Images, Mail, MapPin, Pencil, Phone, Sparkles, StickyNote, Wallet } from "lucide-react";
import { ClientFormModal } from "@/components/forms";
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
  PageLoader,
  PaymentStateBadge,
  StatCard,
} from "@/components/ui";
import { errorMessage } from "@/lib/client-api";
import {
  ACTIVE_BOOKING_STATUSES,
  formatDate,
  formatDateKey,
  formatMoney,
  timeRangeLabel,
  type BookingDTO,
  type ClientDTO,
  type GalleryStatus,
} from "@/lib/shared";

type ClientDetail = {
  client: ClientDTO;
  bookings: BookingDTO[];
  galleries: { id: number; title: string; status: GalleryStatus; createdAt: string }[];
  today: string;
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, mutate } = useSWR<ClientDetail>(`/clients/${id}`);
  const { data: settings } = useSWR<{ settings: { currency: string } }>("/settings");
  const [editing, setEditing] = useState(false);
  const currency = settings?.settings.currency ?? "USD";

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />;
  if (isLoading || !data) return <PageLoader />;
  const { client: c, bookings, galleries, today } = data;
  const upcoming = bookings.filter((b) => b.date >= today && ACTIVE_BOOKING_STATUSES.includes(b.status)).reverse();
  const history = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="space-y-6">
      <Link href="/dashboard/clients" className="inline-flex items-center gap-2 text-xs text-white/45 transition hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" /> All clients
      </Link>

      <div className="glass relative animate-fade-up overflow-hidden rounded-[2rem] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <Avatar name={c.name} size="xl" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-4xl text-white">{c.name}</h1>
                {c.hasAccount ? <Badge tone="sky">Portal account</Badge> : <Badge>No portal login</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/55">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-gold-300" /> {c.email}
                </span>
                {c.phone ? (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-gold-300" /> {c.phone}
                  </span>
                ) : null}
                {c.address || c.city ? (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-gold-300" /> {[c.address, c.city].filter(Boolean).join(", ")}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.tags.map((t) => (
                  <span key={t} className="rounded-full bg-gold-400/10 px-2 py-0.5 text-[11px] text-gold-200">
                    {t}
                  </span>
                ))}
                {c.source ? <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/50">via {c.source}</span> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <ButtonLink href={`/dashboard/bookings/new?clientId=${c.id}`}>
              <CalendarPlus className="h-4 w-4" /> New booking
            </ButtonLink>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sessions" value={c.bookingsCount} icon={CalendarCheck} hint={`${upcoming.length} upcoming`} />
        <StatCard label="Lifetime spend" value={formatMoney(c.totalSpentCents, currency)} icon={Sparkles} delay={60} />
        <StatCard label="Outstanding" value={formatMoney(c.dueCents, currency)} icon={Wallet} delay={120} />
        <StatCard label="Client since" value={formatDate(c.createdAt).replace(/,.*/, "")} icon={CalendarCheck} hint={formatDate(c.createdAt)} delay={180} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={CalendarCheck} title="Booking history" description={`${bookings.length} total bookings`} />
            {bookings.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="No bookings yet" action={<ButtonLink href={`/dashboard/bookings/new?clientId=${c.id}`}>Create first booking</ButtonLink>} />
            ) : (
              <div className="space-y-6">
                {upcoming.length ? (
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-gold-300">Upcoming</p>
                    <BookingTable bookings={upcoming} currency={currency} />
                  </div>
                ) : null}
                {history.length ? (
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/35">Past & cancelled</p>
                    <BookingTable bookings={history} currency={currency} />
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader icon={StickyNote} title="Notes" />
            <p className="whitespace-pre-line text-sm leading-relaxed text-white/60">{c.notes || "No notes yet."}</p>
          </Card>
          <Card>
            <CardHeader icon={Images} title="Galleries" />
            {galleries.length === 0 ? (
              <p className="text-sm text-white/40">No galleries yet.</p>
            ) : (
              <div className="space-y-2">
                {galleries.map((g) => (
                  <Link key={g.id} href={`/dashboard/galleries/${g.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-2.5 transition hover:bg-white/[0.05]">
                    <span className="truncate text-sm text-white">{g.title}</span>
                    <Badge tone={g.status === "published" ? "emerald" : "amber"}>{g.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ClientFormModal open={editing} onClose={() => setEditing(false)} client={c} onSaved={() => void mutate()} />
    </div>
  );
}

function BookingTable({ bookings, currency }: { bookings: BookingDTO[]; currency: string }) {
  return (
    <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06]">
      {bookings.map((b) => (
        <Link key={b.id} href={`/dashboard/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
          <div className="min-w-0">
            <p className="text-sm text-white">{b.title}</p>
            <p className="text-[11px] text-white/40">
              {b.reference} · {formatDateKey(b.date, "medium")} · {timeRangeLabel(b.startMinutes, b.endMinutes)}
              {b.photographer ? ` · ${b.photographer.name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BookingStatusBadge status={b.status} />
            {b.status !== "cancelled" ? <PaymentStateBadge state={b.paymentStatus} /> : null}
            <span className="w-20 text-right text-sm text-white">{formatMoney(b.netCents, currency)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
