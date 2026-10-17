import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useColors } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Signed out sees only (auth); signed in only (tabs) (Expo Router protected routes). */
function RootNavigator() {
  const { status } = useAuth();
  const colors = useColors();
  const scheme = useColorScheme();
  // The navigator is always mounted (the router resolves the start URL against it); the
  // splash screen covers it until the stored session has been read.
  if (status !== "loading") SplashScreen.hide();
  return (
    <>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}
      >
        <Stack.Protected guard={status === "signedIn"}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={status !== "signedIn"}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
