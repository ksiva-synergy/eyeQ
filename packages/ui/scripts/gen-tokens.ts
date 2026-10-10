/**
 * Generates `src/tokens.ts` and `src/theme.css` from `docs/design/tokens.json`.
 *
 *   pnpm --filter @eyeq/ui tokens        # write both files
 *
 * `src/tokens.test.ts` fails when the committed files differ from what this
 * script would write, so a token change is one edit to the JSON plus a re-run.
 *
 * The JSON's `game` group is not emitted: rule values live in `game_config`
 * (ground rule 8) and reach the UI through API payloads, never through tokens.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
export const SOURCE = path.join(root, "docs/design/tokens.json");
export const TOKENS_TS = path.resolve(here, "../src/tokens.ts");
export const THEME_CSS = path.resolve(here, "../src/theme.css");

type Leaf = { $value: unknown; $type?: string; $extensions?: { eyeq?: Record<string, unknown> } };
type Group = { [key: string]: Group | Leaf | string };

const isLeaf = (v: unknown): v is Leaf => typeof v === "object" && v !== null && "$value" in v;

/** Children of a group, skipping `$description` and other `$` metadata. */
function entries(group: Group): [string, Group | Leaf][] {
  return Object.entries(group).filter(([k]) => !k.startsWith("$")) as [string, Group | Leaf][];
}

const px = (v: unknown): number => {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v));
  if (!m) throw new Error(`expected a px dimension, got ${String(v)}`);
  return Number(m[1]);
};
const ms = (v: unknown): number => {
  const m = /^(\d+)ms$/.exec(String(v));
  if (!m) throw new Error(`expected a ms duration, got ${String(v)}`);
  return Number(m[1]);
};
const rem = (n: number): string => `${+(n / 16).toFixed(4)}rem`;

/**
 * The light theme names a separate text colour for streak, XP and warning; the
 * dark theme uses one colour as fill and text and has no warning set (only the
 * light-theme admin validates). Emit the same names in both themes so a
 * component never branches on theme: dark `streak-text` is `streak`, and so on.
 */
const DARK_ALIASES: Record<string, string> = {
  "streak-text": "streak",
  "xp-text": "xp",
  "warning-text": "streak",
  "warning-subtle": "streak-subtle",
  "warning-border": "streak-border",
};

export function buildTokens(json: Group) {
  const color = json["color"] as Group;
  const themes: Record<"dark" | "light", Record<string, string>> = { dark: {}, light: {} };
  for (const theme of ["dark", "light"] as const) {
    for (const [name, leaf] of entries(color[theme] as Group)) {
      if (isLeaf(leaf)) themes[theme][name] = String(leaf.$value);
    }
  }
  for (const [alias, source] of Object.entries(DARK_ALIASES)) {
    const value = themes.dark[source];
    if (!value) throw new Error(`dark alias source ${source} missing`);
    themes.dark[alias] ??= value;
  }
  const names = Object.keys(themes.light);
  for (const n of names) if (!themes.dark[n]) throw new Error(`dark theme lacks ${n}`);
  for (const n of Object.keys(themes.dark))
    if (!themes.light[n]) throw new Error(`light lacks ${n}`);

  const font = json["font"] as Group;
  const family: Record<string, string[]> = {};
  for (const [k, leaf] of entries(font["family"] as Group)) {
    if (isLeaf(leaf)) family[k] = leaf.$value as string[];
  }
  const weight: Record<string, number> = {};
  for (const [k, leaf] of entries(font["weight"] as Group)) {
    if (isLeaf(leaf)) weight[k] = Number(leaf.$value);
  }

  type Typo = {
    family: "display" | "body";
    weight: number;
    fontSize: number;
    lineHeight: number;
    lineHeightPx: number;
    letterSpacing: number;
    uppercase: boolean;
  };
  const typography: Record<string, Typo> = {};
  for (const [k, leaf] of entries(json["typography"] as Group)) {
    if (!isLeaf(leaf)) continue;
    const v = leaf.$value as Record<string, unknown>;
    const ext = leaf.$extensions?.eyeq ?? {};
    typography[k] = {
      family: v["fontFamily"] === "Barlow Condensed" ? "display" : "body",
      weight: Number(v["fontWeight"]),
      fontSize: px(v["fontSize"]),
      lineHeight: Number(v["lineHeight"]),
      lineHeightPx: Number(ext["lineHeightPx"]),
      letterSpacing: px(v["letterSpacing"]),
      uppercase: ext["textTransform"] === "uppercase",
    };
  }

  const dims = (group: string) => {
    const out: Record<string, number> = {};
    for (const [k, leaf] of entries(json[group] as Group))
      if (isLeaf(leaf)) out[k] = px(leaf.$value);
    return out;
  };
  const nums = (group: string) => {
    const out: Record<string, number> = {};
    for (const [k, leaf] of entries(json[group] as Group))
      if (isLeaf(leaf)) out[k] = Number(leaf.$value);
    return out;
  };

  const elevation: Record<
    string,
    { color: string; x: number; y: number; blur: number; spread: number; androidElevation: number }
  > = {};
  for (const [k, leaf] of entries(json["elevation"] as Group)) {
    if (!isLeaf(leaf)) continue;
    const v = leaf.$value as Record<string, string>;
    elevation[k] = {
      color: String(v["color"]),
      x: px(v["offsetX"]),
      y: px(v["offsetY"]),
      blur: px(v["blur"]),
      spread: px(v["spread"]),
      androidElevation: Number(leaf.$extensions?.eyeq?.["androidElevation"] ?? 0),
    };
  }
  const duration: Record<string, number> = {};
  for (const [k, leaf] of entries(json["duration"] as Group))
    if (isLeaf(leaf)) duration[k] = ms(leaf.$value);
  const easing: Record<string, [number, number, number, number]> = {};
  for (const [k, leaf] of entries(json["easing"] as Group)) {
    if (isLeaf(leaf)) easing[k] = leaf.$value as [number, number, number, number];
  }
  const haptic: Record<string, string> = {};
  for (const [k, leaf] of entries(json["haptic"] as Group))
    if (isLeaf(leaf)) haptic[k] = String(leaf.$value);

  return {
    color: themes,
    font: { family, weight },
    typography,
    space: dims("space"),
    radius: dims("radius"),
    border: dims("border"),
    elevation,
    size: dims("size"),
    duration,
    easing,
    haptic,
    opacity: nums("opacity"),
    z: nums("z"),
  };
}

export type BuiltTokens = ReturnType<typeof buildTokens>;

const HEADER =
  "Generated by packages/ui/scripts/gen-tokens.ts from docs/design/tokens.json. Do not edit.";

export function renderTokensTs(t: BuiltTokens): string {
  return `// ${HEADER}
// Dimensions are px numbers (React Native reads them as is; the web theme
// converts type sizes to rem). Colours are per theme. The JSON's \`game\`
// group is left out on purpose: rule values come from game_config.

export const tokens = ${JSON.stringify(t, null, 2)} as const;

export type Tokens = typeof tokens;
export type ThemeName = keyof Tokens["color"];
export type ColorToken = keyof Tokens["color"]["dark"];
export type TypographyToken = keyof Tokens["typography"];
export type IconSize = "s" | "m" | "l";
`;
}

const shadow = (e: BuiltTokens["elevation"][string]) =>
  `${e.x}px ${e.y}px ${e.blur}px ${e.spread}px ${e.color}`;

export function renderThemeCss(t: BuiltTokens): string {
  const vars = (theme: Record<string, string>) =>
    Object.entries(theme)
      .map(([k, v]) => `  --eyeq-${k}: ${v};`)
      .join("\n");
  const family = (k: string, cssVar: string) => {
    const list = t.font.family[k] ?? [];
    const [first, ...rest] = list;
    const quote = (f: string) => (/\s/.test(f) ? `"${f}"` : f);
    return `var(${cssVar}, ${quote(first ?? "sans-serif")}), ${rest.map(quote).join(", ")}`;
  };

  const lines: string[] = [];
  lines.push(`/* ${HEADER} */`);
  lines.push(`/* Dark is the default theme; [data-theme] on any element switches its subtree. */`);
  lines.push(`:root,\n[data-theme="dark"] {\n  color-scheme: dark;\n${vars(t.color.dark)}\n}`);
  lines.push(`[data-theme="light"] {\n  color-scheme: light;\n${vars(t.color.light)}\n}`);
  lines.push(
    `/* With no explicit choice, follow the OS. */\n@media (prefers-color-scheme: light) {\n  :root:not([data-theme]) {\n    color-scheme: light;\n${vars(t.color.light).replace(/^/gm, "  ")}\n  }\n}`,
  );

  const motion = [
    ...Object.entries(t.duration).map(([k, v]) => `  --eyeq-duration-${k}: ${v}ms;`),
    ...Object.entries(t.easing).map(
      ([k, v]) => `  --eyeq-ease-${k}: cubic-bezier(${v.join(", ")});`,
    ),
    ...Object.entries(t.opacity).map(([k, v]) => `  --eyeq-opacity-${k}: ${v};`),
    ...Object.entries(t.z).map(([k, v]) => `  --eyeq-z-${k}: ${v};`),
    ...Object.entries(t.size).map(([k, v]) => `  --eyeq-size-${k}: ${v}px;`),
  ];
  lines.push(`:root {\n${motion.join("\n")}\n}`);

  const theme: string[] = [];
  theme.push("  --color-*: initial;");
  theme.push("  --color-white: #fff;");
  theme.push("  --color-black: #000;");
  for (const k of Object.keys(t.color.dark)) theme.push(`  --color-${k}: var(--eyeq-${k});`);
  theme.push("  --font-*: initial;");
  theme.push(`  --font-display: ${family("display", "--eyeq-font-display")};`);
  theme.push(`  --font-body: ${family("body", "--eyeq-font-body")};`);
  theme.push(`  --font-mono: ${family("mono", "--eyeq-font-mono")};`);
  theme.push("  --radius-*: initial;");
  for (const [k, v] of Object.entries(t.radius)) theme.push(`  --radius-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(t.space)) {
    if (!/^\d+$/.test(k)) theme.push(`  --spacing-${k}: ${v}px;`);
  }
  theme.push("  --shadow-*: initial;");
  for (const [k, e] of Object.entries(t.elevation)) theme.push(`  --shadow-${k}: ${shadow(e)};`);
  for (const [k, v] of Object.entries(t.easing))
    theme.push(`  --ease-${k}: cubic-bezier(${v.join(", ")});`);
  for (const [k, ty] of Object.entries(t.typography)) {
    theme.push(`  --text-${k}: ${rem(ty.fontSize)};`);
    theme.push(`  --text-${k}--line-height: ${ty.lineHeight};`);
  }
  lines.push(`@theme inline {\n${theme.join("\n")}\n}`);

  for (const [k, ty] of Object.entries(t.typography)) {
    const decl = [
      `  font-family: var(--font-${ty.family});`,
      `  font-weight: ${ty.weight};`,
      `  font-size: ${rem(ty.fontSize)};`,
      `  line-height: ${ty.lineHeight};`,
      `  letter-spacing: ${ty.letterSpacing === 0 ? "0" : `${+(ty.letterSpacing / ty.fontSize).toFixed(4)}em`};`,
    ];
    if (ty.uppercase) decl.push("  text-transform: uppercase;");
    if (ty.family === "display") decl.push("  font-variant-numeric: tabular-nums;");
    lines.push(`@utility type-${k} {\n${decl.join("\n")}\n}`);
  }
  return lines.join("\n\n") + "\n";
}

export async function generate(): Promise<{ ts: string; css: string }> {
  const json = JSON.parse(readFileSync(SOURCE, "utf8")) as Group;
  const built = buildTokens(json);
  const ts = await format(renderTokensTs(built), {
    parser: "typescript",
    printWidth: 100,
    trailingComma: "all",
  });
  const css = await format(renderThemeCss(built), { parser: "css", printWidth: 100 });
  return { ts, css };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ts, css } = await generate();
  writeFileSync(TOKENS_TS, ts);
  writeFileSync(THEME_CSS, css);
  console.log(`wrote ${path.relative(root, TOKENS_TS)} and ${path.relative(root, THEME_CSS)}`);
}
