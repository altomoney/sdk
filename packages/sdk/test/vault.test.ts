import { describe, expect, it } from "vitest";

import {
  FixedPointMath,
  FixedRateIrm,
  Market,
  MarketParams,
  MarketType,
  Vault,
} from "../src/index.js";
import type { MarketConfig } from "../src/index.js";

const WAD = 10n ** 18n;
const VIRTUAL_SHARES = 10n ** 6n;
const VIRTUAL_ASSETS = 1n;

function rawConvertToAssetsDown(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint,
) {
  return (shares * (totalAssets + VIRTUAL_ASSETS)) / (totalShares + VIRTUAL_SHARES);
}

function rawConvertToSharesDown(
  assets: bigint,
  totalAssets: bigint,
  totalShares: bigint,
) {
  return (assets * (totalShares + VIRTUAL_SHARES)) / (totalAssets + VIRTUAL_ASSETS);
}

function rawVaultConvertToSharesDown(
  assets: bigint,
  totalAssets: bigint,
  totalSupply: bigint,
  decimalsOffset: bigint,
) {
  return (assets * (totalSupply + 10n ** decimalsOffset)) / (totalAssets + 1n);
}

function borrowMarket({
  address,
  borrowRate,
  totalSupplyAssets,
  totalBorrowAssets,
  interestFee,
}: {
  address: `0x${string}`;
  borrowRate: bigint;
  totalSupplyAssets: bigint;
  totalBorrowAssets: bigint;
  interestFee: bigint;
}) {
  return new Market({
    params: new MarketParams({
      address,
      marketType: MarketType.Borrow,
      borrowToken: "0x4000000000000000000000000000000000000011",
      collateralToken: "0x4000000000000000000000000000000000000021",
      oracle: "0x4000000000000000000000000000000000000031",
      irm: "0x4000000000000000000000000000000000000041",
      liquidationEngine: "0x4000000000000000000000000000000000000051",
      maxLtv: 800_000000000000000n,
      feeRecipient: "0x4000000000000000000000000000000000000061",
      borrowOpeningFee: 0n,
    }),
    totalSupplyAssets,
    totalSupplyShares: totalSupplyAssets,
    totalBorrowAssets,
    totalBorrowShares: totalBorrowAssets,
    lastUpdate: 0n,
    collateralPrice: 1n,
    interestRateModel: new FixedRateIrm({ borrowRate, lastUpdate: 0n }),
    interestFee,
  });
}

describe("Vault", () => {
  it("computes weighted APY and liquidity across allocations", () => {
    const marketA = borrowMarket({
      address: "0x4000000000000000000000000000000000000001",
      borrowRate: 100_000_000n,
      totalSupplyAssets: 1_000n * WAD,
      totalBorrowAssets: 700n * WAD,
      interestFee: 100_000000000000000n,
    });
    const marketB = borrowMarket({
      address: "0x5000000000000000000000000000000000000001",
      borrowRate: 150_000_000n,
      totalSupplyAssets: 900n * WAD,
      totalBorrowAssets: 450n * WAD,
      interestFee: 50_000000000000000n,
    });

    const marketConfig: MarketConfig = {
      cap: 1_000n * WAD,
      enabled: true,
      removableAt: 0n,
    };

    const vault = new Vault({
      config: {
        address: "0x6000000000000000000000000000000000000001",
        asset: "0x4000000000000000000000000000000000000011",
        name: "Alto Vault",
        symbol: "avTOKEN",
        decimalsOffset: 12n,
      },
      owner: "0x6000000000000000000000000000000000000011",
      curator: "0x6000000000000000000000000000000000000021",
      guardian: "0x6000000000000000000000000000000000000031",
      fee: 200_000000000000000n,
      feeRecipient: "0x6000000000000000000000000000000000000041",
      skimRecipient: "0x6000000000000000000000000000000000000051",
      timelock: 86_400n,
      totalSupply: 1_000n * WAD,
      totalAssets: 1_000n * WAD,
      lastTotalAssets: 980n * WAD,
      supplyQueue: [marketA.address, marketB.address],
      withdrawQueue: [marketA.address, marketB.address],
      allocations: [
        {
          market: marketA,
          suppliedAssets: 700n * WAD,
          suppliedShares: 700n * WAD,
          config: marketConfig,
        },
        {
          market: marketB,
          suppliedAssets: 200n * WAD,
          suppliedShares: 200n * WAD,
          config: marketConfig,
        },
      ],
    });

    const expectedAvgSupplyRate =
      58_350_000n;
    const expectedNetRate = FixedPointMath.multiplyWithPrecision(
      expectedAvgSupplyRate,
      800_000000000000000n,
    );
    const expectedMarketBAssets = rawConvertToAssetsDown(
      200n * WAD,
      900n * WAD,
      900n * WAD,
    );

    expect(vault.avgSupplyRate).toBe(expectedAvgSupplyRate);
    expect(vault.netApy).toBeCloseTo(
      Math.expm1(
        (Number(expectedNetRate) / Number(FixedPointMath.MATH_PRECISION)) *
          Number(FixedPointMath.SECONDS_PER_YEAR),
      ),
      12,
    );
    expect(vault.idleLiquidity).toBe(100n * WAD);
    expect(vault.liquidity).toBe(
      100n * WAD + marketA.liquidity + expectedMarketBAssets,
    );

    const shares = vault.toShares(100n * WAD);
    expect(vault.toAssets(shares)).toBeGreaterThanOrEqual(100n * WAD - 1n);
  });

  it("tracks lost assets and fee share minting with contract-like accrual", () => {
    const impairedMarket = borrowMarket({
      address: "0x7000000000000000000000000000000000000001",
      borrowRate: 0n,
      totalSupplyAssets: 800n * WAD,
      totalBorrowAssets: 400n * WAD,
      interestFee: 0n,
    });

    const marketConfig: MarketConfig = {
      cap: 1_000n * WAD,
      enabled: true,
      removableAt: 0n,
    };

    const impairedVault = new Vault({
      config: {
        address: "0x7100000000000000000000000000000000000001",
        asset: "0x4000000000000000000000000000000000000011",
        name: "Impaired Vault",
        symbol: "ivTOKEN",
        decimalsOffset: 12n,
      },
      owner: "0x7100000000000000000000000000000000000011",
      curator: "0x7100000000000000000000000000000000000021",
      guardian: "0x7100000000000000000000000000000000000031",
      fee: 200_000000000000000n,
      feeRecipient: "0x7100000000000000000000000000000000000041",
      skimRecipient: "0x7100000000000000000000000000000000000051",
      timelock: 86_400n,
      totalSupply: 1_000n * WAD,
      totalAssets: 800n * WAD,
      lastTotalAssets: 900n * WAD,
      lostAssets: 0n,
      supplyQueue: [impairedMarket.address],
      withdrawQueue: [impairedMarket.address],
      allocations: [
        {
          market: impairedMarket,
          suppliedAssets: 800n * WAD,
          suppliedShares: 800n * WAD,
          config: marketConfig,
        },
      ],
    });

    const impairedAccrued = impairedVault.accrueInterest(0n);
    const expectedSuppliedAssets = rawConvertToAssetsDown(
      800n * WAD,
      800n * WAD,
      800n * WAD,
    );

    expect(impairedAccrued.lostAssets).toBe(900n * WAD - expectedSuppliedAssets);
    expect(impairedAccrued.totalAssets).toBe(900n * WAD);
    expect(impairedAccrued.totalSupply).toBe(1_000n * WAD);

    const yieldingMarket = borrowMarket({
      address: "0x7200000000000000000000000000000000000001",
      borrowRate: 0n,
      totalSupplyAssets: 1_000n * WAD,
      totalBorrowAssets: 400n * WAD,
      interestFee: 0n,
    });

    const yieldingVault = new Vault({
      ...impairedVault,
      withdrawQueue: [yieldingMarket.address],
      supplyQueue: [yieldingMarket.address],
      allocations: [
        {
          market: yieldingMarket,
          suppliedAssets: 1_000n * WAD,
          suppliedShares: 1_000n * WAD,
          config: marketConfig,
        },
      ],
      totalAssets: 1_000n * WAD,
      lastTotalAssets: 900n * WAD,
      lostAssets: 0n,
    });

    const yieldingAccrued = yieldingVault.accrueInterest(0n);
    const expectedYieldingAssets = rawConvertToAssetsDown(
      1_000n * WAD,
      1_000n * WAD,
      1_000n * WAD,
    );
    const feeAssets =
      ((expectedYieldingAssets - 900n * WAD) * 200_000000000000000n) / WAD;
    const expectedFeeShares = rawVaultConvertToSharesDown(
      feeAssets,
      expectedYieldingAssets - feeAssets,
      1_000n * WAD,
      12n,
    );

    expect(yieldingAccrued.totalAssets).toBe(expectedYieldingAssets);
    expect(yieldingAccrued.totalSupply).toBe(1_000n * WAD + expectedFeeShares);
    expect(yieldingAccrued.toShares(100n * WAD, "Up", 0n)).toBe(102_040_816_428_571_511_870n);
  });

  it("handles a vault with zero allocations", () => {
    const vault = new Vault({
      config: {
        address: "0x7300000000000000000000000000000000000001",
        asset: "0x4000000000000000000000000000000000000011",
        name: "Idle Vault",
        symbol: "idleTOKEN",
        decimalsOffset: 12n,
      },
      owner: "0x7300000000000000000000000000000000000011",
      curator: "0x7300000000000000000000000000000000000021",
      guardian: "0x7300000000000000000000000000000000000031",
      fee: 0n,
      feeRecipient: "0x7300000000000000000000000000000000000041",
      skimRecipient: "0x7300000000000000000000000000000000000051",
      timelock: 86_400n,
      totalSupply: 500n * WAD,
      totalAssets: 500n * WAD,
      lastTotalAssets: 500n * WAD,
      lostAssets: 0n,
      supplyQueue: [],
      withdrawQueue: [],
      allocations: [],
    });

    expect(vault.avgSupplyRate).toBe(0n);
    expect(vault.idleLiquidity).toBe(500n * WAD);
    expect(vault.liquidity).toBe(500n * WAD);
    expect(vault.accrueInterest(0n).totalAssets).toBe(500n * WAD);
  });
});
