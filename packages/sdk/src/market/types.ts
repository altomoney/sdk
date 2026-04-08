import type { IIrm } from "../irm/types.js";
import type { ILiquidationEngine } from "../liquidation/types.js";
import type {
  Address,
  Balance,
  BigIntish,
  MarketType,
} from "../types.js";

export interface IMarketParams {
  address: Address;
  marketType: MarketType;
  borrowToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  liquidationEngine: Address;
  maxLtv: BigIntish;
  feeRecipient: Address;
  borrowOpeningFee: BigIntish;
}

export interface IMarket {
  params: IMarketParams;
  totalSupplyAssets: BigIntish;
  totalSupplyShares: BigIntish;
  totalBorrowAssets: BigIntish;
  totalBorrowShares: BigIntish;
  lastUpdate: BigIntish;
  collateralPrice: BigIntish;
  interestRateModel?: IIrm;
  liquidationModel?: ILiquidationEngine;
  borrowTokenBalance?: BigIntish;
  isPaused?: boolean;
  supplyCapAssets?: BigIntish;
  interestFee?: BigIntish;
  claimableFeesAssets?: BigIntish;
  badDebtAssets?: BigIntish;
}

export interface MarketBalances {
  totalSupply: Balance;
  totalBorrow: Balance;
}
