import { env } from "./env";

/**
 * Supabase Storage, written only by the server with the service-role key (plan 2.0,
 * rule 12). Two buckets: `public` (covers, badges, thumbnails: served to anyone) and
 * `private` (later: data exports). Every upload goes to a new path, so nothing is ever
 * overwritten and the CDN never serves a stale image.
 */
export type Bucket = "public" | "private";

export interface ObjectStore {
  put(bucket: Bucket, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  publicUrl(path: string): string;
}

export class StorageError extends Error {}

type Fetch = typeof fetch;

export function supabaseStore(
  cfg: { url: string; key: string },
  fetcher: Fetch = fetch,
): ObjectStore {
  const base = `${cfg.url.replace(/\/$/, "")}/storage/v1`;
  const headers = { authorization: `Bearer ${cfg.key}`, apikey: cfg.key };
  const ensured = new Set<Bucket>();

  // Creates the bucket the first time it is needed; "already exists" is fine.
  async function ensure(bucket: Bucket) {
    if (ensured.has(bucket)) return;
    const res = await fetcher(`${base}/bucket`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ id: bucket, name: bucket, public: bucket === "public" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok && res.status !== 409 && !(await res.text()).toLowerCase().includes("exists"))
      throw new StorageError(`bucket ${bucket}: ${res.status}`);
    ensured.add(bucket);
  }

  return {
    async put(bucket, path, bytes, contentType) {
      await ensure(bucket);
      const res = await fetcher(`${base}/object/${bucket}/${path}`, {
        method: "POST",
        headers: { ...headers, "content-type": contentType, "cache-control": "max-age=31536000" },
        body: new Blob([bytes as Uint8Array<ArrayBuffer>]),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new StorageError(`upload ${bucket}/${path}: ${res.status}`);
    },
    publicUrl: (path) => `${base}/object/public/public/${path}`,
  };
}

/** For tests: keeps objects in memory. */
export function memoryStore(): ObjectStore & {
  objects: Map<string, { bytes: Uint8Array; contentType: string }>;
} {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(bucket, path, bytes, contentType) {
      objects.set(`${bucket}/${path}`, { bytes, contentType });
    },
    publicUrl: (path) => `memory://public/${path}`,
  };
}

/** Null when the service-role key is not set: uploads are then unavailable (503). */
export function objectStore(): ObjectStore | null {
  const cfg = env.storage();
  return cfg ? supabaseStore(cfg) : null;
}
