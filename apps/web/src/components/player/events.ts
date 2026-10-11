import type { CompletionEvent } from "@eyeq/api-contract";

/**
 * Completion events kept in this browser for the athlete's local day, keyed by session and
 * drill. The same event (and so the same client_event_id) is sent again until the server
 * has it (plan 8.2: a failed submission is retried with the same id while the tab is open),
 * and a stored event can be replayed later to read back its stored result, which writes
 * nothing (rule 6). Losing storage only loses that replay, never an award.
 */
const PREFIX = "eyeq:events:";

function key(localDate: string): string {
  return `${PREFIX}${localDate}`;
}

function read(localDate: string): Record<string, CompletionEvent> {
  try {
    const raw = localStorage.getItem(key(localDate));
    return raw ? (JSON.parse(raw) as Record<string, CompletionEvent>) : {};
  } catch {
    return {};
  }
}

function write(localDate: string, events: Record<string, CompletionEvent>): void {
  try {
    // Older days are not needed again; keep storage to the current one.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX) && k !== key(localDate)) localStorage.removeItem(k);
    }
    localStorage.setItem(key(localDate), JSON.stringify(events));
  } catch {
    // Private mode or full storage: retries within this page still use the same event.
  }
}

const slot = (sessionId: string | null, drillId: string) => `${sessionId ?? "free"}:${drillId}`;

export function storedEvent(
  localDate: string,
  sessionId: string | null,
  drillId: string,
): CompletionEvent | undefined {
  return read(localDate)[slot(sessionId, drillId)];
}

/** The event for this drill: the stored one if it exists, else this one, stored. */
export function keepEvent(localDate: string, event: CompletionEvent): CompletionEvent {
  const all = read(localDate);
  const k = slot(event.sessionId, event.drillId);
  const existing = all[k];
  if (existing) return existing;
  all[k] = event;
  write(localDate, all);
  return event;
}
