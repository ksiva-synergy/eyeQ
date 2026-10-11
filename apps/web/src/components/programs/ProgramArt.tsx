/**
 * The decorative cover the boards draw when a program has no image (1e, 10a, 10b): target
 * rings with a tracking arc. Colours are theme variables, so it follows dark and light.
 * Decorative only (aria-hidden); the program title carries the meaning.
 */
export function ProgramArt({
  coverUrl,
  className,
}: {
  coverUrl: string | null;
  className?: string;
}) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a Storage URL, already resized
      <img src={coverUrl} alt="" className={`h-full w-full object-cover ${className ?? ""}`} />
    );
  }
  return (
    <svg
      viewBox="0 0 390 150"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={`h-full w-full ${className ?? ""}`}
    >
      <rect width="390" height="150" fill="var(--eyeq-primary-subtle)" />
      <circle
        cx="300"
        cy="75"
        r="110"
        fill="none"
        stroke="var(--eyeq-primary)"
        strokeWidth="2"
        opacity=".5"
      />
      <circle
        cx="300"
        cy="75"
        r="70"
        fill="none"
        stroke="var(--eyeq-primary)"
        strokeWidth="2"
        opacity=".7"
      />
      <circle
        cx="300"
        cy="75"
        r="30"
        fill="none"
        stroke="var(--eyeq-primary-text)"
        strokeWidth="3"
      />
      <circle cx="300" cy="75" r="8" fill="var(--eyeq-cta)" />
      <path
        d="M40 120c40-60 90-80 140-40"
        fill="none"
        stroke="var(--eyeq-xp)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="4 8"
      />
      <circle cx="180" cy="80" r="9" fill="var(--eyeq-xp)" />
    </svg>
  );
}
