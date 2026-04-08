import { wExp } from "../math/ExplLib.js";
import { FixedPointMath } from "../math/FixedPointMath.js";
import { IrmType, type BigIntish, toBigInt } from "../types.js";
import { calculateCompoundInterest } from "./calculateCompoundInterest.js";
import type { IIrm, IrmAccrualResult } from "./types.js";

export interface AdaptiveCurveIrmConfig {
  curveSteepness: bigint;
  adjustmentSpeed: bigint;
  targetUtilization: bigint;
  initialRateAtTarget: bigint;
  minRateAtTarget: bigint;
  maxRateAtTarget: bigint;
}

export interface AdaptiveCurveIrmState {
  lastUpdate: bigint;
  rateAtTarget: bigint;
}

export interface AdaptiveCurveIrmConfigInput {
  curveSteepness: BigIntish;
  adjustmentSpeed: BigIntish;
  targetUtilization: BigIntish;
  initialRateAtTarget: BigIntish;
  minRateAtTarget: BigIntish;
  maxRateAtTarget: BigIntish;
}

export interface AdaptiveCurveIrmStateInput {
  lastUpdate: BigIntish;
  rateAtTarget: BigIntish;
}

export class AdaptiveCurveIrm implements IIrm {
  public readonly type = IrmType.AdaptiveCurve;
  private readonly irmConfig: AdaptiveCurveIrmConfig;
  private readonly irmState: AdaptiveCurveIrmState;

  constructor(
    config: AdaptiveCurveIrmConfigInput | AdaptiveCurveIrmConfig,
    state: AdaptiveCurveIrmStateInput | AdaptiveCurveIrmState,
  ) {
    this.irmConfig = AdaptiveCurveIrm.normalizeConfig(config);
    this.irmState = AdaptiveCurveIrm.normalizeState(state);
  }

  get config(): AdaptiveCurveIrmConfig {
    return { ...this.irmConfig };
  }

  get state(): AdaptiveCurveIrmState {
    return { ...this.irmState };
  }

  previewInterestRate(
    totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint,
  ): IrmAccrualResult {
    const { avgRate } = this.computeInterestRate(
      totalSupply,
      totalBorrowed,
      nowSeconds,
    );

    const interest = FixedPointMath.multiplyWithPrecision(
      totalBorrowed,
      calculateCompoundInterest(avgRate, nowSeconds - this.irmState.lastUpdate),
    );

    return {
      interest,
      newBorrowRate: avgRate,
    };
  }

  updateInterestRate(
    totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint,
  ): IrmAccrualResult {
    const { avgRate, rateAtTarget } = this.computeInterestRate(
      totalSupply,
      totalBorrowed,
      nowSeconds,
    );
    const interest = FixedPointMath.multiplyWithPrecision(
      totalBorrowed,
      calculateCompoundInterest(avgRate, nowSeconds - this.irmState.lastUpdate),
    );

    this.irmState.rateAtTarget = rateAtTarget;
    this.irmState.lastUpdate = nowSeconds;

    return {
      interest,
      newBorrowRate: avgRate,
    };
  }

  private computeInterestRate(
    totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint,
  ) {
    const utilization =
      totalSupply > 0n
        ? FixedPointMath.divideWithPrecisionDown(totalBorrowed, totalSupply)
        : 0n;

    const errNormFactor =
      utilization > this.irmConfig.targetUtilization
        ? FixedPointMath.MATH_PRECISION - this.irmConfig.targetUtilization
        : this.irmConfig.targetUtilization;

    const err = FixedPointMath.divideWithPrecisionDown(
      utilization - this.irmConfig.targetUtilization,
      errNormFactor,
    );

    const startRateAtTarget = this.irmState.rateAtTarget;

    let avgRateAtTarget: bigint;
    let endRateAtTarget: bigint;

    if (startRateAtTarget === 0n) {
      avgRateAtTarget = this.irmConfig.initialRateAtTarget;
      endRateAtTarget = this.irmConfig.initialRateAtTarget;
    } else {
      const speed = FixedPointMath.multiplyWithPrecision(
        this.irmConfig.adjustmentSpeed,
        err,
      );
      const elapsed = nowSeconds - this.irmState.lastUpdate;
      const linearAdaptation = speed * elapsed;

      if (linearAdaptation === 0n) {
        avgRateAtTarget = startRateAtTarget;
        endRateAtTarget = startRateAtTarget;
      } else {
        endRateAtTarget = this.newRateAtTarget(
          startRateAtTarget,
          linearAdaptation,
        );
        const midRateAtTarget = this.newRateAtTarget(
          startRateAtTarget,
          linearAdaptation / 2n,
        );
        avgRateAtTarget =
          (startRateAtTarget + endRateAtTarget + 2n * midRateAtTarget) / 4n;
      }
    }

    return {
      avgRate: this.curve(avgRateAtTarget, err),
      rateAtTarget: endRateAtTarget,
    };
  }

  private curve(rateAtTarget: bigint, err: bigint) {
    const coeff =
      err < 0n
        ? FixedPointMath.MATH_PRECISION -
          FixedPointMath.divideWithPrecisionDown(
            FixedPointMath.MATH_PRECISION,
            this.irmConfig.curveSteepness,
          )
        : this.irmConfig.curveSteepness - FixedPointMath.MATH_PRECISION;

    return FixedPointMath.multiplyWithPrecision(
      FixedPointMath.multiplyWithPrecision(coeff, err) +
        FixedPointMath.MATH_PRECISION,
      rateAtTarget,
    );
  }

  private newRateAtTarget(startRateAtTarget: bigint, linearAdaptation: bigint) {
    return FixedPointMath.min(
      FixedPointMath.max(
        FixedPointMath.multiplyWithPrecision(
          startRateAtTarget,
          wExp(linearAdaptation),
        ),
        this.irmConfig.minRateAtTarget,
      ),
      this.irmConfig.maxRateAtTarget,
    );
  }

  static normalizeConfig(
    config: AdaptiveCurveIrmConfigInput | AdaptiveCurveIrmConfig,
  ): AdaptiveCurveIrmConfig {
    return {
      curveSteepness: toBigInt(config.curveSteepness),
      adjustmentSpeed: toBigInt(config.adjustmentSpeed),
      targetUtilization: toBigInt(config.targetUtilization),
      initialRateAtTarget: toBigInt(config.initialRateAtTarget),
      minRateAtTarget: toBigInt(config.minRateAtTarget),
      maxRateAtTarget: toBigInt(config.maxRateAtTarget),
    };
  }

  static normalizeState(
    state: AdaptiveCurveIrmStateInput | AdaptiveCurveIrmState,
  ): AdaptiveCurveIrmState {
    return {
      rateAtTarget: toBigInt(state.rateAtTarget),
      lastUpdate: toBigInt(state.lastUpdate),
    };
  }
}
