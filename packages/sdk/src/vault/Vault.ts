import { FixedPointMath, rateToApy } from "../math/index.js";
import type { Address, BigIntish, RoundingDirection } from "../types.js";
import { toBigInt } from "../types.js";
import { VaultConfig } from "./VaultConfig.js";
import type { IVault, VaultAllocation } from "./types.js";

function mulDiv(
  x: bigint,
  y: bigint,
  denominator: bigint,
  rounding: RoundingDirection,
) {
  return FixedPointMath.divideWithRounding(x, y, denominator, rounding);
}

function currentTimestamp() {
  return BigInt(Math.floor(Date.now() / 1000));
}

export class Vault {
  public readonly config: VaultConfig;
  public readonly owner: Address;
  public readonly curator: Address;
  public readonly guardian: Address;
  public readonly fee: bigint;
  public readonly feeRecipient: Address;
  public readonly skimRecipient: Address;
  public readonly pendingTimelock?: IVault["pendingTimelock"];
  public readonly pendingGuardian?: IVault["pendingGuardian"];
  public readonly timelock: bigint;
  public readonly totalSupply: bigint;
  public readonly totalAssets: bigint;
  public readonly lastTotalAssets: bigint;
  public readonly lostAssets?: bigint;
  public readonly supplyQueue: Address[];
  public readonly withdrawQueue: Address[];
  public readonly allocations: readonly VaultAllocation[];

  constructor(vault: IVault) {
    this.config =
      vault.config instanceof VaultConfig
        ? vault.config
        : new VaultConfig(vault.config);
    this.owner = vault.owner;
    this.curator = vault.curator;
    this.guardian = vault.guardian;
    this.fee = toBigInt(vault.fee);
    this.feeRecipient = vault.feeRecipient;
    this.skimRecipient = vault.skimRecipient;
    this.pendingTimelock = vault.pendingTimelock;
    this.pendingGuardian = vault.pendingGuardian;
    this.timelock = toBigInt(vault.timelock);
    this.totalSupply = toBigInt(vault.totalSupply);
    this.totalAssets = toBigInt(vault.totalAssets);
    this.lastTotalAssets = toBigInt(vault.lastTotalAssets);
    this.lostAssets =
      vault.lostAssets == null ? undefined : toBigInt(vault.lostAssets);
    this.supplyQueue = [...vault.supplyQueue];
    this.withdrawQueue = [...vault.withdrawQueue];
    this.allocations = vault.allocations.map((allocation) => ({
      ...allocation,
      suppliedAssets: toBigInt(allocation.suppliedAssets),
      suppliedShares:
        allocation.suppliedShares == null
          ? undefined
          : toBigInt(allocation.suppliedShares),
      config: {
        ...allocation.config,
        cap: toBigInt(allocation.config.cap),
        removableAt: toBigInt(allocation.config.removableAt),
      },
    }));
  }

  get address() {
    return this.config.address;
  }

  get asset() {
    return this.config.asset;
  }

  get name() {
    return this.config.name;
  }

  get symbol() {
    return this.config.symbol;
  }

  get decimalsOffset() {
    return this.config.decimalsOffset;
  }

  get totalInterest() {
    return this.accrualState().newTotalAssets - this.lastTotalAssets;
  }

  get allocatedAssets() {
    return this.allocations.reduce(
      (sum, allocation) => sum + toBigInt(allocation.suppliedAssets),
      0n,
    );
  }

  get idleLiquidity() {
    return FixedPointMath.zeroFloorSub(this.totalAssets, this.allocatedAssets);
  }

  get liquidity() {
    const allocationsByMarket = new Map(
      this.allocations.map((allocation) => [allocation.market.address, allocation]),
    );

    return this.withdrawQueue.reduce((sum, marketAddress) => {
      const allocation = allocationsByMarket.get(marketAddress);
      if (!allocation) return sum;

      const suppliedAssets =
        allocation.suppliedShares == null
          ? toBigInt(allocation.suppliedAssets)
          : allocation.market.toSupplyAssets(allocation.suppliedShares);
      const withdrawable = FixedPointMath.min(
        suppliedAssets,
        allocation.market.liquidity,
      );

      return sum + withdrawable;
    }, this.idleLiquidity);
  }

  get avgSupplyRate() {
    const totalAssets = this.accrualState().newTotalAssets;
    if (totalAssets === 0n) return 0n;

    return this.allocations.reduce((sum, allocation) => {
      return (
        sum +
        allocation.market.supplyRate * toBigInt(allocation.suppliedAssets)
      );
    }, 0n) / totalAssets;
  }

  get apy() {
    return rateToApy(this.avgSupplyRate);
  }

  get netApy() {
    return rateToApy(
      FixedPointMath.multiplyWithPrecision(
        this.avgSupplyRate,
        FixedPointMath.MATH_PRECISION - this.fee,
      ),
    );
  }

  toAssets(
    shares: BigIntish,
    rounding: RoundingDirection = "Down",
    timestamp?: BigIntish,
  ) {
    const { newTotalAssets, newTotalSupply } = this.accrualState(timestamp);

    return mulDiv(
      toBigInt(shares),
      newTotalAssets + 1n,
      newTotalSupply + 10n ** this.decimalsOffset,
      rounding,
    );
  }

  toShares(
    assets: BigIntish,
    rounding: RoundingDirection = "Up",
    timestamp?: BigIntish,
  ) {
    const { newTotalAssets, newTotalSupply } = this.accrualState(timestamp);

    return mulDiv(
      toBigInt(assets),
      newTotalSupply + 10n ** this.decimalsOffset,
      newTotalAssets + 1n,
      rounding,
    );
  }

  getAllocationProportion(marketAddress: Address) {
    if (this.totalAssets === 0n) return 0n;

    const allocation = this.allocations.find(
      (entry) => entry.market.address === marketAddress,
    );
    if (!allocation) return 0n;

    return FixedPointMath.divideWithPrecisionDown(
      toBigInt(allocation.suppliedAssets),
      this.totalAssets,
    );
  }

  accrueInterest(timestamp?: BigIntish) {
    const {
      nextAllocations,
      newLostAssets,
      newTotalAssets,
      feeShares,
      newTotalSupply,
    } = this.accrualState(timestamp);

    return new Vault({
      ...this,
      allocations: nextAllocations,
      totalAssets: newTotalAssets,
      lastTotalAssets: newTotalAssets,
      totalSupply: newTotalSupply,
      lostAssets: newLostAssets,
    });
  }

  private accrualState(timestamp?: BigIntish) {
    const now = timestamp == null ? undefined : toBigInt(timestamp);
    const snapshotIdleLiquidity = this.idleLiquidity;
    const nextAllocations = this.allocations.map((allocation) => {
      const market =
        now == null ? allocation.market : allocation.market.accrueInterest(now);
      const suppliedAssets =
        allocation.suppliedShares == null
          ? toBigInt(allocation.suppliedAssets)
          : market.toSupplyAssets(allocation.suppliedShares);

      return {
        ...allocation,
        market,
        suppliedAssets,
      };
    });

    const allocationsByMarket = new Map(
      nextAllocations.map((allocation) => [allocation.market.address, allocation]),
    );
    const realTotalAssets =
      this.withdrawQueue.reduce((sum, marketAddress) => {
        const allocation = allocationsByMarket.get(marketAddress);
        if (!allocation) return sum;

        return sum + toBigInt(allocation.suppliedAssets);
      }, 0n) + snapshotIdleLiquidity;

    const currentLostAssets = this.lostAssets ?? 0n;
    const lossReference = FixedPointMath.zeroFloorSub(
      this.lastTotalAssets,
      currentLostAssets,
    );
    const newLostAssets =
      realTotalAssets < lossReference
        ? this.lastTotalAssets - realTotalAssets
        : currentLostAssets;
    const newTotalAssets = realTotalAssets + newLostAssets;
    const totalInterest = newTotalAssets - this.lastTotalAssets;
    const feeAssets =
      totalInterest === 0n || this.fee === 0n
        ? 0n
        : FixedPointMath.multiplyWithPrecision(totalInterest, this.fee);
    const feeShares =
      feeAssets === 0n
        ? 0n
        : mulDiv(
            feeAssets,
            this.totalSupply + 10n ** this.decimalsOffset,
            newTotalAssets - feeAssets + 1n,
            "Down",
          );

    return {
      nextAllocations,
      realTotalAssets,
      newLostAssets,
      newTotalAssets,
      feeShares,
      newTotalSupply: this.totalSupply + feeShares,
    };
  }
}
