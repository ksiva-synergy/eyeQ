"use client";

import { useState } from "react";
import type { DrillMedia } from "@eyeq/api-contract";
import { t } from "@eyeq/i18n";
import { Chip, Spinner, cx } from "@eyeq/ui/web";
import { DriveVideo } from "./DriveVideo";
import type { ProviderProps, WatchProgress } from "./provider";
import { YouTubeVideo } from "./YouTubeVideo";

const PROVIDERS: Partial<Record<DrillMedia["provider"], (p: ProviderProps) => React.ReactNode>> = {
  youtube: YouTubeVideo,
  drive: DriveVideo,
};

function clock(s: number): string {
  const whole = Math.max(0, Math.floor(s));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * The drill's 16:9 stage (board 3; COMPONENTS 3.14): a poster with Play until the athlete
 * starts, then the provider for the drill's host. The video reference is fetched only on
 * Play, through GET /drills/:id/media and its entitlement check (rule 5).
 */
export function DrillVideo({
  title,
  drillSeconds,
  loadMedia,
  progress,
  onProgress,
  watched,
}: {
  title: string;
  drillSeconds: number;
  loadMedia: () => Promise<DrillMedia | null>;
  progress: WatchProgress | null;
  onProgress: (p: WatchProgress) => void;
  watched: boolean;
}) {
  const [stage, setStage] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [media, setMedia] = useState<DrillMedia | null>(null);

  async function play() {
    setStage("loading");
    const m = await loadMedia();
    if (!m || !PROVIDERS[m.provider]) {
      setStage("error");
      return;
    }
    setMedia(m);
    setStage("playing");
  }

  const Provider = media ? PROVIDERS[media.provider] : undefined;
  const pct = Math.round((progress?.fraction ?? 0) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative isolate aspect-video overflow-hidden rounded-card-s border border-border bg-surface-1">
        {stage === "playing" && media && Provider ? (
          <Provider
            media={media}
            title={title}
            drillSeconds={drillSeconds}
            onProgress={onProgress}
            onError={() => setStage("error")}
          />
        ) : (
          <>
            <svg
              aria-hidden="true"
              viewBox="0 0 220 124"
              className="absolute inset-0 -z-10 m-auto h-[70%] text-primary-text opacity-35"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="110" cy="62" r="54" />
              <circle cx="110" cy="62" r="34" />
              <circle cx="110" cy="62" r="14" />
              <path d="M20 62h30M170 62h30M110 8v20M110 96v20" />
            </svg>
            <div className="grid h-full place-items-center p-3">
              {stage === "error" ? (
                <div
                  role="alert"
                  className="flex max-w-[80%] flex-col items-center gap-3 text-center"
                >
                  <span className="type-body-s">{t("player.videoUnavailable")}</span>
                  <button
                    type="button"
                    onClick={() => void play()}
                    className="eyeq-press min-h-11 rounded-control border border-border bg-surface-2 px-4 type-body-strong"
                  >
                    {t("common.retry")}
                  </button>
                </div>
              ) : stage === "loading" ? (
                <span role="status">
                  <Spinner size={36} />
                  <span className="sr-only">{t("video.buffering")}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void play()}
                  aria-label={t("video.play")}
                  className="eyeq-press grid size-16 place-items-center rounded-full bg-cta text-on-cta"
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="type-caption font-bold tabular-nums">
          {clock(progress?.elapsedS ?? 0)}
        </span>
        <div
          role="progressbar"
          aria-label={t("video.progressLabel")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-1 min-w-[6rem] flex-1 overflow-hidden rounded-xs bg-border"
        >
          <div
            className="h-full origin-left bg-primary"
            style={{ transform: `scaleX(${progress?.fraction ?? 0})` }}
          />
        </div>
        <span className="type-caption font-bold text-text-secondary tabular-nums">
          {clock(progress?.totalS ?? drillSeconds)}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {watched ? (
            <Chip kind="status" status="done" compact>
              {media?.provider === "drive"
                ? t("player.onScreen", { pct })
                : t("player.watched", { pct })}
            </Chip>
          ) : null}
          <Chip compact className={cx(media?.provider === "drive" && "hidden")}>
            {t("video.ccOn")}
          </Chip>
        </span>
      </div>
      {media?.provider === "drive" && (
        <p className="type-caption text-text-muted">{t("player.driveNote")}</p>
      )}
    </div>
  );
}
