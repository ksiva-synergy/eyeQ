import { z } from "zod";

/** E.164, e.g. +919876543210. Spaces, dashes and brackets go; a missing +91 or + is added. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  // An Indian mobile typed without "+": 10 digits, a trunk 0 first, or 91 first. The +91
  // shown beside the field (PhoneInput) makes "91…" an easy thing to type.
  .transform((v) =>
    /^\d{10}$/.test(v)
      ? `+91${v}`
      : /^0\d{10}$/.test(v)
        ? `+91${v.slice(1)}`
        : /^91\d{10}$/.test(v)
          ? `+${v}`
          : v,
  )
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "a phone number with country code"));

/** Lower-cased and trimmed, so one inbox is one account. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** POST /api/auth/otp: a code by SMS to a phone, or by email. */
export const otpRequestSchema = z.union([
  z.strictObject({ phone: phoneSchema }),
  z.strictObject({ email: emailSchema }),
]);
export type OtpRequest = z.infer<typeof otpRequestSchema>;

const otpCode = z.string().regex(/^\d{6}$/, "the 6-digit code");

/** POST /api/auth/verify */
export const otpVerifySchema = z.union([
  z.strictObject({ phone: phoneSchema, token: otpCode }),
  z.strictObject({ email: emailSchema, token: otpCode }),
]);
export type OtpVerify = z.infer<typeof otpVerifySchema>;

/**
 * POST /api/auth/token: the mobile app's verify. Same body as /api/auth/verify; the
 * session comes back as JSON instead of cookies, and the app sends `accessToken` as
 * `Authorization: Bearer …` to /api/v1 (DECISIONS.md, phase 8: mobile sign-in).
 */
export const tokenSessionSchema = z.object({
  userId: z.uuid(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Unix seconds when the access token expires. */
  expiresAt: z.number().int(),
});
export type TokenSession = z.infer<typeof tokenSessionSchema>;

/** POST /api/auth/token/refresh */
export const tokenRefreshRequestSchema = z.strictObject({ refreshToken: z.string().min(1) });
export type TokenRefreshRequest = z.infer<typeof tokenRefreshRequestSchema>;
