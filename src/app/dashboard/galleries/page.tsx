"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { Download, Images, Lock, Plus, Stamp } from "lucide-react";
import { GalleryFormModal } from "@/components/forms";
import { useAuth } from "@/components/providers";
import { Badge, Button, EmptyState, ErrorState, PageHeader, PageLoader, SearchInput, Skeleton, Tabs, useDebounced } from "@/components/ui";
import { errorMessage } from "@/lib/client-api";
import { formatDate, formatDateKey, type GalleryDTO } from "@/lib/shared";

function GalleriesContent() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const isStaff = user?.role === "admin" || user?.role === "photographer";
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 300);
  const [creating, setCreating] = useState(false);
  const [defaultBookingId, setDefaultBookingId] = useState<number | null>(null);

  useEffect(() => {
    if (params.get("new") === "1" && isStaff) {
      setDefaultBookingId(Number(params.get("bookingId")) || null);
      setCreating(true);
    }
  }, [params, isStaff]);

  const query = new URLSearchParams();
  if (status !== "all") query.set("status", status);
  if (debounced) query.set("q", debounced);
  const { data, error, isLoading, mutate } = useSWR<{ results: GalleryDTO[] }>(`/galleries?${query}`);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Private galleries"
        title={isStaff ? "Client galleries" : "My galleries"}
        description={isStaff ? "Upload, proof and deliver images securely. Clients are notified the moment a gallery is published." : "Your images, protected with secure expiring links. Favourite, view and download."}
        actions={
          isStaff ? (
            <Button
              onClick={() => {
                setDefaultBookingId(null);
                setCreating(true);
              }}
            >
              <Plus className="h-4 w-4" /> New gallery
            </Button>
          ) : null
        }
      />

      {isStaff ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "published", label: "Published" },
              { value: "draft", label: "Drafts" },
            ]}
          />
          <SearchInput value={q} onChange={setQ} placeholder="Search galleries or clients…" className="sm:w-72" />
        </div>
      ) : null}

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3]" />
          ))}
        </div>
      ) : !data?.results.length ? (
        <EmptyState
          icon={Images}
          title={isStaff ? "No galleries yet" : "Your galleries will appear here"}
          description={isStaff ? "Create a gallery for a completed session and start uploading." : "We'll email you as soon as your images are ready to view."}
          action={isStaff ? <Button onClick={() => setCreating(true)}>Create gallery</Button> : undefined}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.results.map((g, i) => (
            <Link
              key={g.id}
              href={`/dashboard/galleries/${g.id}`}
              className="group glass relative block animate-fade-up overflow-hidden rounded-3xl transition duration-500 hover:-translate-y-1 hover:border-gold-400/30"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                {g.coverUrl ? (
                  <img src={g.coverUrl} alt={g.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-white/[0.03]">
                    <Images className="h-10 w-10 text-white/15" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/10 to-transparent" />
                <div className="absolute left-4 top-4 flex gap-1.5">
                  {isStaff ? <Badge tone={g.status === "published" ? "emerald" : "amber"}>{g.status === "published" ? "Published" : "Draft"}</Badge> : null}
                  {g.watermark ? (
                    <Badge tone="violet">
                      <Stamp className="h-3 w-3" /> Proofing
                    </Badge>
                  ) : null}
                  {g.allowDownload ? (
                    <Badge tone="sky">
                      <Download className="h-3 w-3" /> Downloads
                    </Badge>
                  ) : null}
                </div>
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="font-display text-2xl leading-tight text-white">{g.title}</p>
                  <p className="mt-1 text-xs text-white/60">
                    {g.photoCount} photos · {isStaff ? g.client.name : g.publishedAt ? `Delivered ${formatDate(g.publishedAt)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between px-5 py-3 text-[11px] text-white/45">
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3 w-3 text-gold-300" /> Private & secure
                </span>
                <span>{g.booking ? formatDateKey(g.booking.date, "medium") : formatDate(g.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {isStaff ? (
        <GalleryFormModal
          open={creating}
          defaultBookingId={defaultBookingId}
          onClose={() => {
            setCreating(false);
            if (params.get("new")) router.replace("/dashboard/galleries");
          }}
          onCreated={(id) => router.push(`/dashboard/galleries/${id}`)}
        />
      ) : null}
    </div>
  );
}

export default function GalleriesPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <GalleriesContent />
    </Suspense>
  );
}
