import { postQaSwitch } from "@/server/auth/qa-routes";

/** Switches the QA master login into an athlete. Remove before public launch. */
export const POST = postQaSwitch;
