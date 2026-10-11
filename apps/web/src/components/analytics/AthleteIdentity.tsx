import { currentSession } from "@/server/auth/current";
import { Identify } from "./Identify";

/** Server side of <Identify>: the signed-in athlete's id, or nothing. Render inside Suspense. */
export async function AthleteIdentity() {
  const session = await currentSession();
  return session ? <Identify userId={session.userId} /> : null;
}
