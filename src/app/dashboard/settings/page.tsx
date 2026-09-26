"use client";

import { useEffect, useState, type FormEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Building2, CalendarClock, CircleAlert, CircleCheck, Cloud, KeyRound, Mail, Server, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/components/providers";
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Skeleton, Tabs, Textarea } from "@/components/ui";
import { api, errorMessage, fieldErrors } from "@/lib/client-api";
import { ROLE_LABELS, WEEKDAYS, cn, minutesToTime, timeToMinutes, type SessionUser, type StudioSettingsDTO } from "@/lib/shared";

type Tab = "profile" | "security" | "studio" | "integrations";

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("profile");
  if (!user) return null;
  const options: { value: Tab; label: string }[] = [
    { value: "profile", label: "Profile" },
    { value: "security", label: "Security" },
    ...(isAdmin
      ? [
          { value: "studio" as const, label: "Studio & booking rules" },
          { value: "integrations" as const, label: "Integrations" },
        ]
      : []),
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title={isAdmin ? "Settings" : "Your profile"} description="Manage your account, security and studio configuration." />
      <Tabs value={tab} onChange={setTab} options={options} />
      <div className="animate-fade-in" key={tab}>
        {tab === "profile" ? <ProfileForm user={user} /> : null}
        {tab === "security" ? <PasswordForm /> : null}
        {tab === "studio" && isAdmin ? <StudioForm /> : null}
        {tab === "integrations" && isAdmin ? <Integrations /> : null}
      </div>
    </div>
  );
}

function ProfileForm({ user }: { user: SessionUser }) {
  const { setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, phone: user.phone ?? "", bio: user.bio ?? "", specialty: user.specialty ?? "", avatarUrl: user.avatarUrl ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 2) {
      setErrors({ name: "Please enter your full name" });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const res = await api<{ user: SessionUser }>("/auth/me", {
        method: "PATCH",
        body: { name: form.name.trim(), phone: form.phone.trim() || null, bio: form.bio.trim() || null, specialty: form.specialty.trim() || null, avatarUrl: form.avatarUrl.trim() || null },
      });
      setUser(res.user);
      toast.success("Profile updated");
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="flex flex-col items-center text-center">
        <Avatar name={form.name || user.name} src={form.avatarUrl || null} color={user.color} size="xl" />
        <p className="mt-4 font-display text-2xl text-white">{form.name || user.name}</p>
        <p className="text-sm text-white/45">{user.email}</p>
        <Badge tone="gold" className="mt-3">
          {ROLE_LABELS[user.role]}
        </Badge>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader icon={User} title="Personal details" />
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={errors.name} required>
            <Input value={form.name} onChange={(e) => set("name")(e.target.value)} invalid={!!errors.name} />
          </Field>
          <Field label="Email" hint="Contact the studio to change your email">
            <Input value={user.email} disabled />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} />
          </Field>
          {user.role !== "client" ? (
            <Field label="Specialty" error={errors.specialty}>
              <Input value={form.specialty} onChange={(e) => set("specialty")(e.target.value)} />
            </Field>
          ) : (
            <div />
          )}
          <Field label="Avatar image URL" error={errors.avatarUrl} className="sm:col-span-2">
            <Input value={form.avatarUrl} onChange={(e) => set("avatarUrl")(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Bio" error={errors.bio} className="sm:col-span-2">
            <Textarea value={form.bio} onChange={(e) => set("bio")(e.target.value)} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={saving}>
              Save profile
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function PasswordForm() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.currentPassword) errs.currentPassword = "Current password is required";
    if (form.newPassword.length < 8 || !/[A-Za-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) errs.newPassword = "8+ characters with a letter and a number";
    if (form.confirm !== form.newPassword) errs.confirm = "Passwords don't match";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api("/auth/password", { method: "POST", body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      toast.success("Password updated");
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader icon={KeyRound} title="Change password" description="Use at least 8 characters with a letter and a number." />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Current password" error={errors.currentPassword}>
          <Input type="password" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} invalid={!!errors.currentPassword} autoComplete="current-password" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" error={errors.newPassword}>
            <Input type="password" value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} invalid={!!errors.newPassword} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" error={errors.confirm}>
            <Input type="password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} invalid={!!errors.confirm} autoComplete="new-password" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}

const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney", "UTC"];

function StudioForm() {
  const { data, mutate } = useSWR<{ settings: StudioSettingsDTO }>("/settings");
  const [form, setForm] = useState<StudioSettingsDTO | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data.settings);
  }, [data, form]);

  if (!form) return <Skeleton className="h-96" />;
  const set = <K extends keyof StudioSettingsDTO>(k: K, v: StudioSettingsDTO[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setErrors({});
    try {
      const res = await api<{ settings: StudioSettingsDTO }>("/settings", { method: "PATCH", body: form });
      setForm(res.settings);
      void mutate(res, { revalidate: false });
      toast.success("Studio settings saved");
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader icon={Building2} title="Studio profile" description="Shown on invoices, emails and the public site" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Studio name" error={errors.studioName} className="sm:col-span-2">
            <Input value={form.studioName} onChange={(e) => set("studioName", e.target.value)} />
          </Field>
          <Field label="Tagline" error={errors.tagline} className="sm:col-span-2">
            <Input value={form.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Address" error={errors.address} className="sm:col-span-2">
            <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Currency" error={errors.currency}>
            <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {["USD", "EUR", "GBP", "INR", "AUD", "CAD", "AED", "SGD"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Invoice prefix" error={errors.invoicePrefix}>
            <Input value={form.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} />
          </Field>
          <Field label="Invoice notes & payment details" error={errors.invoiceNotes} className="sm:col-span-2">
            <Textarea value={form.invoiceNotes ?? ""} onChange={(e) => set("invoiceNotes", e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader icon={CalendarClock} title="Booking rules" description="Drive online availability and double-booking protection" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Timezone" error={errors.timezone} className="sm:col-span-2">
            <Select value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {[form.timezone, ...TIMEZONES.filter((t) => t !== form.timezone)].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Opens" error={errors.openMinutes}>
            <Input type="time" value={minutesToTime(form.openMinutes)} onChange={(e) => set("openMinutes", timeToMinutes(e.target.value) || 0)} />
          </Field>
          <Field label="Closes" error={errors.closeMinutes}>
            <Input type="time" value={minutesToTime(Math.min(form.closeMinutes, 1439))} onChange={(e) => set("closeMinutes", timeToMinutes(e.target.value) || 0)} />
          </Field>
          <Field label="Slot interval" error={errors.slotIntervalMinutes}>
            <Select value={form.slotIntervalMinutes} onChange={(e) => set("slotIntervalMinutes", Number(e.target.value))}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  Every {m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Buffer between shoots" error={errors.bufferMinutes} hint="Per photographer">
            <Select value={form.bufferMinutes} onChange={(e) => set("bufferMinutes", Number(e.target.value))}>
              {[0, 15, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Minimum notice (hours)" error={errors.minNoticeHours}>
            <Input type="number" min={0} value={form.minNoticeHours} onChange={(e) => set("minNoticeHours", Number(e.target.value))} />
          </Field>
          <Field label="Book up to (days ahead)" error={errors.maxAdvanceDays}>
            <Input type="number" min={1} value={form.maxAdvanceDays} onChange={(e) => set("maxAdvanceDays", Number(e.target.value))} />
          </Field>
          <Field label="Working days" error={errors.workingDays} className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d, i) => {
                const on = form.workingDays.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set("workingDays", on ? form.workingDays.filter((x) => x !== i) : [...form.workingDays, i].sort())}
                    className={cn("h-10 w-14 rounded-xl text-sm transition", on ? "gold-fill font-medium text-ink-950" : "border border-white/10 text-white/50 hover:border-white/25")}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Card>
      <div className="flex justify-end xl:col-span-2">
        <Button type="submit" size="lg" loading={saving}>
          Save studio settings
        </Button>
      </div>
    </form>
  );
}

type Status = { storage: string; cloudinary: boolean; email: "smtp" | "resend" | "log"; jwtSecretConfigured: boolean; cronSecretConfigured: boolean; appUrl: string | null };

function Integrations() {
  const { data } = useSWR<Status>("/system/status");
  if (!data) return <Skeleton className="h-80" />;
  const rows = [
    {
      icon: Cloud,
      title: "Cloudinary media storage",
      ok: data.cloudinary,
      detail: data.cloudinary ? "Uploads use authenticated delivery with signed URLs." : "Using private server storage. Set CLOUDINARY_URL (or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).",
    },
    {
      icon: Mail,
      title: "Email delivery",
      ok: data.email !== "log",
      detail: data.email === "log" ? "Preview mode — emails are logged to the outbox. Set SMTP_* or RESEND_API_KEY and EMAIL_FROM." : `Sending via ${data.email.toUpperCase()}.`,
    },
    {
      icon: ShieldCheck,
      title: "JWT signing secret",
      ok: data.jwtSecretConfigured,
      detail: data.jwtSecretConfigured ? "Custom JWT_SECRET configured." : "Using a development secret. Set JWT_SECRET to a long random string in production.",
    },
    {
      icon: Server,
      title: "Scheduled reminders",
      ok: data.cronSecretConfigured,
      detail: data.cronSecretConfigured ? "Cron endpoint secured with CRON_SECRET." : "Set CRON_SECRET and call POST /api/notifications/reminders daily with header x-cron-secret.",
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((r) => (
        <Card key={r.title}>
          <div className="flex items-start gap-4">
            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", r.ok ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300")}>
              <r.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-white">{r.title}</p>
                {r.ok ? (
                  <Badge tone="emerald">
                    <CircleCheck className="h-3 w-3" /> Connected
                  </Badge>
                ) : (
                  <Badge tone="amber">
                    <CircleAlert className="h-3 w-3" /> Fallback active
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-white/50">{r.detail}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
