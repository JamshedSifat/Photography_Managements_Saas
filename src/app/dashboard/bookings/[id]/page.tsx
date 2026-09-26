"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import {
  ArrowLeft,
  BellRing,
  CalendarClock,
  CalendarX,
  CircleCheck,
  Clock,
  CreditCard,
  Download,
  FileText,
  Images,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  Send,
  StickyNote,
  Trash2,
  User,
  Smartphone,
  Users,
} from "lucide-react";
import { downloadIcs } from "@/components/booking-wizard";
import { PaymentFormModal, RescheduleModal } from "@/components/forms";
import { ManualPaymentModal, PaymentHistoryRow, StudioWalletCard } from "@/components/manual-payment";
import { useAuth } from "@/components/providers";
import {
  Avatar,
  Badge,
  BookingStatusBadge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  PaymentStateBadge,
  ProgressBar,
  Textarea,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/client-api";
import {
  ACTIVE_BOOKING_STATUSES,
  EMAIL_STATUS_META,
  EMAIL_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_META,
  PAYMENT_TYPE_LABELS,
  cn,
  formatDate,
  formatDateKey,
  formatDateTime,
  formatDuration,
  formatMoney,
  timeRangeLabel,
  toDateKey,
  type BookingDetailResponse,
} from "@/lib/shared";

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const key = `/bookings/${id}`;
  const { data, error, isLoading, mutate } = useSWR<BookingDetailResponse>(key);
  const { mutate: globalMutate } = useSWRConfig();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "cancel" | "delete">(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payingManually, setPayingManually] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (data) setNotes(data.booking.internalNotes ?? "");
  }, [data]);

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />;
  if (isLoading || !data || !user) return <PageLoader />;

  const { booking: b, payments, emails, assignment, studio } = data;
  const currency = studio.currency;
  const isAdmin = user.role === "admin";
  const isPhotographer = user.role === "photographer";
  const isClient = user.role === "client";
  const active = ACTIVE_BOOKING_STATUSES.includes(b.status);
  const upcoming = b.date >= toDateKey(new Date());

  const refreshAll = () => {
    void mutate();
    void globalMutate((k) => typeof k === "string" && ["/bookings?", "/dashboard", "/payments", "/clients", "/availability"].some((p) => k.startsWith(p)));
  };

  async function update(body: Record<string, unknown>, label: string, success: string) {
    setBusy(label);
    try {
      await api(key, { method: "PATCH", body });
      toast.success(success);
      refreshAll();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function notify(type: "confirmation" | "reminder") {
    setBusy(type);
    try {
      await api(`${key}/notify`, { method: "POST", body: { type } });
      toast.success(type === "reminder" ? "Reminder email sent" : "Confirmation email re-sent");
      refreshAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await api(key, { method: "DELETE" });
      toast.success("Booking deleted");
      refreshAll();
      router.replace("/dashboard/bookings");
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(null);
    }
  }

  const paidPct = b.netCents ? Math.min(100, (b.paidCents / b.netCents) * 100) : 100;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/bookings" className="inline-flex items-center gap-2 text-xs text-white/45 transition hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to bookings
      </Link>

      <PageHeader
        eyebrow={`Booking ${b.reference}`}
        title={b.title}
        description={`${formatDateKey(b.date, "long")} · ${timeRangeLabel(b.startMinutes, b.endMinutes)}`}
        actions={
          <>
            {isAdmin && b.status === "pending" ? (
              <Button loading={busy === "confirm"} onClick={() => update({ status: "approved" }, "confirm", "Booking approved")}>
                <CircleCheck className="h-4 w-4" /> Confirm
              </Button>
            ) : null}
            {(isAdmin || isPhotographer) && ACTIVE_BOOKING_STATUSES.includes(b.status) ? (
              <Button variant={isAdmin ? "outline" : "primary"} loading={busy === "complete"} onClick={() => update({ status: "completed" }, "complete", "Session marked as completed")}>
                <CircleCheck className="h-4 w-4" /> Mark completed
              </Button>
            ) : null}
            {isAdmin && active ? (
              <Button variant="outline" onClick={() => setRescheduling(true)}>
                <CalendarClock className="h-4 w-4" /> Reschedule
              </Button>
            ) : null}
            {!isPhotographer ? (
              <ButtonLink href={`/dashboard/invoices/${b.id}`} variant="outline">
                <FileText className="h-4 w-4" /> Invoice
              </ButtonLink>
            ) : null}
            {(isAdmin || (isClient && upcoming)) && active ? (
              <Button variant="danger" onClick={() => setConfirm("cancel")}>
                <CalendarX className="h-4 w-4" /> Cancel
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <BookingStatusBadge status={b.status} />
        {!isPhotographer ? <PaymentStateBadge state={b.paymentStatus} /> : null}
        {b.confirmationSentAt ? <Badge tone="sky">Confirmation sent</Badge> : null}
        {b.reminderSentAt ? <Badge tone="violet">Reminder sent</Badge> : null}
        {b.invoiceNumber ? <Badge>{b.invoiceNumber}</Badge> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={Package} title="Session details" />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: CalendarClock, label: "Date", value: formatDateKey(b.date, "long") },
                { icon: Clock, label: "Time", value: `${timeRangeLabel(b.startMinutes, b.endMinutes)} · ${formatDuration(b.endMinutes - b.startMinutes)}` },
                { icon: MapPin, label: "Location", value: b.location ?? studio.address ?? "Studio" },
                { icon: Package, label: "Package", value: b.package ? `${b.package.name} · ${b.package.category}` : b.title },
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
            {b.notes ? (
              <div className="mt-4 rounded-2xl bg-white/[0.03] p-4">
                <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-white/35">Client notes</p>
                <p className="text-sm leading-relaxed text-white/70">{b.notes}</p>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => downloadIcs(b, studio.name)}>
                <Download className="h-3.5 w-3.5" /> Add to calendar
              </Button>
            </div>
          </Card>

          {!isPhotographer ? (
            <Card>
              <CardHeader
                icon={CreditCard}
                title="Payments"
                description="Advance, balance and receipts"
                action={
                  b.status !== "cancelled" && b.dueCents > 0 ? (
                    isAdmin ? (
                      <Button size="sm" onClick={() => setPaying(true)}>
                        <Plus className="h-3.5 w-3.5" /> Record payment
                      </Button>
                    ) : isClient ? (
                      <Button size="sm" onClick={() => setPayingManually(true)}>
                        <Smartphone className="h-3.5 w-3.5" /> Pay with bKash / Nagad
                      </Button>
                    ) : null
                  ) : null
                }
              />
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: "Package total", value: formatMoney(b.totalCents, currency) },
                  { label: "Discount", value: b.discountCents ? `−${formatMoney(b.discountCents, currency)}` : "—" },
                  { label: "Paid", value: formatMoney(b.paidCents, currency), tone: "text-emerald-300" },
                  { label: "Balance due", value: formatMoney(b.dueCents, currency), tone: "text-gold-200" },
                ].map((t) => (
                  <div key={t.label} className="rounded-2xl bg-white/[0.03] p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{t.label}</p>
                    <p className={cn("mt-1 font-display text-2xl text-white", t.tone)}>{t.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <ProgressBar value={paidPct} />
                <div className="mt-2 flex justify-between text-[11px] text-white/40">
                  <span>{Math.round(paidPct)}% paid</span>
                  <span>Advance {formatMoney(b.depositCents, currency)}</span>
                </div>
              </div>
              <div className="mt-5 divide-y divide-white/[0.06]">
                {payments.length === 0 ? (
                  <p className="py-4 text-sm text-white/40">No payments recorded yet.</p>
                ) : (
                  payments.map((p) => <PaymentHistoryRow key={p.id} payment={p} currency={currency} onReviewed={isAdmin ? refreshAll : undefined} />)
                )}
              </div>
              {isClient && b.dueCents > 0 && b.status !== "cancelled" ? (
                <div className="mt-4 space-y-3">
                  <StudioWalletCard amountDue={b.dueCents} currency={currency} />
                  <p className="text-xs leading-relaxed text-white/45">{studio.invoiceNotes ?? "Please settle your balance before your session."}</p>
                </div>
              ) : null}
            </Card>
          ) : null}

          {isAdmin || isPhotographer ? (
            <Card>
              <CardHeader icon={StickyNote} title="Internal notes" description="Visible to studio staff only" />
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shot list, gear, family dynamics, parking…" />
              <div className="mt-3 flex justify-end">
                <Button size="sm" variant="outline" loading={busy === "notes"} disabled={notes === (b.internalNotes ?? "")} onClick={() => update({ internalNotes: notes.trim() || null, notify: false }, "notes", "Notes saved")}>
                  Save notes
                </Button>
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={User} title="Client" />
            <div className="flex items-center gap-3">
              <Avatar name={b.client.name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-white">{b.client.name}</p>
                <p className="flex items-center gap-1.5 truncate text-xs text-white/45">
                  <Mail className="h-3 w-3" /> {b.client.email}
                </p>
                {b.client.phone ? (
                  <p className="flex items-center gap-1.5 text-xs text-white/45">
                    <Phone className="h-3 w-3" /> {b.client.phone}
                  </p>
                ) : null}
              </div>
            </div>
            {isAdmin ? (
              <ButtonLink href={`/dashboard/clients/${b.client.id}`} variant="outline" size="sm" className="mt-4 w-full">
                View client profile & history
              </ButtonLink>
            ) : null}
          </Card>

          <Card>
            <CardHeader icon={Users} title="Photographer" description={isAdmin && assignment ? "Assign based on live availability" : undefined} />
            {isAdmin && assignment ? (
              <div className="space-y-2">
                {assignment.map((p) => {
                  const current = b.photographer?.id === p.id;
                  return (
                    <div key={p.id} className={cn("flex items-center justify-between gap-3 rounded-2xl border p-3 transition", current ? "border-gold-400/40 bg-gold-400/[0.06]" : "border-white/[0.07] bg-white/[0.02]")}>
                      <span className="flex items-center gap-3">
                        <Avatar name={p.name} color={p.color} size="sm" />
                        <span>
                          <span className="block text-sm text-white">{p.name}</span>
                          <span className={cn("text-[11px]", current ? "text-gold-200" : p.available ? "text-emerald-300" : "text-rose-300")}>
                            {current ? "Currently assigned" : p.available ? "Available" : "Busy at this time"}
                          </span>
                        </span>
                      </span>
                      {current ? (
                        <Badge tone="gold">Assigned</Badge>
                      ) : (
                        <Button size="sm" variant="outline" disabled={!p.available} loading={busy === `assign-${p.id}`} onClick={() => update({ photographerId: p.id, notify: false }, `assign-${p.id}`, `Assigned to ${p.name}`)}>
                          Assign
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : b.photographer ? (
              <div className="flex items-center gap-3">
                <Avatar name={b.photographer.name} color={b.photographer.color} />
                <div>
                  <p className="text-sm text-white">{b.photographer.name}</p>
                  <p className="text-xs text-white/45">Your photographer</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/45">A photographer will be assigned shortly.</p>
            )}
          </Card>

          <Card>
            <CardHeader icon={Images} title="Gallery" />
            {b.gallery ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">Private gallery</span>
                  <Badge tone={b.gallery.status === "published" ? "emerald" : "amber"}>{b.gallery.status === "published" ? "Published" : "In editing"}</Badge>
                </div>
                {!isClient || b.gallery.status === "published" ? (
                  <ButtonLink href={`/dashboard/galleries/${b.gallery.id}`} variant="outline" size="sm" className="w-full">
                    Open gallery
                  </ButtonLink>
                ) : (
                  <p className="text-xs text-white/45">Your images are being lovingly edited. We&apos;ll email you when they&apos;re ready.</p>
                )}
              </div>
            ) : isClient ? (
              <EmptyState icon={Images} title="Coming soon" description="Your private gallery will appear here after your session." className="py-6" />
            ) : (
              <ButtonLink href={`/dashboard/galleries?new=1&bookingId=${b.id}`} size="sm" className="w-full">
                <Plus className="h-3.5 w-3.5" /> Create gallery
              </ButtonLink>
            )}
          </Card>

          {isAdmin ? (
            <Card>
              <CardHeader icon={BellRing} title="Notifications" description="Emails sent for this booking" />
              <div className="mb-4 grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" disabled={!active} loading={busy === "reminder"} onClick={() => notify("reminder")}>
                  <BellRing className="h-3.5 w-3.5" /> Reminder
                </Button>
                <Button size="sm" variant="outline" disabled={b.status === "cancelled"} loading={busy === "confirmation"} onClick={() => notify("confirmation")}>
                  <Send className="h-3.5 w-3.5" /> Confirmation
                </Button>
              </div>
              <div className="space-y-2">
                {emails.length === 0 ? <p className="text-xs text-white/40">No emails yet.</p> : null}
                {emails.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-white">{EMAIL_TYPE_LABELS[e.type]}</p>
                      <p className="text-[10px] text-white/35">{formatDateTime(e.createdAt)}</p>
                    </div>
                    <Badge tone={EMAIL_STATUS_META[e.status].tone}>{e.status}</Badge>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="ghost" className="mt-4 w-full text-rose-200/70 hover:text-rose-200" onClick={() => setConfirm("delete")}>
                <Trash2 className="h-3.5 w-3.5" /> Delete booking
              </Button>
            </Card>
          ) : null}
        </div>
      </div>

      {isAdmin ? <RescheduleModal open={rescheduling} onClose={() => setRescheduling(false)} booking={b} onSaved={refreshAll} /> : null}
      {isAdmin ? <PaymentFormModal open={paying} onClose={() => setPaying(false)} booking={b} currency={currency} onSaved={refreshAll} /> : null}
      {isClient ? (
        <ManualPaymentModal
          open={payingManually}
          onClose={() => setPayingManually(false)}
          bookingId={b.id}
          dueCents={b.dueCents}
          currency={currency}
          onSaved={refreshAll}
        />
      ) : null}
      <ConfirmDialog
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        title="Cancel this session?"
        message={
          <>
            The time slot will be released and {isAdmin ? "the client" : "you"} will receive a cancellation email.
            {b.paidCents > 0 ? " Any refund of payments already made is handled by the studio." : ""}
          </>
        }
        confirmLabel="Cancel session"
        loading={busy === "cancel"}
        onConfirm={async () => {
          const ok = await update({ status: "cancelled" }, "cancel", "Booking cancelled");
          if (ok) setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title="Delete booking permanently?"
        message="This removes the booking and all of its payment records. Galleries are kept but unlinked. This cannot be undone."
        confirmLabel="Delete booking"
        loading={busy === "delete"}
        onConfirm={remove}
      />
    </div>
  );
}
