import { FixedPointMath } from "../math/FixedPointMath.js";

export function calculateCompoundInterest(rate: bigint, elapsed: bigint): bigint {
  const linearTerm = rate * elapsed;
  const quadraticTerm =
    (linearTerm * linearTerm) / (2n * FixedPointMath.MATH_PRECISION);
  const cubicTerm =
    (quadraticTerm * linearTerm) / (3n * FixedPointMath.MATH_PRECISION);

  let result = linearTerm + quadraticTerm + cubicTerm;

  if (linearTerm > 2n * 10n ** 17n) {
    const quarticTerm =
      (cubicTerm * linearTerm) / (4n * FixedPointMath.MATH_PRECISION);

    if (result <= FixedPointMath.MAX_UINT_256 - quarticTerm) {
      result += quarticTerm;
    }
  }

  const maxSafeResult = 10n ** 20n;
  if (result > maxSafeResult) return maxSafeResult;

  return result;
}
