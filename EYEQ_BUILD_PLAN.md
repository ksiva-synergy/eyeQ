# EyeQ build plan for Claude Code (Supabase + Vercel)

10 Oct 2026 · Karthik Sivakumar · Sources: EyeQ Product Requirements, EyeQ System Architecture (both 10 Oct 2026), the EyeQ prototype (30 boards), and this plan's Azure decisions.

Keep this file at the repo root. It is the working plan: tick tasks as they land, and record anything it does not settle in `DECISIONS.md`.

## 0. Start here

**Kickoff prompt for Claude Code**

```
Read EYEQ_BUILD_PLAN.md end to end, then docs/design/README.md and docs/design/tokens.json.
Start Phase 0. Work one phase at a time on a branch named phase-<n>-<slug>.
Tick the task boxes in the plan as you finish them. At the end of each phase run its
acceptance checks, report what passed and what did not, and stop for a go-ahead.
Where the plan gives a default for an open decision, build the default and log it in
DECISIONS.md. Stop and ask only for items marked BLOCKER in section 13.
```

**Inputs to place in the repo before Phase 0**

The repo is the boilerplate Next.js app this plan is dropped into. If the folder is empty, create one first with `create-next-app` (App Router, TypeScript, Tailwind, ESLint) and commit it.

| Path                                                  | What                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EYEQ_BUILD_PLAN.md`                                  | This file                                                                                                                                                                                                                                                                                                                                                         |
| `docs/design/`                                        | Unpacked prototype: `README.md`, `tokens.json`, `screens/*.html` (supplied with this plan)                                                                                                                                                                                                                                                                        |
| `docs/product/PRD.md`, `docs/product/ARCHITECTURE.md` | The two source documents, exported from the Claude project. Sections 5 to 8 of this plan restate the binding rules, numbers and table columns, so phases 0 to 3 can start without them. Add them before phase 4; they hold the reasoning and the detail this plan compresses. Ignore the Supabase and Vercel choices in ARCHITECTURE.md; section 2 replaces them. |

**Order of authority when sources disagree**

1. The PRD decides rules, numbers and scope.
2. The prototype decides look, layout, copy tone and motion.
3. This plan decides infrastructure and build order, and gives the default for each known conflict (section 13).

## 1. What is being built

EyeQ is a mobile-first, gamified training app for individual athletes, made by Forge Your Peak. Athletes complete short daily sessions of coach-led drill videos (embedded from YouTube or Google Drive), earn XP, protect a streak, climb leaderboards and pay for programs. A coach publishes and prices content from a web admin. It launches with 20 athletes and must reach 5,000 by year 3 on the same architecture. It is a training and engagement tool, never a diagnostic one.

**Deliverables**

- `apps/web`: Next.js app holding the public program pages, the athlete web app, the coach admin at `/admin`, and the whole HTTP API.
- `apps/mobile`: Expo (React Native) app for Android and iOS, 14 screen groups.
- `apps/worker`: a small scheduled job that sends pushes and emails.
- A PostgreSQL database that is the game engine: ledgers, rules, entitlements, scheduled jobs.
- Hosting on Supabase (Postgres) and Vercel (web and API), CI/CD. (Was Azure; see 2.0.)

**Scope reading.** "Everything in the product requirements" is built as: all P0 items (phases 1 to 9), all P1 "launch + 60 days" items (phase 10), launch hardening (phase 11). P2 items (leagues, friend challenges, head-to-head, in-app vision tests, protected video host) are not built; section 14 lists the room left for them.

## 2. Architecture

> **Superseded (10 Oct 2026, Karthik).** Section 2 describes the Azure design. Vercel + Supabase replace it until further notice: read 2.0 as the architecture and 2.1 to 2.5 as background only. Nothing Azure (Bicep, Container Apps, Key Vault, Log Analytics, Flexible Server) is built in any phase. `DECISIONS.md` records this.

### 2.0 Hosting change: Supabase and Vercel (10 Oct 2026, after phase 1)

Karthik moved hosting from Azure to **Supabase for the database** and **Vercel for `apps/web`**, with **Prisma** as the typed data-access layer. This subsection wins over 2.1 to 2.5 wherever they name an Azure service; the rest of the architecture (game engine in Postgres functions, RLS as the second line of defence, our own `/api/v1` in Next.js route handlers, the outbox for anything that calls out) is unchanged. The reasoning is in `DECISIONS.md` under "Hosting: Supabase + Vercel".

| Concern          | Now                                                                                                                                                    | Notes                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres         | Supabase, region `ap-south-1` (Mumbai), Postgres 17                                                                                                    | Same SQL migrations, roles and pgTAP suite. Migrations 0012 and 0013 adapt roles and lock out Supabase's Data API. CI also runs the suite on the Supabase image. |
| Schema changes   | Plain SQL in `db/migrations`, applied by `pnpm db:migrate`                                                                                             | Never Prisma Migrate, `db push` or `supabase/migrations`.                                                                                                        |
| Data access      | Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`) in `packages/db`                                                                            | Schema introspected from the migrated database (`pnpm db:types`); SQL game functions called with `$queryRaw`; `asAthlete()` sets `app.user_id` per transaction.  |
| Connections      | Vercel runtime: transaction pooler (6543) as `eyeq_api` / `eyeq_service`. Migrations, tests, Prisma CLI: session pooler or direct (5432) as `postgres` | `app.user_id` is always transaction-local, which is what transaction pooling needs.                                                                              |
| Web and API      | Vercel, functions in `bom1` (Mumbai), project root `apps/web`                                                                                          | `output: 'standalone'` only off Vercel; the Docker image stays as a CI smoke test.                                                                               |
| Secrets          | Vercel project env vars (server-only) and GitHub Actions secrets                                                                                       | Rule 12 reads "Vercel env" where it says Key Vault.                                                                                                              |
| Sign-in          | Supabase Auth (phase 2): phone OTP through the Send SMS hook, Google; Apple with iOS (phase 9)                                                         | D28 settled: Supabase Auth, not Better Auth. The API verifies the Supabase session and talks to Postgres only as `eyeq_api` / `eyeq_service`.                    |
| Storage          | Supabase Storage (phase 4), private bucket and signed URLs                                                                                             | Replaces Azure Blob; Azurite stays in compose until then.                                                                                                        |
| Scheduled SQL    | pg_cron on Supabase (phase 6)                                                                                                                          |                                                                                                                                                                  |
| Scheduled sender | A Vercel Cron route in `apps/web` (phase 6), or `apps/worker` on any runner                                                                            | Vercel Cron at 5-minute cadence needs a Pro plan (D29).                                                                                                          |
| Infra as code    | None needed for now; `infra/` stays empty                                                                                                              |                                                                                                                                                                  |

### 2.1 Overview

```
 CLIENTS                         AZURE · Central India                         THIRD PARTIES
┌───────────────────┐  HTTPS  ┌───────────────────────────────────────────┐
│ Mobile app (Expo) │────────▶│ Container App  eyeq-web  (Next.js)        │◀─ webhook ─ RevenueCat (Play, App Store)
│ Android and iOS   │         │  pages: public, /app, /admin              │◀─ webhook ─ Razorpay (UPI, cards on web)
├───────────────────┤         │  /api/auth      Better Auth: phone OTP,   │── SMS ────▶ MSG91 (OTP)
│ Web app (Next.js) │────────▶│                 Google, Apple             │── email ──▶ Resend
│ athlete + /admin  │         │  /api/v1        typed API                 │
└───────────────────┘         │  /api/webhooks  payments                  │
        ┆                     └──────────────────┬────────────────────────┘
        ┆ SDKs call these                        │ SQL over private network
        ┆ directly: purchases,                   ▼
        ┆ video playback,     ┌───────────────────────────────────────────┐
        ┆ analytics           │ Azure Database for PostgreSQL (Flexible)  │
        ▼                     │  RLS, ledgers, game functions             │
 RevenueCat SDK,              │  pg_cron: leaderboards, streak close,     │
 YouTube and Drive players,   │  week rollover, expiry, enqueue pushes    │
 PostHog, Sentry              └──────────────────▲────────────────────────┘
                                                 │ drains notification outbox
                              ┌──────────────────┴────────────────────────┐
                              │ Container Apps Job  eyeq-worker (5 min)   │── push ───▶ Expo Push (FCM, APNs)
                              └───────────────────────────────────────────┘
                              Blob Storage (images) · Key Vault · Container Registry · Log Analytics
```

The principles from the architecture document all survive: Postgres is the game engine, gamification is server-authoritative, entitlements are decoupled from payment channels, video is embedded, the stack is TypeScript end to end, and there is one small service to run rather than a fleet.

### 2.2 What replaces what

| Was (architecture doc)                                | Now (Azure)                                                                                                                                                                     | Why this option                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Postgres, Mumbai                             | Azure Database for PostgreSQL Flexible Server, Central India (Pune), Burstable B1ms, 32 GB                                                                                      | Same engine, so the SQL game functions, RLS and pg_cron carry over unchanged. India region keeps the PRD's data-residency goal.                                                                                                                            |
| Supabase Auth                                         | Better Auth inside `apps/web`, tables in the same Postgres. Phone OTP through its phone-number plugin with MSG91 as the sender; Google; Apple on iOS; its Expo client on mobile | Microsoft Entra External ID does not offer SMS as a first sign-in factor for customer tenants, and Azure Communication Services does not send SMS to India natively, so the Azure-native route cannot do the PRD's phone-OTP sign-in. [1][2][3]            |
| Supabase auto-generated API + RLS from the client     | A typed HTTP API in Next.js route handlers (`/api/v1`), calling the same Postgres functions. RLS stays on as a second line of defence (section 5.3)                             | Azure has no PostgREST equivalent. A versioned REST API also suits store-installed mobile apps that lag behind the server.                                                                                                                                 |
| Supabase Edge Functions (webhooks, video token, push) | Route handlers in `apps/web` for webhooks and media; `apps/worker` for sending                                                                                                  | One deployable for request work, one for timed work.                                                                                                                                                                                                       |
| pg_cron in Supabase                                   | pg_cron on Flexible Server for everything that is pure SQL; a Container Apps Job on a 5-minute schedule for anything that must call out (push, email)                           | pg_cron is supported on Flexible Server once allow-listed. [4] There is no in-database HTTP client to rely on, so SQL jobs write to an outbox and the worker sends.                                                                                        |
| Supabase Storage + CDN + resize                       | Azure Blob Storage. Images resized to fixed widths at upload with `sharp`; web also uses `next/image`                                                                           | Azure CDN (classic) no longer accepts new profiles and retires in September 2027; its successor Front Door has a base fee of about US$35 a month. [5] At this scale, serve from Blob in-region with long cache headers and add Front Door later if needed. |
| Supabase Realtime                                     | Not used. Clients refetch on focus and after a completion                                                                                                                       | Nothing in the MVP needs sockets; leaderboards refresh every 5 minutes.                                                                                                                                                                                    |
| Vercel                                                | Azure Container Apps running the Next.js standalone build from a Docker image                                                                                                   | Azure Static Web Apps' hybrid Next.js support is still a preview with limits (no linked backends, size cap). [6] Container Apps runs the full Node server, scales on HTTP, and hosts the scheduled job in the same environment.                            |
| Vercel and Supabase env settings                      | Azure Key Vault, read by the apps through a managed identity                                                                                                                    | Secrets never sit in the repo, the image, or the app bundle.                                                                                                                                                                                               |
| Supabase generated types                              | Kysely with `kysely-codegen`, types generated from the migrated database                                                                                                        | Keeps "shared types generated from the schema".                                                                                                                                                                                                            |
| Supabase CLI local stack                              | `docker compose`: Postgres with pg_cron and pgTAP, plus Azurite for Blob                                                                                                        | Lets the PR pipeline run the database tests.                                                                                                                                                                                                               |

Unchanged: Expo and EAS, RevenueCat, Razorpay, Expo Notifications, Resend, PostHog, Sentry, Turborepo + pnpm, YouTube and Drive embeds.

[1] https://learn.microsoft.com/da-dk/entra/external-id/customers/concept-multifactor-authentication-customers
[2] https://learn.microsoft.com/en-us/answers/questions/2124468/azure-sms-services-for-india-region
[3] https://better-auth.com/docs/plugins/phone-number
[4] https://learn.microsoft.com/en-us/azure/postgresql/extensions/concepts-extensions-considerations
[5] https://learn.microsoft.com/azure/cdn/cdn-features
[6] https://learn.microsoft.com/en-us/azure/static-web-apps/nextjs

### 2.3 What the switch costs

Supabase supplied sign-in, an API, storage and function hosting as products. On Azure those become code this repo owns: an auth service (phase 2), an API layer (phases 2 to 7), image handling (phase 4) and a job runner (phase 6). That is the real price of the move. Budget for it; it is why phases 2 and 6 exist in their current size.

### 2.4 Azure resources per environment

One resource group per environment (`rg-eyeq-stg`, `rg-eyeq-prod`) plus `rg-eyeq-shared` for the container registry, all in Central India, defined in `infra/` with Bicep.

| Resource                          | Setting                                                                                                                                                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Virtual network                   | Two subnets: one delegated to Container Apps, one delegated to PostgreSQL                                                                                                                                                                                   |
| Container Apps environment        | Consumption, VNet-integrated, logs to Log Analytics                                                                                                                                                                                                         |
| Container App `eyeq-web`          | External HTTPS ingress, 0.5 vCPU and 1 GiB, production min 1 and max 3 replicas (min 1 avoids cold starts against the 2-second Home target), staging min 0                                                                                                  |
| Container Apps Job `eyeq-worker`  | Cron `*/5 * * * *`, runs to completion; added in phase 6                                                                                                                                                                                                    |
| Container Apps Job `eyeq-migrate` | Manual trigger from the deploy pipeline; runs migrations from inside the network                                                                                                                                                                            |
| PostgreSQL Flexible Server        | Burstable B1ms, 32 GB, private access, 7-day point-in-time restore. Server parameters: `azure.extensions` and `shared_preload_libraries` include `pg_cron`; `cron.database_name` set to the app database; allow-list any other extension the migrations use |
| Storage account                   | Container `public` (covers, badges, avatars, share cards), container `private` (data exports, short-lived SAS links)                                                                                                                                        |
| Key Vault                         | All secrets; access through a user-assigned managed identity                                                                                                                                                                                                |
| Container Registry                | Basic tier, in `rg-eyeq-shared`, used by both environments; pulled with the managed identity                                                                                                                                                                |
| Log Analytics + alerts            | 5xx rate, p95 latency, job failures, database CPU, storage and connections; alert by email                                                                                                                                                                  |
| Custom domain                     | Managed certificate on `eyeq-web`; hostname is an open question (section 13)                                                                                                                                                                                |

Notes for the builder:

- Keep the Node connection pool small (10 per replica). The smallest database tiers allow only a few dozen connections and may not include the built-in pooler; confirm the limits for the chosen tier before raising replicas.
- The Burstable tier is a single instance. The PRD's 99.5% is a target, not an SLA at this size. Moving to General Purpose with zone-redundant standby is a configuration change, to be made when revenue justifies it.
- pg_cron schedules are in UTC. Monday 00:00 IST is `30 18 * * 0`.
- Deploy from GitHub Actions with OIDC federated credentials, not stored cloud secrets.

### 2.5 Running cost, approximate

Azure lines replace the Supabase (US$25) and Vercel (US$20) lines of the architecture document. Figures are estimates from list prices; confirm in the Azure pricing calculator for Central India before budgeting.

| Item                                                  | Production, launch to 1,000 athletes               |
| ----------------------------------------------------- | -------------------------------------------------- |
| PostgreSQL B1ms compute                               | About US$18 [7]                                    |
| PostgreSQL storage 32 GB + backups                    | About US$5                                         |
| Container App, one small replica always on, plus jobs | About US$10 to 30 after the monthly free grant [8] |
| Container Registry Basic                              | About US$5                                         |
| Blob, Key Vault, Log Analytics                        | About US$1 to 5                                    |
| **Azure total**                                       | **About US$40 to 65**, against US$45 before        |

A staging environment with its own database adds roughly US$20 to 25 a month if left running; stop the staging database when idle and let staging scale to zero. All other lines (EAS, RevenueCat, PostHog, Sentry, Resend, SMS, store and payment fees) are as in the architecture document.

Put together, launch infrastructure comes to roughly US$45 to 90 a month (Azure, plus EAS at US$0 to 19 and SMS under US$5) against the PRD's target of US$50 to 70. The top of that range is the container app running busy all month, which 20 athletes will not cause; expect the lower half. Staging is on top.

[7] https://www.bytebase.com/dbcost/azure-flexible/instance/B1ms/
[8] https://azure.microsoft.com/en-us/pricing/details/container-apps/

## 3. Repository layout

```
eyeq/
  EYEQ_BUILD_PLAN.md  CLAUDE.md  DECISIONS.md
  apps/
    web/            Next.js (App Router, output: 'standalone')
                    app/(public)   program landing pages, legal pages
                    app/(app)      athlete web app: Today, session player, Progress, Programs, Account
                    app/admin      coach admin
                    app/auth       Supabase Auth callback; app/api/auth/sms-hook (Send SMS hook)
                    app/api/v1     athlete API
                    app/api/admin  admin API
                    app/api/webhooks/{razorpay,revenuecat}
                    src/server     services that call the database; used by API routes and server components
    mobile/         Expo app (created in phase 8)
    worker/         scheduled sender: push, email
  packages/
    ui/             tokens.ts (from docs/design/tokens.json), icon paths, web components, native components
    game/           pure TypeScript rules: XP, levels, streak maths; vectors/*.json shared with SQL tests
    db/             Prisma client (introspected), asAthlete(), typed wrappers for SQL functions
    api-contract/   zod schemas and types for every /api/v1 and /api/admin request and response; typed fetch client
    i18n/           English message catalogue, typed keys (Tamil and Hindi slot in later)
    config/         eslint, tsconfig, shared constants
  db/
    migrations/     plain SQL, forward only
    tests/          pgTAP
    seed/           game_config defaults, demo content and athletes matching the prototype
  infra/            empty (section 2 superseded; Vercel + Supabase need no infra code yet)
  docker/           Dockerfile.web, Dockerfile.worker, Dockerfile.postgres (pg_cron + pgTAP), compose.yaml
  docs/             design/, product/
  .github/workflows/  pr.yml, migrate.yml, release.yml
```

**Default libraries.** Change one only with a line in `DECISIONS.md`.

| Need                  | Default                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Web styling           | Tailwind CSS, theme generated from `tokens.ts`, CSS variables for dark and light                               |
| Native styling        | React Native `StyleSheet` reading the same `tokens.ts`                                                         |
| Data fetching         | TanStack Query on web client components and mobile                                                             |
| Validation            | zod, in `packages/api-contract`                                                                                |
| Database access       | Prisma 7 with `@prisma/adapter-pg`, schema introspected from the SQL migrations; SQL functions via `$queryRaw` |
| Migrations            | Plain SQL files with a small runner (dbmate or equivalent)                                                     |
| Tests                 | Vitest (unit), pgTAP (database), Playwright (web end to end), Maestro (mobile flows)                           |
| Drag and drop (admin) | dnd-kit                                                                                                        |
| Charts                | Inline SVG on web, `react-native-svg` on mobile; the four charts in the prototype do not need a chart library  |
| Mobile animation      | Reanimated; no Lottie file over 60 KB                                                                          |
| Mobile storage        | SecureStore for the session, MMKV or SQLite for the offline queue                                              |

Components are implemented once for web and once for native against the same token file and the same component list. Do not introduce react-native-web to share them; with about twenty components, two implementations cost less than one cross-platform abstraction.

## 4. Ground rules

Phase 0 copies this section into `CLAUDE.md`. These hold in every phase.

1. **The server decides rewards.** Clients report events and render the result object they get back. No XP, coin, streak, level, badge or entitlement value is computed for storage outside Postgres functions.
2. **Ledgers are append-only**: `xp_ledger`, `coin_ledger`, `credit_ledger`, `freeze_ledger`, `entitlement_events`, `audit_log`. No UPDATE or DELETE; a correction is a new row. Enforce with privileges and a trigger. Two tables are near-ledgers: a `payment_events` row's payload never changes and only its processing fields (`processed_at`, attempts, error) may be set; an `entitlements` row holds current state and every change to it writes an `entitlement_events` row in the same transaction.
3. **Caches are rebuildable.** `user_stats` and the leaderboard tables are derived. Each has a rebuild function, and a test proving rebuild equals cache.
4. **Access means entitlements.** No code path asks a payment provider whether someone may open content.
5. **Video references stay server-side** for anything not free. They leave only through `get_drill_media` after an entitlement check, never in list or detail payloads.
6. **Every mutating call is idempotent**, keyed by `client_event_id` or the provider's event id.
7. **Schema changes are migrations.** Never edit an applied migration.
8. **Rule values live in `game_config`.** No rule constants in application code. `packages/game` loads its defaults from the same seed JSON.
9. **Rules exist twice and are tested once.** SQL and `packages/game` run the same JSON vectors. A rule change edits both and the vectors in one pull request.
10. **Training, never diagnosis.** Nothing may claim to test, diagnose or measure eyesight or eye health, or claim clinical or medical accuracy, anywhere, including store listings. Forge Your Peak's method line "Test · Train · Transform" and disclaimers that deny clinical status ("honest, not clinical") are fine. Keep the disclaimers the prototype shows on baseline, drill, progress and paywall screens.
11. **Privacy.** Analytics events carry the user id and nothing else personal. Public boards show display name, initials avatar, XP level, XP and rank (D25 covers sport). Phone numbers are masked in admin lists. Date of birth never leaves the server.
12. **Secrets** are server-only environment values locally and Vercel / GitHub Actions secrets in hosted environments. Never `NEXT_PUBLIC_*`.
13. **Accessibility floor.** 44 pt targets, layouts that survive 200% text scaling, state never signalled by colour alone, reduced motion respected, captions on by default.
14. **Check third-party docs before writing integration code.** Razorpay, RevenueCat, Supabase, Vercel, Prisma, Expo and MSG91 APIs change; this plan names what to build, not exact event names or SDK calls.
15. **A phase is done when its acceptance checks pass in CI**, not when the code is written.
16. **Strings go through `packages/i18n`.** No hard-coded user-facing text in components.
17. **Web and mobile are at parity.** Every athlete screen and feature exists on both clients. A feature is not done until both have it, or the phase report names the client missing it. The only allowed differences are listed in 8.2.

## 5. Data model

Build the tables in the architecture document, with the additions below. Money is stored in paise as integers; timestamps are `timestamptz`; ids are UUIDs.

### 5.1 Tables from the architecture document

| Group    | Table                                                      | Key columns                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| People   | `profiles`                                                 | id (= auth user id), display_name, avatar_url, sport, playing_level, dob, goal, session_minutes, timezone, visibility (public, private)                                                                             |
| People   | `admins`                                                   | user_id, role (coach, owner)                                                                                                                                                                                        |
| Content  | `programs`                                                 | id, slug, title, sport_tags[], level, duration_days, access (see 5.2), product_id, completion_xp, status (draft, published)                                                                                         |
| Content  | `modules`                                                  | id, program_id, order, title, unlock_rule (immediate, after_previous, on_day N)                                                                                                                                     |
| Content  | `sessions`                                                 | id, module_id, day_number, est_minutes                                                                                                                                                                              |
| Content  | `drills`                                                   | id, title, video_provider (youtube, drive, mux), video_ref, instructions, target_type (reps, seconds, none), target_value, score_type (none, number, rating), xp, measurement_tag, ppv_product_id                   |
| Content  | `session_drills`                                           | session_id, drill_id, order. A drill can be reused across programs                                                                                                                                                  |
| Activity | `enrollments`                                              | user_id, program_id, started_at, current_day, completed_at                                                                                                                                                          |
| Activity | `drill_completions`                                        | id, user_id, drill_id, session_id, completed_at (device time), received_at, watch_pct, score, client_event_id (unique)                                                                                              |
| Activity | `session_completions`                                      | user_id, session_id, local_date, completed_at. Unique on (user_id, local_date): this is the streak fact                                                                                                             |
| Ledgers  | `xp_ledger`                                                | id, user_id, amount, reason, source_id, created_at, local_date                                                                                                                                                      |
| Ledgers  | `coin_ledger`, `credit_ledger`                             | id, user_id, amount (+ or -), reason, source_id, created_at                                                                                                                                                         |
| Ledgers  | `entitlements`                                             | id, user_id, scope (subscription, program, drill, challenge), scope_id, source (play, appstore, razorpay, coins, credits, admin), starts_at, ends_at (null = lifetime), status (active, grace, ended), external_ref |
| Ledgers  | `payment_events`                                           | id, provider, external_id (unique), payload jsonb, received_at, processed_at                                                                                                                                        |
| Ledgers  | `products`                                                 | id, kind (subscription, program, drill, credit_pack, challenge_entry), price, what it grants, Play id, App Store id, Razorpay id                                                                                    |
| Game     | `user_stats`                                               | user_id, total_xp, level, current_streak, best_streak, freezes_held, coins, updated_at. A cache                                                                                                                     |
| Game     | `badges`, `user_badges`                                    | name, family, rule jsonb, coins; user_id, badge_id, awarded_at                                                                                                                                                      |
| Game     | `challenges`, `challenge_progress`                         | type (weekly, program, paid), goal jsonb, window, reward_xp, reward_coins, badge_id, entry_product_id; progress per user                                                                                            |
| Game     | `leaderboard_weekly`                                       | week_start, scope (global, sport, age_band), scope_value, user_id, xp, rank                                                                                                                                         |
| Game     | `game_config`                                              | key, value jsonb, active_from                                                                                                                                                                                       |
| Ops      | `notifications`, `push_tokens`, `redemptions`, `audit_log` | See 5.2 for `notifications`; `audit_log` records actor, action, target, before, after                                                                                                                               |

### 5.2 Additions and changes

| Table or column                                                                                                                                                                                              | Why                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Auth's `auth.users` (D28)                                                                                                                                                                           | Owned by Supabase, never migrated by us. Phase 2 adds the foreign key from `profiles.id` to `auth.users(id)`.                                                               |
| `self_ratings` (user_id, area: focus, reaction or tracking, rating 1 to 5, kind: baseline, day14, day21 or adhoc, taken_at)                                                                                  | The onboarding baseline and the "baseline vs now" radar need somewhere to live; the architecture document has no table for it. The prototype re-rates on day 14 and day 21. |
| `freeze_ledger` (user_id, amount +1 or -1, reason: sub_grant, coin_purchase, used, refund; local_date for `used`)                                                                                            | Freezes are granted, bought, consumed and sometimes refunded (section 6.4). A ledger makes that auditable; `user_stats.freezes_held` becomes its cached sum.                |
| `notifications` gains `status` (queued, sent, failed, skipped), `send_after`, `kind`, `dedupe_key`                                                                                                           | It doubles as the outbox the worker drains.                                                                                                                                 |
| `profiles` gains `playing_level` (school, club, district, state, national), `reminder_time`, notification toggles, `onboarded_at`                                                                            | Onboarding and Profile screens. `level` in the architecture document means playing level; name it `playing_level` so it cannot be confused with XP level.                   |
| `is_minor`                                                                                                                                                                                                   | Cannot be a stored generated column because it depends on today's date. Expose it as a SQL function over `dob` and use it in views.                                         |
| `drills` gains `duration_minutes`, `rest_seconds`, `target_label`, `score_direction` (higher or lower is better), `score_unit`, `access` (included, free_preview, free_pool, ppv), `coin_price`, `min_level` | Drill editor fields in the prototype; `score_direction` is required to detect a personal best. A `ppv` drill is sold through `ppv_product_id` or unlocked with coins.       |
| `programs` gains `description`, `cover_url`, `min_level`                                                                                                                                                     | Catalog and detail screens; level gating is optional (section 13, D9).                                                                                                      |
| `reward_items` (kind: freeze, drill_unlock, frame, voucher, real_world; coin_price; active) and `user_items`                                                                                                 | The Rewards screen catalogue and owned cosmetics.                                                                                                                           |
| `promo_codes`, `promo_redemptions`                                                                                                                                                                           | P1.                                                                                                                                                                         |
| `rate_limits` (key, window_start, count)                                                                                                                                                                     | OTP and completion limits must hold across replicas. Defaults in config: 5 OTP requests per phone per hour, 20 per IP per hour, 30 completions per user per minute.         |
| `entitlement_events` (entitlement_id, change, reason, payment_event_id or admin id, at)                                                                                                                      | The PRD wants entitlements to be auditable like a ledger; rows in `entitlements` change state, so each change is recorded here.                                             |
| `programs.access` as three fields: `is_free`, `in_subscription`, and `product_id` for a one-time purchase                                                                                                    | The prototype's normal case is a program that is both included in Pro and buyable once; the architecture's single `access_type` cannot say that (D23).                      |
| `measurement_tags` (slug, name, group: vision, reaction or cognition)                                                                                                                                        | The 12 measurements and the three groups the catalogue filters by.                                                                                                          |
| `leaderboard_weekly.rank_day_start`                                                                                                                                                                          | The rank at the start of the IST day, so rows can show a movement arrow and the rank-change moment and the "overtaken" alert have something to compare with.                |
| `reward_items.per_user_limit` and period                                                                                                                                                                     | The prototype limits the coach call to one a month.                                                                                                                         |

### 5.3 Roles and row-level security

There is no auto-generated API, so the API is the first gate. Keep the database as the second.

- `eyeq_owner` owns tables and functions and runs migrations.
- `eyeq_api` is the login role for athlete requests. It has no INSERT, UPDATE or DELETE on ledgers, `user_stats`, `entitlements`, or leaderboards; it may execute the public game functions.
- `eyeq_service` is the login role for webhooks, the worker and admin routes. Policies grant it wider access explicitly (`CREATE POLICY ... TO eyeq_service`); do not depend on BYPASSRLS.
- Every athlete request runs in one transaction that begins with `set_config('app.user_id', <id>, true)`. Policies compare `user_id` with that setting. Game functions read the user from the setting, never from a parameter, so a route cannot act for someone else by mistake.
- Functions that write ledgers are `SECURITY DEFINER`, owned by `eyeq_owner`, with a fixed `search_path`.
- Public reads (catalogue, the leaderboard view) need no user.

## 6. Game rules

All values below are defaults seeded into `game_config`. Each rule gets at least one vector in `packages/game/vectors/`.

### 6.1 XP

| Reason              | Amount                                                   | Rule                                                                                                                                                                                               |
| ------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drill`             | 10 (per-drill override allowed)                          | Once per drill per local day. Repeat completions are recorded and earn 0.                                                                                                                          |
| `session_bonus`     | 25                                                       | When every drill in Today's Session is done. Once per local day.                                                                                                                                   |
| `personal_best`     | 15                                                       | Numeric scores only, at most once per drill per day. The first logged score sets the mark and earns nothing. Direction from `drills.score_direction`.                                              |
| `streak_multiplier` | +10% per full 7 days of streak, capped at +50% (35 days) | One ledger row at session completion. Base is that session's drill XP plus the session bonus. Uses the streak the athlete started the day with. Round half up.                                     |
| `challenge`         | 50 to 200, per challenge                                 | On completion.                                                                                                                                                                                     |
| `program_complete`  | 500 (per-program)                                        | Once per program.                                                                                                                                                                                  |
| Daily cap           | 400                                                      | Applies to drill, session bonus, personal best and multiplier XP for a local date. A row that would exceed the cap is truncated and flagged. Challenge and program-completion XP are exempt (D13). |

Vectors that must pass (from the prototype's own arithmetic):

- 4 drills, streak 0: 40 + 25 = **65**.
- 4 drills, streak 12: 65 × 1.1 = 71.5, so **72** (40 + 25 + 7).
- Streak 6 gives ×1.0, 7 gives ×1.1, 14 gives ×1.2, 35 and 60 both give ×1.5.
- 4 drills, streak 35: 65 × 1.5 = 97.5, so **98**.

### 6.2 Levels and rank titles

- Threshold for level n is `round(100 × n^1.5)` for n of 2 and above. Level 1 starts at 0 XP; the formula's value for n = 1 is not used. Level is the highest n whose threshold is at or below total XP, and never below 1. Vector: 0, 99 and 282 XP are level 1; 283 is level 2.
- Check values: level 2 at 283, 5 at 1,118, 7 at 1,852, 8 at 2,263, 10 at 3,162, 20 at 8,944. With 2,040 XP the athlete is level 7 and 223 XP from level 8; after a 72 XP session, 151.
- Rank titles come from bands in `game_config`. Seed the PRD's "every 5 levels": Rookie 1 to 4, Prospect 5 to 9, Contender 10 to 14, Elite 15 to 19, Peak 20+ (D1).
- A level-up grants coins (20) and, on a new title, a profile frame.

### 6.3 Today's Session

- For an enrolled athlete with access, it is the session for `enrollments.current_day` in the active program. `current_day` advances when that session is completed; the next one opens at the athlete's next local midnight. One program session per local day.
- Module unlock rules: immediate, after the previous module is complete, or on day N.
- For a free athlete with no accessible program session, it is the day's free drill from the rotating pool (the pick is deterministic per date). Completing it counts as the day's session (D20).
- The session-length preference (10, 15, 20 minutes) feeds recommendations only; it does not reshape a program's sessions.

### 6.4 Streaks

- A day counts when Today's Session is completed. The day is the athlete's local date, computed on the server from `completed_at` and `profiles.timezone`.
- `completed_at` is device time and is accepted if within 48 hours of receipt. Older completions are stored and earn XP as normal but give no streak credit.
- A timezone change takes effect from the athlete's next local midnight.
- Freeze: protects one missed day. The streak neither grows nor resets on a frozen day and the multiplier is kept. At most 2 held. Subscribers are granted them by `grant_subscriber_freezes`, called from `week-rollover`, on a schedule from config (seed: 1 a week, D3), never past the cap. Buying one costs 50 coins. A held freeze is applied automatically; there is no manual "use" step (D26).
- `streak-close` runs after each athlete's local midnight: if yesterday has no session completion, consume a freeze if one is held, otherwise set the current streak to 0. Best streak is kept and shown beside the current one.
- **Late sync.** A completion can arrive after `streak-close` has already judged that day. So the streak is always recomputed from facts (`session_completions` and `freeze_ledger`), never incremented blindly. If the late completion covers a day on which a freeze was consumed, refund the freeze; if it covers a day that reset the streak, restore it.
- Milestones at 3, 7, 14, 30, 60, 100 and 365 days award a badge and coins.

### 6.5 Coins and credits

- Coins are earned (streak milestones, challenges, level-ups, badges) and never bought (D4). Spend: streak freeze 50, unlock one drill 30 or the drill's own price, profile frame 80, program discount voucher 200, real-world rewards from 500.
- Earn amounts, seeded into config: level-up 20; weekly challenge 40; per badge as set on the badge (prototype: Scan Master I 25, Two-Week Flame 30, Sharp Eye 20, Program Done 100). Streak-milestone coins are not given by any source: seed 10, 20, 30, 60, 100, 150 and 500 for days 3, 7, 14, 30, 60, 100 and 365 as placeholders (D24).
- P0 spends are the freeze and the drill unlock. Frames and vouchers arrive in phase 10; a voucher is issued as a single-use promo code.
- A spend is a negative ledger row in the same transaction as what it buys. A balance can never go below zero; test the race with two concurrent spends.
- Credits are the paid, pay-per-use currency in `credit_ledger`, with the same mechanics. Spending credits and creating the entitlement happen in one transaction. P1.
- Real-world rewards create a `redemptions` row for the coach to fulfil by hand.

### 6.6 Leaderboards

- Weekly board: sum of `xp_ledger.amount` per user for the ISO week in IST, bucketed by the row's `created_at` (this plan's choice, so that a closed week never changes when an offline session syncs late). Resets Monday 00:00 IST. All-time board: total XP.
- Scopes at launch: global and by sport. `age_band` exists in the schema and is not shown.
- Only profiles with `visibility = public` appear. Minors default to private. An athlete always sees their own rank.
- Show the top 10 plus the athlete's own row, pinned, with the XP gap to the row above and the movement since the start of the day (from `rank_day_start`).
- Ties: earlier arrival at that XP wins, then user id.
- Rebuilt every 5 minutes into `leaderboard_weekly`; `week-rollover` freezes final ranks.

### 6.7 Badges and challenges

- A badge rule is a JSON condition evaluated by one function, for example `{"metric":"current_streak","gte":30}`. Metrics to support: current_streak, best_streak, sessions_total, minutes_total, drills_with_tag (with a tag), program_completions, module_completions, personal_bests, score_gte (with a drill), weekly_challenge_wins, weekly_rank_lte, sessions_before_hour, and shares_total (P1, with share cards).
- Badges are evaluated inside `complete_drill` and again by `week-rollover`, which is the only place weekly ones (a podium finish, a challenge win) can be earned.
- Four families: consistency, volume, mastery, community. Each badge has a locked state that says how to earn it and, where it can, how far away it is.
- Challenges use the same condition shape with a window. Weekly: one live at a time, admin-defined; if none is scheduled for next week, the current one repeats. Program challenges are tied to a program and edited on the program's admin page (seed the prototype's two: "Finish Module 2 by Sunday" +60 XP and "Score 25+ clean shifts on Near-Far" +40 XP). Paid challenges (P1) have an entry product and their own leaderboard. A challenge card can show how many athletes have progress on it.

### 6.8 `complete_drill`

One transaction, all or nothing, called as `complete_drill(drill_id, session_id, completed_at, score, watch_pct, client_event_id)`:

1. If `client_event_id` was seen before, return the stored result.
2. Check access (`has_access`) and write `drill_completions`.
3. If the session is now complete, write `session_completions`, recompute the streak, add the session bonus.
4. Write XP rows: drill, personal best, multiplier; apply the daily cap.
5. Update `user_stats`: total XP, level, coins from any level-up.
6. Evaluate badges and challenge progress; advance the enrollment; award program completion if this was the last session.

It returns one result object: XP rows with reasons, daily total against the cap, old and new level, level progress, streak before and after, challenge progress, badges unlocked, coins earned, rank if available. The summary screen animates this object and never its own sums.

### 6.9 Notifications

| Kind             | When                                                                                                                                    | Release |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Streak at risk   | 8 pm local, today not done and a streak of at least 3 (the architecture document's threshold, held in config; the PRD names no minimum) | P0      |
| Daily reminder   | The athlete's chosen time                                                                                                               | P0      |
| Challenge ending | 24 hours before the window closes, if not yet complete                                                                                  | P0      |
| Weekly recap     | After week rollover: push, in-app and email                                                                                             | P1      |
| Overtaken        | When passed on a board, at most once a day                                                                                              | P1      |

At most 2 pushes per athlete per local day. When more than two qualify, send in the order the table lists them. Every send, skip and failure is a row in `notifications`. Each kind has a toggle in Profile.

## 7. API

Athlete endpoints live under `/api/v1`, are authenticated by the Supabase Auth session (cookie on web, bearer token from the Expo client), validated with zod from `packages/api-contract`, and versioned so old app builds keep working. Server components in `apps/web` call the same services directly rather than over HTTP.

| Area         | Endpoints                                                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth         | Supabase Auth (D28): phone OTP, verify, Google, Apple on iOS, session refresh, sign out; `/auth/callback` exchanges the OAuth code for the cookie session; `POST /api/auth/sms-hook` is the Send SMS hook                                   |
| Me           | `GET /me`, `PATCH /me`, `POST /me/self-ratings`, `POST /me/push-tokens`, `GET /me/entitlements`; P1: `POST /me/export`, `DELETE /me`                                                                                                        |
| Home         | `GET /home`: one payload for the Home screen (today's session, streak state, level, weekly challenge, weekly rank, active program) so Home opens on one request                                                                             |
| Content      | `GET /programs`, `GET /programs/:slug`, `POST /programs/:id/enroll`, `GET /sessions/:id`, `GET /drills/:id/media?session=`                                                                                                                  |
| Training     | `POST /completions` (wraps `complete_drill`; accepts a batch for offline replay)                                                                                                                                                            |
| Progress     | `GET /progress`                                                                                                                                                                                                                             |
| Compete      | `GET /leaderboards` (period: week or all; scope: global or sport), `GET /challenges`, `GET /badges`                                                                                                                                         |
| Rewards      | `GET /rewards`, `POST /rewards/purchase` (item id and, for a drill unlock, the drill), `POST /rewards/redeem`                                                                                                                               |
| Purchases    | `POST /purchases/razorpay/order`, `POST /purchases/razorpay/subscription`, `POST /purchases/refresh`                                                                                                                                        |
| P1 additions | `POST /promo/apply`, `GET /credits`, `POST /credits/spend`, `POST /challenges/:id/enter`, `GET /share/:kind.png`, `GET /notifications` (in-app feed and recap; the feed itself ships in phase 6), `GET /recommendations`, `PATCH /me/frame` |
| Webhooks     | `POST /api/webhooks/razorpay`, `POST /api/webhooks/revenuecat`                                                                                                                                                                              |
| Admin        | `/api/admin/*`: programs, modules, sessions, drills, reorder, link check, uploads, athletes, entitlement grant and revoke, products, game config, badges, challenges, redemptions, promo codes, dashboard, CSV export                       |

Conventions: one error shape (`code`, `message`, `details`); rate limits on OTP requests (per phone and per IP) and on completions (per user per minute); admin routes check `admins` and write `audit_log` in the same transaction as the change; webhook routes verify the signature on the raw body, store the event, then process, and return 2xx only once the event is stored.

## 8. Design reference

`docs/design/tokens.json` holds the values; `docs/design/screens/` holds each board's markup. The essentials:

- **Colour.** Black ground `#0B0B10`, surfaces `#15151D` and `#1E1E28`, hairline `#2A2A37`. Violet `#7C3AED` is structure. Red `#DA2141` is the one action on a screen. Ember `#FFB020` (streak) and gold `#FFD23F` (XP, coins) are the only warm colours. Each semantic colour has a fill and a text variant; the light theme darkens the text variants and keeps fills saturated.
- **Type.** Barlow Condensed 700/800 for numbers, levels and headlines; Manrope 500 to 800 for everything else; tabular numerals. Both are open-licence Google fonts: self-host them (`next/font`, `expo-font`).
- **Shape.** 4 pt grid, 20 px screen gutter, 16 px card padding, radii 8 / 14 / 20 / full, flat surfaces with hairlines, one shadow level for sheets and modals.
- **Motion.** Five reward moments, each under 1.2 s, two curves, skippable, cross-fade under reduced motion, a 200 ms fade and nothing more for failure states.
- **Themes.** Dark is primary. Light follows the OS on mobile and is used by the coach admin. The program landing page board is dark; follow the board.

### 8.1 Screens to routes

| Board                                            | Mobile route (Expo Router)                      | Web route                                                |
| ------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------- |
| 1a Welcome                                       | `(auth)/welcome`                                | `/`                                                      |
| 1b Sign in: phone, OTP, Google                   | `(auth)/sign-in`                                | `/sign-in`                                               |
| 1c Profile, 1d Baseline, 1e Starter program      | `(onboarding)/profile`, `/baseline`, `/starter` | `/onboarding/*`                                          |
| 2 Home / Today (dark and light)                  | `(tabs)/index`                                  | `/app`                                                   |
| 3 Drill player                                   | `session/[id]/[index]`                          | `/app/session/[id]`                                      |
| 4 Session complete                               | `session/[id]/complete`                         | same page, summary state                                 |
| 5a Level up, 5b Badge unlock                     | modal routes                                    | overlay                                                  |
| 6 Leaderboard, 7 Challenges                      | `(tabs)/compete`, two segments                  | `/app/compete` (Leaderboard, Challenges)                 |
| 8 Progress                                       | `(tabs)/progress`                               | `/app/progress`                                          |
| 9 Trophy case                                    | `trophies` (from Profile)                       | `/app/trophies`                                          |
| 10a Programs, 10b Program detail                 | `(tabs)/train`, `programs/[slug]`               | `/app/programs`, `/app/programs/[slug]`                  |
| 11 Paywall                                       | `paywall` modal                                 | `/app/upgrade`                                           |
| 12 Rewards                                       | `rewards` (from the coin chip)                  | `/app/rewards`                                           |
| 13a at risk, 13b freeze used, 13c streak lost    | states of Home                                  | states of `/app`                                         |
| 14 Profile and account                           | `(tabs)/profile`                                | `/app/account`                                           |
| 15 Program landing page                          | n/a                                             | `/programs/[slug]` (public, server-rendered)             |
| 16 Athlete web app                               | n/a                                             | `/app/*` with side navigation                            |
| 17 Coach admin: builder, athletes, game settings | n/a                                             | `/admin/programs/[id]`, `/admin/athletes`, `/admin/game` |

The paywall board shows "Pay with UPI, Card, Net banking". That row belongs to the web paywall only; in the mobile app purchases go through the store sheet and the row is not shown.

Not drawn in the prototype but required: `/admin/products`, `/admin/redemptions`, `/admin/dashboard`, `/admin/athletes/[id]`, the legal pages, and every empty, loading, error and offline state. Build them from the same components and say so in the phase report.

### 8.2 Web and mobile parity, and the web layout rule

Ground rule 17 holds: the web app has every athlete screen and feature the mobile app has.

**Layout.** One set of web components serves both widths.

- **Below 768 px** the web app is the mobile design: the same boards, the bottom tab bar (Home, Train, Compete, Progress, Profile), sheets, and full-screen moments. Each screen matches its board at 390 × 844.
- **From 768 px** it follows board 16: side navigation with the same five destinations, cards in two or three columns, and sheets shown as centred dialogs.

**Allowed differences.** Only these:

| Concern           | Web                                                                   | Mobile                                 |
| ----------------- | --------------------------------------------------------------------- | -------------------------------------- |
| Payments          | Razorpay Checkout                                                     | Play Billing and StoreKit (RevenueCat) |
| Restore purchases | Not offered                                                           | Offered                                |
| Reminders         | Web push (opt-in) plus the in-app feed (`GET /notifications`)         | Expo push                              |
| Offline           | No queue; a failed completion retries with the same `client_event_id` | Persisted queue replayed on reconnect  |
| Haptics           | None                                                                  | Yes                                    |
| Share             | Web Share API where present, else copy link                           | Native share sheet                     |

## 9. Build phases

Every phase ends the same way: run its acceptance checks, report, and stop for a go-ahead. A phase with a **Gate** note also needs something from Karthik before the next one can finish.

### Phase 0: Monorepo and local stack

- [x] Inspect the boilerplate. Record the Next.js version, router, TypeScript and lint setup in `DECISIONS.md`. If it uses the Pages Router or JavaScript, convert to App Router and strict TypeScript now.
- [x] Convert to pnpm workspaces and Turborepo. Move the app to `apps/web`. Create the packages in section 3 as empty, typed, building shells.
- [x] `docker/compose.yaml`: Postgres with pg_cron and pgTAP, Azurite. `docker/Dockerfile.web` building the standalone output.
- [x] Scripts: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm db:migrate`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:types`.
- [x] Lint, format, strict typecheck, Vitest and Playwright wired. `.env.example` with every variable the plan names.
- [x] `pr.yml`: typecheck, lint, unit tests, database tests against the compose Postgres, web build.
- [x] Write `CLAUDE.md` from section 4 and start `DECISIONS.md`.

**Acceptance.** A clean clone runs `pnpm i && pnpm dev` and serves the boilerplate page from `apps/web`. `pnpm test` and `pnpm db:test` pass (with one trivial test each). The Docker image builds and serves the page. CI is green.

### Phase 1: Schema and game engine

No UI in this phase. This is the part errors cost most in, so it is built and tested first.

- [x] Migrations for every table in section 5 except the Better Auth tables (phase 2), with constraints, indexes and the append-only trigger. `profiles.id` is a UUID with no foreign key yet.
- [x] Roles, grants and RLS policies per 5.3.
- [x] `game_config` seed and a reader that honours `active_from`.
- [x] Functions: `complete_drill`, `award_xp` (with cap), `recompute_streak`, `evaluate_badges`, `update_challenge_progress`, `todays_session`, `enroll`, `has_access`, `get_drill_media`, `grant_entitlement`, `end_entitlement` (both writing `entitlement_events`), `spend_coins`, `purchase_reward` (freeze, drill unlock), `grant_subscriber_freezes`, `home_payload`, `progress_payload`.
- [x] Job functions: `leaderboard_refresh`, `rank_day_snapshot`, `streak_close`, `week_rollover` (freeze ranks, weekly badges, subscriber freezes, next challenge), `entitlement_expiry`, `enqueue_notifications` (one function, every kind in 6.9). They are written and tested here by calling them directly; pg_cron schedules them in phase 6.
- [x] Rebuild functions for `user_stats` and leaderboards.
- [x] `packages/game`: the same XP, level, multiplier, cap and streak maths in TypeScript, driven by `vectors/*.json`.
- [x] Seed data reproducing the prototype: four programs (3-Day Eye Health Reset free; Cricket Vision Foundations 21 days in three modules; Reaction Edge 28 days; Focus Under Pressure 14 days), the four sample drills with their measurement tags, the 12 measurement tags in their three groups (vision: dynamic visual acuity, contrast sensitivity, binocular acuity, colour perception, stereopsis; reaction: simple reaction speed, complex reaction speed, hand-eye coordination, anticipation; cognition: executive scan, digit span, short-term visual memory), the 17 badges of D2 with their coin values, the reward catalogue of 6.5, the two program challenges of 6.7, a weekly challenge "5 sessions this week" (+150 XP, 40 coins), and about 25 athletes, 18 of them cricketers so the sport board reads "#4 of 18", including Arjun R. at 2,040 XP, level 7, 12-day streak, best 19, 1 freeze, 140 coins and 412 XP this week. The seed reproduces the sample athlete and his session exactly; other figures on the boards (athlete counts, some levels, the daily total on the summary) are illustrative and not all consistent with the rules, so do not chase them.

**Acceptance.** pgTAP covers, at minimum: every vector in 6.1 and 6.2, including the level-1 floor; the daily cap including truncation; a duplicate `client_event_id` returning the first result with no new rows; streak across midnight in two timezones; a 47-hour-late and a 49-hour-late completion; freeze consumed, and freeze refunded by a late sync; two concurrent coin spends that cannot both succeed; `eyeq_api` unable to write any ledger directly; one user unable to read another's rows; rebuild equals cache; leaderboard order, ties and the private-profile filter; week rollover at Sunday 18:30 UTC, including a podium badge and a subscriber freeze grant that respects the cap of 2; every entitlement change leaving an `entitlement_events` row. The TypeScript and SQL implementations agree on every vector.

**Gate.** Report the rule decisions taken from section 13 and any rule the sources left undefined.

### Phase 2: Hosting foundation, sign-in and API skeleton

- [ ] `main` is the default branch and Vercel's production branch; `pr.yml` runs on pull requests, including the Supabase-image job.
- [ ] Supabase projects for staging and production in `ap-south-1`; the Data API reaches nothing (`public` not exposed, or no grants to `anon` / `authenticated`), proved by a test with the anon key; login passwords set for `eyeq_api` and `eyeq_service`. Vercel project with root `apps/web`, env vars per environment (2.0).
- [x] `migrate.yml`: on merge to `main`, run `pnpm db:migrate` from GitHub Actions, then smoke-test `/api/health` and `/api/health/db` once Vercel has deployed. Never from a laptop.
- [x] Supabase Auth (D28): phone OTP through the Send SMS hook behind an SMS sender interface (MSG91 later, a fixed test number on staging, console output locally), Google sign-in, cookie sessions on web; bearer tokens for the Expo client later. Supabase Auth's OTP rate limit set to 5 per phone per hour. Add the foreign key from `profiles.id` to `auth.users(id)`. Create the `profiles` and `user_stats` rows on first sign-in.
- [x] Request pipeline: session to user, transaction with `app.user_id`, zod validation, error shape, idempotency, rate limits backed by `rate_limits`.
- [x] `GET /me`, `PATCH /me`, `/api/health`.
- [x] A script, `pnpm admin:grant <phone> <role>`, that creates an `admins` row; it is the only way the first coach or owner is made, and it writes `audit_log`.
- [x] Sentry on web and server; structured request logs (JSON to stdout, read in Vercel's logs); PostHog server client and feature flags (used later for paywall variants and new game rules). Each skips cleanly when its key is missing.

**Acceptance.** The staging URL serves over HTTPS on the Vercel domain. A person can sign in by phone OTP and by Google on staging, and `GET /me` returns their profile. The sixth OTP request in the window is refused. An integration test shows a request for user A cannot return user B's data even when the service code is deliberately wrong (RLS catches it). Migrations ran through the job, not from a laptop.

**Gate.** Needs from Karthik before this phase can finish: Supabase projects (staging, production) and a Vercel project with Git connected, a Google OAuth client configured in Supabase Auth, the Send SMS hook secret. MSG91 can follow; staging works with the test number.

### Phase 3: Design system and web shell

- [x] `packages/ui/src/tokens.ts` from `tokens.json`; Tailwind theme and CSS variables for both themes; fonts self-hosted; the 16 icons as components from the board's SVG paths.
- [x] Web components for every entry in the token file's component list, each with its states.
- [x] A development-only gallery at `/dev/components` laid out like the "DS · Components" board, for side-by-side comparison.
- [x] App shells: public layout, responsive athlete shell per 8.2 (bottom tab bar below 768 px, side navigation from 768 px per board 16), admin layout (board 17).
- [x] `packages/i18n` in place and used by every component.

**Acceptance.** The gallery matches the board at 1× on colours, type sizes, radii and spacing (compare screenshots against the rendered prototype). The athlete shell is checked at 390 × 844 (tab bar, matching the phone boards) and at 1440 wide (side navigation, board 16). Automated accessibility checks pass on the gallery in both themes. At 200% text size nothing clips or overlaps. With reduced motion set, moments cross-fade.

### Phase 4: Coach admin, content and athletes

- [ ] `/admin` gated by `admins`; every mutation writes `audit_log`.
- [ ] Program builder per board 17: tree of modules, sessions and drills with drag to reorder; drill editor with all fields from 5.2; a drill reused across sessions shows where it is used; duplicate session; bulk paste of video links; publish with validation (every drill has a working video; a paid program has a priced product). Warn, without blocking, when a paid drill uses a Drive link: the PRD wants YouTube unlisted for anything paid because Drive files can be downloaded.
- [ ] Link check on save: YouTube video exists and is embeddable, returning duration and privacy; Drive file is shared to anyone with the link. Needs a server-side Google API key.
- [ ] Cover and badge image upload to Blob with fixed-width variants. Drill thumbnails come from YouTube; Drive drills take an uploaded one.
- [ ] Athletes: list with search and plan filter, streak, last active, plan and program, masked phone, CSV export; athlete page with activity timeline, purchases, entitlements, and manual grant or revoke written with `source = admin`.
- [ ] Products, minimal: internal product id, kind, price, what it grants, and the Play, App Store and Razorpay ids.
- [ ] Read endpoints the admin's result is checked through: `GET /programs`, `GET /programs/:slug`, `GET /sessions/:id` (never returning `video_ref`).

**Acceptance.** A Playwright run signs in as the coach, builds a program with two modules, three sessions and five drills from pasted links, reorders them, publishes, and sees it in `GET /programs`. An unpublishable program (broken link) is refused with the reason shown. A manual grant unlocks content for a test athlete and appears in the audit log.

### Phase 5: Athlete web app, the daily loop

Build each screen phone-width first (390 × 844, the mobile board), then widen it to the board 16 layout (8.2).

- [ ] Onboarding in four steps (boards 1b to 1e): sign in, profile (display name, sport, playing level, date of birth, goal, session length), self-rated baseline, starter program; the first session starts from the last step. Board 1c has no name field: add one, since the PRD collects a name and the boards need a display name. Avatars are initials (D22).
- [ ] Today (`/app`) from `GET /home`, including the at-risk, frozen and lost states.
- [ ] `DrillPlayer` with a provider interface (`youtube`, `drive`, room for `mux`). YouTube through the IFrame Player API, tracking distinct seconds watched so seeking does not count. Drive through the preview iframe with a minimum on-screen time (default 80% of the drill's duration). "Mark done" unlocks at 80% and says why while disabled. Captions on by default.
- [ ] Score entry: number or 1 to 5 self-rating, per drill.
- [ ] Session summary driven by the `complete_drill` result: XP count-up with breakdown, streak, level progress, challenge progress, badges. Level-up and badge moments.
- [ ] Progress: sessions per week against a target, minutes, streak calendar, score trend per drill, baseline vs now; re-rate prompts on day 14 and day 21.
- [ ] Programs catalogue (filter by sport, measurement group and level) and program detail; enrol; locked states.
- [ ] Account (`/app/account`, board 14): edit profile, notification settings, the leaderboard visibility toggle, sign out, help and enquiry links (WhatsApp) read from config.
- [ ] "Preview as athlete" in the admin builder, now that the session view and player exist.
- [ ] PostHog in the web client; server-side `drill_completed`, `session_completed` and `streak_extended` events emitted from the completion route, carrying the user id only.

**Acceptance.** Every Playwright run below runs at 390 × 844 and at 1440 × 900. A Playwright run takes a new athlete from sign-in through onboarding and a four-drill session and sees +65 XP, a streak of 1 and the first badge, with ledger rows matching the screen. The seeded Arjun completes his session and sees +72 XP, streak 13, and 151 XP to level 8. A paid drill's video reference is absent from every payload until entitled. First load of `/app` is one API round trip.

**Gate.** Demo to the coach. This is the PRD's biggest risk (does it feel like training or homework); collect his reaction before building more.

### Phase 6: Compete, rewards and scheduled jobs

- [ ] Endpoints and services for leaderboards, challenges, badges and rewards (section 7).
- [ ] pg_cron schedules: `leaderboard-refresh` every 5 minutes; `daily-reminder`, `streak-at-risk` and `streak-close` every 15 minutes, each selecting athletes by local time; `challenge-ending` hourly; `rank-day-snapshot` at `30 18 * * *`; `week-rollover` at `30 18 * * 0`; `entitlement-expiry` hourly.
- [ ] `apps/worker`: drain queued `notifications`, enforce the 2-a-day cap and toggles, send through a channel interface (email through Resend is wired now and first used for receipts in phase 7; push arrives in phase 9), mark results, retry with backoff. Deploy it as the scheduled sender chosen in D29.
- [ ] Coin spends: freeze and drill unlock (P0). Frames, vouchers and the real-world redemption queue are phase 10.
- [ ] Web screens (8.1, 8.2): Compete (`/app/compete`, Leaderboard and Challenges segments), Trophy case (`/app/trophies`), Rewards (`/app/rewards`), and the challenge and rank cards on Today, each phone-width first and checked at both widths.
- [ ] `GET /notifications` as the in-app feed, shown on web.
- [ ] Web push: a service worker, an explicit opt-in, subscriptions stored in `push_tokens` (platform `web`), sent by the worker through the same channel interface.
- [ ] Admin: weekly challenge editor (title, target, rewards, badge, schedule next week or repeat) and program challenges on the program page.

**Acceptance.** With the clock moved in tests: a missed day with a freeze keeps the streak and consumes the freeze; without one it resets and keeps best; the at-risk notice is queued at 8 pm local for a qualifying athlete in two different timezones and not for one who trained; a third push in a day is skipped and recorded; a challenge-ending notice is queued 24 hours before the window closes for an athlete who has not finished it; rollover freezes last week's ranks, awards the weekly badges and opens the new challenge. The worker job runs on staging on schedule and its failures raise an alert. On web at both widths, Compete, Trophy case and Rewards render from their endpoints, a freeze bought on Rewards appears on Today, the in-app feed lists a queued notice, and a web push opt-in stores a `push_tokens` row.

### Phase 7: Payments and entitlements on web

- [ ] Razorpay: server-side orders for one-time purchases (a program, a pay-per-view drill) and subscriptions (monthly, quarterly, annual), Checkout on web, webhook route with signature verification on the raw body, events stored in `payment_events` then turned into entitlement grants, extensions and endings. Handle capture, subscription charge, cancellation, halt, refund and dispute events.
- [ ] Entitlement behaviour: grace period on billing failure, ending on refund or chargeback, hourly expiry sweep for anything a webhook missed.
- [ ] Paywall (board 11) and locked-content prompts; the day-4 paywall after the Reset; prices in INR including tax; an email collected at checkout (it is optional at sign-up) for the receipt; GST invoices from Razorpay; purchases and entitlements in Account.
- [ ] Public program page `/programs/[slug]` (board 15): server-rendered, metadata and structured data for search, checkout that verifies the phone by OTP before creating the order (D16).
- [ ] Free tier: Reset program, daily free drill, full gamification.
- [ ] Analytics: `paywall_viewed` from the client, `purchase_completed` from the webhook handler. Paywall variants behind PostHog flags.
- [ ] Landing-page text (hero, modules, coach bio, testimonials, proof numbers) comes from program and config content, not from code, so the coach's real claims replace the prototype's placeholders.

**Acceptance.** In Razorpay test mode: buying a program unlocks it within seconds and on a second device; buying one pay-per-view drill unlocks only that drill; a subscription renews and extends; a cancelled subscription runs to period end and then locks; a refund locks at once. Replaying a webhook changes nothing; delivering two events out of order ends in the right state; a bad signature is refused and logged. No route decides access from anything but `entitlements`.

**Gate. BLOCKER for production only:** the Razorpay account, legal entity and real prices (section 13). Staging uses test keys and test prices.

### Phase 8: Mobile app

Mobile ports from the web app: the same screens, states and flows already built and tested on web, through `packages/api-contract`. Differences are only those in 8.2.

- [ ] `apps/mobile` with Expo Router, a development build (not Expo Go), EAS profiles for development, staging and production, and OTA channels. Minimum OS: Android 9 (API 28) and iOS 16.
- [ ] Native components for the full component list; fonts; both themes; the five motion moments with Reanimated and haptics.
- [ ] Supabase Auth in the Expo client: phone OTP and Google; session in SecureStore; the API takes its access token as a bearer token.
- [ ] All boards 1a to 14, with the tab bar (Home, Train, Compete, Progress, Profile), using `packages/api-contract`. The paywall is built without the payment-method row; purchase buttons are wired in phase 9.
- [ ] Drill player: `react-native-youtube-iframe` and a Drive WebView behind the same provider interface.
- [ ] Offline: a persisted queue of completion events (`client_event_id`, device `completed_at` with offset, score, watch percentage) replayed in order on reconnect. Offline, the summary shows a preview from `packages/game` marked as pending and replaces it with the server result on sync.
- [ ] Empty, loading (skeleton), locked, error and offline states for every list.
- [ ] Sentry and PostHog; the analytics events `drill_completed`, `session_completed`, `streak_extended`, `paywall_viewed`, `purchase_completed`.
- [ ] Pipeline: a merge to `main` publishes an EAS Update to the staging channel; a release tag promotes JavaScript-only changes to production; native changes go through an EAS Build and store review.

**Acceptance.** Maestro flows pass on an Android emulator for onboarding, a full session, leaderboard, rewards spend and sign-out. A session completed in airplane mode syncs on reconnect, credits the day it was done, and is not double-counted when the queue is replayed twice. On a mid-range Android device (4 GB RAM) on 4G, cold start to Home is under 2 seconds and the summary appears under 1 second after the last drill. Text at 200% does not break Home, the drill player or the summary. A parity checklist (every athlete screen and feature in 8.1, each ticked for web and for mobile, with any gap named against an allowed difference in 8.2) is complete and attached to the phase report.

### Phase 9: Store payments and push

- [ ] RevenueCat with Play Billing: offerings mapped to `products` (subscriptions, programs, pay-per-view drills), purchase, restore, and the app-user id set to the EyeQ user id. Webhook route with its auth header check, feeding the same `payment_events` and entitlement code as Razorpay.
- [ ] After a successful purchase the app calls `POST /purchases/refresh` so the unlock does not wait on the webhook.
- [ ] Push: register Expo push tokens, worker sends through the Expo Push API in batches and processes receipts, removes dead tokens. Deep links from each notification to the right screen.
- [ ] Notification settings in Profile.
- [ ] iOS: Sign in with Apple (required alongside Google sign-in), StoreKit through RevenueCat, restore purchases, TestFlight build.
- [ ] No link or mention inside the apps that steers purchases to the web. Re-read both stores' current billing rules for India before submission.

**Acceptance.** In the Play sandbox and App Store sandbox: subscribe, buy a program once, restore on a fresh install, cancel, and refund, each ending in the right entitlement state. A purchase made on web unlocks the app and the reverse. On a real device, the daily reminder, at-risk and challenge-ending pushes arrive, open the right screen, and stop at two a day.

**Gate.** Needs from Karthik: Play Console and Apple developer accounts under the legal entity, a RevenueCat project, store products created in each console.

### Phase 10: Launch + 60 days (P1)

Every athlete-facing P1 feature ships on web and mobile together (ground rule 17); mobile ports from the web build.

- [ ] Account deletion and data export (one function bundling a user's rows as JSON, delivered by a short-lived link).
- [ ] Recommendations from the onboarding profile ("Recommended for you").
- [ ] Paid challenges with their own leaderboard and an entry product; real-world reward requests and the admin redemption queue; profile frames; program discount vouchers issued as single-use promo codes.
- [ ] Weekly recap (push, in-app, email) and share cards (rank, streak, badge) rendered server-side as images, shared to WhatsApp and Instagram with deep links back. The recap's paywall line ("Subscribers trained 2× more") sits behind a flag and is shown only once real data supports it.
- [ ] Credits (pay-per-use packs), promo codes and launch discounts, all editable in admin without a release.
- [ ] Admin game settings (board 17): XP values, caps, multiplier, freeze prices, level-up coins, badge editor, all versioned through `game_config.active_from` and applied from the next day. Show a live preview computed by `packages/game`.
- [ ] Admin dashboard: daily actives, sessions, streak distribution, revenue by channel from `payment_events`, and the PRD's success metrics: weekly training days per active athlete (days with a completed session; target 4+), day-1 activation (sign-ups finishing a session on day 1; 70%), day-30 retention (still training in week 5; 40%), 7-day streak rate in the first month (50%), free-to-paid within 30 days (15%), renewal at the first renewal date (70%), revenue per paying athlete, program completion (50%).
- [ ] Overtaken alerts, at most one a day.

**Acceptance.** Each item has an end-to-end test, on web and on mobile for athlete-facing items. A config change made today leaves today's awards untouched and changes tomorrow's. Deleting an account removes personal data and keeps anonymised ledger totals consistent. The dashboard's revenue matches a sum over `payment_events` for the same period.

### Phase 11: Hardening and launch

- [ ] Production environment deployed from a release tag; custom domain and certificate.
- [ ] Restore drill: point-in-time restore of the production database into a scratch server, verified.
- [ ] Alerts tested by causing each condition on staging.
- [ ] Security pass: dependency audit, headers and CSP (allowing the YouTube, Drive and Razorpay frames), webhook replay, auth rate limits, admin routes, RLS suite re-run against production roles.
- [ ] Load check at ten times the year-3 peak of completions.
- [ ] Accessibility pass on every screen in both themes on a small Android device. Web checked on current Chrome, Safari and Edge.
- [ ] Launch content: a seeded launch-cohort challenge, so the first boards are not empty (a PRD risk mitigation).
- [ ] Copy audit against ground rule 10, including store listings; terms and privacy pages; grievance contact.
- [ ] Store submissions: Android internal testing then production; iOS TestFlight then App Store.
- [ ] Runbook: deploy, roll back a revision, re-run a failed job, replay a webhook, grant access by hand, rebuild caches.

**Acceptance.** A fresh athlete can install from the store, sign in, train, buy and be notified, against production. Rollback to the previous revision takes one command and is rehearsed.

## 10. Requirement traceability

| PRD requirement                                                             | Priority | Phase                             |
| --------------------------------------------------------------------------- | -------- | --------------------------------- |
| Sign up and log in with phone OTP and Google; one account on app and web    | P0       | 2, 8                              |
| Athlete profile                                                             | P0       | 5, 8                              |
| Program catalogue, detail, module and session views                         | P0       | 5, 8                              |
| Drill player: YouTube and Drive, instructions, target, mark done, log score | P0       | 5, 8                              |
| Today's Session from the active program                                     | P0       | 1, 5                              |
| XP ledger with rules and daily cap; levels and rank titles                  | P0       | 1                                 |
| Daily streak with timezone handling, freezes, milestones                    | P0       | 1, 6                              |
| Weekly and all-time leaderboards, global and by sport                       | P0       | 1, 6, 8                           |
| Badges with locked and unlocked states                                      | P0       | 1, 6, 8                           |
| Weekly challenge with progress bar                                          | P0       | 6, 8                              |
| Coins: earn, spend on freezes and drill unlocks                             | P0       | 1, 6, 8                           |
| Progress tab                                                                | P0       | 5, 8                              |
| Subscriptions and one-time purchases through Play, App Store and Razorpay   | P0       | 7, 9                              |
| Unified entitlements across devices; restore purchases                      | P0       | 1, 7, 9                           |
| Free tier and paywall screens                                               | P0       | 7, 8                              |
| Admin: program, module, session and drill builder                           | P0       | 4                                 |
| Admin: athlete list, activity, purchases, streaks; manual grant or revoke   | P0       | 4                                 |
| Push: daily reminder, streak at risk, challenge ending                      | P0       | 6, 9                              |
| Account deletion and data export                                            | P1       | 10                                |
| Recommendations from onboarding profile                                     | P1       | 10                                |
| Paid challenges with own leaderboard; redemption queue                      | P1       | 10                                |
| Weekly recap and shareable cards                                            | P1       | 10                                |
| Credits, promo codes, launch discounts                                      | P1       | 10                                |
| Admin: edit XP rules, badges and challenges without a release               | P1       | 10 (weekly challenge editor in 6) |
| Admin: revenue and engagement dashboard                                     | P1       | 10                                |
| Overtaken alerts; WhatsApp share deep links                                 | P1       | 10                                |
| Leagues, friend challenges, head-to-head                                    | P2       | Not built                         |

Non-functional targets and where they are proven: performance (phase 8 acceptance), offline tolerance (8), ledger correctness (1), webhook retry and availability (7, 11), security and audit (2, 4, 11), privacy and India region (2, 11), accessibility (3, 8, 11), Android 9+ and iOS 16+ (set in 8, exercised in 9), current Chrome, Safari and Edge (11), externalised strings (3), cost (2.5).

## 11. Architecture diagram traceability

| Box or arrow in the architecture diagrams                                                                                              | Implemented as                                          | Phase      |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------- |
| Mobile app (Expo), Android and iOS                                                                                                     | `apps/mobile`                                           | 8, 9       |
| Web app (Next.js), athlete web + /admin                                                                                                | `apps/web`                                              | 3 to 7     |
| Auth: phone OTP, Google, Apple                                                                                                         | Supabase Auth, verified in `apps/web`                   | 2, 9       |
| Postgres: RLS, ledgers, game functions                                                                                                 | Supabase Postgres                                       | 1          |
| Edge Functions: webhooks, video token, push                                                                                            | Webhook and media routes in `apps/web`; `apps/worker`   | 5, 6, 7, 9 |
| pg_cron jobs: leaderboards, streak close                                                                                               | pg_cron on Supabase                                     | 1, 6       |
| RevenueCat to backend by webhook                                                                                                       | `/api/webhooks/revenuecat`                              | 9          |
| Razorpay to backend by webhook                                                                                                         | `/api/webhooks/razorpay`                                | 7          |
| Video: YouTube, Drive; Mux later                                                                                                       | `DrillPlayer` provider interface                        | 5, 8       |
| Expo Push: FCM and APNs                                                                                                                | Worker sends through the Expo Push API                  | 9          |
| PostHog, Sentry                                                                                                                        | SDKs in web, mobile, server, worker                     | 2, 8       |
| App SDKs call third parties directly                                                                                                   | RevenueCat SDK, video players, analytics in the clients | 8, 9       |
| `complete_drill`: drop duplicates, write completion, session and streak, XP with multiplier and cap, user_stats, badges and challenges | Section 6.8                                             | 1          |
| Async jobs: every 5 min leaderboards, local midnight freeze or reset, Mon 00:00 IST rollover                                           | Section 6 and phase 6 schedules                         | 1, 6       |
| Daily reminder, streak at risk, entitlement expiry jobs                                                                                | pg_cron enqueues, worker sends                          | 6, 9       |

## 12. What Karthik needs to provide

| Item                                                                                    | Needed by                      | Note                                                                                            |
| --------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Supabase and Vercel projects, GitHub Actions secrets for the migrate job                | Phase 2                        | Replaces the Azure subscription (section 2 superseded).                                         |
| Google Cloud project: OAuth client; API key for YouTube Data and Drive (link check)     | Phases 2, 4                    |                                                                                                 |
| MSG91 account with DLT registration of the sender ID and OTP template                   | Before real users              | Registration is done by the legal entity and takes time; start early. Staging works without it. |
| Sentry, PostHog (EU cloud), Resend projects                                             | Phases 2, 6                    |                                                                                                 |
| Razorpay account, test keys then live keys                                              | Phase 7; live for production   | Needs the legal entity and KYC.                                                                 |
| Expo account; a Firebase project for Android push credentials (uploaded to EAS)         | Phases 8, 9                    |                                                                                                 |
| The phone number of the first coach or owner                                            | Phase 2                        | For `pnpm admin:grant`.                                                                         |
| Google Play Console, Apple Developer Program, RevenueCat project, store products        | Phase 9                        | Under the legal entity.                                                                         |
| Domain and DNS access                                                                   | Phase 11                       | Hostname for the app and API.                                                                   |
| Content: programs, drill videos on YouTube (unlisted) or Drive, coach bio, testimonials | Phase 5 demo; PRD says week 10 |                                                                                                 |
| Terms, privacy policy, grievance contact                                                | Phase 11                       |                                                                                                 |

## 13. Decisions needed

Claude Code builds the default and moves on unless the row says BLOCKER. "PRD" and "prototype" name which source each side comes from.

| #   | Question                                                                                                                                           | Default built                                                                                                                                                                    | Notes                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D1  | Rank-title bands: PRD says every 5 levels; prototype shows 1 to 3, 4 to 8, 9 to 14, 15 to 20, 21+ (and contradicts itself on level 8)              | PRD bands, held in config                                                                                                                                                        | One-line change later                                                                                          |
| D2  | Badge count: PRD 30, prototype 24 with 12 named                                                                                                    | Seed 17: the 12 named plus streak-milestone badges for days 3, 30, 60, 100 and 365 (days 7 and 14 are already among the named). The other 13 need names and rules from the coach | Badges are data; add in admin. The prototype's 21-day badge is kept as an ordinary badge, not a coin milestone |
| D3  | Subscriber freezes: PRD 1 a week, prototype 2 a month                                                                                              | PRD, held in config                                                                                                                                                              |                                                                                                                |
| D4  | Buying coins: PRD says never; prototype sells a "500 coins" pack                                                                                   | Coins are never sold. The pack on the paywall sells credits and is labelled so                                                                                                   | The PRD's reason is regulatory; do not blur the two currencies                                                 |
| D5  | Paid challenge entry with coins (prototype)                                                                                                        | Off. Entry by purchase or credits                                                                                                                                                | Config flag                                                                                                    |
| D6  | Program trial ("3-day trial", "first 3 days free" in the prototype)                                                                                | Not offered. Free tier is the Reset program plus a daily free drill, as in the PRD                                                                                               | The entitlement model can express a trial if wanted                                                            |
| D7  | Express session of 2 drills that counts for the streak (prototype, at-risk screen)                                                                 | Not built                                                                                                                                                                        | It changes the streak rule; needs a product call                                                               |
| D8  | "Skip drill" link (prototype)                                                                                                                      | Not shown                                                                                                                                                                        | A skipped drill would leave the session incomplete                                                             |
| D9  | Level-gated programs and drills ("Unlocks at Level 9")                                                                                             | Columns exist, nothing gated in seed data                                                                                                                                        |                                                                                                                |
| D10 | "Coach feedback on scores" listed as a Pro benefit (prototype)                                                                                     | Removed from the paywall                                                                                                                                                         | Coach notes are phase 2 in the PRD                                                                             |
| D11 | Under-18 copy: the prototype says a parent confirms the account and purchases; the PRD defers consent flows                                        | Neutral copy that claims nothing the product does not do; minors private on boards by default. **BLOCKER before public launch:** legal sign-off                                  | The 12 to 18 persona is in the launch cohort, so many launch athletes may be hidden from boards by default     |
| D12 | Level thresholds: exact (`round`, prototype shows 2,263) or to the nearest ten (PRD examples)                                                      | Exact; the PRD's figures read as rounded for prose                                                                                                                               |                                                                                                                |
| D13 | Does the daily cap of 400 cover challenge and program-completion XP?                                                                               | No. A 500 XP program reward could never be paid under a 400 cap                                                                                                                  |                                                                                                                |
| D14 | What the streak multiplier applies to                                                                                                              | Drill XP plus session bonus, as in the prototype's own sum; not personal-best XP                                                                                                 |                                                                                                                |
| D15 | Landing-page promises in the prototype: "7-day money-back under 3 sessions", a maintenance plan after day 21, proof numbers ("1,000+ assessments") | Refund line omitted; the rest are content slots the coach fills                                                                                                                  | Business policy and claims the coach must stand behind                                                         |
| D16 | Web checkout from the public page                                                                                                                  | Verify the phone by OTP inline, then create the order                                                                                                                            | The purchase must attach to an account                                                                         |
| D17 | At-risk nudge time: PRD 8 pm; prototype adds "or 90 minutes after the usual session if later"                                                      | 8 pm local                                                                                                                                                                       | Config key reserved                                                                                            |
| D18 | Mirroring Razorpay revenue into RevenueCat (architecture doc)                                                                                      | Revenue by channel comes from `payment_events` in the admin dashboard; mirror only if RevenueCat's API supports external purchases with revenue                                  | Unverified; check their docs                                                                                   |
| D19 | Brand name and hostname (PRD open question)                                                                                                        | "EyeQ by Forge Your Peak", one constant; Vercel default hostname until a domain is chosen                                                                                        | **BLOCKER for store listing**                                                                                  |
| D20 | Does the free tier's daily drill count as the day's session for the streak?                                                                        | Yes; the PRD says free users keep their streak                                                                                                                                   |                                                                                                                |
| D21 | Prices, which programs are subscription or paid entry, sports to tag, rewards budget, legal entity, launch date (PRD open questions)               | Placeholders; publishing a paid program requires a price. **BLOCKER for production payments:** prices and legal entity                                                           |                                                                                                                |
| D22 | Avatars: the PRD lists an avatar on the profile; the prototype uses initials only                                                                  | Initials, with a frame once earned; `avatar_url` stays in the schema                                                                                                             | Photo upload of minors is worth avoiding until consent is settled                                              |
| D23 | A program that is both in the subscription and buyable once (prototype)                                                                            | Supported through the three access fields in 5.2                                                                                                                                 | The architecture's single `access_type` could not express it                                                   |
| D24 | Coins for streak milestones: no source gives amounts                                                                                               | Placeholders 10, 20, 30, 60, 100, 150, 500                                                                                                                                       | Coach to set in admin                                                                                          |
| D25 | What a public board row shows: PRD says display name and avatar only; prototype adds sport and level                                               | Display name, initials, XP level, XP and rank; sport only on the sport board, where it is implied                                                                                | Flip one view to match the prototype                                                                           |
| D26 | Manual "use your streak freeze" with undo (prototype)                                                                                              | Not built. A held freeze applies automatically at local midnight; the at-risk state says so                                                                                      | Same outcome, one less control                                                                                 |
| D27 | City on the profile (prototype)                                                                                                                    | Not collected                                                                                                                                                                    | The PRD asks for minimal personal data                                                                         |
| D28 | Sign-in after the move to Supabase: Better Auth (plan) or Supabase Auth (phone OTP via a Send SMS hook to MSG91, Google, Apple)                    | **Settled (Karthik): Supabase Auth.** Phone OTP and Google now; Apple with iOS                                                                                                   | The API verifies Supabase sessions and still talks to Postgres only as `eyeq_api` / `eyeq_service`             |
| D29 | Scheduled sender on Vercel: Vercel Cron every 5 minutes needs a Pro plan                                                                           | A cron route in `apps/web`; on Hobby, pg_cron + `pg_net` calls it instead                                                                                                        | Decide by phase 6                                                                                              |

## 14. Not built, and the room left for it

| Later item                                        | What is already in place                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| In-app vision and reaction tests                  | The 12 measurement tags on every drill; `score` and `score_direction`; the `DrillPlayer` provider interface can host a native test |
| Protected video host (Mux or Cloudflare Stream)   | `video_provider` already allows it; `get_drill_media` is the single place a signed URL would be issued                             |
| Leagues, seasons, friend challenges, head-to-head | Leaderboards are queries over `xp_ledger`; a new scope is a view, not a migration                                                  |
| Age-band boards                                   | `age_band` scope in `leaderboard_weekly`                                                                                           |
| Parental consent, DPDP records                    | `dob` captured, `is_minor` derived, visibility default; a consent record attaches to the profile                                   |
| Tamil and Hindi                                   | Strings externalised from phase 3                                                                                                  |
| Bundles, referrals, family plans, gifting         | `products` and `entitlements` are channel-neutral                                                                                  |
| Higher availability, CDN, Redis leaderboards      | Tier change on the database; Front Door in front of Blob and the app; neither is needed below 5,000 athletes                       |
