import type { DrillMedia } from "@eyeq/api-contract";

/**
 * The DrillPlayer provider interface (plan phase 5): every video host is a component with
 * these props. youtube and drive exist; mux (a protected host, plan section 14) slots in
 * here without touching the player.
 */
export type WatchProgress = {
  /** Share of the drill that counts as watched, 0 to 1. */
  fraction: number;
  elapsedS: number;
  totalS: number;
};

export type ProviderProps = {
  media: DrillMedia;
  title: string;
  /** The drill's own length, for providers that cannot report one (Drive). */
  drillSeconds: number;
  onProgress: (p: WatchProgress) => void;
  onError: () => void;
};

/** "1AbC:resourcekey" (how the link check stores a Drive resource key) → the preview URL. */
export function drivePreviewUrl(ref: string): string {
  const [id, key] = ref.split(":");
  const url = new URL(`https://drive.google.com/file/d/${encodeURIComponent(id ?? "")}/preview`);
  if (key) url.searchParams.set("resourcekey", key);
  return url.toString();
}
