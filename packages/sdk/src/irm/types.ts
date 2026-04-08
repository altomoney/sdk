import type { IrmType } from "../types.js";

export interface IrmAccrualResult {
  interest: bigint;
  newBorrowRate: bigint;
}

export interface IIrm {
  readonly type: IrmType;
  previewInterestRate(
    totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint,
  ): IrmAccrualResult;
  updateInterestRate(
    totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint,
  ): IrmAccrualResult;
}
