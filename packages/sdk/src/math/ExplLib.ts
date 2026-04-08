import { FixedPointMath } from "./FixedPointMath.js";

export const LN_2_INT = 693147180559945309n;
export const LN_WEI_INT = -41446531673892822312n;
export const WEXP_UPPER_BOUND = 93859467695000404319n;
export const WEXP_UPPER_VALUE =
  57716089161558943949701069502944508345128422502756744429568n;

export function wExp(x: bigint): bigint {
  if (x < LN_WEI_INT) return 0n;
  if (x >= WEXP_UPPER_BOUND) return WEXP_UPPER_VALUE;

  const halfLn2 = LN_2_INT / 2n;
  const roundingAdjustment = x < 0n ? -halfLn2 : halfLn2;
  const q = (x + roundingAdjustment) / LN_2_INT;
  const r = x - q * LN_2_INT;

  const expR =
    FixedPointMath.MATH_PRECISION +
    r +
    (r * r) / FixedPointMath.MATH_PRECISION / 2n;

  if (q >= 0n) return expR << q;

  return expR >> -q;
}
