"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  Aperture,
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Camera,
  ChevronDown,
  CreditCard,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "./providers";
import { Avatar, Badge, BookingStatusBadge, ButtonLink, EmptyState, PageLoader, useDebounced } from "./ui";
import { ROLE_LABELS, cn, firstName, formatDateKey, type BookingStatus, type Role } from "@/lib/shared";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
type NavGroup = { section: string; items: NavItem[] };

const overview: NavItem = { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true };

const NAV: Record<Role, NavGroup[]> = {
  admin: [
    {
      section: "Studio",
      items: [
        overview,
        { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
        { href: "/dashboard/availability", label: "Availability", icon: CalendarClock },
        { href: "/dashboard/bookings", label: "Bookings", icon: CalendarCheck },
        { href: "/dashboard/clients", label: "Clients", icon: Users },
        { href: "/dashboard/chat", label: "Chat", icon: MessageCircle },
      ],
    },
    {
      section: "Business",
      items: [
        { href: "/dashboard/packages", label: "Packages", icon: Package },
        { href: "/dashboard/team", label: "Photographers", icon: Camera },
        { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
        { href: "/dashboard/galleries", label: "Galleries", icon: Images },
      ],
    },
    {
      section: "System",
      items: [
        { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
        { href: "/dashboard/settings", label: "Settings", icon: Settings },
      ],
    },
  ],
  photographer: [
    {
      section: "Workspace",
      items: [
        overview,
        { href: "/dashboard/calendar", label: "My schedule", icon: CalendarDays },
        { href: "/dashboard/availability", label: "Availability", icon: CalendarClock },
        { href: "/dashboard/bookings", label: "Assignments", icon: CalendarCheck },
        { href: "/dashboard/galleries", label: "Galleries", icon: Images },
        { href: "/dashboard/chat", label: "Chat", icon: MessageCircle },
      ],
    },
    {
      section: "Studio",
      items: [
        { href: "/dashboard/packages", label: "Packages", icon: Package },
        { href: "/dashboard/settings", label: "Profile", icon: Settings },
      ],
    },
  ],
  client: [
    {
      section: "My studio",
      items: [
        overview,
        { href: "/dashboard/bookings/new", label: "Book a session", icon: CalendarPlus },
        { href: "/dashboard/bookings", label: "My bookings", icon: CalendarCheck },
        { href: "/dashboard/galleries", label: "My galleries", icon: Images },
        { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
        { href: "/dashboard/chat", label: "Chat", icon: MessageCircle },
      ],
    },
    {
      section: "Account",
      items: [
        { href: "/dashboard/packages", label: "Packages", icon: Package },
        { href: "/dashboard/settings", label: "Profile", icon: Settings },
      ],
    },
  ],
};

/** Route-level role guard (the API enforces the same rules server-side). */
const ACCESS: Array<[string, Role[]]> = [
  ["/dashboard/clients", ["admin"]],
  ["/dashboard/team", ["admin"]],
  ["/dashboard/notifications", ["admin"]],
  ["/dashboard/payments", ["admin", "client"]],
  ["/dashboard/invoices", ["admin", "client"]],
  ["/dashboard/calendar", ["admin", "photographer"]],
  ["/dashboard/availability", ["admin", "photographer"]],
  ["/dashboard/bookings/new", ["admin", "client"]],
];

function canAccess(pathname: string, role: Role) {
  const rule = ACCESS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return !rule || rule[1].includes(role);
}

function isActive(pathname: string, item: NavItem, all: NavItem[]) {
  if (item.exact) return pathname === item.href;
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  if (!matches(item.href)) return false;
  return !all.some((o) => o.href !== item.href && o.href.length > item.href.length && matches(o.href));
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-2xl gold-fill text-ink-950 shadow-[0_10px_30px_-12px_rgba(209,169,92,0.9)]">
        <Aperture className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-display text-xl leading-none tracking-[0.32em] text-white">LUMIÈRE</span>
        <span className="mt-1 block text-[9px] uppercase tracking-[0.34em] text-white/40">Studio OS</span>
      </span>
    </Link>
  );
}

function Sidebar({ role, pathname, onNavigate }: { role: Role; pathname: string; onNavigate?: () => void }) {
  const groups = NAV[role];
  const all = groups.flatMap((g) => g.items);
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-6 pt-6">
        <Brand />
      </div>
      <nav className="no-scrollbar flex-1 space-y-7 overflow-y-auto px-4 pb-6">
        {groups.map((g) => (
          <div key={g.section}>
            <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.28em] text-white/30">{g.section}</p>
            <div className="space-y-1">
              {g.items.map((item) => {
                const active = isActive(pathname, item, all);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                      active ? "bg-white/[0.07] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]" : "text-white/55 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    {active ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full gold-fill" /> : null}
                    <Icon className={cn("h-[18px] w-[18px] transition", active ? "text-gold-300" : "text-white/35 group-hover:text-white/70")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="m-4 rounded-2xl glass-gold p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-gold-200">
          <ShieldCheck className="h-4 w-4" /> {ROLE_LABELS[role]} workspace
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">
          {role === "client"
            ? "Your galleries are private and protected with signed, expiring links."
            : "All actions are secured with JWT sessions and role-based permissions."}
        </p>
      </div>
    </div>
  );
}

type SearchResult = {
  clients: { id: number; name: string; email: string }[];
  bookings: { id: number; reference: string; title: string; date: string; clientName: string; status: BookingStatus }[];
  galleries: { id: number; title: string; status: string }[];
};

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q.trim(), 250);
  const ref = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useSWR<SearchResult>(debounced.length >= 2 ? `/search?q=${encodeURIComponent(debounced)}` : null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  const empty = data && !data.clients.length && !data.bookings.length && !data.galleries.length;

  return (
    <div ref={ref} className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search clients, bookings, galleries…"
        className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-10 pr-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-gold-400/50 focus:bg-white/[0.06]"
      />
      {open && q.trim().length >= 2 ? (
        <div className="glass-strong absolute left-0 right-0 top-12 z-50 max-h-[70vh] animate-scale-in overflow-y-auto rounded-2xl p-2 shadow-2xl">
          {isLoading && !data ? <p className="px-3 py-4 text-xs text-white/40">Searching…</p> : null}
          {empty ? <p className="px-3 py-4 text-xs text-white/40">No matches for “{q}”.</p> : null}
          {data?.clients.length ? <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.2em] text-white/30">Clients</p> : null}
          {data?.clients.map((c) => (
            <button key={`c${c.id}`} onClick={() => go(`/dashboard/clients/${c.id}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5">
              <Avatar name={c.name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-white">{c.name}</span>
                <span className="block truncate text-xs text-white/40">{c.email}</span>
              </span>
            </button>
          ))}
          {data?.bookings.length ? <p className="px-3 pb-1 pt-3 text-[10px] uppercase tracking-[0.2em] text-white/30">Bookings</p> : null}
          {data?.bookings.map((b) => (
            <button key={`b${b.id}`} onClick={() => go(`/dashboard/bookings/${b.id}`)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5">
              <span className="min-w-0">
                <span className="block truncate text-sm text-white">
                  {b.clientName} · {b.title}
                </span>
                <span className="block text-xs text-white/40">
                  {b.reference} · {formatDateKey(b.date)}
                </span>
              </span>
              <BookingStatusBadge status={b.status} />
            </button>
          ))}
          {data?.galleries.length ? <p className="px-3 pb-1 pt-3 text-[10px] uppercase tracking-[0.2em] text-white/30">Galleries</p> : null}
          {data?.galleries.map((g) => (
            <button key={`g${g.id}`} onClick={() => go(`/dashboard/galleries/${g.id}`)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5">
              <span className="flex items-center gap-2 truncate text-sm text-white">
                <Images className="h-4 w-4 text-gold-300" /> {g.title}
              </span>
              <Badge tone={g.status === "published" ? "emerald" : "zinc"}>{g.status}</Badge>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] py-1 pl-1 pr-2.5 transition hover:border-white/20">
        <Avatar name={user.name} src={user.avatarUrl} color={user.color} size="sm" />
        <span className="hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-xs font-medium text-white">{user.name}</span>
          <span className="block text-[10px] uppercase tracking-[0.16em] text-gold-300/80">{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-white/40" />
      </button>
      {open ? (
        <div className="glass-strong absolute right-0 top-12 z-50 w-64 animate-scale-in rounded-2xl p-2 shadow-2xl">
          <div className="border-b border-white/[0.07] px-3 pb-3 pt-2">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-white/45">{user.email}</p>
          </div>
          <Link href="/dashboard/settings" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white">
            <Settings className="h-4 w-4" /> Profile & settings
          </Link>
          <button
            onClick={async () => {
              setOpen(false);
              await logout();
              router.replace("/login");
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-rose-200/80 hover:bg-rose-500/10 hover:text-rose-200"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <header className="no-print sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <button onClick={onMenu} aria-label="Open navigation" className="rounded-xl border border-white/10 p-2 text-white/70 transition hover:text-white lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
        {user.role === "admin" ? (
          <GlobalSearch />
        ) : (
          <p className="hidden text-sm text-white/45 md:block">
            {greeting}, <span className="text-white">{firstName(user.name)}</span>
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          {user.role !== "photographer" ? (
            <ButtonLink href="/dashboard/bookings/new" size="sm" className="hidden sm:inline-flex">
              <Plus className="h-3.5 w-3.5" /> New booking
            </ButtonLink>
          ) : null}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status !== "authenticated" || !user) return <PageLoader fullscreen label="Opening your studio" />;
  const allowed = canAccess(pathname, user.role);

  return (
    <div className="min-h-screen ambient print:bg-white">
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/[0.06] bg-ink-950/60 backdrop-blur-2xl lg:block">
        <Sidebar role={user.role} pathname={pathname} />
      </aside>

      {mobileOpen ? (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-in-left border-r border-white/10 bg-ink-900">
            <button onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="absolute right-3 top-7 rounded-xl p-2 text-white/50 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <Sidebar role={user.role} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-72 print:pl-0">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9 print:p-0">
          {allowed ? (
            children
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="This area is restricted"
              description={`Your ${ROLE_LABELS[user.role].toLowerCase()} account doesn't have access to this page.`}
              action={<ButtonLink href="/dashboard">Back to overview</ButtonLink>}
              className="mt-10"
            />
          )}
        </main>
      </div>
    </div>
  );
}
