import type { Address, BigIntish, LiquidationEngineType, MarketPosition } from "../types.js";

export interface LiquidationQuote {
  seizedCollateralAssets: bigint;
  collateralToLiquidator: bigint;
  repaidBorrowAssets: bigint;
  repaidBorrowShares: bigint;
  protocolSeizedCollateralFee: bigint;
  liquidationPercentage: bigint;
  liquidationFee: bigint;
  newLtv: bigint;
}

export interface ILiquidationEngine {
  readonly type: LiquidationEngineType;
  minLltv(): bigint;
  isLiquidatable(position: Pick<MarketPosition, "borrowShares" | "collateralAssets">): boolean;
  quote(
    position: Pick<MarketPosition, "borrowShares" | "collateralAssets">,
    liquidator?: Address,
    additionalData?: unknown,
  ): LiquidationQuote;
  seizableCollateralOfPosition(
    position: Pick<MarketPosition, "borrowShares" | "collateralAssets">,
    liquidator?: Address,
    additionalData?: unknown,
  ): bigint;
}

export interface LiquidationConfiguration {
  maxLiquidationLtv: BigIntish;
  dynamicBonusFeeStart: BigIntish;
  ltvForCompleteLiquidation: BigIntish;
  dynamicBonusFeeDecaySteepness: BigIntish;
  liquidationBaseFee: BigIntish;
  minPenaltyPercentage: BigIntish;
  protocolFeePercentage: BigIntish;
  isEnabledPriorityLiquidation: boolean;
  disablePriorityLiquidationAbovePositionLtv: BigIntish;
  priorityLiquidationGracePeriod: number;
  taggerLiquidationGracePeriod: number;
  liquidationWindowTag: number;
}
