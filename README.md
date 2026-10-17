# EyeQ

**Train the eyes behind the game.** EyeQ is a mobile-first, gamified vision-training app for athletes, from Forge Your Peak. Short, coach-led drill sessions every day, with the XP, streaks, badges and leaderboards that make you want to come back tomorrow.

_Test · Train · Transform._ EyeQ is a training tool, not a clinical one: it does not test, diagnose or measure eyesight or eye health.

---

- [1. What EyeQ does](#1-what-eyeq-does)
- [2. How it is built](#2-how-it-is-built)
- [3. Running it](#3-running-it)

---

## 1. What EyeQ does

Fast bowlers, batters, keepers, shuttlers and strikers all play on what they see and how quickly they react to it. EyeQ turns that into a daily habit: open the app, play today's session of three or four short drill videos from your coach, log your score, and watch your progress build.

### For athletes

**A session waiting for you every day.** Today's Session is ready when you open the app. It comes from the program you're enrolled in, or from a rotating free drill, and fits into 10, 15 or 20 minutes.

**Coach-led drill videos.** Every drill is a short video with clear instructions, a target (reps, seconds, or a score to beat) and captions on by default. "Mark done" unlocks once you've actually watched it, and skipping ahead doesn't count.

**Rewards that feel earned.**

- **XP** for every drill, a bonus for finishing the session, and extra for a personal best.
- **Streaks** that grow every day you train, with a **multiplier** that lifts your XP by 10% for every full week, up to +50%.
- **Streak freezes** that cover a missed day automatically, so one busy day doesn't wipe out a month.
- **Levels and rank titles** from Rookie through Prospect, Contender and Elite to Peak.
- **Badges** in four families (consistency, volume, mastery, community). Locked badges tell you how to earn them and how close you are.
- **Coins** you earn from milestones, level-ups and challenges, and spend on freezes or extra drills.

**Moments worth celebrating.** Level-ups, badge unlocks, streak milestones and rank changes each get a short full-screen moment. You can skip them, and they respect reduced-motion settings.

**Compete.** Weekly and all-time leaderboards, overall and by sport, with your own row always pinned, the XP gap to the athlete above you and how far you've moved today. A new weekly challenge every Monday, plus challenges tied to each program.

**See your progress.** Sessions per week against your target, minutes trained, a streak calendar, score trends for every drill, and a "baseline vs now" view built from your own self-ratings, with re-rate prompts on days 14 and 21.

**Programs for your sport.** Browse by sport, measurement group (vision, reaction, cognition) and level. Programs run from the free 3-Day Reset to multi-week programs like Cricket Vision Foundations, Reaction Edge and Focus Under Pressure, with modules that unlock as you go.

**Reminders that stay out of your way.** A daily reminder at your chosen time, a nudge at 8 pm if your streak is at risk, and a heads-up before a challenge closes. Never more than two a day, each with its own switch, plus an in-app feed so nothing depends on push alone.

**Phone to desktop.** The web app has every athlete screen: a phone layout with a bottom tab bar, and a desktop layout with side navigation and roomier cards. The native Android and iOS apps are next on the roadmap.

**Privacy by default.** Public boards show only your display name, initials, level, XP and rank. Minors start private. You can leave the leaderboard any time.

**Free to start, Pro when you're ready.** The 3-Day Reset, a daily free drill and the full game (XP, streaks, badges, boards) cost nothing. Pro comes monthly, quarterly or annually; a single program or one pay-per-view drill can be bought on its own. Pay by UPI, card or net banking, with prices in rupees including tax. A purchase opens within seconds and on every device you sign in on, and Account lists your purchases, what they unlock, when Pro renews, and lets you cancel at period end.

**Programs you can share.** Every program has a public page at `/programs/<slug>` with its modules, the coach's bio and what athletes say, built for search, with checkout that verifies your phone first.

### For coaches

**A program builder that keeps up with you.** Drag and drop modules, sessions and drills. Paste a batch of YouTube or Google Drive links at once, reuse a drill across programs and see everywhere it's used, duplicate sessions, and preview any session exactly as an athlete sees it.

**Publish with confidence.** Every video link is checked when you save (does it exist, can it be embedded, is it shared correctly), and a program won't publish with a broken drill or an unpriced paid tier.

**Know your athletes.** Search and filter your roster by plan, streak and last activity. Open any athlete for their activity timeline, purchases and access, grant or revoke access by hand, and export to CSV. Phone numbers stay masked.

**Run the game.** Write weekly challenges (title, target, coin and badge rewards, schedule next week or repeat) and challenges tied to a program, and manage the products you sell and their prices. Payments that need a look, such as a partial refund or an open dispute, are flagged for review. Every admin change is recorded in an audit log.

### Where it stands

Built, merged and deployed to staging (`eyeq-nu.vercel.app`, Vercel and Supabase in Mumbai):

| Phase | What it delivered                                                                                                                                                                  | Status                                                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0–2   | Monorepo, local stack, schema and game engine, Supabase sign-in (phone OTP, Google), `/api/v1`                                                                                     | Done                                                                                                                                    |
| 3–5   | Design system, web shell, coach admin and program builder, the athlete daily loop                                                                                                  | Done                                                                                                                                    |
| 6     | Compete, rewards and scheduled jobs: leaderboards, challenges, trophy case, coin spends, rank-change moment, pg_cron schedules, the notification dispatcher, in-app feed, web push | Done; staging acceptance passed 17 Oct 2026                                                                                             |
| 7     | Payments on web: Razorpay orders and subscriptions, webhooks into entitlements, paywall, public program pages, receipts, purchases in Account                                      | Done in CI (Razorpay test mode); staging run in test mode under way; production blocked on the legal entity, KYC, GSTIN and real prices |

**Phase 6, in more detail.**

- Weekly and all-time leaderboards, overall and by sport, refreshed every 5 minutes, with the pinned own row naming the athletes just above and below.
- Weekly challenges (opened every Monday 00:00 IST by `week-rollover`, which also freezes last week's ranks and awards the weekly badges) and program challenges.
- Trophy case, Rewards with coin spends (a streak freeze, unlocking a drill), the rank-change moment, and challenge and rank cards on Today.
- pg_cron jobs: `leaderboard-refresh`, `daily-reminder`, `streak-at-risk` and `streak-close` (each by the athlete's local time), `challenge-ending`, `rank-day-snapshot`, `week-rollover` and `entitlement-expiry`.
- A dispatcher at `/api/cron/dispatch` (Vercel Cron, every 5 minutes, behind the cron secret) drains the notification outbox in batches, enforces the two-a-day cap and per-kind toggles, retries with backoff, and never sends a row twice when runs overlap. Failed runs show in Vercel's logs and in Sentry.
- An in-app notification feed, and web push (VAPID, service worker, opt-in from Profile) verified reaching desktop Chrome on staging.

**Phase 7, in more detail.**

- Razorpay Checkout limited to UPI, cards and net banking. The server prices every order from the `products` table; the browser never sends an amount.
- One-time purchases (a program, a pay-per-view drill) and subscriptions (monthly, quarterly, annual), with Razorpay plans created from a GitHub Actions workflow.
- A purchase is granted by whichever arrives first: the browser's signed refresh or the webhook. Webhooks are signature-checked on the raw body, stored once per event id, answered at once and processed after the response; a 5-minute sweep (`/api/cron/payments`) picks up anything left.
- Subscription state is re-read from Razorpay on every event, so out-of-order events cannot move it backwards: grace while a charge retries, cancel at period end, end on halt. A full refund or a lost dispute locks at once; a failed refund gives access back; partial refunds and disputes are flagged for the coach.
- The paywall (with the day-4 prompt after the Reset and variants behind PostHog flags), locked-content prompts, public program pages with search metadata and structured data, receipts by email, and purchases and entitlements in Account.
- Analytics: `paywall_viewed` from the browser, `purchase_completed` from the webhook handler.
- Outside production every response carries `noindex`. Setup and the staging checks are in [`docs/payments.md`](docs/payments.md).

### What's next

1. **Native Android and iOS apps** (phase 8) at full parity with the web, with offline training that syncs when you reconnect.
2. **Store billing and native push** (phase 9), through RevenueCat and Expo Push into the same entitlements and dispatcher.
3. **Launch + 60 days.** Share cards, weekly recaps, personalised recommendations, paid challenges, promo codes, profile frames, an admin dashboard with live game tuning, data export and account deletion.

---

## 2. How it is built

### Architecture at a glance

```
 CLIENTS                      VERCEL (Mumbai)                           THIRD PARTIES
┌──────────────────┐ HTTPS ┌──────────────────────────────────────┐
│ Web app (Next.js)│──────▶│ apps/web                             │── SMS ───▶ MSG91 (OTP)
│ phone to desktop │       │  pages     public, /app, /admin      │── email ─▶ Resend
├──────────────────┤       │  /api/v1   typed athlete API         │── push ──▶ Web Push, Expo Push
│ Mobile (Expo)    │──────▶│  /api/admin coach API                │◀─ hooks ─ Razorpay, RevenueCat
│ coming           │       │  /api/webhooks/razorpay              │
└──────────────────┘       │  /api/cron/dispatch  every 5 minutes │
                           │  /api/cron/payments  every 5 minutes │── errors ▶ Sentry
                           │                                      │── events ▶ PostHog
                           └──────────────────┬───────────────────┘
                                              │ one transaction per request
                                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ SUPABASE (Mumbai)                                                        │
│  Auth      phone OTP, Google; OTP delivered through our send-SMS hook   │
│  Postgres  the game engine: ledgers, rules, entitlements, RLS            │
│  pg_cron   leaderboards, streak close, week rollover, expiry, outbox     │
│  Storage   covers, badges, uploads                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

Two managed platforms, no servers to run, TypeScript end to end, and hosting that comes to about US$50 a month at launch.

### The ideas that shape it

**Postgres is the game engine.** XP, levels, streaks, freezes, coins, badges, challenges, leaderboards and access are all decided inside Postgres functions. A drill completion is one call, `complete_drill`, which in a single all-or-nothing transaction records the completion, closes the session, recomputes the streak, writes XP with the daily cap and multiplier, levels up, awards badges and coins, advances the program and returns one result object. Clients only render that object. The celebration screen animates the server's numbers, never its own sums, so no client can mint XP.

**Ledgers, not counters.** XP, coins, credits, freezes, entitlement changes and admin actions are append-only ledgers, enforced with privileges and triggers. A correction is a new row. Balances and leaderboards are caches with rebuild functions, and tests prove a rebuild matches the cache.

**Facts over increments.** Streaks are always recomputed from session completions and the freeze ledger. A session that syncs late (accepted up to 48 hours after it happened) can refund a freeze or restore a reset streak correctly.

**Rules live in data and are tested twice.** Every value (XP per drill, session bonus, cap, multiplier steps, level curve `round(100 × n^1.5)`, freeze price, rank bands) sits in `game_config` with an `active_from` date, so rules can change without a release. The same rules exist in SQL and in `packages/game` (TypeScript, for previews and offline), and both run the same JSON test vectors.

**Access means entitlements.** Content access is checked against our own `entitlements` table, never by asking a payment provider. Play, App Store, Razorpay, coins and coach grants all feed the same table, and every change to it writes an `entitlement_events` row. Paid video references never appear in list or detail payloads; they leave only through `get_drill_media` after an access check.

**Defence in depth.** `/api/v1` is our own versioned API, so older store builds keep working. Supabase's public Data API is closed, with a test proving the anon key can read no table and call no function. Each request runs in one transaction as a least-privilege database role, with `app.user_id` set transaction-locally, and row-level security catches a mistake even when service code is wrong. Every mutating call is idempotent, keyed by `client_event_id` or the provider's event id.

**Built for everyone.** 44 pt touch targets, layouts that survive 200% text, state never shown by colour alone, reduced motion honoured, captions on by default, and automated axe checks in CI. All copy goes through `packages/i18n`, ready for Tamil and Hindi.

### Technical choices

| Area          | Choice                                                                           | Why                                                                                       |
| ------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces + Turborepo                                                      | Shared contract, rules, tokens and strings across web, mobile and the database            |
| Web           | Next.js 16 (App Router), React 19, Tailwind CSS 4                                | Server components call services directly; one deploy holds pages, API, webhooks and cron  |
| Mobile (next) | Expo + Expo Router, Reanimated                                                   | One TypeScript stack; OTA updates through EAS                                             |
| Database      | Supabase Postgres in Mumbai, pg_cron, pgTAP                                      | Transactions, RLS and scheduled SQL in one place, close to Indian athletes                |
| Data access   | Prisma 7 (client only, introspected) + `pg` adapter; SQL via `$queryRaw`         | Typed models with drift checks in CI, while plain SQL migrations stay the source of truth |
| Migrations    | Plain forward-only SQL with a small runner                                       | Reviewable, reproducible, never edited once applied; run from GitHub Actions, not laptops |
| Auth          | Supabase Auth: phone OTP and Google (Apple on iOS)                               | Managed sessions; OTP sent through MSG91 via the Send SMS hook                            |
| Contract      | zod schemas in `packages/api-contract`                                           | One source of request and response types for server, web and mobile                       |
| Hosting       | Vercel (`bom1`), Vercel Cron every 5 minutes (dispatcher, payment sweep)         | No servers; the dispatcher drains a notification outbox safely across overlapping runs    |
| Payments      | Razorpay on web (live in test mode); RevenueCat for Play and App Store next      | UPI, cards and net banking on web; store billing in-app; all feed one entitlements table  |
| Messaging     | Web Push (VAPID) and Resend now; Expo Push with the apps                         | One channel interface, daily cap and per-kind toggles enforced centrally                  |
| Video         | YouTube IFrame API and Google Drive embeds, behind a provider interface          | Coaches publish from tools they already use; room for Mux later                           |
| Observability | Sentry (source maps uploaded at build), PostHog (events, flags), structured logs | Each wired behind its environment variable and skipped cleanly when absent                |
| Tests         | Vitest, pgTAP, Playwright with axe                                               | Rules, database behaviour, signed-in end-to-end flows and accessibility, all in CI        |

### Integrations

| Service                | What EyeQ uses it for                                                                                 | State                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Supabase Auth          | Phone OTP and Google sign-in; sessions verified on the server only                                    | Live; staging signs in with Supabase test numbers, Google not yet enabled there      |
| MSG91                  | OTP SMS, sent from our Send SMS hook (`/api/auth/sms-hook`)                                           | Wired                                                                                |
| Supabase Postgres      | The game engine, ledgers, entitlements, RLS; pg_cron for the scheduled jobs                           | Live, Mumbai                                                                         |
| Supabase Storage       | Program covers, badge art, coach uploads                                                              | Live                                                                                 |
| Vercel                 | Hosting for `apps/web` in `bom1`; Vercel Cron for the dispatcher and the payment sweep                | Live (staging behind Vercel Authentication)                                          |
| Razorpay               | Orders, subscriptions, Checkout, webhooks, refunds and disputes; GST invoices from the Dashboard      | Built and tested in test mode; live keys wait on the legal entity, KYC and prices    |
| Web Push (VAPID/FCM)   | Reminders, streak-at-risk and challenge-ending notices to subscribed browsers                         | Live, verified on desktop Chrome                                                     |
| Resend                 | Payment receipts; the channel any email notice uses                                                   | Wired; without a key receipts are recorded and held, and Sentry is told once an hour |
| Sentry                 | Server and browser errors, error boundaries, cron failures, rejected webhook signatures               | Live, with source maps                                                               |
| PostHog                | Product analytics (user id only), server events from completions and purchases, paywall variant flags | Live                                                                                 |
| YouTube / Google Drive | Drill video, with link checks when a coach saves                                                      | Live                                                                                 |
| GitHub Actions         | PR checks, staging migrations with a post-deploy smoke test, demo refresh, Razorpay plan sync         | Live                                                                                 |
| RevenueCat, Expo Push  | Store billing and native push for the apps                                                            | Phase 9                                                                              |

### Repository layout

```
apps/
  web/              Next.js: public pages, athlete app (/app), coach admin (/admin),
                    /api/v1, /api/admin, auth hook, Razorpay webhook, cron routes
packages/
  game/             XP, level and streak rules in TypeScript; shared JSON vectors
  db/               Prisma client, asAthlete(), migration runner, seed, admin:grant
  api-contract/     zod schemas and types for every request and response
  ui/               design tokens, Tailwind theme, icons, web components
  i18n/             typed English message catalogue
  config/           shared eslint and tsconfig
db/
  migrations/       NNNN_snake_case.sql, forward only
  tests/            pgTAP suites, each rolled back
  seed/             game_config defaults, demo programs, drills, badges and athletes
docker/             local Postgres image (pg_cron, pgTAP)
supabase/           Supabase CLI config for the local Auth and Data API stack
docs/design/        design tokens, component specs and the prototype boards
docs/payments.md    Razorpay setup, the webhook, GST, staging acceptance
```

Working documents: [`EYEQ_BUILD_PLAN.md`](EYEQ_BUILD_PLAN.md) (phases, rules and acceptance checks), [`DECISIONS.md`](DECISIONS.md) (every decision the plan left open) and [`CLAUDE.md`](CLAUDE.md) (ground rules for contributors).

---

## 3. Running it

### Prerequisites

- Node.js 22 or later and pnpm 10 (`corepack enable`)
- Docker, for the local Postgres
- The Supabase CLI (installed as a dev dependency) if you want to sign in locally

### First run

```bash
pnpm install
cp .env.example .env            # local defaults; fill in keys only for the services you use

pnpm db:up                      # Postgres with pg_cron and pgTAP, from docker/compose.yaml
pnpm db:reset                   # empty database with every migration applied
pnpm db:seed                    # demo programs, drills, badges and athletes (runs once)
pnpm dev                        # http://localhost:3000
```

The seed reproduces the prototype: four programs, the 12 measurement tags, 17 badges, the reward catalogue, a weekly challenge and about 25 athletes, including Arjun R. (level 7, 12-day streak, 2,040 XP). Ledgers are append-only, so the seed refuses to run twice. Run `pnpm db:reset` first, or use `pnpm demo:refresh` to bring the demo activity up to yesterday.

### Signing in locally

```bash
pnpm supabase:up                # Supabase Auth and the gateway on top of the local stack
pnpm supabase:status            # prints SUPABASE_URL and the anon key for .env
```

Sign in at `/sign-in` with the test number `+919000000001` and the code `123456`. OTP messages are printed to the console locally. To open the coach admin, sign in once, then:

```bash
pnpm admin:grant +919000000001 owner     # or coach
```

### Everyday commands

| Command                    | What it does                                                                 |
| -------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                 | Run the web app                                                              |
| `pnpm db:migrate`          | Apply new migrations                                                         |
| `pnpm db:types`            | Introspect the local database into `schema.prisma` and regenerate the client |
| `pnpm db:test`             | pgTAP suites (each file rolled back)                                         |
| `pnpm db:test:integration` | Multi-connection integration tests (concurrency, RLS, idempotency)           |
| `pnpm test`                | Vitest across the workspace, including the shared rule vectors               |
| `pnpm test:e2e`            | Playwright end-to-end and accessibility runs                                 |
| `pnpm db:supabase:up`      | Supabase's Postgres image on port 55322, for parity checks                   |
| `pnpm demo:refresh`        | Append fresh demo activity ending yesterday                                  |

### Before you push

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm db:test && pnpm --filter web build
```

CI (`.github/workflows/pr.yml`) runs the same, plus the Prisma drift check, the database suite on both plain Postgres and the Supabase image, the signed-in Supabase stack tests and Playwright. Merges to `main` run migrations against staging from GitHub Actions (`migrate.yml`), then wait for Vercel's deployment of that commit and smoke-test it: health checks and a real phone sign-in through to `GET /api/v1/me`. Two manual workflows run against staging from Actions, so no laptop holds its database URL: `demo-refresh.yml` and `razorpay-sync-plans.yml` (dry run unless `apply` is ticked).

### Database safety rails

The db scripts read `DIRECT_URL`, falling back to `DATABASE_URL`, from `.env` or the environment. They refuse to run `db:reset` or `db:test` against anything but a local database, refuse `db:seed` on a remote one without `ALLOW_REMOTE_SEED=1`, and refuse anything through the transaction pooler (port 6543). If your `.env` points at a hosted project, pin local runs explicitly:

```bash
DIRECT_URL= DATABASE_URL=postgres://postgres:postgres@localhost:5432/eyeq pnpm db:test
```

### Changing the schema or the rules

- **Schema:** add `db/migrations/NNNN_snake_case.sql`, run `pnpm db:migrate`, then `pnpm db:types`, and commit the updated `schema.prisma`. Never edit an applied migration, and never use `prisma migrate` or `db push`.
- **Game rules:** change the value in `game_config` (seeded from `db/seed`), update both the SQL function and `packages/game`, and add or adjust the JSON vectors in the same pull request.
- **Strings:** add them to `packages/i18n`; components never hard-code user-facing text.

### Configuration

Every variable is listed in [`.env.example`](.env.example), grouped by service: database URLs and roles, Supabase, the SMS hook, Google (link checks), Razorpay, RevenueCat, cron and VAPID keys, Resend, Sentry and PostHog. Secrets stay server-side: locally in `.env`, and as sensitive environment variables on Vercel or GitHub Actions secrets. Nothing secret ever carries a `NEXT_PUBLIC_` prefix.

---

© Forge Your Peak. EyeQ is a training and engagement tool. It is not a medical device and makes no clinical claims.
