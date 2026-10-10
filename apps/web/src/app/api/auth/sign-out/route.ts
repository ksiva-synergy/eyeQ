import { nextJar } from "@/server/auth/next-cookies";
import { supabaseFor } from "@/server/auth/supabase";
import { env } from "@/server/env";

/** Ends the Supabase session and clears its cookies. */
export async function POST(): Promise<Response> {
  if (env.supabase()) await supabaseFor(await nextJar()).auth.signOut();
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
