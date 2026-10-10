# Fonts

Self-hosted through `next/font/local` (plan section 8), so a build needs no network.

| File                              | Family           | Weights            | Licence                                |
| --------------------------------- | ---------------- | ------------------ | -------------------------------------- |
| `Manrope-Variable.woff2`          | Manrope          | 200–800 (variable) | SIL OFL 1.1, `Manrope-OFL.txt`         |
| `BarlowCondensed-Bold.woff2`      | Barlow Condensed | 700                | SIL OFL 1.1, `BarlowCondensed-OFL.txt` |
| `BarlowCondensed-ExtraBold.woff2` | Barlow Condensed | 800                | SIL OFL 1.1, `BarlowCondensed-OFL.txt` |

Built from the `google/fonts` repository TTFs with
`pyftsubset --unicodes=<Latin, Latin Extended, punctuation, currency (₹), arrows, ▲▼> --flavor=woff2 --layout-features='*'`.
All OpenType features are kept, so `tabular-nums` works. Barlow Condensed has no ₹ glyph; prices
in display type fall back to the next font in the stack for that one character.
