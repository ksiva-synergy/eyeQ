# EyeQ: rules for working in this repo

EyeQ is a mobile-first, gamified vision-training app for athletes by Forge Your Peak. The working plan is `EYEQ_BUILD_PLAN.md` at the repo root: read it before changing anything, tick its task boxes as they land, and record anything it does not settle in `DECISIONS.md`. Design reference: `docs/design/` (tokens, component specs, board markup). Product sources: `docs/product/` (added before phase 4).

Order of authority when sources disagree: the PRD decides rules, numbers and scope; the prototype decides look, layout, copy tone and motion; the plan decides infrastructure, build order and the default for each known conflict (plan section 13).

Hosting is **Supabase (Postgres) + Vercel (`apps/web`)** with **Prisma** as the data-access layer; plan section 2.0 overrides the Azure text elsewhere in the plan, which is superseded until further notice. Sign-in is **Supabase Auth** (D28).

## Ground rules (plan section 4)

These hold in every phase.

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
14. **Check third-party docs before writing integration code.** Razorpay, RevenueCat, Supabase Auth, Expo, MSG91, Supabase, Vercel and Prisma APIs change; the plan names what to build, not exact event names or SDK calls.
15. **A phase is done when its acceptance checks pass in CI**, not when the code is written.
16. **Strings go through `packages/i18n`.** No hard-coded user-facing text in components.
17. **Web and mobile are at parity.** Every athlete screen and feature exists on both clients. A feature is not done until both have it, or the phase report names the client missing it. The only allowed differences are in plan section 8.2: payments, restore purchases, reminders, offline queue, haptics, share sheet.

## Working conventions

- **Phases.** One phase at a time (plan section 9). At the end of each, run its acceptance checks, report what passed and what did not, and stop for a go-ahead. Build the plan's default for every open decision and log it in `DECISIONS.md`; stop and ask only for items marked BLOCKER in plan section 13.
- **Layout.** pnpm workspaces + Turborepo. `apps/web` (Next.js, App Router, `output: 'standalone'`), `apps/worker` (scheduled sender), `apps/mobile` (Expo, phase 8), `packages/*` (`ui`, `game`, `db`, `api-contract`, `i18n`, `config`), `db/` (SQL migrations, pgTAP tests, seed), `docker/`, `supabase/` (CLI config for the Supabase-image local database only).
- **Next.js version.** This repo is on Next.js 16, which differs from older training data. Read `apps/web/node_modules/next/dist/docs/` before writing framework code, and heed deprecation notices.
- **Database.** db scripts accept `.env` or exported variables and use `DIRECT_URL`, else `DATABASE_URL`. `packages/db/src/target.ts` refuses `db:reset` and `db:test` off a local database, `db:seed` on a remote one without `ALLOW_REMOTE_SEED=1`, and anything through the transaction pooler (6543). With a hosted `.env`, run local commands as `DIRECT_URL= DATABASE_URL=postgres://postgres:postgres@localhost:5432/eyeq pnpm db:test`. Plain SQL migrations in `db/migrations/NNNN_snake_case.sql`, applied by `pnpm db:migrate` (the runner in `packages/db/src/migrate.ts`). Tests are pgTAP files in `db/tests`, run by `pnpm db:test`, each rolled back.
- **Prisma.** Client only, never a schema tool: no `prisma migrate`, no `db push`, no `supabase/migrations`. After a migration, `pnpm db:types` introspects the plain Postgres database (it refuses a Supabase one) into `packages/db/prisma/schema.prisma` (commit it; CI checks drift) and regenerates the gitignored client. Never hand-edit the models. Athlete queries go through `asAthlete()` from `@eyeq/db`; SQL functions are called with `$queryRaw`.
- **Local stack.** `pnpm db:up` starts Postgres (pg_cron, pgTAP) and Azurite from `docker/compose.yaml`. `pnpm db:supabase:up` starts the Supabase Postgres image on port 55322 for parity checks (CI runs the suite on both); `pnpm supabase:up` adds Supabase Auth and the Data API gateway for signing in locally (test number `+919000000001`, code `123456`; `pnpm supabase:status` gives `SUPABASE_URL` and the anon key). Copy `.env.example` to `.env`. `pnpm db:reset && pnpm db:seed` gives the demo content and athletes (Arjun R. and the boards); the seed refuses to run twice because ledgers are append-only.
- **Database tests.** `pnpm db:test` runs pgTAP; each file is a `pg_temp.t()` plpgsql function, rolled back, with fixtures from `db/tests/_fixtures.sql` and the shared vectors in `test_vectors`. `pnpm db:test:integration` runs the multi-connection vitest tests. Game functions take `p_at`/`p_received_at` so tests move the clock by argument, never by waiting.
- **Engine shape.** Public functions (`complete_drill`, `home_payload`, ...) read the athlete from `app.user_id`; internal `*_for(p_user_id, ...)` functions take it explicitly and are granted to `eyeq_service` only. All are `SECURITY DEFINER` owned by `eyeq_owner`.
- **Checks before pushing.** `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm db:test && pnpm --filter web build`. CI (`.github/workflows/pr.yml`) runs the same plus the Prisma drift check, the suite on the Supabase image, Playwright and the Docker image build.
- **Auth.** Supabase Auth on the server only (`apps/web/src/server/auth`); `/api/v1` routes are `apiRoute()` from `src/server/api/pipeline.ts`, which verifies the session, rate-limits, validates with `packages/api-contract`, and runs the handler in one `asAthlete()` transaction as `eyeq_api`. The first coach or owner is made with `pnpm admin:grant <phone> <coach|owner>` after they sign in once.
- **Default libraries** are in plan section 3; change one only with a line in `DECISIONS.md`.
- **Money** is integer paise; timestamps are `timestamptz`; ids are UUIDs. pg_cron schedules are UTC (Monday 00:00 IST is `30 18 * * 0`).
- **Commits.** Small, descriptive, one concern each. Never commit `.env`, secrets, or the 7.7 MB prototype bundle.
