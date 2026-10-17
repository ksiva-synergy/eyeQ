import { Redirect } from "expo-router";

/**
 * "/" when signed out, as on web (board 1a Welcome at "/"); signed in, "/" is Home in (tabs).
 * Welcome itself arrives with onboarding in 8c; until then this opens sign-in.
 */
export default function SignedOutStart() {
  return <Redirect href="/sign-in" />;
}
