"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { ClientFormModal } from "@/components/forms";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SearchInput,
  Skeleton,
  Tabs,
  useDebounced,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/client-api";
import { formatDateKey, formatMoney, type ClientDTO, type Paginated } from "@/lib/shared";

type Sort = "recent" | "name" | "spent";

export default function ClientsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 300);
  const [sort, setSort] = useState<Sort>("recent");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ClientDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ClientDTO | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setPage(1), [debounced, sort]);

  const params = new URLSearchParams({ page: String(page), pageSize: "12", sort });
  if (debounced) params.set("q", debounced);
  const { data, error, isLoading, mutate } = useSWR<Paginated<ClientDTO>>(`/clients?${params}`);
  const { data: settings } = useSWR<{ settings: { currency: string } }>("/settings");
  const currency = settings?.settings.currency ?? "USD";

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/clients/${deleting.id}?force=true`, { method: "DELETE" });
      toast.success(`${deleting.name} was removed`);
      setDeleting(null);
      void mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Clients"
        description="Every client, their booking history, spend and outstanding balance."
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" /> Add client
          </Button>
        }
      />

      <Card className="p-4 sm:p-5">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, email, phone, city…" className="sm:w-80" />
          <Tabs
            value={sort}
            onChange={setSort}
            options={[
              { value: "recent", label: "Newest" },
              { value: "name", label: "A–Z" },
              { value: "spent", label: "Top spend" },
            ]}
          />
        </div>

        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />
        ) : isLoading && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : !data?.results.length ? (
          <EmptyState
            icon={Users}
            title={debounced ? "No matching clients" : "No clients yet"}
            description={debounced ? "Try a different search term." : "Add your first client or share your booking page."}
            action={<Button onClick={() => setCreating(true)}>Add client</Button>}
          />
        ) : (
          <>
            <div className="-mx-2 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-white/35">
                    <th className="px-3 pb-3 font-medium">Client</th>
                    <th className="px-3 pb-3 font-medium">Contact</th>
                    <th className="px-3 pb-3 font-medium">Sessions</th>
                    <th className="px-3 pb-3 font-medium">Last / next</th>
                    <th className="px-3 pb-3 text-right font-medium">Total spent</th>
                    <th className="px-3 pb-3 text-right font-medium">Balance</th>
                    <th className="px-3 pb-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {data.results.map((c) => (
                    <tr key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}`)} className="cursor-pointer transition hover:bg-white/[0.025]">
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={c.name} size="sm" />
                          <div>
                            <p className="flex items-center gap-2 text-white">
                              {c.name}
                              {c.hasAccount ? <Badge tone="sky">Portal</Badge> : null}
                            </p>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {c.tags.slice(0, 3).map((t) => (
                                <span key={t} className="rounded-full bg-gold-400/10 px-1.5 py-px text-[10px] text-gold-200">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="text-white/70">{c.email}</p>
                        <p className="text-[11px] text-white/40">{[c.phone, c.city].filter(Boolean).join(" · ") || "—"}</p>
                      </td>
                      <td className="px-3 py-3.5 text-white">{c.bookingsCount}</td>
                      <td className="px-3 py-3.5">
                        <p className="text-white/70">{c.lastSessionDate ? formatDateKey(c.lastSessionDate) : "—"}</p>
                        <p className="text-[11px] text-gold-300/80">{c.nextSessionDate ? `Next ${formatDateKey(c.nextSessionDate, "short")}` : ""}</p>
                      </td>
                      <td className="px-3 py-3.5 text-right text-white">{formatMoney(c.totalSpentCents, currency)}</td>
                      <td className="px-3 py-3.5 text-right">{c.dueCents > 0 ? <span className="text-gold-200">{formatMoney(c.dueCents, currency)}</span> : <span className="text-white/35">—</span>}</td>
                      <td className="px-3 py-3.5">
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" aria-label="Edit client" onClick={() => setEditing(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="Delete client" onClick={() => setDeleting(c)}>
                            <Trash2 className="h-4 w-4 text-rose-300/70" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:hidden">
              {data.results.map((c) => (
                <Link key={c.id} href={`/dashboard/clients/${c.id}`} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{c.name}</p>
                    <p className="truncate text-xs text-white/45">{c.email}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-white">{c.bookingsCount} sessions</p>
                    <p className="text-white/45">{formatMoney(c.totalSpentCents, currency)}</p>
                  </div>
                </Link>
              ))}
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} count={data.count} onPage={setPage} />
          </>
        )}
      </Card>

      <ClientFormModal
        open={creating || !!editing}
        client={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => void mutate()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete client?"
        message={
          deleting ? (
            <>
              <strong className="text-white">{deleting.name}</strong> and {deleting.bookingsCount ? `their ${deleting.bookingsCount} booking(s), payments and galleries` : "their profile"} will be
              permanently deleted.
            </>
          ) : null
        }
        confirmLabel="Delete client"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}
