"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { CalendarClock, Check, Clock3, Coffee, Plus, Save, ShieldCheck, Trash2, Umbrella, X } from "lucide-react";
import { useAuth } from "@/components/providers";
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, PageHeader, Select, Skeleton, Tabs, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/client-api";
import { cn, formatDateKey, minutesToTime, timeToMinutes, WEEKDAYS, type AvailabilityOverrideDTO, type AvailabilitySlotDTO, type LeaveRequestDTO, type PhotographerDTO } from "@/lib/shared";

type Manage = { photographer: { id: number; name: string; email: string; color: string | null }; slots: AvailabilitySlotDTO[]; overrides: AvailabilityOverrideDTO[]; leaves: LeaveRequestDTO[] };
type DraftSlot = { weekday: number; startMinutes: number; endMinutes: number; label: string };

const defaultDraft = (): DraftSlot[] => [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinutes: 540, endMinutes: 1140, label: "Studio hours" }));

export default function AvailabilityPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [photographerId, setPhotographerId] = useState("");
  const [tab, setTab] = useState<"hours" | "overrides" | "leave">("hours");
  const [draft, setDraft] = useState<DraftSlot[]>(defaultDraft());
  const [override, setOverride] = useState({ date: "", kind: "blocked", start: "", end: "", reason: "" });
  const [leave, setLeave] = useState({ startDate: "", endDate: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<AvailabilityOverrideDTO | null>(null);

  const { data: team } = useSWR<{ results: PhotographerDTO[] }>(isAdmin ? "/photographers" : null);
  const selectedId = isAdmin ? Number(photographerId) || team?.results[0]?.id : user?.id;
  useEffect(() => {
    if (isAdmin && !photographerId && team?.results[0]) setPhotographerId(String(team.results[0].id));
  }, [isAdmin, photographerId, team]);
  const { data, error, isLoading, mutate } = useSWR<Manage>(selectedId ? `/availability/manage?photographerId=${selectedId}` : null);
  const { data: allLeaves, mutate: mutateLeaves } = useSWR<{ results: LeaveRequestDTO[] }>(isAdmin ? "/leaves" : null);

  useEffect(() => {
    if (!data) return;
    setDraft(data.slots.map((s) => ({ weekday: s.weekday, startMinutes: s.startMinutes, endMinutes: s.endMinutes, label: s.label ?? "" })));
  }, [data]);

  const grouped = useMemo(() => WEEKDAYS.map((_, weekday) => draft.filter((s) => s.weekday === weekday)), [draft]);

  function addSlot(weekday: number) {
    setDraft((current) => [...current, { weekday, startMinutes: 600, endMinutes: 660, label: "Additional slot" }]);
  }
  function updateSlot(index: number, patch: Partial<DraftSlot>) {
    setDraft((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function removeSlot(index: number) {
    setDraft((current) => current.filter((_, i) => i !== index));
  }

  async function saveHours() {
    setSaving(true);
    try {
      await api("/availability/weekly", { method: "PUT", body: { photographerId: selectedId, slots: draft } });
      toast.success("Weekly availability saved");
      void mutate();
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }

  async function saveOverride() {
    if (!override.date || !override.reason.trim()) { toast.error("Choose a date and add a reason."); return; }
    setSaving(true);
    try {
      await api("/availability/overrides", { method: "POST", body: { photographerId: isAdmin ? Number(photographerId) : undefined, date: override.date, kind: override.kind, startMinutes: override.start ? timeToMinutes(override.start) : null, endMinutes: override.end ? timeToMinutes(override.end) : null, reason: override.reason.trim() } });
      toast.success("Availability override added");
      setOverride({ date: "", kind: "blocked", start: "", end: "", reason: "" });
      void mutate();
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }

  async function submitLeave() {
    if (!leave.startDate || !leave.endDate || !leave.reason.trim()) { toast.error("Complete all leave fields."); return; }
    setSaving(true);
    try {
      await api("/leaves", { method: "POST", body: leave });
      toast.success("Leave request submitted to the studio");
      setLeave({ startDate: "", endDate: "", reason: "" });
      void mutate();
      void mutateLeaves();
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }

  async function review(id: number, status: "approved" | "rejected") {
    setSaving(true);
    try { await api(`/leaves/${id}`, { method: "PATCH", body: { status } }); toast.success(`Leave request ${status}`); void mutate(); void mutateLeaves(); } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }

  async function removeOverride() {
    if (!removing) return;
    try { await api(`/availability/overrides/${removing.id}`, { method: "DELETE" }); toast.success("Override removed"); setRemoving(null); void mutate(); } catch (e) { toast.error(errorMessage(e)); }
  }

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />;
  if (!user || (isAdmin && !team) || (selectedId && isLoading && !data)) return <Skeleton className="h-[600px]" />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Schedule controls" title="Availability management" description="Set recurring hours, breaks, holidays and leave. Online booking only exposes genuinely available time." actions={isAdmin ? <div className="w-56"><Select value={photographerId} onChange={(e) => setPhotographerId(e.target.value)}>{team?.results.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div> : null} />
      <div className="grid gap-4 sm:grid-cols-4">
        {[{ label: "Green", text: "Available", cls: "bg-emerald-400" }, { label: "Blue", text: "Booked", cls: "bg-sky-400" }, { label: "Gray", text: "Blocked", cls: "bg-white/30" }, { label: "Red", text: "Leave", cls: "bg-rose-400" }].map((s) => <div key={s.label} className="glass flex items-center gap-3 rounded-2xl p-4"><span className={cn("h-3 w-3 rounded-full", s.cls)} /><div><p className="text-sm text-white">{s.label}</p><p className="text-xs text-white/40">{s.text}</p></div></div>)}
      </div>
      <Tabs value={tab} onChange={setTab} options={[{ value: "hours", label: "Weekly hours" }, { value: "overrides", label: "Overrides & breaks" }, { value: "leave", label: isAdmin ? "Leave requests" : "My leave" }]} />

      {tab === "hours" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader icon={CalendarClock} title="Recurring working hours" description="Multiple slots per day are supported. Empty days are closed." action={<Button loading={saving} onClick={saveHours}><Save className="h-4 w-4" /> Save hours</Button>} />
            <div className="space-y-4">
              {WEEKDAYS.map((day, weekday) => {
                const dayItems = grouped[weekday];
                return <div key={day} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className={cn("h-2.5 w-2.5 rounded-full", dayItems.length ? "bg-emerald-400" : "bg-white/20")} /><p className="text-sm font-medium text-white">{day}</p><span className="text-xs text-white/35">{dayItems.length ? `${dayItems.length} slot${dayItems.length > 1 ? "s" : ""}` : "Closed"}</span></div><Button variant="ghost" size="sm" onClick={() => addSlot(weekday)}><Plus className="h-3.5 w-3.5" /> Add slot</Button></div>{dayItems.map((slot) => { const index = draft.indexOf(slot); return <div key={`${weekday}-${index}`} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1.3fr_auto] sm:items-end"><Field label="Start"><Input type="time" value={minutesToTime(slot.startMinutes)} onChange={(e) => updateSlot(index, { startMinutes: timeToMinutes(e.target.value) })} /></Field><Field label="End"><Input type="time" value={minutesToTime(slot.endMinutes)} onChange={(e) => updateSlot(index, { endMinutes: timeToMinutes(e.target.value) })} /></Field><Field label="Label"><Input value={slot.label} onChange={(e) => updateSlot(index, { label: e.target.value })} placeholder="Studio hours / Prayer break" /></Field><Button variant="ghost" size="icon" aria-label="Remove slot" onClick={() => removeSlot(index)}><Trash2 className="h-4 w-4 text-rose-300/70" /></Button></div>; })}</div>;
              })}
            </div>
          </Card>
          <div className="space-y-6"><Card className="glass-gold"><p className="flex items-center gap-2 text-sm text-gold-100"><Coffee className="h-4 w-4" /> Lunch & prayer breaks</p><p className="mt-2 text-xs leading-relaxed text-white/55">Add a second slot after your break (for example 09:00–13:00 and 14:00–19:00). Those gaps are automatically unavailable to booking.</p></Card><Card><p className="flex items-center gap-2 text-sm text-white"><ShieldCheck className="h-4 w-4 text-gold-300" /> Double-booking safety</p><p className="mt-2 text-xs leading-relaxed text-white/45">Availability is re-checked inside a PostgreSQL advisory lock when a booking is created or rescheduled.</p></Card></div>
        </div>
      ) : null}

      {tab === "overrides" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card><CardHeader icon={Umbrella} title="Add date override" description="Block a holiday, add a custom session window or record a break." /><div className="space-y-4"><Field label="Date"><Input type="date" value={override.date} onChange={(e) => setOverride((v) => ({ ...v, date: e.target.value }))} /></Field><Field label="Status"><Select value={override.kind} onChange={(e) => setOverride((v) => ({ ...v, kind: e.target.value }))}><option value="blocked">Blocked date</option><option value="holiday">Holiday</option><option value="available">Custom available hours</option><option value="break">Lunch / prayer break</option><option value="leave">Leave</option></Select></Field>{["available", "break"].includes(override.kind) ? <div className="grid gap-3 sm:grid-cols-2"><Field label="Start"><Input type="time" value={override.start} onChange={(e) => setOverride((v) => ({ ...v, start: e.target.value }))} /></Field><Field label="End"><Input type="time" value={override.end} onChange={(e) => setOverride((v) => ({ ...v, end: e.target.value }))} /></Field></div> : null}<Field label="Reason"><Textarea value={override.reason} onChange={(e) => setOverride((v) => ({ ...v, reason: e.target.value }))} placeholder="Holiday, personal appointment, studio event…" className="min-h-[72px]" /></Field><Button onClick={saveOverride} loading={saving}><Plus className="h-4 w-4" /> Add override</Button></div></Card><Card><CardHeader icon={Clock3} title="Upcoming overrides" /><div className="space-y-2">{data?.overrides.length ? data.overrides.map((o) => <div key={o.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3"><span className="flex items-center gap-3"><span className={cn("h-2.5 w-2.5 rounded-full", o.kind === "available" ? "bg-emerald-400" : o.kind === "leave" ? "bg-rose-400" : "bg-white/30")} /><span><span className="block text-sm text-white">{formatDateKey(o.date, "medium")}</span><span className="block text-xs text-white/45">{o.kind}{o.startMinutes != null ? ` · ${minutesToTime(o.startMinutes)}–${minutesToTime(o.endMinutes ?? 0)}` : ""} · {o.reason}</span></span></span>{isAdmin ? <Button variant="ghost" size="icon" aria-label="Remove override" onClick={() => setRemoving(o)}><Trash2 className="h-4 w-4 text-rose-300/70" /></Button> : null}</div>) : <EmptyState icon={Clock3} title="No overrides" description="Add a holiday, blocked date or custom window." className="py-8" />}</div></Card></div>
      ) : null}

      {tab === "leave" ? (
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          {!isAdmin ? <Card><CardHeader icon={Umbrella} title="Request leave" description="Approved leave automatically blocks your dates." /><div className="space-y-4"><Field label="First day"><Input type="date" value={leave.startDate} onChange={(e) => setLeave((v) => ({ ...v, startDate: e.target.value }))} /></Field><Field label="Last day"><Input type="date" value={leave.endDate} onChange={(e) => setLeave((v) => ({ ...v, endDate: e.target.value }))} /></Field><Field label="Reason"><Textarea value={leave.reason} onChange={(e) => setLeave((v) => ({ ...v, reason: e.target.value }))} placeholder="Annual leave, family event…" /></Field><Button onClick={submitLeave} loading={saving}><Umbrella className="h-4 w-4" /> Submit request</Button></div></Card> : null}
          <Card className={isAdmin ? "xl:col-span-2" : ""}><CardHeader icon={isAdmin ? ShieldCheck : CalendarClock} title={isAdmin ? "Leave approvals" : "Leave history"} description={isAdmin ? "Approve or reject requests. Approved dates are blocked immediately." : "Your submitted leave requests and decisions."} /><div className="space-y-3">{(isAdmin ? allLeaves?.results : data?.leaves)?.length ? (isAdmin ? allLeaves!.results : data!.leaves).map((l) => <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"><div><p className="text-sm text-white">{isAdmin ? `${l.photographerName} · ` : ""}{formatDateKey(l.startDate, "medium")} – {formatDateKey(l.endDate, "medium")}</p><p className="mt-1 text-xs text-white/45">{l.reason}{l.adminNote ? ` · ${l.adminNote}` : ""}</p></div><div className="flex items-center gap-2"><Badge tone={l.status === "approved" ? "emerald" : l.status === "rejected" ? "rose" : "amber"} dot>{l.status}</Badge>{isAdmin && l.status === "pending" ? <><Button size="sm" loading={saving} onClick={() => review(l.id, "approved")}><Check className="h-3.5 w-3.5" /> Approve</Button><Button variant="danger" size="sm" onClick={() => review(l.id, "rejected")}><X className="h-3.5 w-3.5" /> Reject</Button></> : null}</div></div>) : <EmptyState icon={Umbrella} title="No leave requests" description={isAdmin ? "Photographer requests will appear here." : "Your leave history is clear."} className="py-10" />}</div></Card>
        </div>
      ) : null}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title="Remove override?" message="This date will fall back to the recurring availability schedule." confirmLabel="Remove override" onConfirm={removeOverride} />
    </div>
  );
}
