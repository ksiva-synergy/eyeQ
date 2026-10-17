import { Stack } from "expo-router";

/** The signed-in shell. Phase 8b turns this into the five tabs (Home, Train, Compete, …). */
export default function SignedInLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
