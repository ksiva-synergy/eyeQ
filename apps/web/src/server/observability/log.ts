/**
 * Structured logs: one JSON object per line on stdout, which Vercel's log view and log
 * drains parse. Fields carry ids, never personal data (ground rule 11): no phone,
 * email, name or date of birth.
 */
type Level = "debug" | "info" | "warn" | "error";

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (process.env["LOG_SILENT"] === "1") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** For logging a phone number at all: country code and last two digits only. */
export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 3)}••••${phone.slice(-2)}` : "••••";
}

/** "asha@example.com" → "a••••@example.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at > 0 ? `${email[0]}••••${email.slice(at)}` : "••••";
}
