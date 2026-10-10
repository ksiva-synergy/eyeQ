import { postOtp } from "@/server/auth/routes";

/** Asks Supabase Auth to text a sign-in code, after our per-phone and per-IP limits. */
export const POST = postOtp;
