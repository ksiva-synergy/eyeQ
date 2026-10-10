import { env, type AppEnv } from "../env";
import { log, maskPhone } from "../observability/log";

/**
 * Sends the OTP that Supabase Auth generated (through the Send SMS hook). One interface,
 * chosen by SMS_PROVIDER:
 *   console  local only: prints the code to the server log
 *   test     staging: sends nothing; only OTP_TEST_PHONE may sign in (its fixed code is
 *            configured in Supabase as a test number, so the hook is not even called)
 *   msg91    production: MSG91 with the DLT-registered template (added before real users)
 */
export interface SmsSender {
  readonly name: string;
  sendOtp(phone: string, otp: string): Promise<void>;
}

export class SmsRefused extends Error {}

export const consoleSender: SmsSender = {
  name: "console",
  async sendOtp(phone, otp) {
    // Local development only (refused elsewhere below), so printing the code is the point.
    log("info", "sms.otp (console sender, local only)", { phone, otp });
  },
};

export function testSender(testPhone: string | undefined): SmsSender {
  return {
    name: "test",
    async sendOtp(phone) {
      if (!testPhone || phone !== testPhone) {
        throw new SmsRefused("Only the test number can sign in on this environment.");
      }
      log("info", "sms.otp (test sender, not sent)", { phone: maskPhone(phone) });
    },
  };
}

export const msg91Sender: SmsSender = {
  name: "msg91",
  async sendOtp() {
    // Wired before real users, once the DLT sender id and OTP template are registered
    // (plan section 12). Until then production refuses to send rather than pretend.
    throw new SmsRefused("SMS sending is not set up yet.");
  },
};

export function smsSender(appEnv: AppEnv = env.appEnv()): SmsSender {
  const provider = env.smsProvider();
  if (provider === "console") {
    if (appEnv === "staging" || appEnv === "production") {
      throw new Error("SMS_PROVIDER=console is for local development only");
    }
    return consoleSender;
  }
  if (provider === "test") return testSender(env.otpTestPhone());
  return msg91Sender;
}
