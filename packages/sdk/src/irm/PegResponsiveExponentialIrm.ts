import { LN_2_INT, wExp } from "../math/ExplLib.js";
import { FixedPointMath } from "../math/FixedPointMath.js";
import { IrmType, type BigIntish, toBigInt } from "../types.js";
import { calculateCompoundInterest } from "./calculateCompoundInterest.js";
import type { IIrm, IrmAccrualResult } from "./types.js";

/** Conservative input cap for the exponential region, matching the contract. */
const MAX_EXPONENT_INPUT = 50n * FixedPointMath.MATH_PRECISION;

export interface PegResponsiveExponentialIrmConfig {
  recoveryPrice: bigint;
  stressPrice: bigint;
  /** May be zero. */
  baseRate: bigint;
  stressRate: bigint;
  maxRate: bigint;
  doublingDistance: bigint;
  recoveryDelay: bigint;
  maxOracleAge: bigint;
}

export interface PegResponsiveExponentialIrmState {
  borrowRate: bigint;
  lastUpdate: bigint;
  recoveryStartedAt: bigint;
  stressMode: boolean;
}

/** Raw `IDusdPegOracle.getPrice()` result. Freshness is checked against the accrual timestamp. */
export interface PegObservation {
  priceWad: bigint;
  observedAt: bigint;
  valid: boolean;
}

export interface PegBorrowRatePreview {
  priceWad: bigint;
  observedAt: bigint;
  oracleValid: boolean;
  borrowRate: bigint;
}

export interface PegResponsiveExponentialIrmConfigInput {
  recoveryPrice: BigIntish;
  stressPrice: BigIntish;
  baseRate: BigIntish;
  stressRate: BigIntish;
  maxRate: BigIntish;
  doublingDistance: BigIntish;
  recoveryDelay: BigIntish;
  maxOracleAge: BigIntish;
}

export interface PegResponsiveExponentialIrmStateInput {
  borrowRate: BigIntish;
  lastUpdate: BigIntish;
  recoveryStartedAt: BigIntish;
  stressMode: boolean;
}

export interface PegObservationInput {
  priceWad: BigIntish;
  observedAt: BigIntish;
  valid: boolean;
}

/**
 * Models `PegResponsiveExponentialIrm`. Interest accrues at the stored rate, then each
 * checkpoint stores a new rate derived from the peg observation. A missing observation
 * is treated like a reverting oracle call.
 */
export class PegResponsiveExponentialIrm implements IIrm {
  public readonly type = IrmType.PegResponsiveExponential;
  private readonly irmConfig: PegResponsiveExponentialIrmConfig;
  private readonly irmState: PegResponsiveExponentialIrmState;
  private readonly observation?: PegObservation;

  constructor(
    config: PegResponsiveExponentialIrmConfigInput | PegResponsiveExponentialIrmConfig,
    state: PegResponsiveExponentialIrmStateInput | PegResponsiveExponentialIrmState,
    pegObservation?: PegObservationInput | PegObservation,
  ) {
    this.irmConfig = PegResponsiveExponentialIrm.normalizeConfig(config);
    this.irmState = PegResponsiveExponentialIrm.normalizeState(state);
    this.observation =
      pegObservation == null
        ? undefined
        : PegResponsiveExponentialIrm.normalizeObservation(pegObservation);
  }

  get config(): PegResponsiveExponentialIrmConfig {
    return { ...this.irmConfig };
  }

  get state(): PegResponsiveExponentialIrmState {
    return { ...this.irmState };
  }

  get pegObservation(): PegObservation | undefined {
    return this.observation == null ? undefined : { ...this.observation };
  }

  /** Mirrors `updateInterestRateView`: interest and the stored rate used to accrue it. */
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

  /** Mirrors `updateInterestRate`: accrues at the stored rate, then refreshes the rate. */
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
    this.refreshBorrowRate(nowSeconds);

    return result;
  }

  /** Mirrors `previewBorrowRate`: the rate a checkpoint at `nowSeconds` would store. */
  previewBorrowRate(nowSeconds: BigIntish): PegBorrowRatePreview {
    const now = toBigInt(nowSeconds);
    const { priceWad, observedAt, valid } = this.readPegPrice(now);

    if (!valid) {
      return {
        priceWad,
        observedAt,
        oracleValid: false,
        borrowRate: this.irmState.borrowRate,
      };
    }

    const { stressMode } = this.nextStressState(priceWad, true, now);

    return {
      priceWad,
      observedAt,
      oracleValid: true,
      borrowRate: this.effectiveTargetRate(priceWad, stressMode),
    };
  }

  /** Mirrors `targetBorrowRate`: the raw curve without the stress-mode floor. */
  targetBorrowRate(price: BigIntish): bigint {
    const priceWad = toBigInt(price);
    const config = this.irmConfig;
    const wad = FixedPointMath.MATH_PRECISION;

    if (priceWad >= config.recoveryPrice) return config.baseRate;

    if (priceWad >= config.stressPrice) {
      const position =
        ((config.recoveryPrice - priceWad) * wad) /
        (config.recoveryPrice - config.stressPrice);
      const rateIncrease = ((config.stressRate - config.baseRate) * position) / wad;

      return config.baseRate + rateIncrease;
    }

    const stressDrop = config.stressPrice - priceWad;
    const exponent = FixedPointMath.min(
      (LN_2_INT * stressDrop) / config.doublingDistance,
      MAX_EXPONENT_INPUT,
    );
    const multiplier = wExp(exponent);

    return FixedPointMath.min((config.stressRate * multiplier) / wad, config.maxRate);
  }

  private refreshBorrowRate(nowSeconds: bigint) {
    const borrowRate = this.irmState.borrowRate;
    const { priceWad, valid } = this.readPegPrice(nowSeconds);
    const { stressMode, recoveryStartedAt } = this.nextStressState(
      priceWad,
      valid,
      nowSeconds,
    );
    const floor = stressMode ? this.irmConfig.stressRate : this.irmConfig.baseRate;

    this.irmState.stressMode = stressMode;
    this.irmState.recoveryStartedAt = recoveryStartedAt;
    this.irmState.borrowRate = valid
      ? this.effectiveTargetRate(priceWad, stressMode)
      : FixedPointMath.min(
          FixedPointMath.max(borrowRate, floor),
          this.irmConfig.maxRate,
        );
  }

  private nextStressState(priceWad: bigint, oracleValid: boolean, nowSeconds: bigint) {
    const { stressMode, recoveryStartedAt } = this.irmState;
    const config = this.irmConfig;

    if (!oracleValid) return { stressMode, recoveryStartedAt: 0n };
    if (!stressMode) {
      return { stressMode: priceWad <= config.stressPrice, recoveryStartedAt: 0n };
    }
    if (priceWad < config.recoveryPrice) return { stressMode: true, recoveryStartedAt: 0n };
    if (recoveryStartedAt === 0n) return { stressMode: true, recoveryStartedAt: nowSeconds };
    if (nowSeconds - recoveryStartedAt < config.recoveryDelay) {
      return { stressMode: true, recoveryStartedAt };
    }

    return { stressMode: false, recoveryStartedAt: 0n };
  }

  private effectiveTargetRate(priceWad: bigint, stressMode: boolean) {
    const targetRate = this.targetBorrowRate(priceWad);

    return stressMode
      ? FixedPointMath.max(targetRate, this.irmConfig.stressRate)
      : targetRate;
  }

  private readPegPrice(nowSeconds: bigint): PegObservation {
    if (this.observation == null) return { priceWad: 0n, observedAt: 0n, valid: false };

    const { priceWad, observedAt, valid } = this.observation;
    if (
      !valid ||
      priceWad === 0n ||
      observedAt === 0n ||
      observedAt > nowSeconds ||
      nowSeconds - observedAt > this.irmConfig.maxOracleAge
    ) {
      return { priceWad: 0n, observedAt, valid: false };
    }

    return { priceWad, observedAt, valid: true };
  }

  static normalizeConfig(
    config: PegResponsiveExponentialIrmConfigInput | PegResponsiveExponentialIrmConfig,
  ): PegResponsiveExponentialIrmConfig {
    return {
      recoveryPrice: toBigInt(config.recoveryPrice),
      stressPrice: toBigInt(config.stressPrice),
      baseRate: toBigInt(config.baseRate),
      stressRate: toBigInt(config.stressRate),
      maxRate: toBigInt(config.maxRate),
      doublingDistance: toBigInt(config.doublingDistance),
      recoveryDelay: toBigInt(config.recoveryDelay),
      maxOracleAge: toBigInt(config.maxOracleAge),
    };
  }

  static normalizeState(
    state: PegResponsiveExponentialIrmStateInput | PegResponsiveExponentialIrmState,
  ): PegResponsiveExponentialIrmState {
    return {
      borrowRate: toBigInt(state.borrowRate),
      lastUpdate: toBigInt(state.lastUpdate),
      recoveryStartedAt: toBigInt(state.recoveryStartedAt),
      stressMode: state.stressMode,
    };
  }

  static normalizeObservation(
    observation: PegObservationInput | PegObservation,
  ): PegObservation {
    return {
      priceWad: toBigInt(observation.priceWad),
      observedAt: toBigInt(observation.observedAt),
      valid: observation.valid,
    };
  }
}
