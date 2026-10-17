# EyeQ mobile (Expo)

The athlete app for Android and iOS (plan phase 8). Expo SDK 58, Expo Router, a development
build (not Expo Go). Versions and choices are in `DECISIONS.md` under Phase 8.

## Run it locally

1. Start the API: the local Supabase stack and `apps/web` (root README). The app talks only
   to `apps/web`; it holds no Supabase key.
2. `cp apps/mobile/.env.example apps/mobile/.env` and set `EXPO_PUBLIC_API_URL` to where
   `apps/web` answers from the device (`http://10.0.2.2:3000` on the Android emulator, the
   Mac's LAN address on a phone on the same Wi-Fi).
3. Build and install the development build once (again after any native change):
   - Android emulator or a USB phone: `pnpm --filter mobile android`
   - iOS simulator: `pnpm --filter mobile ios`
   - Or in the cloud: `eas build --profile development --platform android` and install the
     APK from the link.
4. `pnpm --filter mobile start`, then open the project from the development build.
5. Sign in with a Supabase test number: locally `9000000001` to `9000000009`, code `123456`;
   on staging the numbers in `docs/payments.md` (Staging sign-in). There is no QA master login
   in the app.

## How sign-in works

`POST /api/auth/otp` (the same route as web: phone rules and limits), then
`POST /api/auth/token`, which answers the session as JSON. Tokens are kept in SecureStore and
sent as `Authorization: Bearer …` to `/api/v1`; `POST /api/auth/token/refresh` renews them and
`POST /api/auth/token/sign-out` ends them. Code: `src/lib/session.ts`, `src/lib/api.ts`.

## Variants and EAS

`APP_VARIANT` picks the name and app id (`app.config.ts`): development
(`com.forgeyourpeak.eyeq.dev`), staging (`.staging`) and production
(`com.forgeyourpeak.eyeq`). `eas.json` has a build profile and an update channel for each.
`runtimeVersion` is the fingerprint policy: an update reaches only builds with the same native
code.

## Checks

`pnpm --filter mobile typecheck`, `lint`, `test` (also run by the root scripts), `doctor`
(expo-doctor) and `bundle:check` (Metro bundles both platforms). CI runs all of them.
