/**
 * End-to-end sign-in check against a running app and a real Supabase Auth.
 *   pnpm --filter web auth:e2e            CI and local (Supabase local stack)
 *   pnpm --filter web auth:e2e --staging  staging: test numbers only, no SMS hook check
 *
 * Env: APP_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, OTP_TEST_PHONE, OTP_TEST_CODE,
 * OTP_RATE_TEST_PHONE (a second test number, spent on the OTP limit for the hour).
 * Local also: OTP_HOOK_TEST_PHONE (a number that is NOT a test number, so Supabase calls
 * the Send SMS hook). On staging, OTP_RATE_TEST_PHONE must be a Supabase test number too.
 */
import { apiErrorSchema, meResponseSchema, tokenSessionSchema } from "@eyeq/api-contract";

const staging = process.argv.includes("--staging");
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};
const APP = need("APP_URL").replace(/\/$/, "");
const SB = need("SUPABASE_URL").replace(/\/$/, "");
const KEY = need("SUPABASE_PUBLISHABLE_KEY");
const TEST_PHONE = need("OTP_TEST_PHONE");
const TEST_CODE = need("OTP_TEST_CODE");
const bypass = process.env["VERCEL_AUTOMATION_BYPASS_SECRET"];

let failures = 0;
function check(ok: boolean, what: string, detail?: unknown) {
  console.log(
    `${ok ? "ok" : "not ok"} - ${what}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`,
  );
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function app(path: string, init: RequestInit = {}) {
  return fetch(`${APP}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
      ...(init.headers ?? {}),
    },
  });
}
async function auth(path: string, body: unknown) {
  return fetch(`${SB}/auth/v1${path}`, {
    method: "POST",
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => c && !c.endsWith("="))
    .join("; ");

async function main() {
  // 1. Phone OTP through the app (web): request, verify, cookie session, GET /me.
  const otp = await app("/api/auth/otp", {
    method: "POST",
    body: JSON.stringify({ phone: TEST_PHONE }),
  });
  check(otp.status === 200, "POST /api/auth/otp for the test number", await otp.clone().text());
  const verify = await app("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ phone: TEST_PHONE, token: TEST_CODE }),
  });
  check(
    verify.status === 200,
    "POST /api/auth/verify with the test code",
    await verify.clone().text(),
  );
  const cookie = cookiesOf(verify);
  check(cookie.includes("auth-token"), "the session arrives as Supabase cookies");
  const me = await app("/api/v1/me", { headers: { cookie } });
  const meBody = await me.json();
  check(me.status === 200, "GET /api/v1/me with the cookie session", meBody);
  const parsed = meResponseSchema.safeParse(meBody);
  check(
    parsed.success,
    "the response matches the contract",
    parsed.success ? undefined : parsed.error.issues,
  );
  if (parsed.success)
    check(parsed.data.phone === TEST_PHONE, "it is the test number's profile", parsed.data.phone);

  // 2. Wrong code and no session are refused in the one error shape.
  const wrong = await app("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({
      phone: TEST_PHONE,
      token: TEST_CODE === "000000" ? "111111" : "000000",
    }),
  });
  check(
    wrong.status === 400 && apiErrorSchema.parse(await wrong.json()).code === "otp_invalid",
    "a wrong code is refused",
  );
  const anon = await app("/api/v1/me");
  check(
    anon.status === 401 && apiErrorSchema.parse(await anon.json()).code === "unauthenticated",
    "no session: 401",
  );
  const forged = await app("/api/v1/me", { headers: { authorization: `Bearer ${KEY}` } });
  check(forged.status === 401, "the publishable key is not a session");

  // 3. The app's OTP limit: the sixth request for one phone in the hour is refused. The
  //    app counts a request before it calls Supabase, so on staging the requests are 61 s
  //    apart, past Supabase's own minimum gap per number; otherwise Supabase's refusal
  //    would stand in for ours. Use a test number no one signs in with: it is spent for
  //    the hour.
  const ratePhone = need("OTP_RATE_TEST_PHONE");
  const gap = staging ? 61_000 : 1100;
  if (staging) console.log(`# OTP limit: six requests ${gap / 1000} s apart (about 5 minutes)`);
  const statuses: number[] = [];
  let sixth: Response | undefined;
  for (let i = 1; i <= 6; i++) {
    const r = await app("/api/auth/otp", {
      method: "POST",
      body: JSON.stringify({ phone: ratePhone }),
    });
    statuses.push(r.status);
    if (i === 6) sixth = r;
    else await sleep(gap);
  }
  check(
    statuses.slice(0, 5).every((s) => s === 200),
    "five OTP requests in the hour are accepted",
    statuses,
  );
  const sixthBody = sixth ? apiErrorSchema.safeParse(await sixth.json()) : undefined;
  check(
    sixth?.status === 429 &&
      sixthBody?.success === true &&
      sixthBody.data.code === "rate_limited" &&
      Boolean(sixth.headers.get("retry-after")),
    "the sixth OTP request is refused with 429 and Retry-After",
    statuses,
  );

  if (staging) return;

  // 4. Bearer token, as the Expo client will send it (phase 8).
  await auth("/otp", { phone: TEST_PHONE });
  const tok = await auth("/verify", { type: "sms", phone: TEST_PHONE, token: TEST_CODE });
  const session = (await tok.json()) as { access_token?: string };
  check(Boolean(session.access_token), "Supabase Auth issues a token for the test number");
  const meBearer = await app("/api/v1/me", {
    headers: { authorization: `Bearer ${session.access_token}` },
  });
  check(meBearer.status === 200, "GET /api/v1/me with a bearer token");

  // 4b. The mobile app's own routes (DECISIONS.md, phase 8): code through /api/auth/otp,
  //     session as JSON from /api/auth/token, bearer to /api/v1, refresh, sign-out.
  await sleep(1100); // Supabase sends one code a second per phone (max_frequency)
  const mOtp = await app("/api/auth/otp", {
    method: "POST",
    body: JSON.stringify({ phone: TEST_PHONE.replace(/^\+91/, "") }),
  });
  check(
    mOtp.status === 200,
    "mobile: POST /api/auth/otp with a 10-digit number",
    await mOtp.clone().text(),
  );
  const mTok = await app("/api/auth/token", {
    method: "POST",
    body: JSON.stringify({ phone: TEST_PHONE, token: TEST_CODE }),
  });
  const mSession = tokenSessionSchema.safeParse(await mTok.clone().json());
  check(mTok.status === 200 && mSession.success, "mobile: POST /api/auth/token answers a session");
  check(!cookiesOf(mTok).includes("auth-token"), "mobile: no session cookies are set");
  if (mSession.success) {
    const s = mSession.data;
    const mMe = await app("/api/v1/me", { headers: { authorization: `Bearer ${s.accessToken}` } });
    const mMeBody = meResponseSchema.safeParse(await mMe.json());
    check(
      mMe.status === 200 && mMeBody.success && mMeBody.data.phone === TEST_PHONE,
      "mobile: GET /api/v1/me with the token's bearer is the test number's profile",
    );
    const refreshed = await app("/api/auth/token/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: s.refreshToken }),
    });
    const r = tokenSessionSchema.safeParse(await refreshed.json());
    check(refreshed.status === 200 && r.success, "mobile: a refresh answers a new session");
    if (r.success) {
      const after = await app("/api/v1/me", {
        headers: { authorization: `Bearer ${r.data.accessToken}` },
      });
      check(after.status === 200, "mobile: the refreshed access token works");
      const out = await app("/api/auth/token/sign-out", {
        method: "POST",
        headers: { authorization: `Bearer ${r.data.accessToken}` },
        body: "{}",
      });
      check(out.status === 200, "mobile: POST /api/auth/token/sign-out");
      const again = await app("/api/auth/token/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: r.data.refreshToken }),
      });
      check(again.status === 401, "mobile: a signed-out refresh token is refused", again.status);
    }
  }
  const badTok = await app("/api/auth/token", {
    method: "POST",
    body: JSON.stringify({
      phone: TEST_PHONE,
      token: TEST_CODE === "000000" ? "111111" : "000000",
    }),
  });
  check(badTok.status === 400, "mobile: a wrong code is refused");

  // 5. The Send SMS hook: Supabase Auth calls the app, which sends (console) and enforces
  //    the same limit for clients that skip the app and call Supabase directly.
  const hookPhone = need("OTP_HOOK_TEST_PHONE");
  const hook: number[] = [];
  for (let i = 1; i <= 6; i++) {
    hook.push((await auth("/otp", { phone: hookPhone })).status);
    await sleep(1100);
  }
  check(
    hook.slice(0, 5).every((s) => s === 200),
    "Supabase Auth sends five codes through the hook",
    hook,
  );
  check(hook[5] === 429, "the hook refuses the sixth code for that phone", hook);
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(() => {
    console.log(failures === 0 ? "# auth e2e passed" : `# auth e2e: ${failures} failure(s)`);
    process.exit(failures === 0 ? 0 : 1);
  });
