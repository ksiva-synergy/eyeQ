/**
 * YouTube and Google Drive link parsing, shared by the server's link check and the
 * builder's bulk-paste panel (which parses as the coach types). No network here.
 */
export type VideoLink = { provider: "youtube" | "drive"; ref: string; url: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

/**
 * youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID, /live/ID;
 * drive.google.com/file/d/ID/…, /open?id=ID, /uc?id=ID. A Drive resource key
 * (?resourcekey=) is kept in the reference as "ID:KEY". Null for anything else.
 */
export function parseVideoLink(input: string): VideoLink | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www|m)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") {
    const id = parts[0];
    return id && YOUTUBE_ID.test(id) ? youtube(id) : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id =
      parts[0] === "watch"
        ? u.searchParams.get("v")
        : ["shorts", "embed", "live", "v"].includes(parts[0] ?? "")
          ? parts[1]
          : null;
    return id && YOUTUBE_ID.test(id) ? youtube(id) : null;
  }
  if (host === "drive.google.com") {
    const id =
      parts[0] === "file" && parts[1] === "d"
        ? parts[2]
        : parts[0] === "open" || parts[0] === "uc"
          ? u.searchParams.get("id")
          : null;
    if (!id || !DRIVE_ID.test(id)) return null;
    const key = u.searchParams.get("resourcekey");
    const ref = key && /^[A-Za-z0-9_-]+$/.test(key) ? `${id}:${key}` : id;
    return { provider: "drive", ref, url: videoUrl("drive", ref) };
  }
  return null;
}

const youtube = (id: string): VideoLink => ({
  provider: "youtube",
  ref: id,
  url: videoUrl("youtube", id),
});

/** The canonical link for a stored reference, shown back to the coach. */
export function videoUrl(provider: string, ref: string): string {
  if (provider === "youtube") return `https://youtu.be/${ref}`;
  if (provider === "drive") {
    const [id, key] = ref.split(":");
    return `https://drive.google.com/file/d/${id}/view${key ? `?resourcekey=${key}` : ""}`;
  }
  return ref;
}
