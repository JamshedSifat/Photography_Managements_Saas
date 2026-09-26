"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, ErrorState, PageLoader } from "@/components/ui";
import { errorMessage } from "@/lib/client-api";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  cn,
  formatDate,
  formatDateKey,
  formatDuration,
  formatMoney,
  timeRangeLabel,
  type BookingDetailResponse,
} from "@/lib/shared";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, mutate } = useSWR<BookingDetailResponse>(`/bookings/${id}`);

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />;
  if (isLoading || !data) return <PageLoader />;

  const { booking: b, payments, studio } = data;
  const currency = studio.currency;
  const paid = payments.filter((p) => p.status === "paid");
  const stamp = b.status === "cancelled" ? { label: "Cancelled", cls: "border-zinc-400 text-zinc-500" } : b.paymentStatus === "paid" ? { label: "Paid", cls: "border-emerald-600 text-emerald-600" } : b.paymentStatus === "partial" ? { label: "Partially paid", cls: "border-amber-600 text-amber-600" } : { label: "Payment due", cls: "border-rose-600 text-rose-600" };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dashboard/bookings/${b.id}`} className="inline-flex items-center gap-2 text-xs text-white/45 transition hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to booking
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>

      <div className="print-paper relative animate-fade-up overflow-hidden rounded-[2rem] bg-white p-8 text-zinc-900 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] sm:p-12">
        <div className="absolute inset-x-0 top-0 h-1.5 gold-fill" />
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-display text-3xl tracking-[0.3em] text-zinc-900">{studio.name.toUpperCase()}</p>
            {studio.tagline ? <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#9a7b3f]">{studio.tagline}</p> : null}
            <div className="mt-4 space-y-0.5 text-sm text-zinc-500">
              {studio.address ? <p>{studio.address}</p> : null}
              <p>{studio.email}</p>
              {studio.phone ? <p>{studio.phone}</p> : null}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="font-display text-5xl text-zinc-900">Invoice</p>
            <p className="mt-2 text-sm text-zinc-500">
              No. <span className="font-medium text-zinc-900">{b.invoiceNumber ?? b.reference}</span>
            </p>
            <p className="text-sm text-zinc-500">Issued {formatDate(b.createdAt)}</p>
            <p className="text-sm text-zinc-500">Booking ref. {b.reference}</p>
          </div>
        </div>

        <div className="mt-10 grid gap-6 border-y border-zinc-200 py-6 sm:grid-cols-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#9a7b3f]">Billed to</p>
            <p className="mt-2 font-medium text-zinc-900">{b.client.name}</p>
            <p className="text-sm text-zinc-500">{b.client.email}</p>
            {b.client.phone ? <p className="text-sm text-zinc-500">{b.client.phone}</p> : null}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#9a7b3f]">Session</p>
            <p className="mt-2 font-medium text-zinc-900">{formatDateKey(b.date, "long")}</p>
            <p className="text-sm text-zinc-500">{timeRangeLabel(b.startMinutes, b.endMinutes)}</p>
            <p className="text-sm text-zinc-500">{b.location ?? studio.address ?? "Studio"}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#9a7b3f]">Balance due</p>
            <p className="mt-2 font-display text-4xl text-zinc-900">{formatMoney(b.dueCents, currency)}</p>
            <p className="text-sm text-zinc-500">{b.dueCents > 0 ? "Due before your session" : "Nothing outstanding"}</p>
          </div>
        </div>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              <th className="pb-3 font-medium">Description</th>
              <th className="pb-3 text-center font-medium">Qty</th>
              <th className="pb-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-100">
              <td className="py-4">
                <p className="font-medium text-zinc-900">{b.title}</p>
                <p className="text-xs text-zinc-500">
                  {b.package?.category ?? "Photography session"} · {formatDuration(b.endMinutes - b.startMinutes)}
                  {b.photographer ? ` · Photographer: ${b.photographer.name}` : ""}
                </p>
              </td>
              <td className="py-4 text-center text-zinc-600">1</td>
              <td className="py-4 text-right text-zinc-900">{formatMoney(b.totalCents, currency)}</td>
            </tr>
            {b.discountCents > 0 ? (
              <tr className="border-b border-zinc-100">
                <td className="py-3 text-zinc-600">Discount</td>
                <td />
                <td className="py-3 text-right text-emerald-700">−{formatMoney(b.discountCents, currency)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="mt-6 flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="relative sm:w-1/2">
            <div className={cn("inline-block -rotate-6 rounded-xl border-4 px-5 py-2 font-display text-3xl uppercase tracking-[0.2em] opacity-80", stamp.cls)}>{stamp.label}</div>
          </div>
          <div className="w-full space-y-2 text-sm sm:w-72">
            <div className="flex justify-between text-zinc-600">
              <span>Subtotal</span>
              <span>{formatMoney(b.netCents, currency)}</span>
            </div>
            {paid.map((p) => (
              <div key={p.id} className="flex justify-between text-zinc-500">
                <span>
                  {PAYMENT_TYPE_LABELS[p.type]} · {PAYMENT_METHOD_LABELS[p.method]} · {formatDate(p.paidAt)}
                </span>
                <span>
                  {p.type === "refund" ? "+" : "−"}
                  {formatMoney(p.amountCents, currency)}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-zinc-200 pt-3 text-base font-medium text-zinc-900">
              <span>Balance due</span>
              <span>{formatMoney(b.dueCents, currency)}</span>
            </div>
            <p className="text-right text-xs text-zinc-400">Advance required: {formatMoney(b.depositCents, currency)}</p>
          </div>
        </div>

        {studio.invoiceNotes ? (
          <div className="mt-10 rounded-2xl bg-[#faf7f0] p-5 text-sm leading-relaxed text-zinc-600">
            <p className="mb-1 text-[10px] uppercase tracking-[0.25em] text-[#9a7b3f]">Notes & payment details</p>
            {studio.invoiceNotes}
          </div>
        ) : null}
        <p className="mt-10 text-center font-display text-xl italic text-zinc-400">Thank you for letting us tell your story.</p>
      </div>
    </div>
  );
}
