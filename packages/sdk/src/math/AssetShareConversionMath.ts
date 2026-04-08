import { FixedPointMath } from "./FixedPointMath.js";

const VIRTUAL_SHARES = 10n ** 6n;
const VIRTUAL_ASSETS = 1n;

export namespace AssetShareConversionMath {
  export function convertToSharesDown(
    assets: bigint,
    totalAssets: bigint,
    totalShares: bigint,
  ) {
    return FixedPointMath.divideWithRounding(
      assets,
      totalShares + VIRTUAL_SHARES,
      totalAssets + VIRTUAL_ASSETS,
      "Down",
    );
  }

  export function convertToAssetsDown(
    shares: bigint,
    totalAssets: bigint,
    totalShares: bigint,
  ) {
    return FixedPointMath.divideWithRounding(
      shares,
      totalAssets + VIRTUAL_ASSETS,
      totalShares + VIRTUAL_SHARES,
      "Down",
    );
  }

  export function convertToSharesUp(
    assets: bigint,
    totalAssets: bigint,
    totalShares: bigint,
  ) {
    return FixedPointMath.divideWithRoundingUp(
      assets,
      totalShares + VIRTUAL_SHARES,
      totalAssets + VIRTUAL_ASSETS,
    );
  }

  export function convertToAssetsUp(
    shares: bigint,
    totalAssets: bigint,
    totalShares: bigint,
  ) {
    return FixedPointMath.divideWithRoundingUp(
      shares,
      totalAssets + VIRTUAL_ASSETS,
      totalShares + VIRTUAL_SHARES,
    );
  }
}
