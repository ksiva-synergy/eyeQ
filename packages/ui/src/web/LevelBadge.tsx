import { t, type MessageKey } from "@eyeq/i18n";
import { cx } from "./cx.ts";

/**
 * Tier order of the rank-title bands. Which levels fall in which tier is a
 * rule (`level.rank_titles` in game_config, D1), so the badge takes the tier
 * and title from the payload instead of computing them from the level.
 */
export type RankTier = "rookie" | "prospect" | "contender" | "elite" | "peak";
export const RANK_TIERS: RankTier[] = ["rookie", "prospect", "contender", "elite", "peak"];

const TIER: Record<RankTier, { outer: string; text: string; name: MessageKey }> = {
  // Rookie's slate is not a theme token; COMPONENTS 3.8 gives it as a literal.
  rookie: { name: "rank.rookie", outer: "#3A3A4A", text: "text-text-muted" },
  prospect: { name: "rank.prospect", outer: "var(--eyeq-primary)", text: "text-primary-text" },
  contender: { name: "rank.contender", outer: "var(--eyeq-rank)", text: "text-rank-text" },
  elite: { name: "rank.elite", outer: "var(--eyeq-cta)", text: "text-cta-text" },
  peak: { name: "rank.peak", outer: "var(--eyeq-xp)", text: "text-xp-text" },
};

export type LevelBadgeProps = {
  level: number;
  tier: RankTier;
  size?: 24 | 36 | 44 | 88 | 176;
  locked?: boolean;
  /** Show the tier title under the badge (on by default from 44 px). */
  showTitle?: boolean;
  /** Title text from the payload; defaults to the catalogue name of the tier. */
  title?: string;
  className?: string;
};

/** Hexagon level badge with its rank title, so colour is never the only cue (COMPONENTS 3.8). */
export function LevelBadge({
  level,
  tier,
  size = 44,
  locked,
  showTitle = size >= 44,
  title,
  className,
}: LevelBadgeProps) {
  const tone = TIER[tier];
  const name = title ?? t(tone.name);
  return (
    <div className={cx("inline-flex flex-col items-center gap-1.5", className)}>
      <svg
        width={size}
        height={(size * 96) / 88}
        viewBox="0 0 88 96"
        role="img"
        aria-label={
          locked
            ? t("level.badgeLocked", { level, title: name })
            : t("level.badge", { level, title: name })
        }
      >
        <path d="M44 2l38 22v44L44 94 6 68V24z" fill={locked ? "var(--eyeq-border)" : tone.outer} />
        <path d="M44 12l29 17v34L44 80 15 63V29z" fill="var(--eyeq-surface-1)" />
        {locked ? (
          <g
            transform="translate(26 30) scale(1.5)"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={tone.text}
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </g>
        ) : (
          <text
            x="44"
            y="60"
            textAnchor="middle"
            fontFamily="var(--font-display)"
            fontWeight="800"
            fontSize={level >= 100 ? 30 : 40}
            fill={tier === "peak" ? "var(--eyeq-xp-text)" : "var(--eyeq-text-primary)"}
          >
            {level}
          </text>
        )}
      </svg>
      {showTitle && <span className={cx("type-label", tone.text)}>{name}</span>}
    </div>
  );
}
