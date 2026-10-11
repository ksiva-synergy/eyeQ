import { cookies } from "next/headers";
import { nextJar } from "@/server/auth/next-cookies";
import { QA_COOKIE } from "@/server/auth/qa";
import { supabaseFor } from "@/server/auth/supabase";
import { env } from "@/server/env";

/** Ends the Supabase session and clears its cookies, and any QA grant. */
export async function POST(): Promise<Response> {
  (await cookies()).delete(QA_COOKIE);
  if (env.supabase()) await supabaseFor(await nextJar()).auth.signOut();
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
