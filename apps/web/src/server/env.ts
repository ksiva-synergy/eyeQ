/**
 * Server-only environment, read lazily so a missing optional key never breaks a build
 * (ground rule 12: nothing secret is NEXT_PUBLIC_*). Every integration skips cleanly
 * when its keys are absent.
 */
export type AppEnv = "local" | "test" | "staging" | "production";

function str(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const env = {
  appEnv: (): AppEnv => (str("APP_ENV") as AppEnv | undefined) ?? "local",
  /** Public origin of the app, for OAuth redirects. Falls back to the request origin. */
  appUrl: () => str("APP_URL"),
  supabase: () => {
    const url = str("SUPABASE_URL");
    const key = str("SUPABASE_PUBLISHABLE_KEY");
    return url && key ? { url, key } : undefined;
  },
  smsHookSecret: () => str("SEND_SMS_HOOK_SECRET"),
  /** Storage uploads only (plan 2.0, rule 12); never used for game data. */
  storage: () => {
    const url = str("SUPABASE_URL");
    const key = str("SUPABASE_SERVICE_ROLE_KEY");
    return url && key ? { url, key } : undefined;
  },
  smsProvider: () => (str("SMS_PROVIDER") ?? "console") as "console" | "test" | "msg91",
  otpTestPhone: () => str("OTP_TEST_PHONE"),
  sentryDsn: () => str("SENTRY_DSN"),
  /** YouTube Data and Drive APIs, for the admin link check (phase 4). */
  googleApiKey: () => str("GOOGLE_API_KEY"),
  /** Help and enquiry links (plan phase 5: read from config, not written into pages). */
  supportWhatsappUrl: () => {
    const v = str("SUPPORT_WHATSAPP_URL");
    return v && /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(v) ? v : undefined;
  },
  /**
   * The /dev/components gallery: always on under `next dev`; in a production build only
   * with DEV_GALLERY=1 (staging, CI). Read at build time, since the page is prerendered.
   */
  devGallery: () => process.env.NODE_ENV !== "production" || str("DEV_GALLERY") === "1",
  /**
   * The QA master login (/qa): switch into any athlete for navigation and QA. On only when
   * both values are set and APP_ENV is not production. Remove before public launch.
   */
  qaMaster: () => {
    const login = str("QA_MASTER_LOGIN");
    const password = str("QA_MASTER_PASSWORD");
    if (!login || !password || str("APP_ENV") === "production") return undefined;
    return { login, password };
  },
  posthog: () => {
    const key = str("POSTHOG_API_KEY");
    return key ? { key, host: str("POSTHOG_HOST") ?? "https://eu.i.posthog.com" } : undefined;
  },
  /** Vercel Cron sends it as `Authorization: Bearer …`; the dispatcher refuses calls without it. */
  cronSecret: () => str("CRON_SECRET"),
  /** Resend (email). Both or neither; unset, email rows are retried until it is set. */
  resend: () => {
    const key = str("RESEND_API_KEY");
    const from = str("EMAIL_FROM");
    return key && from ? { key, from } : undefined;
  },
  /** Web push (VAPID). The public key is served to browsers by GET /me/push-config. */
  vapid: () => {
    const publicKey = str("VAPID_PUBLIC_KEY");
    const privateKey = str("VAPID_PRIVATE_KEY");
    const subject = str("VAPID_SUBJECT");
    return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : undefined;
  },
  /**
   * Razorpay (phase 7, test keys until production). The key secret and webhook secret are
   * server-only; the key id is public by design (Checkout needs it) and is served to the
   * browser in the order response, read from RAZORPAY_KEY_ID or NEXT_PUBLIC_RAZORPAY_KEY_ID.
   */
  razorpay: () => {
    const keyId = str("RAZORPAY_KEY_ID") ?? str("NEXT_PUBLIC_RAZORPAY_KEY_ID");
    const keySecret = str("RAZORPAY_KEY_SECRET");
    return keyId && keySecret ? { keyId, keySecret } : undefined;
  },
  razorpayWebhookSecret: () => str("RAZORPAY_WEBHOOK_SECRET"),
  str,
};
