import { z } from "zod";

/** E.164, e.g. +919876543210. The sign-in form normalises spaces and a missing +91. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .transform((v) => (/^\d{10}$/.test(v) ? `+91${v}` : v))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "a phone number with country code"));

/** POST /api/auth/otp */
export const otpRequestSchema = z.strictObject({ phone: phoneSchema });
export type OtpRequest = z.infer<typeof otpRequestSchema>;

/** POST /api/auth/verify */
export const otpVerifySchema = z.strictObject({
  phone: phoneSchema,
  token: z.string().regex(/^\d{6}$/, "the 6-digit code"),
});
export type OtpVerify = z.infer<typeof otpVerifySchema>;
