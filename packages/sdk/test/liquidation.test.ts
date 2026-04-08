import { describe, expect, it } from "vitest";

import {
  AssetShareConversionMath,
  DlbDcfPriorityLiquidationEngine,
  Market,
  MarketParams,
  MarketType,
} from "../src/index.js";

const WAD = 10n ** 18n;
const ORACLE_PRECISION = 10n ** 36n;

describe("DlbDcfPriorityLiquidationEngine", () => {
  it("matches the expected full-liquidation amounts for an insolvent position", () => {
    const market = new Market({
      params: new MarketParams({
        address: "0x3000000000000000000000000000000000000001",
        marketType: MarketType.Borrow,
        borrowToken: "0x3000000000000000000000000000000000000011",
        collateralToken: "0x3000000000000000000000000000000000000021",
        oracle: "0x3000000000000000000000000000000000000031",
        irm: "0x3000000000000000000000000000000000000041",
        liquidationEngine: "0x3000000000000000000000000000000000000051",
        maxLtv: 750_000000000000000n,
        feeRecipient: "0x3000000000000000000000000000000000000061",
        borrowOpeningFee: 0n,
      }),
      totalSupplyAssets: 2_000n * WAD,
      totalSupplyShares: 2_000n * WAD,
      totalBorrowAssets: 1_200n * WAD,
      totalBorrowShares: 1_200n * WAD,
      lastUpdate: 0n,
      collateralPrice: 2n * ORACLE_PRECISION,
    });

    const engine = new DlbDcfPriorityLiquidationEngine(
      market,
      {
        maxLiquidationLtv: 800_000000000000000n,
        dynamicBonusFeeStart: 100_000000000000000n,
        ltvForCompleteLiquidation: 900_000000000000000n,
        dynamicBonusFeeDecaySteepness: 3n * WAD,
        liquidationBaseFee: 50_000000000000000n,
        minPenaltyPercentage: 100_000000000000000n,
        protocolFeePercentage: 200_000000000000000n,
        isEnabledPriorityLiquidation: true,
        disablePriorityLiquidationAbovePositionLtv: 950_000000000000000n,
        priorityLiquidationGracePeriod: 3600,
        taggerLiquidationGracePeriod: 7200,
        liquidationWindowTag: 10_800,
      },
      false,
    );

    const quote = engine.quote({
      borrowShares: 55n * WAD,
      collateralAssets: 30n * WAD,
    });

    expect(engine.isLiquidatable({
      borrowShares: 55n * WAD,
      collateralAssets: 30n * WAD,
    })).toBe(true);
    expect(quote.liquidationPercentage).toBe(WAD);
    expect(quote.liquidationFee).toBe(50_000000000000000n);
    expect(quote.newLtv).toBe(0n);
    expect(quote.repaidBorrowAssets).toBe(54_999_999_999_999_954_167n);
    expect(quote.repaidBorrowShares).toBe(55n * WAD);
    expect(quote.seizedCollateralAssets).toBe(28_999_999_999_999_977_084n);
    expect(quote.collateralToLiquidator).toBe(28_699_999_999_999_977_084n);
    expect(quote.protocolSeizedCollateralFee).toBe(300_000_000_000_000_000n);
    expect(quote.seizedCollateralAssets).toBe(
      quote.collateralToLiquidator + quote.protocolSeizedCollateralFee,
    );
  });

  it("uses contract-style down-rounding for repaid borrow shares", () => {
    const market = new Market({
      params: new MarketParams({
        address: "0x3100000000000000000000000000000000000001",
        marketType: MarketType.Borrow,
        borrowToken: "0x3100000000000000000000000000000000000011",
        collateralToken: "0x3100000000000000000000000000000000000021",
        oracle: "0x3100000000000000000000000000000000000031",
        irm: "0x3100000000000000000000000000000000000041",
        liquidationEngine: "0x3100000000000000000000000000000000000051",
        maxLtv: 750_000000000000000n,
        feeRecipient: "0x3100000000000000000000000000000000000061",
        borrowOpeningFee: 0n,
      }),
      totalSupplyAssets: 2_000n * WAD,
      totalSupplyShares: 2_000n * WAD,
      totalBorrowAssets: 1_000n * WAD,
      totalBorrowShares: 1_000n * WAD + 1n,
      lastUpdate: 0n,
      collateralPrice: 2n * ORACLE_PRECISION,
    });

    const engine = new DlbDcfPriorityLiquidationEngine(
      market,
      {
        maxLiquidationLtv: 800_000000000000000n,
        dynamicBonusFeeStart: 100_000000000000000n,
        ltvForCompleteLiquidation: 900_000000000000000n,
        dynamicBonusFeeDecaySteepness: 3n * WAD,
        liquidationBaseFee: 50_000000000000000n,
        minPenaltyPercentage: 100_000000000000000n,
        protocolFeePercentage: 200_000000000000000n,
        isEnabledPriorityLiquidation: true,
        disablePriorityLiquidationAbovePositionLtv: 950_000000000000000n,
        priorityLiquidationGracePeriod: 3600,
        taggerLiquidationGracePeriod: 7200,
        liquidationWindowTag: 10_800,
      },
      false,
    );

    const position = {
      borrowShares: 55n * WAD,
      collateralAssets: 30n * WAD,
    };
    const quote = engine.quote(position);
    const uncappedDownShares = AssetShareConversionMath.convertToSharesDown(
      quote.repaidBorrowAssets,
      market.totalBorrow.assets,
      market.totalBorrow.shares,
    );

    expect(quote.repaidBorrowShares).toBe(
      uncappedDownShares < position.borrowShares
        ? uncappedDownShares
        : position.borrowShares,
    );
  });

  it("matches partial-liquidation amounts when dynamic bonus fee is non-zero", () => {
    const market = new Market({
      params: new MarketParams({
        address: "0x3300000000000000000000000000000000000001",
        marketType: MarketType.Borrow,
        borrowToken: "0x3300000000000000000000000000000000000011",
        collateralToken: "0x3300000000000000000000000000000000000021",
        oracle: "0x3300000000000000000000000000000000000031",
        irm: "0x3300000000000000000000000000000000000041",
        liquidationEngine: "0x3300000000000000000000000000000000000051",
        maxLtv: 750_000000000000000n,
        feeRecipient: "0x3300000000000000000000000000000000000061",
        borrowOpeningFee: 0n,
      }),
      totalSupplyAssets: 2_000n * WAD,
      totalSupplyShares: 2_000n * WAD,
      totalBorrowAssets: 1_200n * WAD,
      totalBorrowShares: 1_200n * WAD,
      lastUpdate: 0n,
      collateralPrice: 2n * ORACLE_PRECISION,
    });

    const engine = new DlbDcfPriorityLiquidationEngine(
      market,
      {
        maxLiquidationLtv: 800_000000000000000n,
        dynamicBonusFeeStart: 100_000000000000000n,
        ltvForCompleteLiquidation: 900_000000000000000n,
        dynamicBonusFeeDecaySteepness: 3n * WAD,
        liquidationBaseFee: 50_000000000000000n,
        minPenaltyPercentage: 100_000000000000000n,
        protocolFeePercentage: 200_000000000000000n,
        isEnabledPriorityLiquidation: true,
        disablePriorityLiquidationAbovePositionLtv: 950_000000000000000n,
        priorityLiquidationGracePeriod: 3600,
        taggerLiquidationGracePeriod: 7200,
        liquidationWindowTag: 10_800,
      },
      false,
    );

    const quote = engine.quote({
      borrowShares: 49n * WAD,
      collateralAssets: 30n * WAD,
    });

    expect(quote.liquidationPercentage).toBe(166_666_666_666_659_870n);
    expect(quote.liquidationFee).toBe(110_590_004_861_954_884n);
    expect(quote.newLtv).toBe(625_000_000_000_005_097n);
    expect(quote.protocolSeizedCollateralFee).toBe(663_540_029_171_729_304n);
    expect(quote.repaidBorrowAssets).toBe(41_725_667_152_861_887_984n);
    expect(quote.repaidBorrowShares).toBe(41_725_667_152_861_922_755n);
    expect(quote.seizedCollateralAssets).toBe(24_180_533_722_289_590_512n);
    expect(quote.collateralToLiquidator).toBe(23_516_993_693_117_861_208n);
  });

  it("returns an all-zero quote for a solvent position", () => {
    const market = new Market({
      params: new MarketParams({
        address: "0x3200000000000000000000000000000000000001",
        marketType: MarketType.Borrow,
        borrowToken: "0x3200000000000000000000000000000000000011",
        collateralToken: "0x3200000000000000000000000000000000000021",
        oracle: "0x3200000000000000000000000000000000000031",
        irm: "0x3200000000000000000000000000000000000041",
        liquidationEngine: "0x3200000000000000000000000000000000000051",
        maxLtv: 750_000000000000000n,
        feeRecipient: "0x3200000000000000000000000000000000000061",
        borrowOpeningFee: 0n,
      }),
      totalSupplyAssets: 2_000n * WAD,
      totalSupplyShares: 2_000n * WAD,
      totalBorrowAssets: 1_200n * WAD,
      totalBorrowShares: 1_200n * WAD,
      lastUpdate: 0n,
      collateralPrice: 2n * ORACLE_PRECISION,
    });

    const engine = new DlbDcfPriorityLiquidationEngine(
      market,
      {
        maxLiquidationLtv: 800_000000000000000n,
        dynamicBonusFeeStart: 100_000000000000000n,
        ltvForCompleteLiquidation: 900_000000000000000n,
        dynamicBonusFeeDecaySteepness: 3n * WAD,
        liquidationBaseFee: 50_000000000000000n,
        minPenaltyPercentage: 100_000000000000000n,
        protocolFeePercentage: 200_000000000000000n,
        isEnabledPriorityLiquidation: true,
        disablePriorityLiquidationAbovePositionLtv: 950_000000000000000n,
        priorityLiquidationGracePeriod: 3600,
        taggerLiquidationGracePeriod: 7200,
        liquidationWindowTag: 10_800,
      },
      false,
    );

    expect(
      engine.quote({ borrowShares: 10n * WAD, collateralAssets: 30n * WAD }),
    ).toEqual({
      seizedCollateralAssets: 0n,
      collateralToLiquidator: 0n,
      repaidBorrowAssets: 0n,
      repaidBorrowShares: 0n,
      protocolSeizedCollateralFee: 0n,
      liquidationPercentage: 0n,
      liquidationFee: 0n,
      newLtv: 0n,
    });
  });
});
