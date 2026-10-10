# EyeQ design reference

Unpacked from the Claude Design prototype `EyeQ by Forge Your Peak` (30 boards). Use it to build the UI; do not ship it.

- `tokens.json`: colours (dark and light), type scale, spacing, radii, elevation, icon rules, motion timings and the component list. Build `packages/ui/src/tokens.ts` from this file.
- `screens/*.html`: the source markup of each board, with fonts and the prototype runtime removed. These are for **reading** (inline styles give exact sizes, spacing and colours); they do not render on their own.
- To **see** the boards rendered, open the original `EyeQ by Forge Your Peak.html` bundle in a browser. Keep it outside the repo or in git-lfs; it is 7.7 MB.

## Reading the markup

- `{{name}}` is a bound value. Its sample value is in the `<script type="text/x-dc">` block at the bottom of the same file (`renderVals()`).
- `sc-if` shows an element conditionally, `sc-for` repeats it over a list, `sc-raw-select` marks a native select. These are prototype template attributes, not something to port.
- Sample data is consistent across boards (athlete Arjun R., Level 7, 2,040 XP, 12-day streak, 140 coins, rank #4 of 18). The plan's seed data reproduces that athlete and his session. Other figures on the boards (athlete counts, some levels, the daily total on the summary) are illustrative and not all consistent with the rules.
- Prices are placeholders (`₹[PRICE]`). Bracketed text such as `[COACH BIO ...]` is a content slot.

## Boards

| File                                                    | Board                                                       | Frame       |
| ------------------------------------------------------- | ----------------------------------------------------------- | ----------- |
| `screens/00_DS_Colour_tokens.html`                      | EyeQ design system — colour tokens                          | 1240 × 900  |
| `screens/01_DS_Type_spacing_radii_elevation_icons.html` | EyeQ design system — type, spacing, radii, elevation, icons | 1240 × 900  |
| `screens/02_DS_Motion_moments.html`                     | EyeQ design system — motion moments                         | 1240 × 900  |
| `screens/03_DS_Components.html`                         | EyeQ design system — components                             | 3880 × 1240 |
| `screens/04_1a_Welcome.html`                            | EyeQ — Welcome                                              | 390 × 844   |
| `screens/05_1b_Sign_in.html`                            | EyeQ — Sign in                                              | 390 × 844   |
| `screens/06_1c_Profile.html`                            | EyeQ — Your profile                                         | 390 × 844   |
| `screens/07_1d_Baseline.html`                           | EyeQ — Baseline self-rating                                 | 390 × 844   |
| `screens/08_1e_Starter_program.html`                    | EyeQ — Your starter program                                 | 390 × 844   |
| `screens/09_2_Home_Today.html`                          | EyeQ — Home / Today                                         | 390 × 844   |
| `screens/10_2_Home_light_theme.html`                    | EyeQ — Home / Today (light theme)                           | 390 × 844   |
| `screens/11_3_Drill_player.html`                        | EyeQ — Drill player                                         | 390 × 844   |
| `screens/12_4_Session_complete.html`                    | EyeQ — Session complete                                     | 390 × 844   |
| `screens/13_5a_Level_up.html`                           | EyeQ — Level up                                             | 390 × 844   |
| `screens/14_5b_Badge_unlock.html`                       | EyeQ — Badge unlocked                                       | 390 × 844   |
| `screens/15_6_Leaderboard.html`                         | EyeQ — Leaderboard                                          | 390 × 844   |
| `screens/16_7_Challenges.html`                          | EyeQ — Challenges                                           | 390 × 844   |
| `screens/17_8_Progress.html`                            | EyeQ — Progress                                             | 390 × 844   |
| `screens/18_9_Trophy_case.html`                         | EyeQ — Trophy case                                          | 390 × 844   |
| `screens/19_10a_Programs.html`                          | EyeQ — Programs                                             | 390 × 844   |
| `screens/20_10b_Program_detail.html`                    | EyeQ — Program detail                                       | 390 × 844   |
| `screens/21_11_Paywall.html`                            | EyeQ — Go Pro                                               | 390 × 844   |
| `screens/22_12_Rewards.html`                            | EyeQ — Rewards                                              | 390 × 844   |
| `screens/23_13a_Streak_at_risk_8_pm.html`               | EyeQ — Home, streak at risk (8 pm)                          | 390 × 844   |
| `screens/24_13b_Streak_freeze_used.html`                | EyeQ — Home, streak freeze used                             | 390 × 844   |
| `screens/25_13c_Streak_lost.html`                       | EyeQ — Home, streak lost                                    | 390 × 844   |
| `screens/26_14_Profile_and_account.html`                | EyeQ — Profile and account                                  | 390 × 844   |
| `screens/27_15_Program_landing_page.html`               | Cricket Vision Foundations — EyeQ by Forge Your Peak        | 1440 × 3560 |
| `screens/28_16_Athlete_web_app.html`                    | EyeQ — Athlete web app                                      | 1440 × 1040 |
| `screens/29_17_Coach_admin.html`                        | EyeQ — Coach admin                                          | 1440 × 1180 |

## Where the prototype and the PRD disagree

The prototype was generated from a prompt and drifts from the PRD in places (rank-title bands, badge count, purchasable coins, a program trial, an express session, parental-confirmation copy). The build plan lists each one with the default to build. Follow the plan, not the board, for those.
