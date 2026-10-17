/**
 * Post-deploy smoke check for phone sign-in (run by Migrate's smoke job after each deploy
 * of main). Phone sign-in was found switched off on staging's Supabase on 2026-10-17:
 * every sign-in test ran against the local stack, where supabase/config.toml enables it,
 * and nothing ever signed in on staging itself. This asks the deployment for a code for a
 * Supabase test number (no SMS is sent), verifies it, and reads GET /api/v1/me with the
 * session, so a provider switched off, a broken hook or a bad key fails the run.
 *
 *   APP_URL=… SMOKE_PHONE=+91… SMOKE_CODE=… [VERCEL_AUTOMATION_BYPASS_SECRET=…] \
 *     pnpm --filter web signin:smoke
 *
 * Each run spends one of the number's five codes an hour (the app's OTP limit), so the
 * number should be one nobody else uses.
 */
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};
const APP = need("APP_URL").replace(/\/$/, "");
const PHONE = need("SMOKE_PHONE");
const CODE = need("SMOKE_CODE");
const bypass = process.env["VERCEL_AUTOMATION_BYPASS_SECRET"];

const app = (path: string, init: RequestInit = {}) =>
  fetch(`${APP}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
      ...(init.headers ?? {}),
    },
  });

async function step(name: string, res: Response, want = 200): Promise<Response> {
  if (res.status !== want) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`not ok - ${name}: ${res.status} (wanted ${want}) ${body}`);
  }
  console.log(`ok - ${name}: ${res.status}`);
  return res;
}

async function main() {
  await step(
    "POST /api/auth/otp",
    await app("/api/auth/otp", { method: "POST", body: JSON.stringify({ phone: PHONE }) }),
  );
  const verify = await step(
    "POST /api/auth/verify",
    await app("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ phone: PHONE, token: CODE }),
    }),
  );
  const cookie = verify.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => c && !c.endsWith("="))
    .join("; ");
  if (!cookie) throw new Error("not ok - verify set no session cookie");
  const me = await step(
    "GET /api/v1/me (signed in)",
    await app("/api/v1/me", { headers: { cookie } }),
  );
  const body = (await me.json()) as { id?: string };
  if (!body.id) throw new Error("not ok - /api/v1/me returned no athlete");
  console.log("ok - phone sign-in works on this deployment");
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
