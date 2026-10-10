import { NextResponse, type NextRequest } from "next/server";
import { ensureProfile } from "@/server/auth/routes";
import { nextJar } from "@/server/auth/next-cookies";
import { supabaseFor } from "@/server/auth/supabase";
import { serviceDb } from "@/server/db";
import { env } from "@/server/env";
import { log } from "@/server/observability/log";

/** Google returns here: exchange the code for the cookie session, create the profile. */
export async function GET(req: NextRequest): Promise<Response> {
  const origin = env.appUrl() ?? req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  if (!code || !env.supabase())
    return NextResponse.redirect(new URL("/sign-in?error=google", origin));
  const { data, error } = await supabaseFor(await nextJar()).auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    log("warn", "oauth code exchange failed", { code: error?.code });
    return NextResponse.redirect(new URL("/sign-in?error=google", origin));
  }
  const meta = data.user.user_metadata as Record<string, unknown>;
  const name =
    typeof meta["full_name"] === "string"
      ? meta["full_name"]
      : typeof meta["name"] === "string"
        ? meta["name"]
        : null;
  await ensureProfile(serviceDb(), data.user.id, name);
  return NextResponse.redirect(new URL("/app", origin));
}
