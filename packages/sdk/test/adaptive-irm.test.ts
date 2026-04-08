import { describe, expect, it } from "vitest";

import { AdaptiveCurveIrm } from "../src/index.js";

const WAD = 10n ** 18n;

function rawCompoundInterest(rate: bigint, elapsed: bigint) {
  const linearTerm = rate * elapsed;
  const quadraticTerm = (linearTerm * linearTerm) / (2n * WAD);
  const cubicTerm = (quadraticTerm * linearTerm) / (3n * WAD);

  return linearTerm + quadraticTerm + cubicTerm;
}

describe("AdaptiveCurveIrm", () => {
  it("uses the initial target rate at target utilization when uninitialized", () => {
    const irm = new AdaptiveCurveIrm(
      {
        curveSteepness: 4n * WAD,
        adjustmentSpeed: 1n * 10n ** 12n,
        targetUtilization: 800_000000000000000n,
        initialRateAtTarget: 50_000_000n,
        minRateAtTarget: 10_000_000n,
        maxRateAtTarget: 200_000_000n,
      },
      {
        rateAtTarget: 0n,
        lastUpdate: 1_000n,
      },
    );

    const preview = irm.previewInterestRate(1_000n * WAD, 800n * WAD, 1_100n);
    const expectedInterest = (800n * WAD * rawCompoundInterest(50_000_000n, 100n)) / WAD;

    expect(preview.newBorrowRate).toBe(50_000_000n);
    expect(preview.interest).toBe(expectedInterest);
  });

  it("returns zero interest and preserves state when no time elapsed", () => {
    const irm = new AdaptiveCurveIrm(
      {
        curveSteepness: 4n * WAD,
        adjustmentSpeed: 1n * 10n ** 12n,
        targetUtilization: 800_000000000000000n,
        initialRateAtTarget: 50_000_000n,
        minRateAtTarget: 10_000_000n,
        maxRateAtTarget: 200_000_000n,
      },
      {
        rateAtTarget: 75_000_000n,
        lastUpdate: 2_000n,
      },
    );

    const result = irm.updateInterestRate(1_000n * WAD, 800n * WAD, 2_000n);

    expect(result.interest).toBe(0n);
    expect(result.newBorrowRate).toBe(75_000_000n);
    expect(irm.state).toEqual({
      rateAtTarget: 75_000_000n,
      lastUpdate: 2_000n,
    });
  });

  it("matches the expected mid-range curve output below target utilization", () => {
    const irm = new AdaptiveCurveIrm(
      {
        curveSteepness: 4n * WAD,
        adjustmentSpeed: 1n * 10n ** 12n,
        targetUtilization: 800_000000000000000n,
        initialRateAtTarget: 50_000_000n,
        minRateAtTarget: 10_000_000n,
        maxRateAtTarget: 200_000_000n,
      },
      {
        rateAtTarget: 50_000_000n,
        lastUpdate: 5_000n,
      },
    );

    const preview = irm.previewInterestRate(1_000n * WAD, 600n * WAD, 5_000n);

    expect(preview.interest).toBe(0n);
    expect(preview.newBorrowRate).toBe(40_625_000n);
  });

  it("clamps rateAtTarget to the max bound under sustained over-utilization", () => {
    const irm = new AdaptiveCurveIrm(
      {
        curveSteepness: 4n * WAD,
        adjustmentSpeed: 20n * 10n ** 15n,
        targetUtilization: 500_000000000000000n,
        initialRateAtTarget: 50_000_000n,
        minRateAtTarget: 10_000_000n,
        maxRateAtTarget: 120_000_000n,
      },
      {
        rateAtTarget: 90_000_000n,
        lastUpdate: 0n,
      },
    );

    const result = irm.updateInterestRate(1_000n * WAD, 1_000n * WAD, 10_000n);

    expect(result.newBorrowRate).toBeGreaterThan(90_000_000n);
    expect(irm.state.rateAtTarget).toBe(120_000_000n);
  });

  it("clamps rateAtTarget to the min bound under sustained under-utilization", () => {
    const irm = new AdaptiveCurveIrm(
      {
        curveSteepness: 4n * WAD,
        adjustmentSpeed: 20n * 10n ** 15n,
        targetUtilization: 800_000000000000000n,
        initialRateAtTarget: 50_000_000n,
        minRateAtTarget: 10_000_000n,
        maxRateAtTarget: 120_000_000n,
      },
      {
        rateAtTarget: 90_000_000n,
        lastUpdate: 0n,
      },
    );

    const result = irm.updateInterestRate(1_000n * WAD, 0n, 10_000n);

    expect(result.newBorrowRate).toBeLessThan(90_000_000n);
    expect(irm.state.rateAtTarget).toBe(10_000_000n);
  });
});
