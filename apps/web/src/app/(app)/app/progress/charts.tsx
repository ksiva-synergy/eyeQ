import type { ProgressResponse } from "@eyeq/api-contract";
import {
  formatCalendarDate,
  formatNumber,
  formatShortWeekday,
  t,
  type MessageKey,
} from "@eyeq/i18n";
import { cx } from "@eyeq/ui/web";

/**
 * The four charts of board 8 as inline SVG (plan section 3: no chart library). Each has a
 * text alternative with every number it draws, and none relies on colour alone.
 */
export function WeekBars({ weeks, target }: { weeks: ProgressResponse["weeks"]; target: number }) {
  const W = 326;
  const H = 120;
  const top = 20;
  const base = 100;
  const max = Math.max(target, ...weeks.map((w) => w.sessions), 1);
  const slot = W / weeks.length;
  const bar = Math.min(26, slot - 10);
  const y = (n: number) => base - ((base - top) * n) / max;
  const last = weeks.length - 1;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={t("progress.perWeekAria", {
        n: weeks.length,
        list: weeks.map((w) => w.sessions).join(", "),
      })}
    >
      <line
        x1="0"
        x2={W}
        y1={y(target)}
        y2={y(target)}
        stroke="var(--eyeq-border)"
        strokeDasharray="3 4"
      />
      <text x="0" y={y(target) - 5} fontSize="10" fontWeight="700" fill="var(--eyeq-text-muted)">
        {target}
      </text>
      <line x1="0" x2={W} y1={base} y2={base} stroke="var(--eyeq-border)" />
      {weeks.map((w, i) => {
        const x = i * slot + (slot - bar) / 2;
        const h = Math.max(0, base - y(w.sessions));
        const met = w.sessions >= target;
        return (
          <g key={w.weekStart}>
            <rect
              x={x}
              y={base - h}
              width={bar}
              height={h}
              rx="3"
              fill={met ? "var(--eyeq-primary)" : "var(--eyeq-primary-subtle-border)"}
              stroke={i === last ? "var(--eyeq-primary-text)" : undefined}
              strokeWidth={i === last ? 2 : undefined}
              strokeDasharray={i === last ? "3 3" : undefined}
            />
            <text
              x={x + bar / 2}
              y={base - h - 6}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="var(--eyeq-text-primary)"
              className="font-display"
            >
              {w.sessions}
            </text>
            <text
              x={x + bar / 2}
              y={H - 5}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill={i === last ? "var(--eyeq-primary-text)" : "var(--eyeq-text-muted)"}
            >
              {i === last ? t("progress.now") : t("progress.weekLabel", { n: i + 1 })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const SHADE = [
  "bg-surface-2",
  "bg-primary-subtle-border/60",
  "bg-primary-subtle-border",
  "bg-primary/70",
  "bg-primary",
];

/** A trained day always shows as trained, even when its drills carry no minutes. */
function shade(minutes: number, trained: boolean): string {
  if (minutes <= 0) return trained ? SHADE[1]! : SHADE[0]!;
  if (minutes <= 5) return SHADE[1]!;
  if (minutes <= 10) return SHADE[2]!;
  if (minutes < 20) return SHADE[3]!;
  return SHADE[4]!;
}

/** Weeks as rows from Monday, days as cells shaded by minutes; each cell is labelled. */
export function Heatmap({ calendar }: { calendar: ProgressResponse["calendar"] }) {
  if (calendar.length === 0) return null;
  const first = new Date(`${calendar[0]!.date}T00:00:00Z`);
  const pad = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells: (ProgressResponse["calendar"][number] | null)[] = [
    ...Array(pad).fill(null),
    ...calendar,
  ];
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const heads = [
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
  ];
  return (
    <div className="flex max-w-[24rem] flex-col gap-3">
      <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] gap-1.5" role="presentation">
        <span />
        {heads.map((d) => (
          <span key={d} aria-hidden="true" className="text-center type-label text-text-muted">
            {formatShortWeekday(d).slice(0, 1)}
          </span>
        ))}
        {rows.map((row, r) => {
          const firstDay = row.find(Boolean);
          const month =
            firstDay && (r === 0 || firstDay.date.slice(8) <= "07")
              ? new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(
                  new Date(`${firstDay.date}T00:00:00Z`),
                )
              : "";
          return [
            <span
              key={`m${r}`}
              aria-hidden="true"
              className="self-center type-label text-text-muted"
            >
              {month}
            </span>,
            ...row.map((c, i) =>
              c ? (
                <span
                  key={c.date}
                  role="img"
                  aria-label={t("progress.calendarDay", {
                    date: formatCalendarDate(c.date),
                    minutes: c.minutes,
                    status: t(`progress.day.${c.status}` as MessageKey),
                  })}
                  className={cx(
                    "relative aspect-square rounded-[0.3rem]",
                    c.status === "frozen"
                      ? "bg-rank-subtle outline-2 -outline-offset-2 outline-rank-text"
                      : shade(c.minutes, c.status === "done"),
                    c.status === "today" &&
                      "outline-2 -outline-offset-2 outline-dashed outline-primary-text",
                  )}
                />
              ) : (
                <span key={`p${r}-${i}`} />
              ),
            ),
          ];
        })}
      </div>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 type-caption text-text-secondary"
        aria-hidden="true"
      >
        <span className="flex items-center gap-1">
          {t("progress.legendNone")}
          {SHADE.map((s) => (
            <span key={s} className={cx("size-3 rounded-[0.2rem]", s)} />
          ))}
          {t("progress.legendMax")}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-[0.2rem] outline-2 -outline-offset-2 outline-dashed outline-primary-text" />
          {t("progress.legendToday")}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-[0.2rem] bg-rank-subtle outline-2 -outline-offset-2 outline-rank-text" />
          {t("progress.legendFrozen")}
        </span>
      </div>
    </div>
  );
}

export function Trend({ drill }: { drill: ProgressResponse["drills"][number] }) {
  const W = 326;
  const H = 110;
  const pts = drill.points;
  const scores = pts.map((p) => p.score);
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const span = hi - lo || 1;
  const x = (i: number) => (pts.length === 1 ? W - 8 : 8 + ((W - 16) * i) / (pts.length - 1));
  const y = (v: number) => 90 - (80 * (v - lo)) / span;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={t("progress.trendAria", {
        drill: drill.title,
        first: formatNumber(first.score),
        firstDate: formatCalendarDate(first.date),
        last: formatNumber(last.score),
        lastDate: formatCalendarDate(last.date),
        best: formatNumber(drill.best ?? last.score),
      })}
    >
      <line x1="0" x2={W} y1="90" y2="90" stroke="var(--eyeq-border)" />
      <line x1="0" x2={W} y1="50" y2="50" stroke="var(--eyeq-border)" strokeDasharray="3 4" />
      <line x1="0" x2={W} y1="10" y2="10" stroke="var(--eyeq-border)" strokeDasharray="3 4" />
      <polyline
        points={pts.map((p, i) => `${x(i)},${y(p.score)}`).join(" ")}
        fill="none"
        stroke="var(--eyeq-primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={x(pts.length - 1)}
        cy={y(last.score)}
        r="5"
        fill="var(--eyeq-primary-text)"
        stroke="var(--eyeq-surface-1)"
        strokeWidth="2"
      />
      <text
        x={x(pts.length - 1)}
        y={Math.max(14, y(last.score) - 10)}
        textAnchor="end"
        fontSize="16"
        fontWeight="700"
        fill="var(--eyeq-text-primary)"
        className="font-display"
      >
        {formatNumber(last.score)}
      </text>
      <text x="0" y="104" fontSize="10" fontWeight="700" fill="var(--eyeq-text-muted)">
        {t("progress.trendStart", {
          date: formatCalendarDate(first.date),
          score: formatNumber(first.score),
        })}
      </text>
      <text
        x={W}
        y="104"
        textAnchor="end"
        fontSize="10"
        fontWeight="700"
        fill="var(--eyeq-text-muted)"
      >
        {formatCalendarDate(last.date)}
      </text>
    </svg>
  );
}

const AREAS = ["focus", "reaction", "tracking"] as const;
type Ratings = ProgressResponse["ratings"]["baseline"];

/** Three-axis radar: baseline dashed, now filled; ratings 1 to 5. */
export function Radar({ baseline, latest }: { baseline: Ratings; latest: Ratings }) {
  const cx0 = 110;
  const cy0 = 78;
  const R = 62;
  const angle = [-90, 30, 150].map((d) => (d * Math.PI) / 180);
  const point = (i: number, v: number) => {
    const r = (R * Math.max(0, Math.min(5, v))) / 5;
    return `${cx0 + r * Math.cos(angle[i]!)},${cy0 + r * Math.sin(angle[i]!)}`;
  };
  const poly = (r: Ratings) => AREAS.map((a, i) => point(i, r?.[a] ?? 0)).join(" ");
  const list = AREAS.map((a) =>
    t("progress.change", { area: t(`area.${a}`), from: baseline?.[a] ?? 0, to: latest?.[a] ?? 0 }),
  ).join(", ");
  return (
    <svg
      width="220"
      height="160"
      viewBox="0 0 220 160"
      role="img"
      aria-label={t("progress.radarAria", { list })}
      className="shrink-0"
    >
      <g fill="none" stroke="var(--eyeq-border)">
        {[5, 3.3, 1.6].map((v) => (
          <polygon key={v} points={AREAS.map((_, i) => point(i, v)).join(" ")} />
        ))}
      </g>
      {baseline && (
        <polygon
          points={poly(baseline)}
          fill="none"
          stroke="var(--eyeq-text-muted)"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      )}
      {latest && (
        <polygon
          points={poly(latest)}
          fill="var(--eyeq-primary)"
          fillOpacity=".3"
          stroke="var(--eyeq-primary-text)"
          strokeWidth="2.5"
        />
      )}
      <g fontSize="10" fontWeight="800" fill="var(--eyeq-text-secondary)">
        <text x={cx0} y="8" textAnchor="middle">
          {t("area.focus").toUpperCase()}
        </text>
        <text x="186" y="140" textAnchor="middle">
          {t("area.reaction").toUpperCase()}
        </text>
        <text x="34" y="140" textAnchor="middle">
          {t("area.tracking").toUpperCase()}
        </text>
      </g>
    </svg>
  );
}

export { AREAS };
