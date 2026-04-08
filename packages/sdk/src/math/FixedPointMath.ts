import type { RoundingDirection } from "../types.js";

export namespace FixedPointMath {
  export const MATH_PRECISION = 1_000000000000000000n;
  export const SECONDS_PER_YEAR = 31_536_000n;

  export const MAX_UINT_256 = maxUint(256);
  export const MAX_UINT_160 = maxUint(160);
  export const MAX_UINT_128 = maxUint(128);
  export const MAX_UINT_48 = maxUint(48);

  export function maxUint(nBits: number) {
    if (nBits % 4 !== 0) throw new Error(`Invalid number of bits: ${nBits}`);

    return BigInt(`0x${"f".repeat(nBits / 4)}`);
  }

  export function abs(a: bigint) {
    return a >= 0n ? a : -a;
  }

  export function min(...xs: bigint[]) {
    return xs.reduce((x, y) => (x <= y ? x : y));
  }

  export function max(...xs: bigint[]) {
    return xs.reduce((x, y) => (x >= y ? x : y));
  }

  export function zeroFloorSub(x: bigint, y: bigint) {
    return x <= y ? 0n : x - y;
  }

  export function multiplyWithPrecision(x: bigint, y: bigint) {
    return multiplyWithPrecisionWithRounding(x, y, "Down");
  }

  export function multiplyWithPrecisionUp(x: bigint, y: bigint) {
    return multiplyWithPrecisionWithRounding(x, y, "Up");
  }

  export function multiplyWithPrecisionWithRounding(
    x: bigint,
    y: bigint,
    rounding: RoundingDirection,
  ) {
    return divideWithRounding(x, y, MATH_PRECISION, rounding);
  }

  export function divideWithPrecisionDown(x: bigint, y: bigint) {
    return divideWithPrecisionWithRounding(x, y, "Down");
  }

  export function divideWithPrecisionUp(x: bigint, y: bigint) {
    return divideWithPrecisionWithRounding(x, y, "Up");
  }

  export function divideWithPrecisionWithRounding(
    x: bigint,
    y: bigint,
    rounding: RoundingDirection,
  ) {
    return divideWithRounding(x, MATH_PRECISION, y, rounding);
  }

  export function divideWithRoundingDown(
    x: bigint,
    y: bigint,
    denominator: bigint,
  ) {
    if (denominator === 0n) throw new Error("DIVISION_BY_ZERO");

    return (x * y) / denominator;
  }

  export function divideWithRoundingUp(
    x: bigint,
    y: bigint,
    denominator: bigint,
  ) {
    if (denominator === 0n) throw new Error("DIVISION_BY_ZERO");

    const product = x * y;
    const roundup = product % denominator === 0n ? 0n : 1n;

    return product / denominator + roundup;
  }

  export function divideWithRounding(
    x: bigint,
    y: bigint,
    denominator: bigint,
    rounding: RoundingDirection,
  ) {
    if (rounding === "Up") return divideWithRoundingUp(x, y, denominator);

    return divideWithRoundingDown(x, y, denominator);
  }
}
