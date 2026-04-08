import { AssetShareConversionMath, wExp, FixedPointMath } from "../math/index.js";
import { LiquidationEngineType, toBigInt, type Address, type MarketPosition } from "../types.js";
import { LENDING_ORACLE_PRICE_PRECISION, Market } from "../market/index.js";
import type {
  ILiquidationEngine,
  LiquidationConfiguration,
  LiquidationQuote,
} from "./types.js";

export class DlbDcfPriorityLiquidationEngine implements ILiquidationEngine {
  public readonly type = LiquidationEngineType.DlbDcfPriority;
  public readonly market: Market;
  public readonly liquidationConfiguration;
  public readonly isPriorityLiquidator: boolean;

  constructor(
    market: Market,
    liquidationConfiguration: LiquidationConfiguration,
    isPriorityLiquidator = false,
  ) {
    this.market = market;
    this.liquidationConfiguration = {
      maxLiquidationLtv: toBigInt(liquidationConfiguration.maxLiquidationLtv),
      dynamicBonusFeeStart: toBigInt(liquidationConfiguration.dynamicBonusFeeStart),
      ltvForCompleteLiquidation: toBigInt(
        liquidationConfiguration.ltvForCompleteLiquidation,
      ),
      dynamicBonusFeeDecaySteepness: toBigInt(
        liquidationConfiguration.dynamicBonusFeeDecaySteepness,
      ),
      liquidationBaseFee: toBigInt(liquidationConfiguration.liquidationBaseFee),
      minPenaltyPercentage: toBigInt(
        liquidationConfiguration.minPenaltyPercentage,
      ),
      protocolFeePercentage: toBigInt(
        liquidationConfiguration.protocolFeePercentage,
      ),
      isEnabledPriorityLiquidation:
        liquidationConfiguration.isEnabledPriorityLiquidation,
      disablePriorityLiquidationAbovePositionLtv: toBigInt(
        liquidationConfiguration.disablePriorityLiquidationAbovePositionLtv,
      ),
      priorityLiquidationGracePeriod:
        liquidationConfiguration.priorityLiquidationGracePeriod,
      taggerLiquidationGracePeriod:
        liquidationConfiguration.taggerLiquidationGracePeriod,
      liquidationWindowTag: liquidationConfiguration.liquidationWindowTag,
    };
    this.isPriorityLiquidator = isPriorityLiquidator;
  }

  minLltv() {
    return this.liquidationConfiguration.maxLiquidationLtv;
  }

  isLiquidatable(position: Pick<MarketPosition, "borrowShares" | "collateralAssets">) {
    if (this.market.collateralPrice === 0n) return false;

    const collateralValue = FixedPointMath.divideWithRounding(
      position.collateralAssets,
      this.market.collateralPrice,
      LENDING_ORACLE_PRICE_PRECISION,
      "Down",
    );
    const maxBorrowValue = FixedPointMath.multiplyWithPrecision(
      collateralValue,
      this.liquidationConfiguration.maxLiquidationLtv,
    );
    const borrowValue = this.market.toBorrowAssets(position.borrowShares);

    return borrowValue > 0n && borrowValue >= maxBorrowValue;
  }

  quote(
    position: Pick<MarketPosition, "borrowShares" | "collateralAssets">,
    _liquidator?: Address,
    _additionalData?: unknown,
  ): LiquidationQuote {
    if (!this.isLiquidatable(position)) {
      return {
        seizedCollateralAssets: 0n,
        collateralToLiquidator: 0n,
        repaidBorrowAssets: 0n,
        repaidBorrowShares: 0n,
        protocolSeizedCollateralFee: 0n,
        liquidationPercentage: 0n,
        liquidationFee: 0n,
        newLtv: 0n,
      };
    }

    const collateralPrice = this.market.collateralPrice;
    const positionCollateralValue = FixedPointMath.divideWithRounding(
      position.collateralAssets,
      collateralPrice,
      LENDING_ORACLE_PRICE_PRECISION,
      "Down",
    );
    const positionBorrowedAssets = this.market.toBorrowAssets(position.borrowShares);
    const currentLtv = FixedPointMath.divideWithPrecisionUp(
      positionBorrowedAssets,
      positionCollateralValue,
    );

    const liquidationPercentage =
      currentLtv >= this.liquidationConfiguration.ltvForCompleteLiquidation
        ? FixedPointMath.MATH_PRECISION
        : FixedPointMath.divideWithPrecisionUp(
            currentLtv - this.liquidationConfiguration.maxLiquidationLtv,
            this.liquidationConfiguration.ltvForCompleteLiquidation -
              this.liquidationConfiguration.maxLiquidationLtv,
          );

    const bonusFee = this.isPriorityLiquidator
      ? 0n
      : this.calculateBonusFee(liquidationPercentage);
    const liquidationFee =
      bonusFee + this.liquidationConfiguration.liquidationBaseFee;
    const newLtv = this.calculateNewLtv(liquidationPercentage);
    const liquidatorBonusFee = FixedPointMath.multiplyWithPrecision(
      position.collateralAssets,
      liquidationFee,
    );
    const protocolFee = FixedPointMath.divideWithRounding(
      liquidatorBonusFee,
      this.liquidationConfiguration.protocolFeePercentage,
      FixedPointMath.MATH_PRECISION,
      "Up",
    );
    const remainingCollateralAfterFee =
      position.collateralAssets - liquidatorBonusFee;
    const remainingCollateralAfterFeeInBorrowAssets =
      FixedPointMath.divideWithRounding(
        remainingCollateralAfterFee,
        collateralPrice,
        LENDING_ORACLE_PRICE_PRECISION,
        "Down",
      );

    let collateralToSellInBorrowAssets = FixedPointMath.divideWithPrecisionUp(
      positionBorrowedAssets -
        FixedPointMath.multiplyWithPrecision(
          remainingCollateralAfterFeeInBorrowAssets,
          newLtv,
        ),
      FixedPointMath.MATH_PRECISION - newLtv,
    );
    collateralToSellInBorrowAssets = FixedPointMath.min(
      collateralToSellInBorrowAssets,
      remainingCollateralAfterFeeInBorrowAssets,
      positionBorrowedAssets,
    );

    const seizedCollateralAssets =
      FixedPointMath.divideWithRounding(
        collateralToSellInBorrowAssets,
        LENDING_ORACLE_PRICE_PRECISION,
        collateralPrice,
        "Up",
      ) + liquidatorBonusFee;
    const cappedSeizedCollateralAssets =
      seizedCollateralAssets > position.collateralAssets
        ? position.collateralAssets
        : seizedCollateralAssets;

    const repaidBorrowAssets = FixedPointMath.min(
      positionBorrowedAssets,
      collateralToSellInBorrowAssets,
    );
    const repaidBorrowShares = FixedPointMath.min(
      AssetShareConversionMath.convertToSharesDown(
        repaidBorrowAssets,
        this.market.totalBorrow.assets,
        this.market.totalBorrow.shares,
      ),
      position.borrowShares,
    );

    return {
      seizedCollateralAssets: cappedSeizedCollateralAssets,
      collateralToLiquidator: cappedSeizedCollateralAssets - protocolFee,
      repaidBorrowAssets,
      repaidBorrowShares,
      protocolSeizedCollateralFee: protocolFee,
      liquidationPercentage,
      liquidationFee,
      newLtv,
    };
  }

  seizableCollateralOfPosition(
    position: Pick<MarketPosition, "borrowShares" | "collateralAssets">,
    liquidator?: Address,
    additionalData?: unknown,
  ) {
    return this.quote(position, liquidator, additionalData).collateralToLiquidator;
  }

  private calculateBonusFee(liquidationPercentage: bigint) {
    if (liquidationPercentage >= FixedPointMath.MATH_PRECISION) return 0n;

    const exponent =
      (-this.liquidationConfiguration.dynamicBonusFeeDecaySteepness *
        liquidationPercentage) /
      FixedPointMath.MATH_PRECISION;

    return FixedPointMath.multiplyWithPrecision(
      this.liquidationConfiguration.dynamicBonusFeeStart,
      wExp(exponent),
    );
  }

  private calculateNewLtv(liquidationPercentage: bigint) {
    const liquidationPercentageAppliedPenalty =
      liquidationPercentage < this.liquidationConfiguration.minPenaltyPercentage
        ? this.liquidationConfiguration.minPenaltyPercentage
        : liquidationPercentage;

    return FixedPointMath.multiplyWithPrecision(
      this.market.params.maxLtv,
      FixedPointMath.MATH_PRECISION - liquidationPercentageAppliedPenalty,
    );
  }
}
