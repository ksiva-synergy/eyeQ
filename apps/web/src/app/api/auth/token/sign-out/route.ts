import { postTokenSignOut } from "@/server/auth/routes";

/** The mobile app's sign-out: revokes the bearer token's session. */
export const POST = postTokenSignOut;
