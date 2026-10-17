import type { CaptureResult, Properties } from "posthog-js";

/**
 * URL properties PostHog keeps on events and copies onto the person ($set, $set_once).
 * PostHog's ingestion turns an identified event's `$current_url` into `$initial_current_url`
 * itself, so the SDK settings alone cannot keep a query string off the person (ground rule 11).
 */
const URL_KEYS = ["$current_url", "$initial_current_url", "$session_entry_url"] as const;

/** The URL without its query string and fragment: origin and path only. */
export function stripQueryAndHash(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url.split(/[?#]/, 1)[0] ?? "";
  }
}

function clean(props: Properties | undefined): Properties | undefined {
  if (!props) return props;
  let out: Properties | undefined;
  for (const key of URL_KEYS) {
    const v = props[key];
    if (typeof v !== "string") continue;
    const stripped = stripQueryAndHash(v);
    if (stripped === v) continue;
    out ??= { ...props };
    out[key] = stripped;
  }
  return out ?? props;
}

/** posthog-js `before_send`: strips query strings and fragments from URL properties. */
export function stripUrlQueries(cr: CaptureResult | null): CaptureResult | null {
  if (!cr) return cr;
  return {
    ...cr,
    properties: clean(cr.properties) ?? cr.properties,
    $set: clean(cr.$set),
    $set_once: clean(cr.$set_once),
  };
}
