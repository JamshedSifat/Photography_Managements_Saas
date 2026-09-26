import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import type { Photo } from "@/db/schema";
import { ApiError } from "./http";

/**
 * Photo storage: Cloudinary (authenticated delivery + signed URLs) when configured,
 * otherwise a private on-disk store served only through the authorized media API.
 */

export function cloudinaryEnabled() {
  return Boolean(
    process.env.CLOUDINARY_URL ||
      (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
  );
}

let configured = false;
function configure() {
  if (configured) return;
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  } else {
    cloudinary.config({ secure: true }); // reads CLOUDINARY_URL
  }
  configured = true;
}

const STORAGE_ROOT = path.resolve(
  /*turbopackIgnore: true*/ process.env.UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "uploads"),
);
const FOLDER = process.env.CLOUDINARY_FOLDER || "lumiere-studio";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};

export type StoredPhoto = {
  provider: "cloudinary" | "local";
  publicId: string;
  url: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  bytes: number;
  mimeType: string;
};

function slugify(name: string) {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "photo"
  );
}

export async function storePhoto(file: File, galleryId: number): Promise<StoredPhoto> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";

  if (cloudinaryEnabled()) {
    configure();
    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `${FOLDER}/gallery-${galleryId}`,
            public_id: `${slugify(file.name)}-${randomUUID().slice(0, 8)}`,
            type: "authenticated",
            resource_type: "image",
            overwrite: false,
          },
          (error, res) => {
            if (error || !res) reject(error ?? new Error("Cloudinary upload failed"));
            else resolve(res);
          },
        );
        stream.end(buffer);
      });
      return {
        provider: "cloudinary",
        publicId: result.public_id,
        url: result.secure_url,
        format: result.format ?? null,
        width: result.width ?? null,
        height: result.height ?? null,
        bytes: result.bytes ?? buffer.length,
        mimeType,
      };
    } catch (err) {
      const message = (err as { message?: string })?.message ?? "Unknown error";
      throw new ApiError(502, `Cloudinary upload failed: ${message}`);
    }
  }

  const ext = MIME_EXT[mimeType] || path.extname(file.name).slice(1).toLowerCase() || "jpg";
  const key = `gallery-${galleryId}/${randomUUID()}.${ext}`;
  const target = path.join(/*turbopackIgnore: true*/ STORAGE_ROOT, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
  return { provider: "local", publicId: key, url: null, format: ext, width: null, height: null, bytes: buffer.length, mimeType };
}

function localPath(key: string) {
  const full = path.resolve(/*turbopackIgnore: true*/ STORAGE_ROOT, key);
  if (!full.startsWith(STORAGE_ROOT + path.sep)) throw new ApiError(400, "Invalid file key");
  return full;
}

export async function readLocalPhoto(key: string) {
  try {
    return await fs.readFile(localPath(key));
  } catch {
    throw new ApiError(404, "Image file not found");
  }
}

type UrlOptions = NonNullable<Parameters<typeof cloudinary.url>[1]>;

export function cloudinaryImageUrl(publicId: string, format: string | null, variant: "thumb" | "preview", watermarkText?: string | null) {
  configure();
  const options: UrlOptions = {
    type: "authenticated",
    sign_url: true,
    secure: true,
    resource_type: "image",
    format: format ?? undefined,
    transformation: [
      variant === "thumb"
        ? { width: 900, crop: "limit", quality: "auto", fetch_format: "auto" }
        : { width: 2200, crop: "limit", quality: "auto:good", fetch_format: "auto" },
      ...(watermarkText
        ? [
            {
              overlay: { font_family: "Arial", font_size: variant === "thumb" ? 46 : 110, font_weight: "bold", text: watermarkText },
              color: "#FFFFFF",
              opacity: 35,
              gravity: "center",
            },
          ]
        : []),
    ],
  } as UrlOptions;
  return cloudinary.url(publicId, options);
}

export function cloudinaryDownloadUrl(publicId: string, format: string | null) {
  configure();
  return cloudinary.utils.private_download_url(publicId, format || "jpg", {
    type: "authenticated",
    resource_type: "image",
    attachment: true,
    expires_at: Math.floor(Date.now() / 1000) + 600,
  });
}

export async function deleteStoredPhoto(photo: Pick<Photo, "provider" | "publicId">) {
  try {
    if (photo.provider === "cloudinary" && photo.publicId && cloudinaryEnabled()) {
      configure();
      await cloudinary.uploader.destroy(photo.publicId, { type: "authenticated", resource_type: "image", invalidate: true });
    } else if (photo.provider === "local" && photo.publicId) {
      await fs.unlink(localPath(photo.publicId));
    }
  } catch (err) {
    console.warn("[storage] failed to delete asset", photo.publicId, (err as Error)?.message);
  }
}

// ------------------------------------------------------------------ chat attachments

const CHAT_MAX_BYTES = 15 * 1024 * 1024;
const CHAT_FOLDER = process.env.CLOUDINARY_CHAT_FOLDER || "lumiere-chat";

export type StoredChatFile = {
  provider: "cloudinary" | "local";
  publicId: string;
  url: string | null;
  mimeType: string;
  bytes: number;
};

/**
 * Stores a chat attachment (image or file). Images go to Cloudinary as authenticated
 * assets when configured; everything else lands in the private local store, which is
 * only ever served through the authorised `/api/chat/files/:id` endpoint.
 */
export async function storeChatFile(file: File, roomId: number): Promise<StoredChatFile> {
  if (file.size > CHAT_MAX_BYTES) throw new ApiError(400, "Attachments must be 15 MB or smaller.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const isImage = mimeType.startsWith("image/");

  if (isImage && cloudinaryEnabled()) {
    configure();
    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `${CHAT_FOLDER}/room-${roomId}`,
            public_id: `${slugify(file.name)}-${randomUUID().slice(0, 8)}`,
            type: "authenticated",
            resource_type: "image",
            overwrite: false,
          },
          (error, res) => {
            if (error || !res) reject(error ?? new Error("Cloudinary upload failed"));
            else resolve(res);
          },
        );
        stream.end(buffer);
      });
      return { provider: "cloudinary", publicId: result.public_id, url: result.secure_url, mimeType, bytes: result.bytes ?? buffer.length };
    } catch (err) {
      const message = (err as { message?: string })?.message ?? "Unknown error";
      throw new ApiError(502, `Upload failed: ${message}`);
    }
  }

  const ext = MIME_EXT[mimeType] || path.extname(file.name).slice(1).toLowerCase() || "bin";
  const key = `chat-room-${roomId}/${randomUUID()}.${ext}`;
  const target = path.join(/*turbopackIgnore: true*/ STORAGE_ROOT, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
  return { provider: "local", publicId: key, url: null, mimeType, bytes: buffer.length };
}

export async function readChatFile(key: string) {
  return readLocalPhoto(key);
}

export function chatFileUrl(messageId: number) {
  return `/api/chat/files/${messageId}`;
}

export function chatImageUrl(messageId: number) {
  return `/api/chat/files/${messageId}?inline=1`;
}

export async function deleteChatAttachment(stored: { provider: string; publicId: string | null }) {
  await deleteStoredPhoto({ provider: stored.provider as "cloudinary" | "local", publicId: stored.publicId });
}
