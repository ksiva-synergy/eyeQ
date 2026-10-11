import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { memoryStore, supabaseStore } from "../../storage";
import { uploadImage } from "./uploads";

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#7C3AED" } })
    .withExif({ IFD0: { Copyright: "secret location" } })
    .jpeg()
    .toBuffer()
    .then((b) => new Uint8Array(b));

describe("uploadImage", () => {
  it("writes fixed-width WebP variants with metadata stripped, and audits", async () => {
    const store = memoryStore();
    const audit = vi.fn(async () => {});
    const r = await uploadImage(
      store,
      "cover",
      { bytes: await png(2000, 1000), name: "cover.jpg" },
      audit,
    );
    expect(r.variants.map((v) => v.width)).toEqual([400, 800, 1200]);
    expect(r.url).toBe(r.variants.at(-1)!.url);
    expect(r.url).toMatch(/^memory:\/\/public\/cover\/[0-9a-f-]{36}\/1200\.webp$/);
    for (const [key, obj] of store.objects) {
      expect(key.startsWith("public/cover/")).toBe(true);
      expect(obj.contentType).toBe("image/webp");
      const meta = await sharp(obj.bytes).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect(Number(key.match(/(\d+)\.webp$/)![1])).toBe(meta.width);
    }
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "upload.create", targetType: "image" }),
    );
  });

  it("never upscales a small image", async () => {
    const store = memoryStore();
    await uploadImage(
      store,
      "badge",
      { bytes: await png(200, 200), name: "b.png" },
      async () => {},
    );
    const widths = await Promise.all(
      [...store.objects.values()].map(async (o) => (await sharp(o.bytes).metadata()).width),
    );
    expect(widths).toEqual([128, 200, 200]);
  });

  it("refuses files that are not images, and answers 503 without storage", async () => {
    const store = memoryStore();
    await expect(
      uploadImage(
        store,
        "cover",
        { bytes: new TextEncoder().encode("<svg/>"), name: "x.svg" },
        async () => {},
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      uploadImage(store, "cover", { bytes: new Uint8Array(), name: "e" }, async () => {}),
    ).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      uploadImage(null, "cover", { bytes: await png(10, 10), name: "c" }, async () => {}),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(store.objects.size).toBe(0);
  });
});

describe("supabaseStore", () => {
  it("creates the bucket once, uploads with the service key, and builds public URLs", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", {
        status: url.endsWith("/bucket") && calls.length > 2 ? 409 : 200,
      });
    }) as unknown as typeof fetch;
    const store = supabaseStore({ url: "https://x.supabase.co/", key: "svc" }, fetcher);
    await store.put("public", "cover/a/400.webp", new Uint8Array([1]), "image/webp");
    await store.put("public", "cover/a/800.webp", new Uint8Array([1]), "image/webp");
    expect(calls.map((c) => c.url)).toEqual([
      "https://x.supabase.co/storage/v1/bucket",
      "https://x.supabase.co/storage/v1/object/public/cover/a/400.webp",
      "https://x.supabase.co/storage/v1/object/public/cover/a/800.webp",
    ]);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      id: "public",
      name: "public",
      public: true,
    });
    expect(calls[1]!.init.headers).toMatchObject({
      authorization: "Bearer svc",
      "content-type": "image/webp",
    });
    expect(store.publicUrl("cover/a/800.webp")).toBe(
      "https://x.supabase.co/storage/v1/object/public/public/cover/a/800.webp",
    );
  });

  it("treats an existing bucket as fine and fails loudly on an upload error", async () => {
    const fetcher = (async (url: string) =>
      url.endsWith("/bucket")
        ? new Response('{"error":"Duplicate","message":"The resource already exists"}', {
            status: 400,
          })
        : new Response("no", { status: 403 })) as unknown as typeof fetch;
    const store = supabaseStore({ url: "https://x.supabase.co", key: "svc" }, fetcher);
    await expect(store.put("public", "p", new Uint8Array([1]), "image/webp")).rejects.toThrow(
      /upload public\/p: 403/,
    );
  });
});
