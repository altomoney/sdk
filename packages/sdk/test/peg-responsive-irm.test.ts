import { describe, expect, it } from "vitest";

import {
  IrmType,
  Market,
  MarketParams,
  MarketType,
  PegResponsiveExponentialIrm,
} from "../src/index.js";
import { CONTRACT_VECTORS, DEBT, START } from "./fixtures-peg-irm.js";

const WAD = 10n ** 18n;

function initialState(baseRate: bigint) {
  return { borrowRate: baseRate, lastUpdate: START, recoveryStartedAt: 0n, stressMode: false };
}

function frxUsdMintMarket(irm: PegResponsiveExponentialIrm, lastUpdate: bigint) {
  return new Market({
    params: new MarketParams({
      address: "0x1000000000000000000000000000000000000001",
      marketType: MarketType.Mint,
      borrowToken: "0x1000000000000000000000000000000000000011",
      collateralToken: "0x1000000000000000000000000000000000000021",
      oracle: "0x1000000000000000000000000000000000000031",
      irm: "0x1000000000000000000000000000000000000041",
      liquidationEngine: "0x1000000000000000000000000000000000000051",
      maxLtv: 800_000000000000000n,
      feeRecipient: "0x1000000000000000000000000000000000000061",
      borrowOpeningFee: 0n,
    }),
    totalSupplyAssets: 10n * DEBT,
    totalSupplyShares: 0n,
    totalBorrowAssets: DEBT,
    totalBorrowShares: DEBT,
    lastUpdate,
    collateralPrice: 1n,
    interestRateModel: irm,
    claimableFeesAssets: 0n,
  });
}

describe("PegResponsiveExponentialIrm contract parity", () => {
  for (const [label, vectors] of Object.entries(CONTRACT_VECTORS)) {
    it(`matches targetBorrowRate for the ${label} configuration`, () => {
      const irm = new PegResponsiveExponentialIrm(
        vectors.config,
        initialState(vectors.config.baseRate),
      );

      for (const [price, rate] of vectors.targets) {
        expect(irm.targetBorrowRate(price)).toBe(rate);
      }
    });

    it(`matches checkpoint interest, previews and state for the ${label} configuration`, () => {
      let state = initialState(vectors.config.baseRate);

      for (const step of vectors.steps) {
        const irm = new PegResponsiveExponentialIrm(
          vectors.config,
          state,
          step.observation,
        );

        expect(irm.previewBorrowRate(step.now)).toEqual(step.preview);
        expect(irm.updateInterestRate(0n, DEBT, step.now)).toEqual({
          interest: step.interest,
          newBorrowRate: step.accruedAtRate,
        });
        expect(irm.state).toEqual(step.state);

        state = irm.state;
      }
    });
  }
});

describe("PegResponsiveExponentialIrm with a zero base rate", () => {
  const config = CONTRACT_VECTORS.frxUSD.config;
  const healthy = { priceWad: WAD, observedAt: START, valid: true };

  it("accrues no interest and keeps a zero rate while the peg is healthy", () => {
    const irm = new PegResponsiveExponentialIrm(config, initialState(0n), healthy);
    const accrued = frxUsdMintMarket(irm, START).accrueInterest(START + 3_600n);

    expect(irm.type).toBe(IrmType.PegResponsiveExponential);
    expect(accrued.totalBorrowAssets).toBe(DEBT);
    expect(accrued.claimableFeesAssets).toBe(0n);
    expect(accrued.borrowRate).toBe(0n);
  });

  it("prices a depeg from zero and leaves the original market snapshot unchanged", () => {
    const stressed = { priceWad: 990_000_000_000_000_000n, observedAt: START, valid: true };
    const irm = new PegResponsiveExponentialIrm(config, initialState(0n), stressed);
    const market = frxUsdMintMarket(irm, START);

    expect(irm.previewBorrowRate(START + 60n).borrowRate).toBe(4n * config.stressRate);

    const accrued = market.accrueInterest(START + 60n);
    const accruedIrm = accrued.interestRateModel as PegResponsiveExponentialIrm;

    expect(accrued.totalBorrowAssets).toBe(DEBT);
    expect(accruedIrm.state).toEqual({
      borrowRate: 4n * config.stressRate,
      lastUpdate: START + 60n,
      recoveryStartedAt: 0n,
      stressMode: true,
    });
    expect(irm.state).toEqual(initialState(0n));
    expect(market.borrowRate).toBe(0n);
  });

  it("refreshes the rate at a checkpoint in the same second as the last update", () => {
    const stressed = { priceWad: 990_000_000_000_000_000n, observedAt: START, valid: true };
    const irm = new PegResponsiveExponentialIrm(config, initialState(0n), stressed);
    const accrued = frxUsdMintMarket(irm, START).accrueInterest(START);

    expect(accrued.totalBorrowAssets).toBe(DEBT);
    expect((accrued.interestRateModel as PegResponsiveExponentialIrm).state).toEqual({
      borrowRate: 4n * config.stressRate,
      lastUpdate: START,
      recoveryStartedAt: 0n,
      stressMode: true,
    });
  });

  it("treats a missing observation like a reverting oracle and holds the zero rate", () => {
    const irm = new PegResponsiveExponentialIrm(config, initialState(0n));

    expect(irm.previewBorrowRate(START + 60n)).toEqual({
      priceWad: 0n,
      observedAt: 0n,
      oracleValid: false,
      borrowRate: 0n,
    });

    irm.updateInterestRate(0n, DEBT, START + 60n);
    expect(irm.state).toEqual({ ...initialState(0n), lastUpdate: START + 60n });
  });
});
