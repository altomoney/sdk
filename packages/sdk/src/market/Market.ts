import { AdaptiveCurveIrm, FixedRateIrm } from "../irm/index.js";
import type { IIrm } from "../irm/types.js";
import { AssetShareConversionMath, FixedPointMath, rateToApy } from "../math/index.js";
import type { MarketPosition, BigIntish } from "../types.js";
import { MarketType, toBigInt } from "../types.js";
import { MarketParams } from "./MarketParams.js";
import type { IMarket } from "./types.js";

export const LENDING_ORACLE_PRICE_PRECISION = 10n ** 36n;

function currentTimestamp() {
  return BigInt(Math.floor(Date.now() / 1000));
}

export class Market {
  public readonly params: MarketParams;
  public readonly totalSupplyAssets: bigint;
  public readonly totalSupplyShares: bigint;
  public readonly totalBorrowAssets: bigint;
  public readonly totalBorrowShares: bigint;
  public readonly lastUpdate: bigint;
  public readonly collateralPrice: bigint;
  public readonly interestRateModel?: IIrm;
  public readonly liquidationModel?: IMarket["liquidationModel"];
  public readonly borrowTokenBalance?: bigint;
  public readonly isPaused: boolean;
  public readonly supplyCapAssets?: bigint;
  public readonly interestFee?: bigint;
  public readonly claimableFeesAssets?: bigint;
  public readonly badDebtAssets?: bigint;

  constructor(market: IMarket | Market) {
    this.params =
      market.params instanceof MarketParams
        ? market.params
        : new MarketParams(market.params);
    this.totalSupplyAssets = toBigInt(market.totalSupplyAssets);
    this.totalSupplyShares = toBigInt(market.totalSupplyShares);
    this.totalBorrowAssets = toBigInt(market.totalBorrowAssets);
    this.totalBorrowShares = toBigInt(market.totalBorrowShares);
    this.lastUpdate = toBigInt(market.lastUpdate);
    this.collateralPrice = toBigInt(market.collateralPrice);
    this.interestRateModel = market.interestRateModel;
    this.liquidationModel = market.liquidationModel;
    this.borrowTokenBalance =
      market.borrowTokenBalance == null
        ? undefined
        : toBigInt(market.borrowTokenBalance);
    this.isPaused = market.isPaused ?? false;
    this.supplyCapAssets =
      market.supplyCapAssets == null ? undefined : toBigInt(market.supplyCapAssets);
    this.interestFee =
      market.interestFee == null ? undefined : toBigInt(market.interestFee);
    this.claimableFeesAssets =
      market.claimableFeesAssets == null
        ? undefined
        : toBigInt(market.claimableFeesAssets);
    this.badDebtAssets =
      market.badDebtAssets == null ? undefined : toBigInt(market.badDebtAssets);
  }

  get id() {
    return this.params.id;
  }

  get address() {
    return this.params.address;
  }

  get marketType() {
    return this.params.marketType;
  }

  get totalSupply() {
    return {
      assets: this.totalSupplyAssets,
      shares: this.totalSupplyShares,
    };
  }

  get totalBorrow() {
    return {
      assets: this.totalBorrowAssets,
      shares: this.totalBorrowShares,
    };
  }

  get utilization() {
    if (this.totalSupplyAssets === 0n) return 0n;

    return FixedPointMath.divideWithPrecisionDown(
      this.totalBorrowAssets,
      this.totalSupplyAssets,
    );
  }

  get liquidity() {
    if (this.isPaused) return 0n;

    if (this.marketType === MarketType.Mint) {
      return FixedPointMath.zeroFloorSub(
        this.totalSupplyAssets,
        this.totalBorrowAssets + (this.badDebtAssets ?? 0n),
      );
    }

    const accountingLiquidity = FixedPointMath.zeroFloorSub(
      this.totalSupplyAssets,
      this.totalBorrowAssets,
    );

    return this.borrowTokenBalance == null
      ? accountingLiquidity
      : FixedPointMath.min(accountingLiquidity, this.borrowTokenBalance);
  }

  get borrowRate() {
    return this.getBorrowRate();
  }

  getBorrowRate(timestamp: BigIntish = currentTimestamp()) {
    if (!this.interestRateModel) return 0n;

    return this.interestRateModel.previewInterestRate(
      this.totalSupplyAssets,
      this.totalBorrowAssets,
      toBigInt(timestamp),
    ).newBorrowRate;
  }

  get supplyRate() {
    return this.getSupplyRate();
  }

  getSupplyRate(timestamp: BigIntish = currentTimestamp()) {
    if (this.marketType !== MarketType.Borrow) return 0n;

    const grossSupplyRate = FixedPointMath.multiplyWithPrecision(
      this.getBorrowRate(timestamp),
      this.utilization,
    );

    return FixedPointMath.multiplyWithPrecision(
      grossSupplyRate,
      FixedPointMath.MATH_PRECISION - (this.interestFee ?? 0n),
    );
  }

  get borrowApy() {
    return rateToApy(this.getBorrowRate());
  }

  get supplyApy() {
    return rateToApy(this.getSupplyRate());
  }

  accrueInterest(timestamp: BigIntish = currentTimestamp()) {
    const now = toBigInt(timestamp);
    if (!this.interestRateModel || now <= this.lastUpdate) return new Market(this);

    const nextIrm = this.cloneInterestRateModel();
    const { interest } = nextIrm.updateInterestRate(
      this.totalSupplyAssets,
      this.totalBorrowAssets,
      now,
    );

    if (this.marketType === MarketType.Borrow) {
      let totalSupplyShares = this.totalSupplyShares;
      let totalSupplyAssets = this.totalSupplyAssets + interest;

      if (interest > 0n && (this.interestFee ?? 0n) > 0n) {
        const feeBorrowAssets = FixedPointMath.multiplyWithPrecision(
          interest,
          this.interestFee ?? 0n,
        );
        const feeShares = AssetShareConversionMath.convertToSharesDown(
          feeBorrowAssets,
          totalSupplyAssets - feeBorrowAssets,
          totalSupplyShares,
        );
        totalSupplyShares += feeShares;
      }

      return new Market({
        ...this,
        totalSupplyAssets,
        totalSupplyShares,
        totalBorrowAssets: this.totalBorrowAssets + interest,
        lastUpdate: now,
        interestRateModel: nextIrm,
      });
    }

    return new Market({
      ...this,
      totalBorrowAssets: this.totalBorrowAssets + interest,
      claimableFeesAssets: (this.claimableFeesAssets ?? 0n) + interest,
      lastUpdate: now,
      interestRateModel: nextIrm,
    });
  }

  toSupplyAssets(shares: BigIntish) {
    return AssetShareConversionMath.convertToAssetsDown(
      toBigInt(shares),
      this.totalSupplyAssets,
      this.totalSupplyShares,
    );
  }

  toSupplyShares(assets: BigIntish) {
    return AssetShareConversionMath.convertToSharesDown(
      toBigInt(assets),
      this.totalSupplyAssets,
      this.totalSupplyShares,
    );
  }

  toBorrowAssets(shares: BigIntish) {
    return AssetShareConversionMath.convertToAssetsUp(
      toBigInt(shares),
      this.totalBorrowAssets,
      this.totalBorrowShares,
    );
  }

  toBorrowShares(assets: BigIntish) {
    return AssetShareConversionMath.convertToSharesUp(
      toBigInt(assets),
      this.totalBorrowAssets,
      this.totalBorrowShares,
    );
  }

  getCollateralValue(collateralAssets: BigIntish) {
    return FixedPointMath.divideWithRounding(
      toBigInt(collateralAssets),
      this.collateralPrice,
      LENDING_ORACLE_PRICE_PRECISION,
      "Down",
    );
  }

  getMaxBorrowAssets(collateralAssets: BigIntish) {
    return FixedPointMath.multiplyWithPrecision(
      this.getCollateralValue(collateralAssets),
      this.params.maxLtv,
    );
  }

  getLtv(position: Pick<MarketPosition, "borrowShares" | "collateralAssets">) {
    const collateralValue = this.getCollateralValue(position.collateralAssets);
    const borrowAssets = this.toBorrowAssets(position.borrowShares);
    if (borrowAssets === 0n) return 0n;
    if (collateralValue === 0n) return FixedPointMath.MAX_UINT_256;

    return FixedPointMath.divideWithPrecisionUp(borrowAssets, collateralValue);
  }

  getHealthFactor(position: Pick<MarketPosition, "borrowShares" | "collateralAssets">) {
    const borrowAssets = this.toBorrowAssets(position.borrowShares);
    if (borrowAssets === 0n) return FixedPointMath.MAX_UINT_256;

    const maxBorrowAssets = this.getMaxBorrowAssets(position.collateralAssets);

    return FixedPointMath.divideWithPrecisionDown(maxBorrowAssets, borrowAssets);
  }

  getBorrowCapacityUsage(
    position: Pick<MarketPosition, "borrowShares" | "collateralAssets">,
  ) {
    const maxBorrowAssets = this.getMaxBorrowAssets(position.collateralAssets);
    const borrowAssets = this.toBorrowAssets(position.borrowShares);
    if (maxBorrowAssets === 0n) {
      return borrowAssets === 0n ? 0n : FixedPointMath.MAX_UINT_256;
    }

    return FixedPointMath.divideWithPrecisionUp(borrowAssets, maxBorrowAssets);
  }

  getWithdrawableCollateral(
    position: Pick<MarketPosition, "borrowShares" | "collateralAssets">,
  ) {
    const borrowAssets = this.toBorrowAssets(position.borrowShares);
    if (borrowAssets === 0n) return position.collateralAssets;
    if (this.params.maxLtv === 0n || this.collateralPrice === 0n) return 0n;

    const requiredCollateralValue = FixedPointMath.divideWithPrecisionUp(
      borrowAssets,
      this.params.maxLtv,
    );
    const collateralValue = this.getCollateralValue(position.collateralAssets);
    const withdrawableValue = FixedPointMath.zeroFloorSub(
      collateralValue,
      requiredCollateralValue,
    );

    return FixedPointMath.divideWithRounding(
      withdrawableValue,
      LENDING_ORACLE_PRICE_PRECISION,
      this.collateralPrice,
      "Down",
    );
  }

  isHealthy(position: Pick<MarketPosition, "borrowShares" | "collateralAssets">) {
    return this.toBorrowAssets(position.borrowShares) <=
      this.getMaxBorrowAssets(position.collateralAssets);
  }

  isLiquidatable(position: Pick<MarketPosition, "borrowShares" | "collateralAssets">) {
    if (!this.liquidationModel) return !this.isHealthy(position);

    return this.liquidationModel.isLiquidatable(position);
  }

  getLiquidationThreshold() {
    return this.liquidationModel?.minLltv() ?? this.params.maxLtv;
  }

  private cloneInterestRateModel(): IIrm {
    if (this.interestRateModel instanceof FixedRateIrm) {
      return new FixedRateIrm(this.interestRateModel.state);
    }
    if (this.interestRateModel instanceof AdaptiveCurveIrm) {
      return new AdaptiveCurveIrm(
        this.interestRateModel.config,
        this.interestRateModel.state,
      );
    }

    return this.interestRateModel!;
  }
}
