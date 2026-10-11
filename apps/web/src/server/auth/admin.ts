import "server-only";
import { notFound, redirect } from "next/navigation";
import { serviceDb } from "../db";
import { currentSession } from "./current";
import type { Session } from "./session";

export type AdminIdentity = { session: Session; role: "coach" | "owner" };

/**
 * Page-side gate for /admin (plan phase 4): signed out -> sign-in, then back; signed in
 * without an `admins` row -> 404, so the admin's existence is not advertised. The API
 * checks again on every call (adminRoute); this only decides what renders.
 */
export async function requireAdmin(next = "/admin"): Promise<AdminIdentity> {
  const session = await currentSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const row = await serviceDb().admins.findUnique({ where: { user_id: session.userId } });
  if (!row) notFound();
  return { session, role: row.role as AdminIdentity["role"] };
}

/** The coach's profile time zone; admin dates are shown in it on server and browser alike. */
export async function adminTimeZone(userId: string): Promise<string> {
  const p = await serviceDb().profiles.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  return p?.timezone ?? "Asia/Kolkata";
}
