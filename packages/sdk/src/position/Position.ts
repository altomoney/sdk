import type { Address, BigIntish } from "../types.js";
import { toBigInt } from "../types.js";
import { Market, type IMarket } from "../market/index.js";
import type { LiquidationQuote } from "../liquidation/types.js";

export interface IPosition {
  user: Address;
  marketId: Address;
  supplyShares: BigIntish;
  borrowShares: BigIntish;
  collateralAssets: BigIntish;
}

export class Position {
  public readonly user: Address;
  public readonly marketId: Address;
  public readonly supplyShares: bigint;
  public readonly borrowShares: bigint;
  public readonly collateralAssets: bigint;

  constructor(position: IPosition) {
    this.user = position.user;
    this.marketId = position.marketId;
    this.supplyShares = toBigInt(position.supplyShares);
    this.borrowShares = toBigInt(position.borrowShares);
    this.collateralAssets = toBigInt(position.collateralAssets);
  }
}

export interface IAccrualPosition extends Omit<IPosition, "marketId"> {
  market: IMarket | Market;
}

export class AccrualPosition extends Position {
  public readonly market: Market;

  constructor(position: IAccrualPosition) {
    const market = position.market instanceof Market
      ? position.market
      : new Market(position.market);

    super({
      ...position,
      marketId: market.id,
    });

    this.market = market;
  }

  get supplyAssets() {
    return this.market.toSupplyAssets(this.supplyShares);
  }

  get borrowAssets() {
    return this.market.toBorrowAssets(this.borrowShares);
  }

  get collateralValue() {
    return this.market.getCollateralValue(this.collateralAssets);
  }

  get maxBorrowAssets() {
    return this.market.getMaxBorrowAssets(this.collateralAssets);
  }

  get maxBorrowableAssets() {
    const remaining = this.maxBorrowAssets - this.borrowAssets;

    return remaining > 0n ? remaining : 0n;
  }

  get ltv() {
    return this.market.getLtv(this);
  }

  get healthFactor() {
    return this.market.getHealthFactor(this);
  }

  get borrowCapacityUsage() {
    return this.market.getBorrowCapacityUsage(this);
  }

  get withdrawableCollateral() {
    return this.market.getWithdrawableCollateral(this);
  }

  get isHealthy() {
    return this.market.isHealthy(this);
  }

  get isLiquidatable() {
    return this.market.isLiquidatable(this);
  }

  get liquidationQuote(): LiquidationQuote | undefined {
    return this.market.liquidationModel?.quote(this);
  }

  get seizableCollateral() {
    return this.liquidationQuote?.collateralToLiquidator ?? 0n;
  }

  accrueInterest(timestamp?: BigIntish) {
    return new AccrualPosition({
      ...this,
      market: this.market.accrueInterest(timestamp),
    });
  }
}
