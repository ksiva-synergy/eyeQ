import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookies before pages and /api/v1 render (the
 * @supabase/ssr pattern; Next.js 16 calls this file proxy, formerly middleware).
 * Does nothing when Supabase is not configured.
 */
export async function proxy(request: NextRequest) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });
  // Nothing between createServerClient and getClaims(): it refreshes an expiring session.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    // Pages and /api/v1; not static files, the service worker, health checks, the auth
    // routes, the SMS hook or the cron dispatcher.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|api/health|api/auth|api/cron|api/webhooks|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
