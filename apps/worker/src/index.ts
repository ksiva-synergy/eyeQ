/**
 * eyeq-worker: one run drains the `notifications` outbox and exits.
 * Phase 6 adds the channels (Resend email, Expo push), the 2-a-day cap and
 * retries. Phase 0 only proves the job boots, reaches the database and exits 0.
 */
import { createDb } from "@eyeq/db";
import { sql } from "kysely";

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.log(JSON.stringify({ level: "warn", msg: "DATABASE_URL not set; nothing to drain" }));
    return;
  }
  const db = createDb({ connectionString: url, max: 2 });
  try {
    const r = await sql<{ now: Date }>`select now() as now`.execute(db);
    console.log(
      JSON.stringify({ level: "info", msg: "worker run complete", dbTime: r.rows[0]?.now }),
    );
  } finally {
    await db.destroy();
  }
}

main().catch((e: unknown) => {
  console.error(JSON.stringify({ level: "error", msg: String(e) }));
  process.exit(1);
});
