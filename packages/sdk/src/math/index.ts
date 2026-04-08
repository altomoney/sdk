export * from "./AssetShareConversionMath.js";
export * from "./ExplLib.js";
export * from "./FixedPointMath.js";

import { FixedPointMath } from "./FixedPointMath.js";

export function rateToApy(rate: bigint): number {
  const yearlyRate = Number(rate) / Number(FixedPointMath.MATH_PRECISION);

  return Math.expm1(yearlyRate * Number(FixedPointMath.SECONDS_PER_YEAR));
}
