"use client";

import { useEffect, useRef } from "react";
import { drivePreviewUrl, type ProviderProps } from "./provider";

/**
 * Google Drive through its preview iframe, which reports nothing back. Watched means time
 * on screen: each second the frame is at least half visible in a visible tab counts, and
 * the drill's own length is the whole (plan phase 5: a minimum on-screen time of 80 % of
 * the drill's duration, the same done threshold as YouTube).
 */
export function DriveVideo({ media, title, drillSeconds, onProgress }: ProviderProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  });

  useEffect(() => {
    let onScreen = false;
    let seconds = 0;
    const el = frame.current;
    const io = new IntersectionObserver(([e]) => (onScreen = (e?.intersectionRatio ?? 0) >= 0.5), {
      threshold: [0, 0.5, 1],
    });
    if (el) io.observe(el);
    const total = Math.max(1, drillSeconds);
    const timer = setInterval(() => {
      if (onScreen && document.visibilityState === "visible") seconds += 1;
      report.current({ fraction: Math.min(1, seconds / total), elapsedS: seconds, totalS: total });
    }, 1000);
    return () => {
      clearInterval(timer);
      io.disconnect();
    };
  }, [media.ref, drillSeconds]);

  return (
    <iframe
      ref={frame}
      src={drivePreviewUrl(media.ref)}
      title={title}
      allow="autoplay; fullscreen"
      allowFullScreen
      className="absolute inset-0 h-full w-full border-0"
    />
  );
}
