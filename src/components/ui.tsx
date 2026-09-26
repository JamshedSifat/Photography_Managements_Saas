"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, X, type LucideIcon } from "lucide-react";
import {
  BOOKING_STATUS_META,
  PAYMENT_STATE_META,
  cn,
  hexToRgba,
  initials,
  type BookingStatus,
  type PaymentState,
  type Tone,
} from "@/lib/shared";

// ------------------------------------------------------------------ buttons

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variantClass: Record<Variant, string> = {
  primary:
    "gold-fill text-ink-950 shadow-[0_10px_30px_-12px_rgba(209,169,92,0.75)] hover:brightness-110 hover:shadow-[0_14px_40px_-12px_rgba(209,169,92,0.9)]",
  secondary: "bg-white text-ink-950 hover:bg-white/90",
  outline: "border border-white/12 bg-white/[0.03] text-white hover:border-gold-400/50 hover:bg-white/[0.06]",
  ghost: "text-white/65 hover:bg-white/[0.06] hover:text-white",
  danger: "border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-xs",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-2xl px-6 text-sm",
  icon: "h-9 w-9 rounded-xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60",
    variantClass[variant],
    sizeClass[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button type={type} disabled={disabled || loading} className={buttonClass(variant, size, className)} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

// ------------------------------------------------------------------ form controls

export const fieldClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.035] px-3.5 text-sm text-white placeholder:text-white/30 outline-none transition duration-200 focus:border-gold-400/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-gold-400/10 disabled:cursor-not-allowed disabled:opacity-50";
const invalidClass = "border-rose-500/60 focus:border-rose-400/70 focus:ring-rose-500/10";

export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input className={cn(fieldClass, "h-11", invalid && invalidClass, className)} aria-invalid={invalid || undefined} {...props} />;
}

export function Textarea({ className, invalid, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea className={cn(fieldClass, "min-h-[96px] resize-y py-3 leading-relaxed", invalid && invalidClass, className)} {...props} />;
}

export function Select({ className, invalid, children, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select className={cn(fieldClass, "h-11 cursor-pointer appearance-none pr-10", invalid && invalidClass, className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-white/50">
          {label}
          {required ? <span className="text-gold-400"> *</span> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="block text-xs text-rose-300">{error}</span> : hint ? <span className="block text-xs text-white/40">{hint}</span> : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition hover:border-white/20 disabled:opacity-50"
    >
      <span>
        <span className="block text-sm text-white">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-white/45">{description}</span> : null}
      </span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300", checked ? "gold-fill" : "bg-white/15")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300", checked ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(fieldClass, "h-11 pl-10 pr-9")} />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ------------------------------------------------------------------ surfaces

export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("glass rounded-3xl p-5 sm:p-6", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon: Icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-start justify-between gap-4", className)}>
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-gold-400/20 bg-gold-400/10 text-gold-300">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div>
          <h3 className="text-[15px] font-medium text-white">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-white/45">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex animate-fade-up flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.3em] text-gold-400/90">{eyebrow}</p> : null}
        <h1 className="font-display text-[32px] font-medium leading-tight tracking-tight text-white sm:text-[40px]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-white/50">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  trend,
  delay = 0,
  className,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: ReactNode;
  trend?: { label: string; positive: boolean } | null;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group glass relative animate-fade-up overflow-hidden rounded-3xl p-5 transition duration-300 hover:-translate-y-0.5 hover:border-gold-400/25",
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gold-400/10 blur-2xl transition duration-500 group-hover:bg-gold-400/20" />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">{label}</p>
        <span className="grid h-10 w-10 place-items-center rounded-2xl border border-gold-400/20 bg-gold-400/10 text-gold-300">
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="relative mt-2 font-display text-[34px] font-medium leading-none text-white">{value}</p>
      {hint || trend ? (
        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs text-white/45">
          {trend ? (
            <span className={cn("rounded-full px-2 py-0.5", trend.positive ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300")}>
              {trend.label}
            </span>
          ) : null}
          {hint}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ badges & avatars

const toneClass: Record<Tone, string> = {
  gold: "bg-gold-400/10 text-gold-200 ring-gold-400/25",
  emerald: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
  amber: "bg-amber-400/10 text-amber-300 ring-amber-400/25",
  rose: "bg-rose-400/10 text-rose-300 ring-rose-400/25",
  sky: "bg-sky-400/10 text-sky-300 ring-sky-400/25",
  violet: "bg-violet-400/10 text-violet-300 ring-violet-400/25",
  zinc: "bg-white/5 text-white/60 ring-white/10",
};

export function Badge({ tone = "zinc", dot = false, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", toneClass[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function BookingStatusBadge({ status }: { status: BookingStatus | string }) {
  const meta = BOOKING_STATUS_META[status as keyof typeof BOOKING_STATUS_META] ?? {
    label: String(status).replace(/_/g, " "),
    tone: "default",
  };

  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

export function PaymentStateBadge({ state }: { state: PaymentState }) {
  const meta = PAYMENT_STATE_META[state];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function Avatar({
  name,
  src,
  color,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  color?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const dims = { xs: "h-6 w-6 text-[9px]", sm: "h-8 w-8 text-[11px]", md: "h-10 w-10 text-xs", lg: "h-14 w-14 text-base", xl: "h-20 w-20 text-xl" }[size];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn("shrink-0 rounded-full object-cover ring-1 ring-white/10", dims, className)} />;
  }
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold ring-1 ring-white/10", dims, className)}
      style={{
        background: color ? hexToRgba(color, 0.18) : "linear-gradient(135deg, rgba(243,225,179,.22), rgba(167,122,54,.28))",
        color: color ?? "#ecd39c",
      }}
    >
      {initials(name)}
    </span>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-white/10", className)}>
      <div className="h-full rounded-full gold-fill transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ navigation helpers

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn("no-scrollbar inline-flex max-w-full overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "relative whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
            value === o.value ? "bg-white text-ink-950 shadow" : "text-white/55 hover:text-white",
          )}
        >
          {o.label}
          {o.count != null ? (
            <span className={cn("ml-1.5 rounded-full px-1.5 py-px text-[10px]", value === o.value ? "bg-ink-950/10" : "bg-white/10")}>{o.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, count, onPage }: { page: number; totalPages: number; count: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-5 text-xs text-white/45">
      <span>
        Page {page} of {totalPages} · {count} results
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ feedback

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-gold-300", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-2xl", className)} />;
}

export function PageLoader({ label = "Loading…", fullscreen = false }: { label?: string; fullscreen?: boolean }) {
  return (
    <div className={cn("grid place-items-center", fullscreen ? "min-h-screen ambient" : "min-h-[50vh]")}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-gold-400" />
        </div>
        <p className="text-xs uppercase tracking-[0.3em] text-white/40">{label}</p>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 px-6 py-12 text-center", className)}>
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-gold-400/20 bg-gold-400/10 text-gold-300">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 font-display text-xl text-white">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-white/45">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-rose-500/20 bg-rose-500/[0.04] px-6 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-rose-300" />
      <p className="mt-3 text-sm text-rose-100/80">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ overlays

function useOverlay(open: boolean, onClose: () => void) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
  return mounted;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const mounted = useOverlay(open, onClose);
  if (!open || !mounted) return null;
  const width = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cn("glass-strong relative flex max-h-[92vh] w-full animate-scale-in flex-col rounded-t-3xl shadow-2xl sm:rounded-3xl", width)}>
        {title ? (
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-5">
            <div>
              <h2 className="font-display text-2xl text-white">{title}</h2>
              {description ? <p className="mt-1 text-sm text-white/45">{description}</p> : null}
            </div>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-xl p-2 text-white/40 transition hover:bg-white/5 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.07] px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const mounted = useOverlay(open, onClose);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="glass-strong absolute inset-y-0 right-0 flex w-full max-w-md animate-slide-in-right flex-col shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
          <div className="font-display text-2xl text-white">{title}</div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-xl p-2 text-white/40 transition hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex flex-wrap gap-2 border-t border-white/[0.07] px-6 py-4">{footer}</div> : null}
      </aside>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "danger",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", tone === "danger" ? "bg-rose-500/10 text-rose-300" : "bg-gold-400/10 text-gold-300")}>
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="text-sm leading-relaxed text-white/65">{message}</div>
      </div>
    </Modal>
  );
}

export function InfoRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2.5 text-sm", className)}>
      <span className="text-white/45">{label}</span>
      <span className="text-right text-white">{children}</span>
    </div>
  );
}
