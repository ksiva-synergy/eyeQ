// Makes sure supabase/.env (gitignored) holds SEND_SMS_HOOK_SECRET before the Supabase CLI
// starts: config.toml reads it for the Send SMS hook and refuses to start without it.
// Uses the value from the environment or the root .env when there is one, so Supabase Auth
// and apps/web sign hooks with the same secret; otherwise generates a local-only one.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, "supabase/.env");
const read = (file) =>
  existsSync(file)
    ? readFileSync(file, "utf8").match(/^SEND_SMS_HOOK_SECRET=["']?([^"'\n]+)["']?$/m)?.[1]
    : undefined;

const current = read(target);
const wanted = process.env.SEND_SMS_HOOK_SECRET || read(path.join(root, ".env"));
if (current && (!wanted || wanted === current)) process.exit(0);

const secret = wanted ?? `v1,whsec_${randomBytes(32).toString("base64")}`;
const rest = existsSync(target)
  ? readFileSync(target, "utf8").replace(/^SEND_SMS_HOOK_SECRET=.*\n?/m, "")
  : "";
writeFileSync(target, `${rest}SEND_SMS_HOOK_SECRET=${secret}\n`, { mode: 0o600 });
if (!wanted) {
  console.log("Wrote a local SEND_SMS_HOOK_SECRET to supabase/.env. Put the same line in .env so");
  console.log(
    "apps/web can verify the Send SMS hook:  grep SEND_SMS_HOOK_SECRET supabase/.env >> .env",
  );
}
