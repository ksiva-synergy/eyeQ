"use client";

import { useEffect, useState } from "react";

/**
 * Time left until the streak's day ends (board 13a), as h:mm, ticking once a second. The
 * server gives the end instant (streak.endsAt, the athlete's next local midnight).
 */
export function Countdown({ to, label }: { to: string; label: string }) {
  const end = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const left = Math.max(0, end - (now ?? end));
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const text = now === null ? "" : `${h}:${String(m).padStart(2, "0")}`;
  return (
    <span className="flex shrink-0 flex-col items-end">
      <span className="sr-only">{label} </span>
      <span
        className="font-display text-[1.625rem] leading-none font-bold text-streak-text tabular-nums"
        aria-live="off"
      >
        {text}
      </span>
    </span>
  );
}
