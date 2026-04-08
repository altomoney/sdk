import { FixedPointMath } from "../math/FixedPointMath.js";
import { IrmType, type BigIntish, toBigInt } from "../types.js";
import { calculateCompoundInterest } from "./calculateCompoundInterest.js";
import type { IIrm, IrmAccrualResult } from "./types.js";

export interface FixedRateIrmState {
  borrowRate: bigint;
  lastUpdate: bigint;
}

export interface FixedRateIrmInput {
  borrowRate: BigIntish;
  lastUpdate: BigIntish;
}

export class FixedRateIrm implements IIrm {
  public readonly type = IrmType.FixedRate;
  private readonly irmState: FixedRateIrmState;

  constructor(state: FixedRateIrmInput | FixedRateIrmState) {
    this.irmState = FixedRateIrm.normalizeState(state);
  }

  get state(): FixedRateIrmState {
    return { ...this.irmState };
  }

  previewInterestRate(
    _totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint,
  ): IrmAccrualResult {
    const interest = FixedPointMath.multiplyWithPrecision(
      totalBorrowed,
      calculateCompoundInterest(
        this.irmState.borrowRate,
        nowSeconds - this.irmState.lastUpdate,
      ),
    );

    return {
      interest,
      newBorrowRate: this.irmState.borrowRate,
    };
  }

  updateInterestRate(
    totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint,
  ): IrmAccrualResult {
    const result = this.previewInterestRate(
      totalSupply,
      totalBorrowed,
      nowSeconds,
    );

    this.irmState.lastUpdate = nowSeconds;

    return result;
  }

  static normalizeState(
    state: FixedRateIrmInput | FixedRateIrmState,
  ): FixedRateIrmState {
    return {
      borrowRate: toBigInt(state.borrowRate),
      lastUpdate: toBigInt(state.lastUpdate),
    };
  }
}
