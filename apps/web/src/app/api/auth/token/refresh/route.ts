import { postTokenRefresh } from "@/server/auth/routes";

/** The mobile app trades its refresh token for a new session. */
export const POST = postTokenRefresh;
