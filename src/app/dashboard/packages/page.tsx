"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Check, Clock, EyeOff, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { PackageFormModal } from "@/components/forms";
import { useAuth } from "@/components/providers";
import { Badge, Button, ButtonLink, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { api, errorMessage } from "@/lib/client-api";
import { cn, formatDuration, formatMoney, type PackageDTO } from "@/lib/shared";

export default function PackagesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data, error, isLoading, mutate } = useSWR<{ results: PackageDTO[] }>(isAdmin ? "/packages?all=1" : "/packages");
  const { data: settings } = useSWR<{ settings: { currency: string } }>("/settings");
  const currency = settings?.settings.currency ?? "USD";
  const [editing, setEditing] = useState<PackageDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PackageDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(p: PackageDTO) {
    setBusy(`t${p.id}`);
    try {
      await api(`/packages/${p.id}`, { method: "PATCH", body: { active: !p.active } });
      toast.success(p.active ? "Package hidden from booking" : "Package is live");
      void mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy("delete");
    try {
      const res = await api<{ archived?: boolean; message?: string }>(`/packages/${deleting.id}`, { method: "DELETE" });
      toast.success(res.archived ? (res.message ?? "Package archived") : "Package deleted");
      setDeleting(null);
      void mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Collections"
        title="Packages"
        description={isAdmin ? "Pricing, duration and deposits. Durations drive calendar availability automatically." : "Explore our collections and reserve the one that fits your story."}
        actions={
          isAdmin ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New package
            </Button>
          ) : null
        }
      />

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      ) : !data?.results.length ? (
        <EmptyState icon={Package} title="No packages yet" description="Create your first collection to open online booking." action={isAdmin ? <Button onClick={() => setCreating(true)}>New package</Button> : undefined} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.results.map((p, i) => (
            <article
              key={p.id}
              className={cn(
                "glass group flex animate-fade-up flex-col overflow-hidden rounded-3xl transition duration-500 hover:-translate-y-1 hover:border-gold-400/30",
                p.popular && "ring-1 ring-gold-400/35",
                !p.active && "opacity-60",
              )}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="relative h-44 overflow-hidden">
                {p.coverUrl ? <img src={p.coverUrl} alt={p.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="h-full w-full bg-gradient-to-br from-gold-400/20 to-transparent" />}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/20 to-transparent" />
                <div className="absolute right-3 top-3 flex gap-1.5">
                  {p.popular ? <Badge tone="gold">Most loved</Badge> : null}
                  {!p.active ? (
                    <Badge tone="zinc">
                      <EyeOff className="h-3 w-3" /> Hidden
                    </Badge>
                  ) : null}
                </div>
                <span className="absolute bottom-3 left-5 text-[10px] uppercase tracking-[0.3em] text-gold-200">{p.category}</span>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-2xl text-white">{p.name}</h3>
                  <p className="font-display text-2xl gold-text">{formatMoney(p.priceCents, currency)}</p>
                </div>
                {p.description ? <p className="mt-2 text-sm leading-relaxed text-white/50">{p.description}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/60">
                  <span className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1">
                    <Clock className="h-3 w-3" /> {formatDuration(p.durationMinutes)}
                  </span>
                  <span className="rounded-full bg-white/5 px-2.5 py-1">{p.depositPercent}% advance</span>
                  {p.deliverables ? <span className="rounded-full bg-white/5 px-2.5 py-1">{p.deliverables}</span> : null}
                  {isAdmin && p.bookingsCount != null ? <span className="rounded-full bg-gold-400/10 px-2.5 py-1 text-gold-200">{p.bookingsCount} bookings</span> : null}
                </div>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-white/65">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> {f}
                    </li>
                  ))}
                </ul>
                {isAdmin ? (
                  <div className="mt-6 flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(p)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" loading={busy === `t${p.id}`} onClick={() => toggle(p)}>
                      {p.active ? "Hide" : "Publish"}
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete package" onClick={() => setDeleting(p)}>
                      <Trash2 className="h-4 w-4 text-rose-300/70" />
                    </Button>
                  </div>
                ) : user?.role === "client" ? (
                  <ButtonLink href={`/dashboard/bookings/new?packageId=${p.id}`} variant={p.popular ? "primary" : "outline"} className="mt-6 w-full">
                    Book this package
                  </ButtonLink>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <PackageFormModal
        open={creating || !!editing}
        pkg={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => void mutate()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete package?"
        message="Packages that have bookings are archived (hidden) instead of deleted, so your booking history and invoices stay intact."
        confirmLabel="Delete package"
        loading={busy === "delete"}
        onConfirm={remove}
      />
    </div>
  );
}
