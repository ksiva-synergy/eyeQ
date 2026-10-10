/**
 * pnpm admin:grant <phone> <coach|owner>
 *
 * The only way the first coach or owner is made (plan phase 2). The person signs in
 * once by phone (so Supabase Auth has created their user), then someone with the admin
 * database URL runs this. It calls grant_admin_for(), which writes admins and audit_log
 * in one transaction. Uses DIRECT_URL or DATABASE_URL (the session pooler or direct
 * host as postgres); refuses the transaction pooler.
 */
import pg from "pg";
import { targetFor } from "./target.ts";

export type AdminRole = "coach" | "owner";

/** Supabase stores phone numbers as digits without the +. */
export function phoneDigits(input: string): string {
  const compact = input.replace(/[\s()-]/g, "");
  const withCountry = /^\d{10}$/.test(compact) ? `91${compact}` : compact.replace(/^\+/, "");
  if (!/^[1-9]\d{7,14}$/.test(withCountry)) throw new Error(`not a phone number: ${input}`);
  return withCountry;
}

export async function adminGrant(
  url: string,
  phone: string,
  role: string,
): Promise<{ userId: string; role: AdminRole }> {
  if (role !== "coach" && role !== "owner")
    throw new Error(`role must be coach or owner, not ${role}`);
  const digits = phoneDigits(phone);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    const users = await client.query<{ id: string }>(
      "select id from auth.users where phone in ($1, $2)",
      [digits, `+${digits}`],
    );
    if (users.rowCount === 0) {
      throw new Error(`no user with phone +${digits}: they must sign in once by phone first`);
    }
    const userId = users.rows[0]!.id;
    await client.query("select grant_admin_for($1, $2, 'script', null)", [userId, role]);
    await client.query("commit");
    return { userId, role };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [phone, role] = process.argv.slice(2);
  if (!phone || !role) {
    console.error("usage: pnpm admin:grant <phone> <coach|owner>");
    process.exit(2);
  }
  adminGrant(targetFor("admin"), phone, role)
    .then((r) => {
      const masked = `+${phoneDigits(phone).slice(0, 2)}••••${phoneDigits(phone).slice(-2)}`;
      console.log(`${masked} is now ${r.role} (user ${r.userId}); audit_log has the grant.`);
    })
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
