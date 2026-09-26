"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { CalendarCheck, CalendarPlus, Clock, MapPin } from "lucide-react";
import { useAuth } from "@/components/providers";
import {
  Avatar,
  BookingStatusBadge,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  PaymentStateBadge,
  SearchInput,
  Select,
  Skeleton,
  Tabs,
  useDebounced,
} from "@/components/ui";
import { errorMessage } from "@/lib/client-api";
import {
  ACTIVE_BOOKING_STATUSES,
  formatDateKey,
  formatMoney,
  timeRangeLabel,
  type BookingDTO,
  type Paginated,
  type PhotographerDTO,
} from "@/lib/shared";

type Tab = "upcoming" | "all" | "pending" | "active" | "completed" | "cancelled";

export default function BookingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const isPhotographer = user?.role === "photographer";
  const [tab, setTab] = useState<Tab>("upcoming");
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 300);
  const [photographerId, setPhotographerId] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [tab, debounced, photographerId]);

  const params = new URLSearchParams({ page: String(page), pageSize: "15" });
  if (tab === "upcoming") {
    params.set("scope", "upcoming");
    params.set("status", ACTIVE_BOOKING_STATUSES.join(","));
  } else if (tab !== "all") params.set("status", tab);
  if (tab === "all" || tab === "completed" || tab === "cancelled") params.set("order", "desc");
  if (debounced) params.set("q", debounced);
  if (photographerId) params.set("photographerId", photographerId);

  const { data, error, isLoading, mutate } = useSWR<Paginated<BookingDTO>>(`/bookings?${params}`);
  const { data: team } = useSWR<{ results: PhotographerDTO[] }>(isAdmin ? "/photographers" : null);
  const { data: settings } = useSWR<{ settings: { currency: string } }>("/settings");
  const currency = settings?.settings.currency ?? "USD";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bookings"
        title={isAdmin ? "All bookings" : isPhotographer ? "My assignments" : "My bookings"}
        description={isAdmin ? "Search, filter and manage every session." : isPhotographer ? "Sessions assigned to you." : "Your upcoming and past sessions."}
        actions={
          !isPhotographer ? (
            <ButtonLink href="/dashboard/bookings/new">
              <CalendarPlus className="h-4 w-4" /> New booking
            </ButtonLink>
          ) : null
        }
      />

      <Card className="p-4 sm:p-5">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "upcoming", label: "Upcoming" },
              { value: "all", label: "All" },
              { value: "pending", label: "Pending" },
              { value: "active", label: "In progress" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            {isAdmin ? (
              <div className="sm:w-48">
                <Select value={photographerId} onChange={(e) => setPhotographerId(e.target.value)}>
                  <option value="">All photographers</option>
                  {team?.results.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <SearchInput value={q} onChange={setQ} placeholder="Search client, reference, package…" className="sm:w-72" />
          </div>
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
            icon={CalendarCheck}
            title="No bookings found"
            description={debounced ? "Try a different search or filter." : "Bookings will appear here as soon as they're made."}
            action={!isPhotographer ? <ButtonLink href="/dashboard/bookings/new">Create a booking</ButtonLink> : undefined}
          />
        ) : (
          <>
            <div className="-mx-2 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-white/35">
                    <th className="px-3 pb-3 font-medium">Client</th>
                    <th className="px-3 pb-3 font-medium">Session</th>
                    <th className="px-3 pb-3 font-medium">Date & time</th>
                    <th className="px-3 pb-3 font-medium">Photographer</th>
                    <th className="px-3 pb-3 font-medium">Status</th>
                    {!isPhotographer ? <th className="px-3 pb-3 font-medium">Payment</th> : null}
                    {!isPhotographer ? <th className="px-3 pb-3 text-right font-medium">Total</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {data.results.map((b) => (
                    <tr key={b.id} onClick={() => router.push(`/dashboard/bookings/${b.id}`)} className="cursor-pointer transition hover:bg-white/[0.025]">
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={b.client.name} size="sm" />
                          <div>
                            <p className="text-white">{b.client.name}</p>
                            <p className="text-[11px] text-white/40">{b.reference}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-white/70">{b.title}</td>
                      <td className="px-3 py-3.5">
                        <p className="text-white">{formatDateKey(b.date, "weekday")}</p>
                        <p className="text-[11px] text-white/40">{timeRangeLabel(b.startMinutes, b.endMinutes)}</p>
                      </td>
                      <td className="px-3 py-3.5">
                        {b.photographer ? (
                          <span className="flex items-center gap-2 text-white/70">
                            <span className="h-2 w-2 rounded-full" style={{ background: b.photographer.color ?? "#d1a95c" }} />
                            {b.photographer.name}
                          </span>
                        ) : (
                          <span className="text-white/35">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <BookingStatusBadge status={b.status} />
                      </td>
                      {!isPhotographer ? (
                        <td className="px-3 py-3.5">
                          <PaymentStateBadge state={b.paymentStatus} />
                        </td>
                      ) : null}
                      {!isPhotographer ? (
                        <td className="px-3 py-3.5 text-right">
                          <p className="text-white">{formatMoney(b.netCents, currency)}</p>
                          {b.dueCents > 0 ? <p className="text-[11px] text-gold-300/80">{formatMoney(b.dueCents, currency)} due</p> : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {data.results.map((b) => (
                <Link key={b.id} href={`/dashboard/bookings/${b.id}`} className="block rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-white">{b.client.name}</p>
                      <p className="text-xs text-white/45">{b.title}</p>
                    </div>
                    <BookingStatusBadge status={b.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/45">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatDateKey(b.date, "weekday")} · {timeRangeLabel(b.startMinutes, b.endMinutes)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {b.location ?? "Studio"}
                    </span>
                  </div>
                  {!isPhotographer ? (
                    <div className="mt-3 flex items-center justify-between">
                      <PaymentStateBadge state={b.paymentStatus} />
                      <span className="text-sm text-white">{formatMoney(b.netCents, currency)}</span>
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} count={data.count} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
