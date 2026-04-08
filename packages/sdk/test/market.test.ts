import { describe, expect, it } from "vitest";

import {
  FixedRateIrm,
  Market,
  MarketParams,
  MarketType,
} from "../src/index.js";

const WAD = 10n ** 18n;
const VIRTUAL_SHARES = 10n ** 6n;
const VIRTUAL_ASSETS = 1n;

function rawCompoundInterest(rate: bigint, elapsed: bigint) {
  const linearTerm = rate * elapsed;
  const quadraticTerm = (linearTerm * linearTerm) / (2n * WAD);
  const cubicTerm = (quadraticTerm * linearTerm) / (3n * WAD);

  return linearTerm + quadraticTerm + cubicTerm;
}

function rawConvertToSharesDown(
  assets: bigint,
  totalAssets: bigint,
  totalShares: bigint,
) {
  return (assets * (totalShares + VIRTUAL_SHARES)) / (totalAssets + VIRTUAL_ASSETS);
}

describe("Market accrual", () => {
  it("accrues borrow-market interest and mints fee shares", () => {
    const rate = 100_000_000n;
    const elapsed = 86_400n;
    const initialSupplyAssets = 1_000n * WAD;
    const initialSupplyShares = 1_000n * WAD;
    const initialBorrowAssets = 800n * WAD;

    const market = new Market({
      params: new MarketParams({
        address: "0x1000000000000000000000000000000000000001",
        marketType: MarketType.Borrow,
        borrowToken: "0x1000000000000000000000000000000000000011",
        collateralToken: "0x1000000000000000000000000000000000000021",
        oracle: "0x1000000000000000000000000000000000000031",
        irm: "0x1000000000000000000000000000000000000041",
        liquidationEngine: "0x1000000000000000000000000000000000000051",
        maxLtv: 800_000000000000000n,
        feeRecipient: "0x1000000000000000000000000000000000000061",
        borrowOpeningFee: 0n,
      }),
      totalSupplyAssets: initialSupplyAssets,
      totalSupplyShares: initialSupplyShares,
      totalBorrowAssets: initialBorrowAssets,
      totalBorrowShares: initialBorrowAssets,
      lastUpdate: 0n,
      collateralPrice: 1n,
      interestRateModel: new FixedRateIrm({ borrowRate: rate, lastUpdate: 0n }),
      interestFee: 100_000000000000000n,
    });

    const accrued = market.accrueInterest(elapsed);
    const expectedInterestFactor = 8_640_037_324_907n;
    const expectedInterest = (initialBorrowAssets * expectedInterestFactor) / WAD;
    const expectedFeeBorrowAssets = 691_202_985_992_560n;
    const expectedFeeShares = rawConvertToSharesDown(
      expectedFeeBorrowAssets,
      initialSupplyAssets + expectedInterest - expectedFeeBorrowAssets,
      initialSupplyShares,
    );

    expect(rawCompoundInterest(rate, elapsed)).toBe(expectedInterestFactor);
    expect(accrued.totalBorrowAssets).toBe(800_006_912_029_859_925_600n);
    expect(accrued.totalSupplyAssets).toBe(1_000_006_912_029_859_925_600n);
    expect(accrued.totalSupplyShares).toBe(
      initialSupplyShares + expectedFeeShares,
    );
  });

  it("accrues mint-market interest into claimable fees", () => {
    const rate = 120_000_000n;
    const elapsed = 43_200n;
    const debtCeiling = 2_000n * WAD;
    const initialBorrowAssets = 1_250n * WAD;

    const market = new Market({
      params: new MarketParams({
        address: "0x2000000000000000000000000000000000000001",
        marketType: MarketType.Mint,
        borrowToken: "0x2000000000000000000000000000000000000011",
        collateralToken: "0x2000000000000000000000000000000000000021",
        oracle: "0x2000000000000000000000000000000000000031",
        irm: "0x2000000000000000000000000000000000000041",
        liquidationEngine: "0x2000000000000000000000000000000000000051",
        maxLtv: 750_000000000000000n,
        feeRecipient: "0x2000000000000000000000000000000000000061",
        borrowOpeningFee: 0n,
      }),
      totalSupplyAssets: debtCeiling,
      totalSupplyShares: 0n,
      totalBorrowAssets: initialBorrowAssets,
      totalBorrowShares: initialBorrowAssets,
      lastUpdate: 0n,
      collateralPrice: 1n,
      interestRateModel: new FixedRateIrm({ borrowRate: rate, lastUpdate: 0n }),
      claimableFeesAssets: 5n * WAD,
      badDebtAssets: 20n * WAD,
    });

    const accrued = market.accrueInterest(elapsed);
    const expectedInterest = 6_480_016_796_188_750n;

    expect(accrued.totalSupplyAssets).toBe(debtCeiling);
    expect(accrued.totalBorrowAssets).toBe(1_250_006_480_016_796_188_750n);
    expect(accrued.claimableFeesAssets).toBe(5_006_480_016_796_188_750n);
    expect(accrued.liquidity).toBe(729_993_519_983_203_811_250n);
    expect(expectedInterest).toBe(6_480_016_796_188_750n);
  });

  it("caps borrow-market liquidity by token balance and pause state", () => {
    const market = new Market({
      params: new MarketParams({
        address: "0x3000000000000000000000000000000000000001",
        marketType: MarketType.Borrow,
        borrowToken: "0x3000000000000000000000000000000000000011",
        collateralToken: "0x3000000000000000000000000000000000000021",
        oracle: "0x3000000000000000000000000000000000000031",
        irm: "0x3000000000000000000000000000000000000041",
        liquidationEngine: "0x3000000000000000000000000000000000000051",
        maxLtv: 800_000000000000000n,
        feeRecipient: "0x3000000000000000000000000000000000000061",
        borrowOpeningFee: 0n,
      }),
      totalSupplyAssets: 1_000n * WAD,
      totalSupplyShares: 1_000n * WAD,
      totalBorrowAssets: 600n * WAD,
      totalBorrowShares: 600n * WAD,
      lastUpdate: 0n,
      collateralPrice: 1n,
      borrowTokenBalance: 250n * WAD,
    });

    expect(market.liquidity).toBe(250n * WAD);

    const pausedMarket = new Market({
      ...market,
      isPaused: true,
    });

    expect(pausedMarket.liquidity).toBe(0n);
  });

  it("returns an identical snapshot when no time elapsed", () => {
    const market = new Market({
      params: new MarketParams({
        address: "0x3100000000000000000000000000000000000001",
        marketType: MarketType.Borrow,
        borrowToken: "0x3100000000000000000000000000000000000011",
        collateralToken: "0x3100000000000000000000000000000000000021",
        oracle: "0x3100000000000000000000000000000000000031",
        irm: "0x3100000000000000000000000000000000000041",
        liquidationEngine: "0x3100000000000000000000000000000000000051",
        maxLtv: 800_000000000000000n,
        feeRecipient: "0x3100000000000000000000000000000000000061",
        borrowOpeningFee: 0n,
      }),
      totalSupplyAssets: 1_000n * WAD,
      totalSupplyShares: 1_000n * WAD,
      totalBorrowAssets: 600n * WAD,
      totalBorrowShares: 600n * WAD,
      lastUpdate: 123_456n,
      collateralPrice: 1n,
      interestRateModel: new FixedRateIrm({ borrowRate: 100_000_000n, lastUpdate: 123_456n }),
      interestFee: 50_000000000000000n,
    });

    const accrued = market.accrueInterest(123_456n);

    expect(accrued.totalSupplyAssets).toBe(market.totalSupplyAssets);
    expect(accrued.totalSupplyShares).toBe(market.totalSupplyShares);
    expect(accrued.totalBorrowAssets).toBe(market.totalBorrowAssets);
    expect(accrued.lastUpdate).toBe(market.lastUpdate);
  });
});
