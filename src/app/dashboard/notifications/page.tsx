"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { BellRing, CircleAlert, CircleCheck, Inbox, Mail, MailCheck, Send, Server } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  StatCard,
  useDebounced,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/client-api";
import { EMAIL_STATUS_META, EMAIL_TYPES, EMAIL_TYPE_LABELS, formatDateTime, type EmailLogDTO, type Paginated } from "@/lib/shared";

type ListResponse = Paginated<EmailLogDTO> & { stats: Record<string, number>; provider: "smtp" | "resend" | "log" };

const PROVIDER_LABEL = { smtp: "SMTP", resend: "Resend API", log: "Preview mode (outbox only)" };

export default function NotificationsPage() {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 300);
  const [page, setPage] = useState(1);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setPage(1), [type, status, debounced]);
  const params = new URLSearchParams({ page: String(page), pageSize: "15" });
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  if (debounced) params.set("q", debounced);

  const { data, error, isLoading, mutate } = useSWR<ListResponse>(`/notifications?${params}`);
  const { data: preview, isLoading: previewLoading } = useSWR<{ notification: EmailLogDTO & { html: string } }>(previewId ? `/notifications/${previewId}` : null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
      void mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const provider = data?.provider ?? "log";
  const stats = data?.stats ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automations"
        title="Email notifications"
        description="Booking confirmations, session reminders, payment receipts and gallery-ready emails — all logged in one outbox."
        actions={
          <>
            <Button
              variant="outline"
              loading={busy === "test"}
              onClick={() =>
                run("test", async () => {
                  const r = await api<{ status: string; to: string }>("/notifications/test", { method: "POST" });
                  toast.success(`Test email ${r.status === "sent" ? "delivered" : r.status} → ${r.to}`);
                })
              }
            >
              <Send className="h-4 w-4" /> Send test
            </Button>
            <Button
              loading={busy === "reminders"}
              onClick={() =>
                run("reminders", async () => {
                  const r = await api<{ sent: number }>("/notifications/reminders", { method: "POST" });
                  toast.success(r.sent ? `Sent ${r.sent} reminder${r.sent === 1 ? "" : "s"}` : "No reminders due right now");
                })
              }
            >
              <BellRing className="h-4 w-4" /> Send due reminders
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Delivery provider" value={<span className="text-2xl">{provider === "log" ? "Preview" : provider.toUpperCase()}</span>} icon={Server} hint={PROVIDER_LABEL[provider]} />
        <StatCard label="Delivered" value={stats.sent ?? 0} icon={MailCheck} delay={60} />
        <StatCard label="Logged (preview)" value={stats.logged ?? 0} icon={Inbox} delay={120} />
        <StatCard label="Failed" value={stats.failed ?? 0} icon={CircleAlert} delay={180} />
      </div>

      {provider === "log" ? (
        <Card className="glass-gold">
          <div className="flex items-start gap-4">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-gold-200" />
            <p className="text-sm leading-relaxed text-white/65">
              Emails are currently rendered and stored in the outbox without being sent. Add <code className="text-gold-200">SMTP_HOST</code>, <code className="text-gold-200">SMTP_PORT</code>,{" "}
              <code className="text-gold-200">SMTP_USER</code>, <code className="text-gold-200">SMTP_PASS</code> (or <code className="text-gold-200">RESEND_API_KEY</code>) and{" "}
              <code className="text-gold-200">EMAIL_FROM</code> to deliver real emails. Schedule <code className="text-gold-200">POST /api/notifications/reminders</code> with header{" "}
              <code className="text-gold-200">x-cron-secret</code> for automatic daily reminders. <Link href="/dashboard/settings" className="text-gold-300 underline-offset-4 hover:underline">View integrations</Link>
            </p>
          </div>
        </Card>
      ) : null}

      <Card className="p-4 sm:p-5">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Search recipient or subject…" className="sm:w-72" />
          <div className="sm:w-52">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All email types</option>
              {EMAIL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMAIL_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:w-44">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="sent">Delivered</option>
              <option value="logged">Logged</option>
              <option value="failed">Failed</option>
            </Select>
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
          <EmptyState icon={Inbox} title="No emails yet" description="Notifications will appear here as bookings, payments and galleries happen." />
        ) : (
          <>
            <div className="divide-y divide-white/[0.06]">
              {data.results.map((e) => (
                <button key={e.id} type="button" onClick={() => setPreviewId(e.id)} className="flex w-full flex-wrap items-center gap-4 px-2 py-3.5 text-left transition hover:bg-white/[0.025]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.03]">
                    {e.status === "failed" ? <CircleAlert className="h-4 w-4 text-rose-300" /> : e.status === "sent" ? <CircleCheck className="h-4 w-4 text-emerald-300" /> : <Mail className="h-4 w-4 text-sky-300" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{e.subject}</p>
                    <p className="truncate text-xs text-white/40">
                      To {e.toName ? `${e.toName} · ` : ""}
                      {e.toEmail}
                      {e.error ? ` · ${e.error}` : ""}
                    </p>
                  </div>
                  <Badge tone="gold">{EMAIL_TYPE_LABELS[e.type]}</Badge>
                  <Badge tone={EMAIL_STATUS_META[e.status].tone}>{EMAIL_STATUS_META[e.status].label}</Badge>
                  <span className="w-36 text-right text-xs text-white/40">{formatDateTime(e.createdAt)}</span>
                </button>
              ))}
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} count={data.count} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={previewId != null} onClose={() => setPreviewId(null)} size="xl" title={preview?.notification.subject ?? "Email preview"} description={preview ? `To ${preview.notification.toEmail} · ${formatDateTime(preview.notification.createdAt)}` : undefined}>
        {previewLoading || !preview ? (
          <Skeleton className="h-[480px]" />
        ) : (
          <iframe title="Email preview" srcDoc={preview.notification.html} sandbox="" className="h-[65vh] w-full rounded-2xl border border-white/10 bg-white" />
        )}
      </Modal>
    </div>
  );
}
