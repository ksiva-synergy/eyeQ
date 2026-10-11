import sharp, { type Metadata } from "sharp";
import type { AuditEntry } from "../../api/admin";
import { ApiError } from "../../api/errors";
import type { ObjectStore } from "../../storage";

/**
 * Image uploads for the admin (plan phase 4): program covers, badge art and thumbnails
 * for Drive drills. The server decodes the file, strips metadata, and writes fixed-width
 * WebP variants with sharp (Supabase's metered image transformation is not used, plan
 * 2.0). Each upload gets a new folder; the stored URL is the largest variant, and the
 * others sit beside it as {width}.webp.
 */
export const imageKinds = ["cover", "badge", "thumbnail"] as const;
export type ImageKind = (typeof imageKinds)[number];

export const VARIANT_WIDTHS: Record<ImageKind, number[]> = {
  cover: [400, 800, 1200],
  badge: [128, 256, 512],
  thumbnail: [320, 640],
};
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["jpeg", "png", "webp", "avif", "heif"]);

export type UploadResult = {
  url: string;
  kind: ImageKind;
  variants: { width: number; url: string }[];
};

const invalid = (message: string) =>
  new ApiError(400, "validation_failed", "The request is not valid.", {
    issues: [{ path: "file", message }],
  });

export async function uploadImage(
  store: ObjectStore | null,
  kind: ImageKind,
  file: { bytes: Uint8Array; name: string },
  audit: (e: AuditEntry) => Promise<void>,
): Promise<UploadResult> {
  if (!store) throw new ApiError(503, "internal", "Image uploads are not configured.");
  if (file.bytes.byteLength === 0) throw invalid("the file is empty");
  if (file.bytes.byteLength > MAX_BYTES) throw invalid("images up to 8 MB");
  let meta: Metadata;
  try {
    meta = await sharp(file.bytes).metadata();
  } catch {
    throw invalid("not an image");
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw invalid("JPEG, PNG, WebP or AVIF only");
  const folder = `${kind}/${crypto.randomUUID()}`;
  const variants: UploadResult["variants"] = [];
  for (const width of VARIANT_WIDTHS[kind]) {
    // Never upscale; rotate from EXIF, then drop all metadata (location included).
    const bytes = await sharp(file.bytes)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const path = `${folder}/${width}.webp`;
    await store.put("public", path, new Uint8Array(bytes), "image/webp");
    variants.push({ width, url: store.publicUrl(path) });
  }
  const result = { kind, url: variants.at(-1)!.url, variants };
  await audit({
    action: "upload.create",
    targetType: "image",
    targetId: folder,
    after: { kind, name: file.name.slice(0, 120), bytes: file.bytes.byteLength, url: result.url },
  });
  return result;
}
