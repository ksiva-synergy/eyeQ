import { z } from "zod";

/** E.164, e.g. +919876543210. The sign-in form normalises spaces and a missing +91. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .transform((v) => (/^\d{10}$/.test(v) ? `+91${v}` : v))
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
