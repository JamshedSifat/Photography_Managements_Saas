"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { BadgeCheck, Copy, Download, ImageIcon, Receipt, ShieldCheck, Smartphone, X } from "lucide-react";
import { api, errorMessage, uploadWithProgress } from "@/lib/client-api";
import { cn, formatDateTime, formatMoney, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META, STUDIO_MOBILE_PAYMENT, type PaymentDTO } from "@/lib/shared";
import { Badge, Button, ConfirmDialog, Field, Input, Modal, Select, Skeleton, Textarea } from "./ui";

/**
 * Manual bKash / Nagad payment UI.
 *
 * The studio takes money on its own wallet, so the client pays out-of-band and then
 * submits the transaction details here. Nothing is credited until an admin verifies it.
 */

/** Big, copyable display of the studio wallet number. */
export function StudioWalletCard({ amountDue, currency }: { amountDue?: number; currency?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(STUDIO_MOBILE_PAYMENT.number);
      setCopied(true);
      toast.success("Number copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — please note the number manually.");
    }
  };

  return (
    <div className="glass-gold rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-400/15 text-gold-200">
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-200/70">Send payment to</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="font-display text-3xl tracking-wide text-white">{STUDIO_MOBILE_PAYMENT.number}</p>
            <Button variant="outline" size="sm" onClick={() => void copy()} aria-label="Copy wallet number">
              {copied ? <BadgeCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-gold-100/70">{STUDIO_MOBILE_PAYMENT.label}</p>
          {amountDue != null && amountDue > 0 ? (
            <p className="mt-3 text-sm text-white/80">
              Amount due: <span className="font-display text-lg text-gold-200">{formatMoney(amountDue, currency)}</span>
            </p>
          ) : null}
          <ol className="mt-4 space-y-1.5 text-xs leading-relaxed text-gold-100/70">
            <li>1. Open bKash or Nagad and choose “Send Money”.</li>
            <li>2. Send the amount to the number above.</li>
            <li>3. Copy the Transaction ID (TrxID) from the confirmation SMS.</li>
            <li>4. Submit the details below — we verify it, usually within a few hours.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

/** Client-facing submission form. */
export function ManualPaymentModal({
  open,
  onClose,
  bookingId,
  dueCents,
  currency,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: number;
  dueCents: number;
  currency?: string;
  onSaved?: () => void;
}) {
  const [amount, setAmount] = useState(() => (dueCents / 100).toFixed(2));
  const [method, setMethod] = useState<"bkash" | "nagad">("bkash");
  const [transactionId, setTransactionId] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setTransactionId("");
    setSenderNumber("");
    setNotes("");
    setScreenshot(null);
    setErrors({});
    setProgress(null);
  };

  async function submit() {
    setSaving(true);
    setErrors({});
    try {
      const fields: Record<string, string> = {
        bookingId: String(bookingId),
        amountCents: String(Math.round(Number(amount) * 100)),
        method,
        transactionId: transactionId.trim(),
        senderNumber: senderNumber.trim(),
        paidAt: new Date(paidAt).toISOString(),
      };
      if (notes.trim()) fields.notes = notes.trim();

      if (screenshot) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(fields)) fd.append(k, v);
        fd.append("screenshot", screenshot);
        await uploadWithProgress("/payments/manual", fd, setProgress);
      } else {
        await api("/payments/manual", { method: "POST", body: { ...fields, amountCents: Number(fields.amountCents), bookingId } });
      }
      toast.success("Payment submitted — the studio will verify it shortly.");
      reset();
      onSaved?.();
      onClose();
    } catch (e) {
      const err = e as { fields?: Record<string, string> };
      if (err.fields) setErrors(err.fields);
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Submit your bKash / Nagad payment" size="lg">
      <div className="space-y-5">
        <StudioWalletCard amountDue={dueCents} currency={currency} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Wallet used" required>
            <Select value={method} onChange={(e) => setMethod(e.target.value as "bkash" | "nagad")}>
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
            </Select>
          </Field>
          <Field label="Amount paid" required error={errors.amountCents}>
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(errors.amountCents)} />
          </Field>
          <Field label="Transaction ID (TrxID)" required error={errors.transactionId} hint="From your bKash/Nagad confirmation SMS">
            <Input
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
              placeholder="e.g. 8N7A2K4L9P"
              invalid={Boolean(errors.transactionId)}
              autoComplete="off"
            />
          </Field>
          <Field label="Your wallet number" required error={errors.senderNumber} hint="The 11-digit number you paid from">
            <Input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="01XXXXXXXXX" inputMode="numeric" invalid={Boolean(errors.senderNumber)} />
          </Field>
          <Field label="Payment date & time" required error={errors.paidAt} className="sm:col-span-2">
            <Input type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} invalid={Boolean(errors.paidAt)} />
          </Field>
        </div>

        <Field label="Payment screenshot" hint="Optional, but it speeds up verification (max 8 MB)">
          {screenshot ? (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <ImageIcon className="h-4 w-4 shrink-0 text-gold-300" />
              <span className="min-w-0 flex-1 truncate text-xs text-white/70">{screenshot.name}</span>
              <button type="button" onClick={() => setScreenshot(null)} className="text-white/40 transition hover:text-white" aria-label="Remove screenshot">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Input type="file" accept="image/*" onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)} />
          )}
        </Field>

        <Field label="Note for the studio">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know about this payment…" />
        </Field>

        {progress != null ? (
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full gold-fill transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-white/40">Uploading… {progress}%</p>
          </div>
        ) : null}

        <p className="flex items-start gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-white/50">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
          Your payment stays “pending verification” until a studio admin confirms it against the wallet statement. You’ll be notified either way.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()} disabled={!transactionId.trim() || !senderNumber.trim()}>
            Submit payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** One row in a payment history list, including manual-payment metadata. */
export function PaymentHistoryRow({ payment, currency, onReviewed }: { payment: PaymentDTO; currency?: string; onReviewed?: () => void }) {
  const meta = PAYMENT_STATUS_META[payment.status];
  const isManual = payment.method === "bkash" || payment.method === "nagad";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm text-white">
          {PAYMENT_METHOD_LABELS[payment.method]}
          {isManual ? <span className="ml-2 text-[10px] uppercase tracking-[0.16em] text-white/35">manual</span> : null}
        </p>
        <p className="mt-0.5 text-[11px] text-white/40">
          {formatDateTime(payment.paidAt)}
          {payment.transactionId ? ` · TrxID ${payment.transactionId}` : ""}
          {payment.senderNumber ? ` · from ${payment.senderNumber}` : ""}
        </p>
        {payment.verifiedBy ? <p className="mt-0.5 text-[11px] text-emerald-300/70">Verified by {payment.verifiedBy}</p> : null}
        {payment.rejectionReason ? <p className="mt-0.5 text-[11px] text-rose-300/80">Rejected: {payment.rejectionReason}</p> : null}
        <div className="mt-1.5 flex flex-wrap gap-2">
          {payment.screenshotUrl ? (
            <a href={payment.screenshotUrl} target="_blank" rel="noreferrer" className="text-[11px] text-gold-300 underline-offset-2 hover:underline">
              View screenshot
            </a>
          ) : null}
          {payment.receiptUrl ? (
            <a href={payment.receiptUrl} className="inline-flex items-center gap-1 text-[11px] text-gold-300 underline-offset-2 hover:underline">
              <Download className="h-3 w-3" /> Download receipt
            </a>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <p className={cn("font-display text-lg", payment.type === "refund" ? "text-rose-300" : "text-white")}>
          {payment.type === "refund" ? "−" : ""}
          {formatMoney(payment.amountCents, currency)}
        </p>
        {onReviewed && payment.status === "pending_verification" ? <ReviewActions payment={payment} onReviewed={onReviewed} /> : null}
      </div>
    </div>
  );
}

/** Admin verify / reject buttons. */
export function ReviewActions({ payment, onReviewed }: { payment: PaymentDTO; onReviewed: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function review(approve: boolean) {
    setBusy(true);
    try {
      await api(`/payments/${payment.id}/review`, { method: "POST", body: { approve, reason: approve ? undefined : reason.trim() } });
      toast.success(approve ? "Payment verified" : "Payment rejected");
      setConfirming(false);
      setRejecting(false);
      setReason("");
      onReviewed();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setConfirming(true)}>
          Verify
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
          Reject
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void review(true)}
        loading={busy}
        title="Verify this payment?"
        confirmLabel="Verify payment"
        message={`Confirm ${formatMoney(payment.amountCents)} (TrxID ${payment.transactionId ?? "—"}) arrived on the studio wallet. The booking balance updates and the client gets a receipt.`}
      />

      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Reject this payment" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-white/60">
            Tell the client why the payment of {formatMoney(payment.amountCents)} (TrxID {payment.transactionId ?? "—"}) could not be verified.
          </p>
          <Field label="Reason" required>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No matching transaction on the wallet statement." />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => void review(false)}>
              Reject payment
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Admin queue of everything awaiting verification. */
export function PendingVerificationQueue({ currency }: { currency?: string }) {
  const { data, isLoading, mutate } = useSWR<{ results: PaymentDTO[] }>("/payments/pending-verification");
  const { mutate: globalMutate } = useSWRConfig();

  const refresh = () => {
    void mutate();
    void globalMutate((k) => typeof k === "string" && ["/payments", "/bookings", "/dashboard"].some((p) => k.startsWith(p)));
  };

  if (isLoading) return <Skeleton className="h-24" />;
  const results = data?.results ?? [];
  if (!results.length) return null;

  return (
    <div className="glass rounded-3xl p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400/15 text-amber-200">
          <Receipt className="h-4.5 w-4.5" />
        </span>
        <div>
          <p className="text-sm font-medium text-white">Awaiting verification</p>
          <p className="text-[11px] text-white/40">
            {results.length} manual payment{results.length === 1 ? "" : "s"} submitted by clients
          </p>
        </div>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {results.map((p) => (
          <div key={p.id}>
            <p className="pt-3 text-[11px] text-white/40">
              {p.booking?.reference} · {p.client?.name}
            </p>
            <PaymentHistoryRow payment={p} currency={currency} onReviewed={refresh} />
          </div>
        ))}
      </div>
    </div>
  );
}
