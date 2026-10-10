import { handleSendSmsHook } from "@/server/auth/hook";
import { smsSender } from "@/server/auth/sms";
import { serviceDb } from "@/server/db";
import { env } from "@/server/env";

/** Supabase Auth's Send SMS hook. Verified by its Standard Webhooks signature, not a session. */
export async function POST(req: Request): Promise<Response> {
  return handleSendSmsHook(req, {
    secret: env.smsHookSecret(),
    sender: smsSender(),
    db: serviceDb(),
  });
}
