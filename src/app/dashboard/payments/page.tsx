"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { CircleCheck, CreditCard, FileText, Hourglass, Plus, Receipt, Trash2, TrendingUp, Wallet } from "lucide-react";
import { PaymentFormModal } from "@/components/forms";
import { PendingVerificationQueue, StudioWalletCard } from "@/components/manual-payment";
import { useAuth } from "@/components/providers";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  PaymentStateBadge,
  ProgressBar,
  SearchInput,
  Select,
  Skeleton,
  StatCard,
  Tabs,
  useDebounced,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/client-api";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_META,
  PAYMENT_TYPE_LABELS,
  cn,
  formatDate,
  formatDateKey,
  formatMoney,
  type BookingDTO,
  type Paginated,
  type PaymentDTO,
  type PaymentMethod,
} from "@/lib/shared";

type AdminSummary = {
  role: "admin";
  currency: string;
  collectedTotalCents: number;
  collectedMonthCents: number;
  pendingPaymentsCents: number;
  transactions: number;
  outstandingCents: number;
  outstandingCount: number;
  byMethod: { method: PaymentMethod; cents: number }[];
};
type ClientSummary = { role: "client"; currency: string; paidCents: number; dueCents: number; outstandingCount: number };

export default function PaymentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<"transactions" | "outstanding">("transactions");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 300);
  const [page, setPage] = useState(1);
  const [recording, setRecording] = useState<{ open: boolean; booking: BookingDTO | null }>({ open: false, booking: null });
  const [deleting, setDeleting] = useState<PaymentDTO | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setPage(1), [status, method, debounced]);

  const params = new URLSearchParams({ page: String(page), pageSize: "15" });
  if (status) params.set("status", status);
  if (method) params.set("method", method);
  if (debounced) params.set("q", debounced);

  const { data: summary, mutate: mutateSummary } = useSWR<AdminSummary | ClientSummary>("/payments/summary");
  const { data: txns, error, isLoading, mutate } = useSWR<Paginated<PaymentDTO>>(`/payments?${params}`);
  const { data: outstanding, mutate: mutateOutstanding } = useSWR<{ results: BookingDTO[]; totalDueCents: number; count: number }>("/payments/outstanding");
  const currency = summary?.currency ?? "USD";

  const refresh = () => {
    void mutate();
    void mutateSummary();
    void mutateOutstanding();
  };

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/payments/${deleting.id}`, { method: "DELETE" });
      toast.success("Payment removed");
      setDeleting(null);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const admin = summary?.role === "admin" ? summary : null;
  const client = summary?.role === "client" ? summary : null;
  const methodMax = Math.max(...(admin?.byMethod.map((m) => m.cents) ?? [1]), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title={isAdmin ? "Payments" : "Payments & invoices"}
        description={isAdmin ? "Advances, balances, refunds and outstanding dues across every booking." : "Your payment history, balances and invoices."}
        actions={
          isAdmin ? (
            <Button onClick={() => setRecording({ open: true, booking: null })}>
              <Plus className="h-4 w-4" /> Record payment
            </Button>
          ) : null
        }
      />

      {admin ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Collected this month" value={formatMoney(admin.collectedMonthCents, currency)} icon={TrendingUp} />
          <StatCard label="Total collected" value={formatMoney(admin.collectedTotalCents, currency)} icon={CircleCheck} hint={`${admin.transactions} transactions`} delay={60} />
          <StatCard label="Outstanding" value={formatMoney(admin.outstandingCents, currency)} icon={Wallet} hint={`${admin.outstandingCount} bookings`} delay={120} />
          <StatCard label="Pending payments" value={formatMoney(admin.pendingPaymentsCents, currency)} icon={Hourglass} hint="Awaiting confirmation" delay={180} />
        </div>
      ) : client ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total paid" value={formatMoney(client.paidCents, currency)} icon={CircleCheck} />
          <StatCard label="Balance due" value={formatMoney(client.dueCents, currency)} icon={Wallet} delay={60} />
          <StatCard label="Open invoices" value={client.outstandingCount} icon={FileText} delay={120} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {/* Manual bKash / Nagad: admins review claims, clients see where to pay. */}
      {admin ? <PendingVerificationQueue currency={currency} /> : null}
      {client && client.dueCents > 0 ? <StudioWalletCard amountDue={client.dueCents} currency={currency} /> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className={cn("p-4 sm:p-5", admin ? "xl:col-span-2" : "xl:col-span-3")}>
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              value={tab}
              onChange={setTab}
              options={[
                { value: "transactions", label: "Transactions", count: txns?.count },
                { value: "outstanding", label: "Outstanding", count: outstanding?.count },
              ]}
            />
            {tab === "transactions" ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="sm:w-36">
                  <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </Select>
                </div>
                <div className="sm:w-40">
                  <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="">All methods</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </div>
                {isAdmin ? <SearchInput value={q} onChange={setQ} placeholder="Client, invoice, reference…" className="sm:w-60" /> : null}
              </div>
            ) : null}
          </div>

          {tab === "transactions" ? (
            error ? (
              <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />
            ) : isLoading && !txns ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : !txns?.results.length ? (
              <EmptyState icon={Receipt} title="No payments found" description="Recorded payments will appear here." />
            ) : (
              <>
                <div className="-mx-2 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-white/35">
                        <th className="px-3 pb-3 font-medium">Date</th>
                        {isAdmin ? <th className="px-3 pb-3 font-medium">Client</th> : null}
                        <th className="px-3 pb-3 font-medium">Invoice</th>
                        <th className="px-3 pb-3 font-medium">Type · Method</th>
                        <th className="px-3 pb-3 font-medium">Status</th>
                        <th className="px-3 pb-3 text-right font-medium">Amount</th>
                        {isAdmin ? <th className="px-3 pb-3" /> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {txns.results.map((p) => (
                        <tr key={p.id} className="transition hover:bg-white/[0.02]">
                          <td className="px-3 py-3 text-white/70">{formatDate(p.paidAt)}</td>
                          {isAdmin ? (
                            <td className="px-3 py-3">
                              <Link href={`/dashboard/clients/${p.client?.id}`} className="text-white hover:text-gold-200">
                                {p.client?.name}
                              </Link>
                            </td>
                          ) : null}
                          <td className="px-3 py-3">
                            <Link href={`/dashboard/invoices/${p.bookingId}`} className="text-white/80 hover:text-gold-200">
                              {p.booking?.invoiceNumber ?? p.booking?.reference}
                            </Link>
                            <p className="text-[11px] text-white/40">{p.booking?.title}</p>
                          </td>
                          <td className="px-3 py-3 text-white/60">
                            {PAYMENT_TYPE_LABELS[p.type]} · {PAYMENT_METHOD_LABELS[p.method]}
                            {p.reference ? <p className="text-[11px] text-white/35">{p.reference}</p> : null}
                          </td>
                          <td className="px-3 py-3">
                            <Badge tone={PAYMENT_STATUS_META[p.status].tone}>{PAYMENT_STATUS_META[p.status].label}</Badge>
                          </td>
                          <td className={cn("px-3 py-3 text-right font-display text-lg", p.type === "refund" ? "text-rose-300" : "text-white")}>
                            {p.type === "refund" ? "−" : ""}
                            {formatMoney(p.amountCents, currency)}
                          </td>
                          {isAdmin ? (
                            <td className="px-3 py-3 text-right">
                              <Button variant="ghost" size="icon" aria-label="Delete payment" onClick={() => setDeleting(p)}>
                                <Trash2 className="h-4 w-4 text-rose-300/70" />
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={txns.page} totalPages={txns.totalPages} count={txns.count} onPage={setPage} />
              </>
            )
          ) : !outstanding ? (
            <Skeleton className="h-48" />
          ) : outstanding.results.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nothing outstanding" description="Every booking is fully paid." />
          ) : (
            <div className="space-y-3">
              {outstanding.results.map((b) => (
                <div key={b.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/dashboard/bookings/${b.id}`} className="text-sm text-white hover:text-gold-200">
                        {isAdmin ? `${b.client.name} · ` : ""}
                        {b.title}
                      </Link>
                      <p className="text-[11px] text-white/40">
                        {b.invoiceNumber ?? b.reference} · session {formatDateKey(b.date, "medium")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl text-gold-200">{formatMoney(b.dueCents, currency)}</p>
                      <p className="text-[11px] text-white/40">of {formatMoney(b.netCents, currency)}</p>
                    </div>
                  </div>
                  <ProgressBar value={b.netCents ? (b.paidCents / b.netCents) * 100 : 0} className="mt-3" />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <PaymentStateBadge state={b.paymentStatus} />
                    <div className="flex gap-2">
                      <ButtonLink href={`/dashboard/invoices/${b.id}`} variant="ghost" size="sm">
                        <FileText className="h-3.5 w-3.5" /> Invoice
                      </ButtonLink>
                      {isAdmin ? (
                        <Button size="sm" onClick={() => setRecording({ open: true, booking: b })}>
                          <CreditCard className="h-3.5 w-3.5" /> Record payment
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {admin ? (
          <Card>
            <CardHeader icon={CreditCard} title="By payment method" description="All-time collected" />
            <div className="space-y-4">
              {admin.byMethod.length === 0 ? <p className="text-sm text-white/40">No payments yet.</p> : null}
              {[...admin.byMethod]
                .sort((a, b) => b.cents - a.cents)
                .map((m) => (
                  <div key={m.method}>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">{PAYMENT_METHOD_LABELS[m.method]}</span>
                      <span className="text-white">{formatMoney(m.cents, currency)}</span>
                    </div>
                    <ProgressBar value={(m.cents / methodMax) * 100} className="mt-2" />
                  </div>
                ))}
            </div>
          </Card>
        ) : null}
      </div>

      {isAdmin ? (
        <PaymentFormModal open={recording.open} booking={recording.booking} currency={currency} onClose={() => setRecording({ open: false, booking: null })} onSaved={refresh} />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this payment?"
        message={deleting ? `${formatMoney(deleting.amountCents, currency)} (${PAYMENT_TYPE_LABELS[deleting.type]}) will be removed and the booking balance recalculated.` : null}
        confirmLabel="Delete payment"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}
