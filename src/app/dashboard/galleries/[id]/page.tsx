"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Activity, ArrowLeft, CalendarCheck, Clock3, Download, Eye, EyeOff, FileArchive, Heart, Images, Lock, MessageSquare, Send, ShieldCheck, Stamp, Trash2 } from "lucide-react";
import { Lightbox, PhotoGrid, Uploader } from "@/components/gallery";
import { useAuth } from "@/components/providers";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, PageLoader, Tabs, Textarea, Toggle } from "@/components/ui";
import { api, errorMessage } from "@/lib/client-api";
import { formatDate, formatDateKey, type GalleryDetailDTO, type PhotoDTO } from "@/lib/shared";

export default function GalleryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const key = `/galleries/${id}`;
  const { data, error, isLoading, mutate } = useSWR<{ gallery: GalleryDetailDTO }>(key);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "delete" | { photo: PhotoDTO }>(null);
  const [comment, setComment] = useState("");
  const [commentPhotoId, setCommentPhotoId] = useState<number | null>(null);
  const [extensionDays, setExtensionDays] = useState("7");

  const closeLightbox = useCallback(() => setOpenIndex(null), []);

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => mutate()} />;
  if (isLoading || !data || !user) return <PageLoader />;

  const g = data.gallery;
  const isStaff = user.role !== "client";
  const photos = filter === "favorites" ? g.photos.filter((p) => p.isFavorite) : g.photos;
  const favorites = g.photos.filter((p) => p.isFavorite).length;

  async function patch(body: Record<string, unknown>, label: string, success: string) {
    setBusy(label);
    try {
      const res = await api<{ notified?: boolean }>(key, { method: "PATCH", body });
      toast.success(res.notified ? `${success} — client notified by email` : success);
      void mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleFavorite(p: PhotoDTO) {
    const next = !p.isFavorite;
    void mutate({ gallery: { ...g, photos: g.photos.map((x) => (x.id === p.id ? { ...x, isFavorite: next } : x)) } }, { revalidate: false });
    try {
      await api(`/photos/${p.id}`, { method: "PATCH", body: { isFavorite: next } });
    } catch (e) {
      toast.error(errorMessage(e));
      void mutate();
    }
  }

  async function deletePhoto(p: PhotoDTO) {
    setBusy("photo");
    try {
      await api(`/photos/${p.id}`, { method: "DELETE" });
      toast.success("Photo deleted");
      setConfirm(null);
      void mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function notifyClient() {
    setBusy("notify");
    try {
      await api(`${key}/notify`, { method: "POST" });
      toast.success(`Gallery-ready email sent to ${g.client.name}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeGallery() {
    setBusy("delete");
    try {
      await api(key, { method: "DELETE" });
      toast.success("Gallery deleted");
      router.replace("/dashboard/galleries");
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(null);
    }
  }

  async function addComment() {
    if (!comment.trim()) return;
    setBusy("comment");
    try {
      await api(`${key}/comments`, { method: "POST", body: { photoId: commentPhotoId, message: comment.trim() } });
      setComment("");
      setCommentPhotoId(null);
      toast.success("Edit request added");
      void mutate();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }

  async function requestExtension() {
    setBusy("extension");
    try {
      await api(`${key}/extension-requests`, { method: "POST", body: { requestedDays: Number(extensionDays), note: "Please keep downloads open a little longer." } });
      toast.success("Extension request sent to the studio");
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }

  const zipToken = g.photos[0]?.downloadUrl?.split("t=")[1] ?? "";
  const zipUrl = zipToken ? `/api/galleries/${g.id}/download.zip?t=${zipToken}` : null;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/galleries" className="inline-flex items-center gap-2 text-xs text-white/45 transition hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" /> All galleries
      </Link>

      <div className="glass relative animate-fade-up overflow-hidden rounded-[2rem] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap gap-1.5">
              {isStaff ? <Badge tone={g.status === "published" ? "emerald" : "amber"} dot>{g.status === "published" ? "Published" : "Draft — hidden from client"}</Badge> : null}
              <Badge tone="gold">
                <Lock className="h-3 w-3" /> Private
              </Badge>
              {g.watermark ? (
                <Badge tone="violet">
                  <Stamp className="h-3 w-3" /> Proofing watermark
                </Badge>
              ) : null}
              {g.allowDownload ? (
                <Badge tone="sky">
                  <Download className="h-3 w-3" /> Downloads enabled
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-3 font-display text-4xl text-white sm:text-5xl">{g.title}</h1>
            <p className="mt-2 text-sm text-white/50">
              {isStaff ? `${g.client.name} · ` : ""}
              {g.photos.length} photos{favorites ? ` · ${favorites} favourites` : ""}
              {g.booking ? ` · Session ${formatDateKey(g.booking.date, "medium")}` : ""}
              {g.expiresAt ? ` · Access until ${formatDate(g.expiresAt)}` : ""}
            </p>
            {g.description ? <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65">{g.description}</p> : null}
            {g.downloadExpiresAt ? <p className={g.downloadsEnabled ? "mt-3 flex items-center gap-2 text-xs text-amber-200/80" : "mt-3 flex items-center gap-2 text-xs text-rose-300"}><Clock3 className="h-3.5 w-3.5" /> {g.downloadsEnabled ? `Downloads expire in ${g.downloadDaysRemaining} day${g.downloadDaysRemaining === 1 ? "" : "s"}` : "Downloads expired — request an extension below"}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {zipUrl && g.downloadsEnabled ? <a href={zipUrl} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white transition hover:border-gold-400/50 hover:bg-white/[0.06]"><FileArchive className="h-4 w-4 text-gold-300" /> Download ZIP</a> : null}
            {g.booking && isStaff ? (
              <Button variant="ghost" onClick={() => router.push(`/dashboard/bookings/${g.booking?.id}`)}>
                <CalendarCheck className="h-4 w-4" /> Booking
              </Button>
            ) : null}
            {isStaff && g.status === "published" ? (
              <Button variant="outline" loading={busy === "notify"} onClick={notifyClient}>
                <Send className="h-4 w-4" /> Notify client
              </Button>
            ) : null}
            {isStaff ? (
              g.status === "published" ? (
                <Button variant="outline" loading={busy === "status"} onClick={() => patch({ status: "draft" }, "status", "Gallery unpublished")}>
                  <EyeOff className="h-4 w-4" /> Unpublish
                </Button>
              ) : (
                <Button loading={busy === "status"} disabled={!g.photos.length} onClick={() => patch({ status: "published" }, "status", "Gallery published")}>
                  <Eye className="h-4 w-4" /> Publish & notify
                </Button>
              )
            ) : null}
          </div>
        </div>
      </div>

      {isStaff ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Uploader galleryId={g.id} storage={g.storage} onUploaded={() => void mutate()} />
          </div>
          <Card className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-white">
              <ShieldCheck className="h-4 w-4 text-gold-300" /> Delivery & security
            </p>
            <Toggle checked={g.allowDownload} disabled={busy === "dl"} onChange={(v) => patch({ allowDownload: v }, "dl", v ? "Downloads enabled" : "Downloads disabled")} label="Allow downloads" description="Full-resolution originals via expiring links" />
            <Toggle checked={g.watermark} disabled={busy === "wm"} onChange={(v) => patch({ watermark: v }, "wm", v ? "Proof watermark on" : "Proof watermark off")} label="Proof watermark" description="Overlay on client previews" />
            {user.role === "admin" ? (
              <Button variant="ghost" size="sm" className="w-full text-rose-200/70 hover:text-rose-200" onClick={() => setConfirm("delete")}>
                <Trash2 className="h-3.5 w-3.5" /> Delete gallery
              </Button>
            ) : null}
          </Card>
        </div>
      ) : null}

      {!isStaff && !g.downloadsEnabled ? <Card className="glass-gold"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 text-sm text-gold-100"><Clock3 className="h-4 w-4" /> Downloads have expired</p><p className="mt-1 text-xs text-white/50">Request 7, 15 or 30 more days and the studio will review it.</p></div><div className="flex items-center gap-2"><select value={extensionDays} onChange={(e) => setExtensionDays(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white"><option value="7">7 days</option><option value="15">15 days</option><option value="30">30 days</option></select><Button loading={busy === "extension"} onClick={requestExtension}><Send className="h-4 w-4" /> Request extension</Button></div></div></Card> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All photos", count: g.photos.length },
            { value: "favorites", label: <span className="flex items-center gap-1.5"><Heart className="h-3 w-3" /> Favourites</span>, count: favorites },
          ]}
        />
        <p className="flex items-center gap-1.5 text-[11px] text-white/35">
          <Lock className="h-3 w-3" /> Images are served through signed links that expire automatically.
        </p>
      </div>

      {photos.length === 0 ? (
        <EmptyState
          icon={filter === "favorites" ? Heart : Images}
          title={filter === "favorites" ? "No favourites yet" : "No photos yet"}
          description={filter === "favorites" ? "Tap the heart on any image to add it here." : isStaff ? "Drag images into the uploader above." : "Images are on their way."}
        />
      ) : (
        <PhotoGrid
          photos={photos}
          watermark={g.watermark && !isStaff}
          canManage={isStaff}
          coverPhotoId={g.coverPhotoId}
          onOpen={setOpenIndex}
          onFavorite={toggleFavorite}
          onDelete={isStaff ? (p) => setConfirm({ photo: p }) : undefined}
          onCover={isStaff ? (p) => patch({ coverPhotoId: p.id }, "cover", "Cover photo updated") : undefined}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2"><div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-sm text-white"><MessageSquare className="h-4 w-4 text-gold-300" /> Edit requests & comments</p><p className="mt-1 text-xs text-white/40">Leave notes on the gallery or a specific image.</p></div><Badge tone="gold">{g.comments?.length ?? 0}</Badge></div><div className="mt-4 space-y-2">{g.comments?.length ? g.comments.map((c) => <div key={c.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs text-white">{c.authorName}{c.photoId ? ` · Photo #${c.photoId}` : " · Gallery"}</p><Badge tone={c.status === "resolved" ? "emerald" : "amber"}>{c.status}</Badge></div><p className="mt-2 text-sm leading-relaxed text-white/65">{c.message}</p></div>) : <p className="text-sm text-white/40">No comments yet.</p>}</div><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Request a retouch, ask for a crop, or leave a note…" className="min-h-[72px]" /><div className="flex flex-col gap-2"><Input value={commentPhotoId ?? ""} onChange={(e) => setCommentPhotoId(Number(e.target.value) || null)} placeholder="Photo #" inputMode="numeric" /><Button loading={busy === "comment"} onClick={addComment}><MessageSquare className="h-4 w-4" /> Add note</Button></div></div></Card>
        <Card><p className="flex items-center gap-2 text-sm text-white"><Activity className="h-4 w-4 text-gold-300" /> Activity timeline</p><div className="mt-4 space-y-3">{g.activities?.slice(0, 8).map((a) => <div key={a.id} className="flex gap-3 text-xs"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold-400" /><div><p className="text-white/70">{a.type.replaceAll("_", " ")}</p><p className="text-white/35">{a.actorName ?? "Client"} · {new Date(a.createdAt).toLocaleString()}</p></div></div>)}</div></Card>
      </div>

      {openIndex != null && photos[openIndex] ? (
        <Lightbox photos={photos} index={openIndex} onIndex={setOpenIndex} onClose={closeLightbox} watermark={g.watermark && !isStaff} onFavorite={toggleFavorite} />
      ) : null}

      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title="Delete this gallery?"
        message="All photos will be permanently removed from storage. This cannot be undone."
        confirmLabel="Delete gallery"
        loading={busy === "delete"}
        onConfirm={removeGallery}
      />
      <ConfirmDialog
        open={typeof confirm === "object" && confirm !== null}
        onClose={() => setConfirm(null)}
        title="Delete photo?"
        message="The image will be removed from the gallery and storage."
        confirmLabel="Delete photo"
        loading={busy === "photo"}
        onConfirm={() => {
          if (confirm && typeof confirm === "object") void deletePhoto(confirm.photo);
        }}
      />
    </div>
  );
}
