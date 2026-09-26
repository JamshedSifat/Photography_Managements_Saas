"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CloudUpload, Download, Heart, ImageIcon, Star, Trash2, X } from "lucide-react";
import { Badge, ProgressBar } from "./ui";
import { errorMessage, uploadWithProgress } from "@/lib/client-api";
import { cn, type PhotoDTO } from "@/lib/shared";

const MAX_BYTES = 25 * 1024 * 1024;
const BATCH = 4;

export function WatermarkOverlay({ large = false }: { large?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
      <span className={cn("-rotate-[24deg] select-none whitespace-nowrap font-display tracking-[0.45em] text-white/30 drop-shadow", large ? "text-4xl sm:text-6xl" : "text-lg")}>
        PROOF · LUMIÈRE
      </span>
    </div>
  );
}

export function Uploader({ galleryId, storage, onUploaded }: { galleryId: number; storage: "cloudinary" | "local"; onUploaded: () => void }) {
  const [drag, setDrag] = useState(false);
  const [state, setState] = useState<{ total: number; done: number; pct: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handle(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (!files.length) {
      toast.error("Please choose image files (JPG, PNG, WebP…)");
      return;
    }
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      toast.error(`"${tooBig.name}" exceeds the 25 MB limit`);
      return;
    }
    const total = files.length;
    let done = 0;
    setState({ total, done: 0, pct: 0 });
    try {
      for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH);
        const fd = new FormData();
        batch.forEach((f) => fd.append("files", f));
        await uploadWithProgress(`/galleries/${galleryId}/photos`, fd, (p) => {
          setState({ total, done, pct: Math.round(((done + (p / 100) * batch.length) / total) * 100) });
        });
        done += batch.length;
        setState({ total, done, pct: Math.round((done / total) * 100) });
        onUploaded();
      }
      toast.success(`Uploaded ${total} photo${total === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(errorMessage(e));
      onUploaded();
    } finally {
      setTimeout(() => setState(null), 700);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) void handle(e.dataTransfer.files);
      }}
      className={cn(
        "relative overflow-hidden rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300",
        drag ? "scale-[1.01] border-gold-400/70 bg-gold-400/[0.06]" : "border-white/10 bg-white/[0.015] hover:border-white/25",
      )}
    >
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-gold-400/25 bg-gold-400/10 text-gold-300">
        <CloudUpload className="h-6 w-6" />
      </span>
      <p className="mt-4 text-sm text-white">
        Drag &amp; drop photos here, or{" "}
        <button type="button" onClick={() => inputRef.current?.click()} className="text-gold-300 underline-offset-4 hover:underline" disabled={!!state}>
          browse files
        </button>
      </p>
      <p className="mt-1 text-xs text-white/40">
        JPG, PNG, WebP or HEIC up to 25 MB · Stored in {storage === "cloudinary" ? "Cloudinary with authenticated, signed delivery" : "private server storage (configure Cloudinary for CDN delivery)"}
      </p>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void handle(e.target.files)} />
      {state ? (
        <div className="mx-auto mt-6 max-w-sm animate-fade-in">
          <ProgressBar value={state.pct} />
          <p className="mt-2 text-xs text-white/50">
            Uploading {Math.min(state.done + 1, state.total)} of {state.total} · {state.pct}%
          </p>
        </div>
      ) : null}
    </div>
  );
}

function IconButton({ onClick, title, active, danger, children }: { onClick: () => void; title: string; active?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-xl backdrop-blur-md transition",
        danger ? "bg-black/50 text-rose-200 hover:bg-rose-500/80 hover:text-white" : active ? "bg-rose-500/90 text-white" : "bg-black/50 text-white hover:bg-white hover:text-ink-950",
      )}
    >
      {children}
    </button>
  );
}

export function PhotoGrid({
  photos,
  watermark,
  canManage,
  coverPhotoId,
  onOpen,
  onFavorite,
  onDelete,
  onCover,
}: {
  photos: PhotoDTO[];
  watermark: boolean;
  canManage: boolean;
  coverPhotoId: number | null;
  onOpen: (index: number) => void;
  onFavorite: (p: PhotoDTO) => void;
  onDelete?: (p: PhotoDTO) => void;
  onCover?: (p: PhotoDTO) => void;
}) {
  return (
    <div className="protect-media columns-2 gap-3 sm:columns-3 xl:columns-4" onContextMenu={(e) => e.preventDefault()}>
      {photos.map((p, i) => (
        <div
          key={p.id}
          className="group relative mb-3 animate-fade-up break-inside-avoid overflow-hidden rounded-2xl bg-white/[0.03]"
          style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
        >
          <img
            src={p.thumbUrl}
            alt={p.filename}
            loading="lazy"
            draggable={false}
            onClick={() => onOpen(i)}
            className="min-h-[120px] w-full cursor-zoom-in object-cover transition duration-700 group-hover:scale-[1.03]"
          />
          {watermark ? <WatermarkOverlay /> : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 transition duration-300 group-hover:opacity-100" />
          <div className="absolute right-2 top-2 flex gap-1.5 opacity-100 transition duration-300 sm:opacity-0 sm:group-hover:opacity-100">
            <IconButton title={p.isFavorite ? "Remove favourite" : "Favourite"} active={p.isFavorite} onClick={() => onFavorite(p)}>
              <Heart className={cn("h-4 w-4", p.isFavorite && "fill-current")} />
            </IconButton>
            {p.downloadUrl ? (
              <a
                href={p.downloadUrl}
                onClick={(e) => e.stopPropagation()}
                title="Download original"
                aria-label="Download original"
                className="grid h-8 w-8 place-items-center rounded-xl bg-black/50 text-white backdrop-blur-md transition hover:bg-white hover:text-ink-950"
              >
                <Download className="h-4 w-4" />
              </a>
            ) : null}
            {canManage && onCover ? (
              <IconButton title="Set as cover" onClick={() => onCover(p)}>
                <Star className={cn("h-4 w-4", coverPhotoId === p.id && "fill-current text-gold-300")} />
              </IconButton>
            ) : null}
            {canManage && onDelete ? (
              <IconButton title="Delete photo" danger onClick={() => onDelete(p)}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            ) : null}
          </div>
          {p.isFavorite ? <Heart className="absolute left-2.5 top-2.5 h-4 w-4 fill-rose-400 text-rose-400 transition group-hover:opacity-0" /> : null}
          {coverPhotoId === p.id ? (
            <Badge tone="gold" className="absolute bottom-2 left-2">
              Cover
            </Badge>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function Lightbox({
  photos,
  index,
  onClose,
  onIndex,
  watermark,
  onFavorite,
}: {
  photos: PhotoDTO[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
  watermark: boolean;
  onFavorite: (p: PhotoDTO) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const photo = photos[index];
  const count = photos.length;

  useEffect(() => {
    setLoaded(false);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % count);
      if (e.key === "ArrowLeft") onIndex((index - 1 + count) % count);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, count, onClose, onIndex]);

  if (!photo || typeof document === "undefined") return null;

  return createPortal(
    <div className="protect-media fixed inset-0 z-[120] flex animate-fade-in flex-col bg-black/95 backdrop-blur-xl" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs text-white/50">
            {index + 1} / {count}
          </p>
          <p className="truncate text-sm text-white">{photo.filename}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onFavorite(photo)}
            className={cn("grid h-10 w-10 place-items-center rounded-xl transition", photo.isFavorite ? "bg-rose-500 text-white" : "bg-white/10 text-white hover:bg-white/20")}
            aria-label="Favourite"
          >
            <Heart className={cn("h-4 w-4", photo.isFavorite && "fill-current")} />
          </button>
          {photo.downloadUrl ? (
            <a href={photo.downloadUrl} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white transition hover:bg-white/20" aria-label="Download">
              <Download className="h-4 w-4" />
            </a>
          ) : null}
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white transition hover:bg-white/20" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-3 sm:px-16">
        {count > 1 ? (
          <button
            type="button"
            onClick={() => onIndex((index - 1 + count) % count)}
            className="absolute left-2 z-10 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-5"
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : null}
        <div className="relative flex max-h-full items-center justify-center">
          {!loaded ? (
            <div className="absolute inset-0 grid place-items-center">
              <ImageIcon className="h-8 w-8 animate-pulse text-white/20" />
            </div>
          ) : null}
          <img
            key={photo.id}
            src={photo.previewUrl}
            alt={photo.filename}
            draggable={false}
            onLoad={() => setLoaded(true)}
            className={cn("max-h-[calc(100vh-190px)] max-w-full rounded-lg object-contain transition duration-500", loaded ? "scale-100 opacity-100" : "scale-[0.98] opacity-0")}
          />
          {watermark && loaded ? <WatermarkOverlay large /> : null}
        </div>
        {count > 1 ? (
          <button
            type="button"
            onClick={() => onIndex((index + 1) % count)}
            className="absolute right-2 z-10 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-5"
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        ) : null}
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-4">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onIndex(i)}
            className={cn("h-14 w-14 shrink-0 overflow-hidden rounded-lg transition", i === index ? "opacity-100 ring-2 ring-gold-400" : "opacity-40 hover:opacity-80")}
          >
            <img src={p.thumbUrl} alt="" draggable={false} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
