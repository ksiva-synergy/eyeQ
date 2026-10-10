import { NextResponse, type NextRequest } from "next/server";
import { nextJar } from "@/server/auth/next-cookies";
import { supabaseFor } from "@/server/auth/supabase";
import { env } from "@/server/env";
import { log } from "@/server/observability/log";

/** Starts Google sign-in through Supabase Auth (PKCE; the verifier is kept in a cookie). */
export async function GET(req: NextRequest): Promise<Response> {
  const origin = env.appUrl() ?? req.nextUrl.origin;
  if (!env.supabase()) return NextResponse.redirect(new URL("/sign-in?error=unavailable", origin));
  const { data, error } = await supabaseFor(await nextJar()).auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    log("warn", "google sign-in could not start", { code: error?.code });
    return NextResponse.redirect(new URL("/sign-in?error=google", origin));
  }
  return NextResponse.redirect(data.url);
}
