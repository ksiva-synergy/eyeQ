import { t } from "@eyeq/i18n";
import { cx } from "./cx.ts";
import { Spinner } from "./Button.tsx";
import { Chip } from "./Chip.tsx";

export type VideoFrameState = "idle" | "playing" | "watched" | "buffering" | "error";

export type VideoFrameProps = {
  state: VideoFrameState;
  /** "Set 2 of 3"; omitted for single-set drills. */
  setLabel?: string;
  elapsedLabel?: string;
  totalLabel?: string;
  /** 0–1 watched fraction for the violet track. */
  progress?: number;
  onPlay?: () => void;
  onRetry?: () => void;
  className?: string;
};

/**
 * The 16:9 stage frame of the drill player (COMPONENTS 3.14). The provider
 * (YouTube, Drive) mounts inside it in phase 5; this frame draws the poster,
 * play button, set and caption chips, progress track and error state.
 */
export function VideoFrame({
  state,
  setLabel,
  elapsedLabel,
  totalLabel,
  progress = 0,
  onPlay,
  onRetry,
  className,
}: VideoFrameProps) {
  // Chips, stage content and the progress row are in flow (not stacked absolutely),
  // so at 200 % text the frame grows past 16:9 instead of overlapping its own text.
  return (
    <div
      className={cx(
        "relative isolate flex aspect-video flex-col rounded-card-s border border-border bg-surface-1",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 grid place-items-center overflow-hidden rounded-card-s"
      >
        <svg
          viewBox="0 0 220 124"
          className="h-[70%] text-primary-text opacity-35"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="110" cy="62" r="54" />
          <circle cx="110" cy="62" r="34" />
          <circle cx="110" cy="62" r="14" />
          <path d="M20 62h30M170 62h30M110 8v20M110 96v20" />
        </svg>
      </div>
      <div className="flex flex-wrap justify-between gap-2 px-3 pt-2.5">
        {setLabel ? <Chip compact>{setLabel}</Chip> : <span />}
        <span className="flex flex-wrap gap-2">
          {state === "watched" && (
            <Chip kind="status" status="done" compact>
              {t("video.watched")}
            </Chip>
          )}
          <Chip compact>{t("video.ccOn")}</Chip>
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center px-3 py-2">
        {state === "error" ? (
          <div className="flex max-w-[80%] flex-col items-center gap-3 text-center" role="alert">
            <span className="type-body-s text-text-primary">{t("video.error")}</span>
            <button
              type="button"
              onClick={onRetry}
              className="eyeq-press min-h-11 rounded-control border border-border bg-surface-2 px-4 type-body-strong text-text-primary"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : state === "buffering" ? (
          <span className="text-text-primary" role="status">
            <Spinner size={36} />
            <span className="sr-only">{t("video.buffering")}</span>
          </span>
        ) : state === "idle" ? (
          <button
            type="button"
            onClick={onPlay}
            aria-label={t("video.play")}
            className="eyeq-press grid size-16 place-items-center rounded-full bg-cta text-on-cta"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        ) : null}
      </div>
      {state === "playing" || state === "watched" ? (
        <div className="flex items-center gap-2.5 px-3 pb-2.5">
          <span className="text-[0.6875rem] font-bold tabular-nums">{elapsedLabel}</span>
          <div
            role="progressbar"
            aria-label={t("video.progressLabel")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-1 flex-1 overflow-hidden rounded-xs bg-border"
          >
            <div
              className="h-full origin-left bg-primary"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
          <span className="text-[0.6875rem] font-bold text-text-secondary tabular-nums">
            {totalLabel}
          </span>
        </div>
      ) : (
        <div className="h-2.5" />
      )}
    </div>
  );
}
