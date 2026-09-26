"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Camera, KeyRound, Mail, Pencil, Phone, Plus, Power } from "lucide-react";
import { PhotographerFormModal } from "@/components/forms";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { api, errorMessage } from "@/lib/client-api";
import { cn, hexToRgba, type PhotographerDTO } from "@/lib/shared";

export default function TeamPage() {
  const { data, error, isLoading, mutate } = useSWR<{ results: PhotographerDTO[] }>("/photographers?all=1");
  const [editing, setEditing] = useState<PhotographerDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  async function toggle(p: PhotographerDTO) {
    setBusy(p.id);
    try {
      await api(`/photographers/${p.id}`, { method: "PATCH", body: { active: !p.active } });
      toast.success(p.active ? `${p.name} deactivated` : `${p.name} reactivated`);
      void mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const team = data?.results ?? [];
  const active = team.filter((p) => p.active);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team"
        title="Photographers"
        description="Manage your photographers, their calendar colours and workload. Assignments respect each photographer's availability."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Add photographer
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active photographers", value: active.length },
          { label: "Sessions today", value: active.reduce((s, p) => s + (p.stats?.today ?? 0), 0) },
          { label: "Upcoming sessions", value: active.reduce((s, p) => s + (p.stats?.upcoming ?? 0), 0) },
        ].map((s, i) => (
          <Card key={s.label} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{s.label}</p>
            <p className="mt-2 font-display text-4xl text-white">{s.value}</p>
          </Card>
        ))}
      </div>

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : !team.length ? (
        <EmptyState icon={Camera} title="No photographers yet" description="Add your first photographer to start assigning sessions." action={<Button onClick={() => setCreating(true)}>Add photographer</Button>} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {team.map((p, i) => (
            <Card key={p.id} className={cn("relative animate-fade-up overflow-hidden transition duration-300 hover:-translate-y-0.5", !p.active && "opacity-60")} style={{ animationDelay: `${i * 60}ms` }}>
              <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full blur-3xl" style={{ background: hexToRgba(p.color, 0.18) }} />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-4">
                  <Avatar name={p.name} color={p.color} src={p.avatarUrl} size="lg" />
                  <div>
                    <p className="font-display text-2xl text-white">{p.name}</p>
                    <p className="text-xs text-gold-200/80">{p.specialty ?? "Photographer"}</p>
                  </div>
                </div>
                <Badge tone={p.active ? "emerald" : "zinc"} dot>
                  {p.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              {p.bio ? <p className="relative mt-4 line-clamp-2 text-sm leading-relaxed text-white/50">{p.bio}</p> : null}
              <div className="relative mt-4 space-y-1 text-xs text-white/50">
                <p className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-gold-300" /> {p.email}
                </p>
                {p.phone ? (
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-gold-300" /> {p.phone}
                  </p>
                ) : null}
              </div>
              <div className="relative mt-5 grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "Today", value: p.stats?.today ?? 0 },
                  { label: "Upcoming", value: p.stats?.upcoming ?? 0 },
                  { label: "Month", value: p.stats?.thisMonth ?? 0 },
                  { label: "Done", value: p.stats?.completed ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-white/[0.03] py-2">
                    <p className="font-display text-xl text-white">{s.value}</p>
                    <p className="text-[9px] uppercase tracking-[0.18em] text-white/35">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="relative mt-5 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(p)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button variant={p.active ? "ghost" : "outline"} size="sm" loading={busy === p.id} onClick={() => toggle(p)}>
                  <Power className="h-3.5 w-3.5" /> {p.active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="glass-gold">
        <div className="flex items-start gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gold-400/15 text-gold-200">
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="text-sm text-white/65">
            <p className="text-white">Self-registration for staff</p>
            <p className="mt-1 leading-relaxed">
              Photographers can also create their own account on the registration page using the studio invite code (env <code className="text-gold-200">PHOTOGRAPHER_INVITE_CODE</code>, demo:{" "}
              <code className="text-gold-200">LUMIERE-TEAM</code>). Admin sign-up uses <code className="text-gold-200">ADMIN_INVITE_CODE</code>.
            </p>
          </div>
        </div>
      </Card>

      <PhotographerFormModal
        open={creating || !!editing}
        photographer={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => void mutate()}
      />
    </div>
  );
}
