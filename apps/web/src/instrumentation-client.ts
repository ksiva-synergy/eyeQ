import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { stripUrlQueries } from "@/lib/posthog-before-send";

/**
 * Sentry in the browser. The DSN is public by design (it can only submit events), so it
 * is a NEXT_PUBLIC_ value; no secret is ever NEXT_PUBLIC_ (ground rule 12).
 */
const dsn = process.env["NEXT_PUBLIC_SENTRY_DSN"];
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env["NEXT_PUBLIC_APP_ENV"] ?? "local",
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

/**
 * PostHog in the browser (plan phase 5). The project key is public by design, like the
 * DSN. Ground rule 11: events carry the user id and nothing else personal, so there is no
 * autocapture (it reads text off the page, names included), no session recording and no
 * person properties; only page views, web vitals (switched on in the PostHog project:
 * timings and the URL) and the events the app names (paywall_viewed, phase 7). Skipped
 * without the key.
 */
const posthogKey = process.env["NEXT_PUBLIC_POSTHOG_KEY"];
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "https://eu.i.posthog.com",
    autocapture: false,
    capture_pageview: "history_change",
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
    mask_all_text: true,
    mask_all_element_attributes: true,
    // No first-touch referrer or campaign params on the person; URLs lose query and hash.
    save_referrer: false,
    save_campaign_params: false,
    before_send: stripUrlQueries,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
