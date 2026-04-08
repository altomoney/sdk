import type { Address, BigIntish } from "../types.js";
import { toBigInt } from "../types.js";
import type { IMarketParams } from "./types.js";

export type InputMarketParams = IMarketParams;

export class MarketParams implements IMarketParams {
  public readonly address: Address;
  public readonly marketType: IMarketParams["marketType"];
  public readonly borrowToken: Address;
  public readonly collateralToken: Address;
  public readonly oracle: Address;
  public readonly irm: Address;
  public readonly liquidationEngine: Address;
  public readonly feeRecipient: Address;
  public readonly maxLtv: bigint;
  public readonly borrowOpeningFee: bigint;

  constructor(params: IMarketParams) {
    this.address = params.address;
    this.marketType = params.marketType;
    this.borrowToken = params.borrowToken;
    this.collateralToken = params.collateralToken;
    this.oracle = params.oracle;
    this.irm = params.irm;
    this.liquidationEngine = params.liquidationEngine;
    this.feeRecipient = params.feeRecipient;
    this.maxLtv = toBigInt(params.maxLtv);
    this.borrowOpeningFee = toBigInt(params.borrowOpeningFee);
  }

  get id() {
    return this.address;
  }

  with(values: Partial<Omit<IMarketParams, "maxLtv" | "borrowOpeningFee">> & {
    maxLtv?: BigIntish;
    borrowOpeningFee?: BigIntish;
  }) {
    return new MarketParams({
      ...this,
      ...values,
      maxLtv: values.maxLtv ?? this.maxLtv,
      borrowOpeningFee: values.borrowOpeningFee ?? this.borrowOpeningFee,
    });
  }
}
