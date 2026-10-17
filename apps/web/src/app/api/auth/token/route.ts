import { postToken } from "@/server/auth/routes";

/** The mobile app's verify: checks the code and answers the session as JSON, no cookies. */
export const POST = postToken;
