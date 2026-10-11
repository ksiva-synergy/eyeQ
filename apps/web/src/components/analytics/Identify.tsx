"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/** Ties this browser's events to the athlete's id, and nothing else about them (rule 11). */
export function Identify({ userId }: { userId: string }) {
  useEffect(() => {
    if (!posthog.__loaded) return;
    if (posthog.get_distinct_id() !== userId) posthog.identify(userId);
  }, [userId]);
  return null;
}
