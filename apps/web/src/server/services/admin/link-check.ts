import { parseVideoLink, videoUrl, type VideoLink } from "../../../lib/video-link";
import { env } from "../../env";

export { parseVideoLink, videoUrl, type VideoLink };

/**
 * Link check (plan phase 4): a pasted YouTube or Google Drive link is parsed into a
 * provider and reference, then checked server-side. YouTube: the video exists, is
 * embeddable and not private (duration, privacy, title and thumbnail come back). Drive:
 * the file is shared to anyone with the link and is a video.
 *
 * Without GOOGLE_API_KEY, local and test runs use a deterministic stub (references starting
 * "dead" are missing, "priv" are private), so CI never calls Google. Staging and production
 * without a key report "unavailable": the drill stays unchecked and cannot be published.
 */

export type LinkReason =
  "not_found" | "private" | "not_embeddable" | "not_shared" | "not_video" | "unavailable";

export type LinkCheck = {
  status: "ok" | "broken" | "unchecked";
  reason: LinkReason | null;
  durationSeconds: number | null;
  privacy: string | null;
  title: string | null;
  thumbnailUrl: string | null;
};

export interface LinkChecker {
  check(link: VideoLink): Promise<LinkCheck>;
}

/** ISO 8601 duration ("PT1H3M50S") to seconds. */
export function isoDurationSeconds(iso: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return ((d ?? 0) * 24 + (h ?? 0)) * 3600 + (min ?? 0) * 60 + (s ?? 0);
}

const result = (r: Partial<LinkCheck> & Pick<LinkCheck, "status">): LinkCheck => ({
  reason: null,
  durationSeconds: null,
  privacy: null,
  title: null,
  thumbnailUrl: null,
  ...r,
});
const broken = (reason: LinkReason) => result({ status: "broken", reason });
const unavailable = () => result({ status: "unchecked", reason: "unavailable" });

type Fetch = typeof fetch;

export function googleChecker(key: string, fetcher: Fetch = fetch): LinkChecker {
  const get = (url: string, headers: Record<string, string> = {}) =>
    fetcher(url, { headers, signal: AbortSignal.timeout(8_000), cache: "no-store" });

  async function youtubeCheck(id: string): Promise<LinkCheck> {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.search = new URLSearchParams({ part: "status,contentDetails,snippet", id, key }).toString();
    const res = await get(url.toString());
    if (!res.ok) return unavailable();
    const body = (await res.json()) as {
      items?: {
        status?: { privacyStatus?: string; embeddable?: boolean };
        contentDetails?: { duration?: string };
        snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> };
      }[];
    };
    const v = body.items?.[0];
    if (!v) return broken("not_found");
    const privacy = v.status?.privacyStatus ?? null;
    const t = v.snippet?.thumbnails ?? {};
    const meta = {
      privacy,
      durationSeconds: v.contentDetails?.duration
        ? isoDurationSeconds(v.contentDetails.duration)
        : null,
      title: v.snippet?.title ?? null,
      thumbnailUrl: (t["high"] ?? t["medium"] ?? t["default"])?.url ?? null,
    };
    if (privacy === "private") return result({ status: "broken", reason: "private", ...meta });
    if (v.status?.embeddable === false)
      return result({ status: "broken", reason: "not_embeddable", ...meta });
    return result({ status: "ok", ...meta });
  }

  async function driveCheck(ref: string): Promise<LinkCheck> {
    const [id, resourceKey] = ref.split(":");
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${id}`);
    url.search = new URLSearchParams({
      fields: "id,name,mimeType,thumbnailLink,videoMediaMetadata(durationMillis)",
      supportsAllDrives: "true",
      key,
    }).toString();
    // An API key only reads files shared to anyone with the link.
    const res = await get(
      url.toString(),
      resourceKey ? { "X-Goog-Drive-Resource-Keys": `${id}/${resourceKey}` } : {},
    );
    if (res.status === 404 || res.status === 403) return broken("not_shared");
    if (!res.ok) return unavailable();
    const f = (await res.json()) as {
      name?: string;
      mimeType?: string;
      thumbnailLink?: string;
      videoMediaMetadata?: { durationMillis?: string };
    };
    const meta = {
      privacy: "anyone_with_link",
      title: f.name ?? null,
      thumbnailUrl: f.thumbnailLink ?? null,
      durationSeconds: f.videoMediaMetadata?.durationMillis
        ? Math.round(Number(f.videoMediaMetadata.durationMillis) / 1000)
        : null,
    };
    if (!f.mimeType?.startsWith("video/"))
      return result({ status: "broken", reason: "not_video", ...meta });
    return result({ status: "ok", ...meta });
  }

  return {
    async check(link) {
      try {
        return link.provider === "youtube"
          ? await youtubeCheck(link.ref)
          : await driveCheck(link.ref);
      } catch {
        return unavailable();
      }
    },
  };
}

/** Deterministic, offline: local and CI runs without a key. */
export const stubChecker: LinkChecker = {
  async check(link) {
    const ref = link.ref.toLowerCase();
    if (ref.startsWith("dead"))
      return broken(link.provider === "drive" ? "not_shared" : "not_found");
    if (ref.startsWith("priv")) return broken("private");
    return result({
      status: "ok",
      durationSeconds: 180,
      privacy: link.provider === "drive" ? "anyone_with_link" : "unlisted",
      title: null,
      thumbnailUrl:
        link.provider === "youtube" ? `https://i.ytimg.com/vi/${link.ref}/hqdefault.jpg` : null,
    });
  },
};

const unavailableChecker: LinkChecker = { check: async () => unavailable() };

export function linkChecker(): LinkChecker {
  const key = env.googleApiKey();
  if (key) return googleChecker(key);
  const app = env.appEnv();
  return app === "local" || app === "test" ? stubChecker : unavailableChecker;
}
