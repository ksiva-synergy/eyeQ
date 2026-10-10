/**
 * Who is calling. The API trusts only a verified session; the verifier is injected so
 * tests can supply sessions without Supabase (DECISIONS.md, phase 2: auth in tests).
 */
export interface Session {
  userId: string;
  /** E.164 with a leading + when the user signed in by phone. */
  phone: string | null;
  email: string | null;
  /** From the identity provider (Google), used once to seed the display name. */
  name: string | null;
}

export interface SessionVerifier {
  verify(req: Request): Promise<Session | null>;
}

/** Supabase stores phone numbers without the +. */
export function e164(phone: unknown): string | null {
  if (typeof phone !== "string" || phone === "") return null;
  return phone.startsWith("+") ? phone : `+${phone}`;
}
