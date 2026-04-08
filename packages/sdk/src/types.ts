export type Address = `0x${string}`;

export type BigIntish = bigint | number | string;

export type RoundingDirection = "Up" | "Down";

export enum MarketType {
  Borrow = "borrow",
  Mint = "mint",
}

export enum IrmType {
  FixedRate = "fixed-rate",
  AdaptiveCurve = "adaptive-curve",
}

export enum LiquidationEngineType {
  DlbDcfPriority = "dlb-dcf-priority",
}

export interface Balance {
  assets: bigint;
  shares: bigint;
}

export interface MarketPosition {
  supplyShares: bigint;
  borrowShares: bigint;
  collateralAssets: bigint;
}

export interface PendingAddress {
  value: Address;
  validAt: bigint;
}

export interface PendingUint192 {
  value: bigint;
  validAt: bigint;
}

export interface MarketConfig {
  cap: bigint;
  enabled: boolean;
  removableAt: bigint;
}

export function toBigInt(value: BigIntish): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}
