"use client";

import { useEffect, useRef } from "react";
import type { ProviderProps } from "./provider";
import { WatchCounter } from "./watched";

/** The slice of the YouTube IFrame Player API this player uses. */
type YTPlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onError?: () => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { PLAYING: number };
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("YouTube IFrame API did not load"));
    };
    document.head.append(s);
  });
  return loading;
}

/**
 * YouTube through the IFrame Player API (privacy-enhanced host). Watched means distinct
 * seconds actually played: each whole second the playhead passes while playing is counted
 * once, so seeking ahead or replaying a part does not add to it (WatchCounter). Captions on by default
 * (cc_load_policy = 1, ground rule 13).
 */
export function YouTubeVideo({ media, title, onProgress, onError }: ProviderProps) {
  const host = useRef<HTMLDivElement>(null);
  const report = useRef(onProgress);
  const fail = useRef(onError);
  useEffect(() => {
    report.current = onProgress;
    fail.current = onError;
  });

  useEffect(() => {
    let player: YTPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    const watched = new WatchCounter();
    loadApi()
      .then((YT) => {
        if (cancelled || !host.current) return;
        const mount = document.createElement("div");
        host.current.append(mount);
        player = new YT.Player(mount, {
          videoId: media.ref,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            cc_load_policy: 1,
            cc_lang_pref: "en",
          },
          events: {
            onReady: () => {
              host.current?.querySelector("iframe")?.setAttribute("title", title);
              timer = setInterval(() => {
                if (!player) return;
                const total = player.getDuration();
                const now = player.getCurrentTime();
                watched.sample(
                  now,
                  performance.now(),
                  player.getPlayerState() === YT.PlayerState.PLAYING,
                );
                report.current({
                  fraction: watched.fraction(total),
                  elapsedS: now,
                  totalS: total,
                });
              }, 250);
            },
            onError: () => fail.current(),
          },
        });
      })
      .catch(() => fail.current());
    return () => {
      cancelled = true;
      clearInterval(timer);
      player?.destroy();
    };
  }, [media.ref, title]);

  return <div ref={host} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />;
}
