import { ratingKinds } from "@eyeq/api-contract";
import { BaselineForm } from "./BaselineForm";

/**
 * Board 1d (step 3 of 4). The re-rate day comes from the rating kinds the API accepts
 * ("day14"), the same days Progress prompts on, not from a number written here.
 */
const RERATE_DAY = Number(ratingKinds.find((k) => /^day\d+$/.test(k))?.slice(3) ?? 0);

export default function OnboardingBaseline() {
  return <BaselineForm rerateDay={RERATE_DAY} />;
}
