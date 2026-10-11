/**
 * Phase 2 acceptance: fifty concurrent GET /api/v1/me succeed without exhausting database
 * connections. Signs in once with the test number, then fires the requests together and
 * reports status codes and latency. On staging the app reaches Postgres through the
 * transaction pooler (6543), so this exercises the pooler with DB_POOL_MAX per instance.
 *
 *   pnpm --filter web concurrency:check            (APP_URL, OTP_TEST_PHONE, OTP_TEST_CODE)
 *   VERCEL_AUTOMATION_BYPASS_SECRET=… for a deployment behind Vercel Authentication.
 */
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};
const APP = need("APP_URL").replace(/\/$/, "");
const PHONE = need("OTP_TEST_PHONE");
const CODE = need("OTP_TEST_CODE");
const N = Number(process.env["CONCURRENCY"] ?? 50);
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

async function main() {
  const otp = await app("/api/auth/otp", {
    method: "POST",
    body: JSON.stringify({ phone: PHONE }),
  });
  if (otp.status !== 200) throw new Error(`otp ${otp.status}`);
  const verify = await app("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ phone: PHONE, token: CODE }),
  });
  if (verify.status !== 200) throw new Error(`verify ${verify.status}`);
  const cookie = verify.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => c && !c.endsWith("="))
    .join("; ");

  const started = performance.now();
  const results = await Promise.all(
    Array.from({ length: N }, async () => {
      const t = performance.now();
      const res = await app("/api/v1/me", { headers: { cookie } });
      await res.arrayBuffer();
      return { status: res.status, ms: performance.now() - t };
    }),
  );
  const total = performance.now() - started;
  const byStatus = results.reduce<Record<number, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p: number) =>
    Math.round(ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))]!);
  console.log(`${N} concurrent GET /api/v1/me in ${Math.round(total)} ms`);
  console.log(
    `status: ${JSON.stringify(byStatus)}  p50 ${pct(50)} ms  p95 ${pct(95)} ms  max ${pct(100)} ms`,
  );
  const ok = byStatus[200] === N;
  console.log(ok ? "ok - every request succeeded" : "not ok - some requests failed");
  process.exit(ok ? 0 : 1);
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
