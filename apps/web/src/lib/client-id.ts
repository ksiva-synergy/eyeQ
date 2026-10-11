/**
 * A v4 UUID for client_event_id and idempotency keys (rule 6). `crypto.randomUUID` exists
 * only in a secure context (HTTPS or localhost); over plain HTTP, such as a phone opening
 * the app at a LAN address, it is missing and the page crashed. `getRandomValues` is
 * available everywhere.
 */
export function clientId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
