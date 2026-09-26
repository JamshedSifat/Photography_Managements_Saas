"use client";

import { useEffect, useState, type FormEvent } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { CalendarClock, Check, Mail } from "lucide-react";
import { api, errorMessage, fieldErrors } from "@/lib/client-api";
import { Button, Field, Input, Modal, ProgressBar, Select, Skeleton, Textarea, Toggle } from "./ui";
import {
  ACTIVE_BOOKING_STATUSES,
  PACKAGE_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS,
  PHOTOGRAPHER_COLORS,
  centsToInput,
  cn,
  formatDateKey,
  formatDuration,
  formatMoney,
  inputToCents,
  minutesToLabel,
  timeRangeLabel,
  toDateKey,
  type AvailabilityResponse,
  type BookingDTO,
  type ClientDTO,
  type PackageDTO,
  type Paginated,
  type PaymentMethod,
  type PaymentStatus,
  type PaymentType,
  type PhotographerDTO,
  type Slot,
} from "@/lib/shared";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Revalidate every cached SWR key starting with one of the prefixes. */
export function useRevalidate() {
  const { mutate } = useSWRConfig();
  return (...prefixes: string[]) => mutate((key) => typeof key === "string" && prefixes.some((p) => key.startsWith(p)));
}

// ------------------------------------------------------------------ slot grid

export function SlotGrid({
  slots,
  value,
  onChange,
  loading,
  emptyMessage = "No times available on this day.",
}: {
  slots: Slot[] | undefined;
  value: number | null;
  onChange: (start: number) => void;
  loading?: boolean;
  emptyMessage?: string;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!slots?.length) return <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/45">{emptyMessage}</p>;
  const groups = [
    { label: "Morning", match: (s: Slot) => s.start < 720 },
    { label: "Afternoon", match: (s: Slot) => s.start >= 720 && s.start < 1020 },
    { label: "Evening", match: (s: Slot) => s.start >= 1020 },
  ];
  const anyAvailable = slots.some((s) => s.available);
  return (
    <div className="space-y-4">
      {!anyAvailable ? <p className="text-sm text-amber-200/80">This day is fully booked — please choose another date.</p> : null}
      {groups.map((g) => {
        const list = slots.filter(g.match);
        if (!list.length) return null;
        return (
          <div key={g.label}>
            <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-white/35">{g.label}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {list.map((s) => {
                const selected = value === s.start;
                return (
                  <button
                    key={s.start}
                    type="button"
                    disabled={!s.available}
                    title={s.available ? `${timeRangeLabel(s.start, s.end)}` : s.reason}
                    onClick={() => onChange(s.start)}
                    className={cn(
                      "h-11 rounded-xl text-sm transition-all duration-200",
                      selected
                        ? "gold-fill font-semibold text-ink-950 shadow-[0_8px_24px_-10px_rgba(209,169,92,0.9)]"
                        : s.available
                          ? "border border-white/10 bg-white/[0.03] text-white hover:border-gold-400/50 hover:bg-white/[0.07]"
                          : "cursor-not-allowed border border-transparent bg-white/[0.015] text-white/20 line-through",
                    )}
                  >
                    {minutesToLabel(s.start)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ client form

type ClientForm = { name: string; email: string; phone: string; address: string; city: string; source: string; notes: string; tags: string };
const emptyClient: ClientForm = { name: "", email: "", phone: "", address: "", city: "", source: "", notes: "", tags: "" };

export function ClientFormModal({
  open,
  onClose,
  client,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  client?: ClientDTO | null;
  onSaved?: (client: ClientDTO) => void;
}) {
  const [form, setForm] = useState<ClientForm>(emptyClient);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const revalidate = useRevalidate();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      client
        ? {
            name: client.name,
            email: client.email,
            phone: client.phone ?? "",
            address: client.address ?? "",
            city: client.city ?? "",
            source: client.source ?? "",
            notes: client.notes ?? "",
            tags: client.tags.join(", "),
          }
        : emptyClient,
    );
  }, [open, client]);

  const set = (k: keyof ClientForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = "Name is required";
    if (!EMAIL_RE.test(form.email.trim())) errs.email = "Enter a valid email address";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        source: form.source.trim() || null,
        notes: form.notes.trim() || null,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const res = await api<{ client: ClientDTO }>(client ? `/clients/${client.id}` : "/clients", { method: client ? "PATCH" : "POST", body });
      toast.success(client ? "Client updated" : "Client added");
      void revalidate("/clients", "/search");
      onSaved?.(res.client);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={client ? "Edit client" : "New client"}
      description="Client details are used for bookings, invoices and notifications."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={saving}>
            {client ? "Save changes" : "Add client"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name} required>
          <Input value={form.name} onChange={(e) => set("name")(e.target.value)} invalid={!!errors.name} placeholder="Jane Doe" />
        </Field>
        <Field label="Email" error={errors.email} required>
          <Input type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} invalid={!!errors.email} placeholder="jane@example.com" />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="+1 555 0100" />
        </Field>
        <Field label="Lead source" error={errors.source}>
          <Input value={form.source} onChange={(e) => set("source")(e.target.value)} placeholder="Instagram, referral…" />
        </Field>
        <Field label="Address" error={errors.address}>
          <Input value={form.address} onChange={(e) => set("address")(e.target.value)} placeholder="Street address" />
        </Field>
        <Field label="City" error={errors.city}>
          <Input value={form.city} onChange={(e) => set("city")(e.target.value)} placeholder="New York" />
        </Field>
        <Field label="Tags" hint="Comma separated, e.g. VIP, Wedding" className="sm:col-span-2" error={errors.tags}>
          <Input value={form.tags} onChange={(e) => set("tags")(e.target.value)} placeholder="VIP, Wedding" />
        </Field>
        <Field label="Notes" className="sm:col-span-2" error={errors.notes}>
          <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} placeholder="Preferences, family members, special requests…" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ package form

const DURATIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600, 720];
type PackageForm = {
  name: string;
  category: string;
  price: string;
  durationMinutes: number;
  depositPercent: string;
  deliverables: string;
  description: string;
  features: string;
  coverUrl: string;
  popular: boolean;
  active: boolean;
  sortOrder: string;
};

export function PackageFormModal({ open, onClose, pkg, onSaved }: { open: boolean; onClose: () => void; pkg?: PackageDTO | null; onSaved?: () => void }) {
  const empty: PackageForm = {
    name: "",
    category: "Portrait",
    price: "",
    durationMinutes: 60,
    depositPercent: "30",
    deliverables: "",
    description: "",
    features: "",
    coverUrl: "",
    popular: false,
    active: true,
    sortOrder: "0",
  };
  const [form, setForm] = useState<PackageForm>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const revalidate = useRevalidate();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      pkg
        ? {
            name: pkg.name,
            category: pkg.category,
            price: centsToInput(pkg.priceCents),
            durationMinutes: pkg.durationMinutes,
            depositPercent: String(pkg.depositPercent),
            deliverables: pkg.deliverables ?? "",
            description: pkg.description ?? "",
            features: pkg.features.join("\n"),
            coverUrl: pkg.coverUrl ?? "",
            popular: pkg.popular,
            active: pkg.active,
            sortOrder: String(pkg.sortOrder),
          }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg]);

  const set = <K extends keyof PackageForm>(k: K, v: PackageForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    const priceCents = inputToCents(form.price);
    const deposit = Number(form.depositPercent);
    if (form.name.trim().length < 2) errs.name = "Name is required";
    if (!Number.isFinite(priceCents) || priceCents < 0) errs.priceCents = "Enter a valid price";
    if (!Number.isInteger(deposit) || deposit < 0 || deposit > 100) errs.depositPercent = "0–100%";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        priceCents,
        durationMinutes: form.durationMinutes,
        depositPercent: deposit,
        deliverables: form.deliverables.trim() || null,
        description: form.description.trim() || null,
        features: form.features
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
        coverUrl: form.coverUrl.trim() || null,
        popular: form.popular,
        active: form.active,
        sortOrder: Number(form.sortOrder) || 0,
      };
      await api(pkg ? `/packages/${pkg.id}` : "/packages", { method: pkg ? "PATCH" : "POST", body });
      toast.success(pkg ? "Package updated" : "Package created");
      void revalidate("/packages");
      onSaved?.();
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={pkg ? "Edit package" : "New package"}
      description="Pricing, duration and deposit drive availability and invoices."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={saving}>
            {pkg ? "Save package" : "Create package"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Package name" error={errors.name} required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} invalid={!!errors.name} placeholder="Signature Wedding" />
        </Field>
        <Field label="Category" error={errors.category}>
          <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {PACKAGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Price" error={errors.priceCents} required>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
            <Input inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} invalid={!!errors.priceCents} className="pl-7" placeholder="450" />
          </div>
        </Field>
        <Field label="Duration" error={errors.durationMinutes}>
          <Select value={form.durationMinutes} onChange={(e) => set("durationMinutes", Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {formatDuration(d)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Advance / deposit" error={errors.depositPercent} hint="Percentage due to reserve">
          <div className="relative">
            <Input inputMode="numeric" value={form.depositPercent} onChange={(e) => set("depositPercent", e.target.value)} invalid={!!errors.depositPercent} className="pr-8" />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-white/40">%</span>
          </div>
        </Field>
        <Field label="Deliverables" error={errors.deliverables} className="sm:col-span-2">
          <Input value={form.deliverables} onChange={(e) => set("deliverables", e.target.value)} placeholder="60 edited images · 10 days" />
        </Field>
        <Field label="Description" error={errors.description} className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What makes this collection special…" />
        </Field>
        <Field label="Features" hint="One per line" error={errors.features} className="sm:col-span-2">
          <Textarea value={form.features} onChange={(e) => set("features", e.target.value)} placeholder={"2 hours of coverage\nPrivate online gallery"} />
        </Field>
        <Field label="Cover image URL" error={errors.coverUrl}>
          <Input value={form.coverUrl} onChange={(e) => set("coverUrl", e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Display order" error={errors.sortOrder}>
          <Input inputMode="numeric" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </Field>
        <Toggle checked={form.popular} onChange={(v) => set("popular", v)} label="Highlight as popular" description="Shows a “Most loved” badge" />
        <Toggle checked={form.active} onChange={(v) => set("active", v)} label="Available for booking" description="Inactive packages are hidden" />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ payment form

type PaymentForm = {
  amount: string;
  type: PaymentType;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  paidAt: string;
  notes: string;
  sendReceipt: boolean;
};

export function PaymentFormModal({
  open,
  onClose,
  booking,
  onSaved,
  currency = "USD",
}: {
  open: boolean;
  onClose: () => void;
  booking?: BookingDTO | null;
  onSaved?: () => void;
  currency?: string;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: outstanding } = useSWR<{ results: BookingDTO[] }>(open && !booking ? "/payments/outstanding" : null);
  const target = booking ?? outstanding?.results.find((b) => b.id === selectedId) ?? null;
  const [form, setForm] = useState<PaymentForm>({
    amount: "",
    type: "advance",
    method: "card",
    status: "paid",
    reference: "",
    paidAt: toDateKey(new Date()),
    notes: "",
    sendReceipt: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const revalidate = useRevalidate();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSelectedId(null);
  }, [open]);

  useEffect(() => {
    if (!open || !target) return;
    const remaining = Math.max(0, target.netCents - target.paidCents);
    const depositLeft = Math.max(0, target.depositCents - target.paidCents);
    const useDeposit = target.paidCents === 0 && depositLeft > 0 && depositLeft < remaining;
    setForm((f) => ({
      ...f,
      amount: centsToInput(useDeposit ? depositLeft : remaining),
      type: useDeposit ? "advance" : target.paidCents === 0 ? "full" : "balance",
      reference: "",
      notes: "",
      paidAt: toDateKey(new Date()),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.id]);

  const set = <K extends keyof PaymentForm>(k: K, v: PaymentForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!target) {
      setErrors({ bookingId: "Select a booking" });
      return;
    }
    const amountCents = inputToCents(form.amount);
    const errs: Record<string, string> = {};
    if (!Number.isFinite(amountCents) || amountCents <= 0) errs.amountCents = "Enter an amount greater than zero";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api("/payments", {
        method: "POST",
        body: {
          bookingId: target.id,
          amountCents,
          type: form.type,
          method: form.method,
          status: form.status,
          reference: form.reference.trim() || null,
          notes: form.notes.trim() || null,
          paidAt: form.paidAt || undefined,
          sendReceipt: form.sendReceipt,
        },
      });
      toast.success(`Payment of ${formatMoney(amountCents, currency)} recorded`);
      void revalidate("/payments", "/bookings", "/dashboard", "/clients");
      onSaved?.();
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const remaining = target ? Math.max(0, target.netCents - target.paidCents) : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Record payment"
      description="Track advances, balances and refunds. Clients receive an emailed receipt."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={saving} disabled={!target}>
            Record payment
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        {!booking ? (
          <Field label="Booking" error={errors.bookingId} required>
            <Select value={selectedId ?? ""} onChange={(e) => setSelectedId(Number(e.target.value) || null)} invalid={!!errors.bookingId}>
              <option value="">{outstanding ? "Select a booking with a balance…" : "Loading bookings…"}</option>
              {outstanding?.results.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.client.name} — {b.reference} · {formatDateKey(b.date, "short")} · due {formatMoney(b.dueCents, currency)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {target ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-white">
                  {target.client.name} · {target.title}
                </p>
                <p className="text-xs text-white/45">
                  {target.invoiceNumber ?? target.reference} · {formatDateKey(target.date)}
                </p>
              </div>
              <p className="text-right text-xs text-white/45">
                Balance due
                <span className="block font-display text-2xl text-gold-200">{formatMoney(remaining, currency)}</span>
              </p>
            </div>
            <ProgressBar value={target.netCents ? (target.paidCents / target.netCents) * 100 : 100} className="mt-3" />
            <div className="mt-2 flex justify-between text-[11px] text-white/45">
              <span>Paid {formatMoney(target.paidCents, currency)}</span>
              <span>Total {formatMoney(target.netCents, currency)}</span>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" error={errors.amountCents} required>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
              <Input inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} invalid={!!errors.amountCents} className="pl-7" />
            </div>
          </Field>
          <Field label="Payment type" error={errors.type}>
            <Select value={form.type} onChange={(e) => set("type", e.target.value as PaymentType)}>
              {PAYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PAYMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Method" error={errors.method}>
            <Select value={form.method} onChange={(e) => set("method", e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" error={errors.status}>
            <Select value={form.status} onChange={(e) => set("status", e.target.value as PaymentStatus)}>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </Select>
          </Field>
          <Field label="Paid on" error={errors.paidAt}>
            <Input type="date" value={form.paidAt} onChange={(e) => set("paidAt", e.target.value)} />
          </Field>
          <Field label="Transaction reference" error={errors.reference}>
            <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="TXN-10293" />
          </Field>
          <Field label="Notes" className="sm:col-span-2" error={errors.notes}>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-[72px]" placeholder="Optional internal note" />
          </Field>
        </div>
        <Toggle checked={form.sendReceipt} onChange={(v) => set("sendReceipt", v)} label="Email receipt to client" description="Sent only for payments marked as paid" />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ photographer form

export function PhotographerFormModal({
  open,
  onClose,
  photographer,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  photographer?: PhotographerDTO | null;
  onSaved?: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", specialty: "", bio: "", color: PHOTOGRAPHER_COLORS[0] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const revalidate = useRevalidate();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({
      name: photographer?.name ?? "",
      email: photographer?.email ?? "",
      password: "",
      phone: photographer?.phone ?? "",
      specialty: photographer?.specialty ?? "",
      bio: photographer?.bio ?? "",
      color: photographer?.color ?? PHOTOGRAPHER_COLORS[Math.floor(Math.random() * PHOTOGRAPHER_COLORS.length)],
    });
  }, [open, photographer]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = "Name is required";
    if (!photographer && !EMAIL_RE.test(form.email.trim())) errs.email = "Enter a valid email";
    if (!photographer || form.password) {
      if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) errs.password = "8+ characters with a letter and a number";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const common = { name: form.name.trim(), phone: form.phone.trim() || null, specialty: form.specialty.trim() || null, bio: form.bio.trim() || null, color: form.color.toUpperCase() };
      if (photographer) {
        await api(`/photographers/${photographer.id}`, { method: "PATCH", body: { ...common, password: form.password || undefined } });
      } else {
        await api("/photographers", { method: "POST", body: { ...common, email: form.email.trim(), password: form.password } });
      }
      toast.success(photographer ? "Photographer updated" : "Photographer added to the team");
      void revalidate("/photographers", "/dashboard");
      onSaved?.();
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={photographer ? "Edit photographer" : "Add photographer"}
      description={photographer ? "Update profile, calendar colour or reset their password." : "Creates a photographer login with access to their schedule and galleries."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={saving}>
            {photographer ? "Save changes" : "Add photographer"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name} required>
          <Input value={form.name} onChange={(e) => set("name")(e.target.value)} invalid={!!errors.name} />
        </Field>
        <Field label="Email" error={errors.email} required={!photographer} hint={photographer ? "Email can't be changed" : undefined}>
          <Input type="email" value={form.email} disabled={!!photographer} onChange={(e) => set("email")(e.target.value)} invalid={!!errors.email} />
        </Field>
        <Field label={photographer ? "Reset password" : "Password"} error={errors.password} required={!photographer} hint={photographer ? "Leave blank to keep current password" : undefined}>
          <Input type="password" value={form.password} onChange={(e) => set("password")(e.target.value)} invalid={!!errors.password} autoComplete="new-password" />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} />
        </Field>
        <Field label="Specialty" error={errors.specialty} className="sm:col-span-2">
          <Input value={form.specialty} onChange={(e) => set("specialty")(e.target.value)} placeholder="Weddings & Engagements" />
        </Field>
        <Field label="Calendar colour" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {PHOTOGRAPHER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("color")(c)}
                className={cn("grid h-9 w-9 place-items-center rounded-xl ring-2 transition", form.color.toUpperCase() === c.toUpperCase() ? "ring-white" : "ring-transparent hover:ring-white/30")}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
              >
                {form.color.toUpperCase() === c.toUpperCase() ? <Check className="h-4 w-4 text-ink-950" /> : null}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Bio" className="sm:col-span-2" error={errors.bio}>
          <Textarea value={form.bio} onChange={(e) => set("bio")(e.target.value)} placeholder="Shown to clients when choosing a photographer" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ gallery form

export function GalleryFormModal({
  open,
  onClose,
  defaultBookingId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultBookingId?: number | null;
  onCreated?: (id: number) => void;
}) {
  const { data } = useSWR<Paginated<BookingDTO>>(open ? `/bookings?status=completed,${ACTIVE_BOOKING_STATUSES.join(",")}&order=desc&pageSize=200` : null);
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [watermark, setWatermark] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const revalidate = useRevalidate();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setBookingId(defaultBookingId ?? null);
    setTitle("");
    setDescription("");
    setAllowDownload(true);
    setWatermark(false);
    setExpiresAt("");
  }, [open, defaultBookingId]);

  const booking = data?.results.find((b) => b.id === bookingId) ?? null;
  useEffect(() => {
    if (booking && !title) setTitle(`${booking.client.name} — ${booking.title}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!bookingId) errs.bookingId = "Select the session this gallery belongs to";
    if (title.trim().length < 2) errs.title = "Title is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const res = await api<{ gallery: { id: number } }>("/galleries", {
        method: "POST",
        body: { bookingId, title: title.trim(), description: description.trim() || null, allowDownload, watermark, expiresAt: expiresAt || null },
      });
      toast.success("Gallery created — start uploading photos");
      void revalidate("/galleries", "/bookings", "/dashboard");
      onCreated?.(res.gallery.id);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New private gallery"
      description="Galleries stay private until you publish them. Clients are emailed when their gallery is ready."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={saving}>
            Create gallery
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Session" error={errors.bookingId} required>
          <Select value={bookingId ?? ""} onChange={(e) => setBookingId(Number(e.target.value) || null)} invalid={!!errors.bookingId}>
            <option value="">{data ? "Select a session…" : "Loading sessions…"}</option>
            {data?.results.map((b) => (
              <option key={b.id} value={b.id}>
                {b.client.name} — {b.title} · {formatDateKey(b.date, "medium")}
                {b.gallery ? " (has gallery)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Gallery title" error={errors.title} required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} invalid={!!errors.title} placeholder="Olivia & Noah — The Wedding Day" />
        </Field>
        <Field label="Message to client" error={errors.description}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short note shown at the top of the gallery" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle checked={allowDownload} onChange={setAllowDownload} label="Allow downloads" description="Full-resolution originals" />
          <Toggle checked={watermark} onChange={setWatermark} label="Proof watermark" description="Protect previews during proofing" />
        </div>
        <Field label="Access expires" hint="Optional — leave blank for no expiry" error={errors.expiresAt}>
          <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ reschedule

export function RescheduleModal({
  open,
  onClose,
  booking,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingDTO;
  onSaved?: () => void;
}) {
  const [date, setDate] = useState(booking.date);
  const [slot, setSlot] = useState<number | null>(null);
  const [keepPhotographer, setKeepPhotographer] = useState(true);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const revalidate = useRevalidate();
  const duration = booking.endMinutes - booking.startMinutes;

  useEffect(() => {
    if (!open) return;
    setDate(booking.date);
    setSlot(null);
    setKeepPhotographer(true);
    setNotify(true);
  }, [open, booking.date]);

  const params = new URLSearchParams({ date, duration: String(duration), excludeBookingId: String(booking.id) });
  if (keepPhotographer && booking.photographer) params.set("photographerId", String(booking.photographer.id));
  const { data, isLoading } = useSWR<AvailabilityResponse>(open && date ? `/availability?${params}` : null);

  async function submit() {
    if (slot == null) return;
    setSaving(true);
    try {
      await api(`/bookings/${booking.id}`, {
        method: "PATCH",
        body: { date, startMinutes: slot, notify, ...(keepPhotographer ? {} : { photographerId: null }) },
      });
      toast.success("Session rescheduled");
      void revalidate("/bookings", "/dashboard", "/availability");
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Reschedule session"
      description={`Currently ${formatDateKey(booking.date, "long")} · ${timeRangeLabel(booking.startMinutes, booking.endMinutes)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={slot == null}>
            <CalendarClock className="h-4 w-4" /> Confirm new time
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New date">
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSlot(null);
              }}
            />
          </Field>
          {booking.photographer ? (
            <Toggle
              checked={keepPhotographer}
              onChange={(v) => {
                setKeepPhotographer(v);
                setSlot(null);
              }}
              label={`Keep ${booking.photographer.name}`}
              description="Off = auto-assign any free photographer"
            />
          ) : null}
        </div>
        {data?.closed ? (
          <p className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100/80">{data.reason}</p>
        ) : (
          <SlotGrid slots={data?.slots} value={slot} onChange={setSlot} loading={isLoading} />
        )}
        <Toggle checked={notify} onChange={setNotify} label="Email the client" description="Sends the updated session details" />
        <p className="flex items-center gap-2 text-xs text-white/40">
          <Mail className="h-3.5 w-3.5" /> Double-booking protection re-checks availability when you confirm.
        </p>
      </div>
    </Modal>
  );
}
