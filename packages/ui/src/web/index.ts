/**
 * @eyeq/ui/web: React components for apps/web. Styled with Tailwind classes
 * against the theme in theme.css; apps/web scans this folder with @source.
 * Native counterparts arrive in phase 8 against the same tokens and list.
 */
export { cx } from "./cx.ts";
export { Icon, ICON_NAMES, BOARD_ICONS, type IconName, type IconProps } from "./Icon.tsx";
export {
  Button,
  IconButton,
  TextLink,
  Spinner,
  buttonClass,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./Button.tsx";
export { Card, cardClass, type CardProps, type CardTone } from "./Card.tsx";
export { Chip, CoinChip, XPChip, type ChipProps, type ChipKind, type ChipStatus } from "./Chip.tsx";
export { ProgressRing, XPBar, Bar, type ProgressRingProps, type XPBarProps } from "./Progress.tsx";
export {
  StreakCounter,
  StreakFlame,
  type StreakCounterProps,
  type StreakState,
} from "./Streak.tsx";
export { LevelBadge, RANK_TIERS, type LevelBadgeProps, type RankTier } from "./LevelBadge.tsx";
export { Avatar, type AvatarProps } from "./Avatar.tsx";
export { RankRow, type RankRowProps, type RankDelta } from "./RankRow.tsx";
export { DrillCard, type DrillCardProps, type DrillCardState } from "./DrillCard.tsx";
export { ChallengeCard, type ChallengeCardProps } from "./ChallengeCard.tsx";
export { VideoFrame, type VideoFrameProps, type VideoFrameState } from "./VideoFrame.tsx";
export { PlanGroup, type Plan, type PlanGroupProps } from "./PlanCard.tsx";
export {
  BottomTabBar,
  SideNav,
  BrandMark,
  type NavItem,
  type NavProps,
  type LinkComponent,
} from "./Nav.tsx";
export { Toast, type ToastProps } from "./Toast.tsx";
export { Sheet, SheetPreview, type SheetProps } from "./Sheet.tsx";
export { EmptyState, Skeleton, SkeletonRow, ErrorCard } from "./States.tsx";
export {
  TextInput,
  PhoneInput,
  OTPInput,
  SegmentedControl,
  Toggle,
  Pill,
  RatingInput,
  type SegmentedOption,
} from "./Inputs.tsx";
export {
  XPCountUp,
  StreakPlusOne,
  RankSwap,
  LevelUpTakeover,
  BadgeUnlock,
  BadgeTile,
  usePrefersReducedMotion,
} from "./Moments.tsx";
