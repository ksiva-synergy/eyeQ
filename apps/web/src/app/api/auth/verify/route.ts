import { postVerify } from "@/server/auth/routes";

/** Checks the code; on success Supabase's session cookies are set on this response. */
export const POST = postVerify;
