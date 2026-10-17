import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * One config, three variants (DECISIONS.md, phase 8: app variants and ids). EAS sets
 * APP_VARIANT per build profile (eas.json); a local `expo start` is development.
 *
 * `eas init` writes the Expo project id (not a secret) and owner into app.json, which Expo
 * passes in as `config`. Until then there are no EAS builds or updates, and a local
 * development build still runs.
 */
type Variant = "development" | "staging" | "production";

const variant = (process.env.APP_VARIANT ?? "development") as Variant;

const byVariant: Record<Variant, { name: string; id: string; scheme: string }> = {
  development: { name: "EyeQ Dev", id: "com.forgeyourpeak.eyeq.dev", scheme: "eyeq-dev" },
  staging: { name: "EyeQ Staging", id: "com.forgeyourpeak.eyeq.staging", scheme: "eyeq-staging" },
  production: { name: "EyeQ", id: "com.forgeyourpeak.eyeq", scheme: "eyeq" },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const v = byVariant[variant];
  const projectId = (config.extra?.["eas"] as { projectId?: string } | undefined)?.projectId;
  return {
    ...config,
    name: v.name,
    slug: "eyeq",
    version: "0.1.0",
    orientation: "portrait",
    scheme: v.scheme,
    icon: "./assets/icon.png",
    // Dark is primary; light follows the OS on mobile (plan section 8).
    userInterfaceStyle: "automatic",
    backgroundColor: "#0B0B10",
    ios: {
      bundleIdentifier: v.id,
      // SDK 58 supports iOS 16.4 and later (DECISIONS.md, phase 8: minimum OS).
      deploymentTarget: "16.4",
      supportsTablet: false,
      config: { usesNonExemptEncryption: false },
    },
    android: {
      package: v.id,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0B0B10",
      },
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 120,
          backgroundColor: "#0B0B10",
        },
      ],
      [
        "expo-build-properties",
        {
          // Android 9 (API 28) is the floor (plan phase 8).
          android: { minSdkVersion: 28 },
        },
      ],
    ],
    experiments: { typedRoutes: true },
    runtimeVersion: { policy: "fingerprint" },
    extra: { ...config.extra, variant },
    ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}` } } : {}),
  };
};
