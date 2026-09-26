"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Aperture, Camera, Crown, Eye, EyeOff, KeyRound, Quote, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { useAuth } from "./providers";
import { Button, Field, Input } from "./ui";
import { errorMessage, fieldErrors } from "@/lib/client-api";
import { MEDIA, ROLES, cn, firstName, type Role } from "@/lib/shared";

const ROLE_OPTIONS: { value: Role; label: string; icon: LucideIcon; blurb: string }[] = [
  { value: "client", label: "Client", icon: UserRound, blurb: "Book, pay & view galleries" },
  { value: "photographer", label: "Photographer", icon: Camera, blurb: "Schedule & deliveries" },
  { value: "admin", label: "Admin", icon: Crown, blurb: "Run the studio" },
];

const DEMO: Record<Role, { email: string; password: string }> = {
  admin: { email: "admin@lumiere.studio", password: "Admin@123" },
  photographer: { email: "elena@lumiere.studio", password: "Photo@123" },
  client: { email: "client@lumiere.studio", password: "Client@123" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

function initialRole(value: string | null): Role {
  return (ROLES as readonly string[]).includes(value ?? "") ? (value as Role) : "client";
}

export function AuthShell({ title, subtitle, children }: { title: ReactNode; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-ink-950 lg:grid-cols-[1fr_1.05fr]">
      <div className="ambient relative flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="flex w-fit items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl gold-fill text-ink-950">
            <Aperture className="h-5 w-5" />
          </span>
          <span className="font-display text-xl tracking-[0.32em] text-white">LUMIÈRE</span>
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="animate-fade-up font-display text-4xl text-white sm:text-5xl">{title}</h1>
          <p className="mt-3 animate-fade-up text-sm text-white/50" style={{ animationDelay: "60ms" }}>
            {subtitle}
          </p>
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "120ms" }}>
            {children}
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs text-white/30">
          <KeyRound className="h-3.5 w-3.5" /> Secured with JWT access & refresh tokens and role-based permissions.
        </p>
      </div>
      <div className="relative hidden overflow-hidden lg:block">
        <img src={MEDIA.auth} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/80 via-transparent to-transparent" />
        <div className="glass absolute bottom-12 left-12 right-12 max-w-lg animate-fade-up rounded-3xl p-7">
          <Quote className="h-6 w-6 text-gold-300" />
          <p className="mt-4 font-display text-2xl leading-snug text-white">
            &ldquo;Booking was effortless, and our gallery arrived in a gorgeous private portal. Pure magic.&rdquo;
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.25em] text-white/50">Olivia &amp; Noah · Wedding clients</p>
        </div>
      </div>
    </div>
  );
}

function RoleTabs({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
      {ROLE_OPTIONS.map((r) => {
        const active = value === r.value;
        return (
          <button
            key={r.value}
            type="button"
            onClick={() => onChange(r.value)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center transition-all duration-200",
              active ? "bg-white text-ink-950 shadow-lg" : "text-white/55 hover:bg-white/[0.05] hover:text-white",
            )}
          >
            <r.icon className={cn("h-4 w-4", active ? "text-gold-700" : "")} />
            <span className="text-xs font-medium">{r.label}</span>
            <span className={cn("hidden text-[10px] leading-tight sm:block", active ? "text-ink-950/55" : "text-white/35")}>{r.blurb}</span>
          </button>
        );
      })}
    </div>
  );
}

function PasswordInput({ value, onChange, invalid, placeholder, autoComplete }: { value: string; onChange: (v: string) => void; invalid?: boolean; placeholder?: string; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid} placeholder={placeholder} autoComplete={autoComplete} className="pr-11" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function LoginForm() {
  const { login, status } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [role, setRole] = useState<Role>(() => initialRole(params.get("role")));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && !loading) router.replace(next);
  }, [status, loading, next, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) errs.email = "Enter a valid email address";
    if (!password) errs.password = "Password is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const user = await login({ email: email.trim(), password, role });
      toast.success(`Welcome back, ${firstName(user.name)}`);
      router.replace(next);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <RoleTabs value={role} onChange={setRole} />
      <Field label="Email" error={errors.email}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} placeholder="you@example.com" autoComplete="email" />
      </Field>
      <Field label="Password" error={errors.password ?? errors.role}>
        <PasswordInput value={password} onChange={setPassword} invalid={!!errors.password} placeholder="••••••••" autoComplete="current-password" />
      </Field>
      <Button type="submit" size="lg" loading={loading} className="w-full">
        Sign in to {ROLE_OPTIONS.find((r) => r.value === role)?.label.toLowerCase()} portal
      </Button>

      <div className="rounded-2xl glass-gold p-4">
        <p className="flex items-center gap-2 text-xs font-medium text-gold-200">
          <Sparkles className="h-3.5 w-3.5" /> Demo accounts — one click to fill
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => {
                setRole(r.value);
                setEmail(DEMO[r.value].email);
                setPassword(DEMO[r.value].password);
                setErrors({});
              }}
              className="rounded-xl border border-white/10 bg-ink-950/40 px-2 py-2 text-[11px] text-white/70 transition hover:border-gold-400/40 hover:text-white"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-center text-sm text-white/45">
        New to Lumière?{" "}
        <Link href={`/register${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-gold-300 hover:text-gold-200">
          Create an account
        </Link>
      </p>
    </form>
  );
}

function passwordScore(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
  return s;
}

export function RegisterForm() {
  const { register, status } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [role, setRole] = useState<Role>(() => initialRole(params.get("role")));
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "", inviteCode: "" });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const score = passwordScore(form.password);

  useEffect(() => {
    if (status === "authenticated" && !loading) router.replace(next);
  }, [status, loading, next, router]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = "Please enter your full name";
    if (!EMAIL_RE.test(form.email.trim())) errs.email = "Enter a valid email address";
    if (form.password.length < 8) errs.password = "Password must be at least 8 characters";
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) errs.password = "Include at least one letter and one number";
    if (form.confirm !== form.password) errs.confirm = "Passwords don't match";
    if (role !== "client" && !form.inviteCode.trim()) errs.inviteCode = "Staff accounts require a studio invite code";
    if (!agree) errs.agree = "Please accept the terms to continue";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        role,
        inviteCode: role !== "client" ? form.inviteCode.trim() : undefined,
      });
      toast.success(`Welcome to Lumière, ${firstName(user.name)}!`);
      router.replace(user.role === "client" && next === "/dashboard" ? "/dashboard" : next);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <RoleTabs value={role} onChange={setRole} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name} required>
          <Input value={form.name} onChange={(e) => set("name")(e.target.value)} invalid={!!errors.name} placeholder="Jane Doe" autoComplete="name" />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="+1 555 0100" autoComplete="tel" />
        </Field>
      </div>
      <Field label="Email" error={errors.email} required>
        <Input type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} invalid={!!errors.email} placeholder="you@example.com" autoComplete="email" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" error={errors.password ?? errors.newPassword} required>
          <PasswordInput value={form.password} onChange={set("password")} invalid={!!errors.password} placeholder="8+ characters" autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" error={errors.confirm} required>
          <PasswordInput value={form.confirm} onChange={set("confirm")} invalid={!!errors.confirm} placeholder="Repeat password" autoComplete="new-password" />
        </Field>
      </div>
      {form.password ? (
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < score ? (score >= 3 ? "bg-emerald-400" : score === 2 ? "bg-amber-400" : "bg-rose-400") : "bg-white/10")} />
          ))}
          <span className="w-14 text-right text-[11px] text-white/45">{["Weak", "Weak", "Fair", "Good", "Strong"][score]}</span>
        </div>
      ) : null}
      {role !== "client" ? (
        <Field
          label="Studio invite code"
          error={errors.inviteCode}
          required
          hint={<>Ask your studio administrator. Demo codes: <code className="text-gold-300">LUMIERE-TEAM</code> (photographer), <code className="text-gold-300">LUMIERE-ADMIN</code> (admin).</>}
        >
          <Input value={form.inviteCode} onChange={(e) => set("inviteCode")(e.target.value)} invalid={!!errors.inviteCode} placeholder="LUMIERE-XXXX" />
        </Field>
      ) : null}
      <label className="flex cursor-pointer items-start gap-3 text-sm text-white/55">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#d1a95c]" />
        <span>
          I agree to the studio&apos;s terms and privacy policy.
          {errors.agree ? <span className="block text-xs text-rose-300">{errors.agree}</span> : null}
        </span>
      </label>
      <Button type="submit" size="lg" loading={loading} className="w-full">
        Create {role} account
      </Button>
      <p className="text-center text-sm text-white/45">
        Already have an account?{" "}
        <Link href={`/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-gold-300 hover:text-gold-200">
          Sign in
        </Link>
      </p>
    </form>
  );
}
