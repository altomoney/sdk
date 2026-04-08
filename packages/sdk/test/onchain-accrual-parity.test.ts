import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";

import {
  AdaptiveCurveIrm,
  AssetShareConversionMath,
  FixedPointMath,
  FixedRateIrm,
  IrmType,
  Market,
  MarketParams,
  MarketType,
} from "../src/index.js";

const FIXED_BLOCK = 24_830_463n;

const syrupUsdcBorrowMarket = "0x33B24510233281350bF8679A7c427d04db0ed208";
const syrupUsdcMintMarket = "0xD2eA320713158a7b7eaE46025B8Ad4CBF3cdc87e";

const marketAbi = parseAbi([
  "function MARKET_TYPE() view returns (uint8)",
  "function borrowToken() view returns (address)",
  "function collateralToken() view returns (address)",
  "function oracle() view returns (address)",
  "function irm() view returns (address)",
  "function liquidationEngine() view returns (address)",
  "function maxLtv() view returns (uint256)",
  "function borrowOpeningFee() view returns (uint256)",
  "function feeRecipient() view returns (address)",
  "function totalSupply() view returns (uint128 assets, uint128 shares)",
  "function totalBorrowed() view returns (uint128 assets, uint128 shares)",
  "function interestFee() view returns (uint256)",
  "function claimableFeesAssets() view returns (uint128)",
  "function badDebtAssets() view returns (uint128)",
]);

const irmCommonAbi = parseAbi([
  "function IRM_TYPE() view returns (uint8)",
  "function updateInterestRateView(uint256 totalSupply, uint256 totalBorrowed) view returns (uint256 interest, uint256 newBorrowRate)",
]);

const adaptiveIrmAbi = parseAbi([
  "function irState() view returns (int256 rateAtTarget, uint48 lastUpdate)",
  "function irmConfig() view returns (int256 curveSteepness, int256 adjustmentSpeed, int256 targetUtilization, int256 initialRateAtTarget, int256 minRateAtTarget, int256 maxRateAtTarget)",
]);

const fixedIrmAbi = parseAbi([
  "function irState() view returns (uint256 borrowRate, uint48 lastUpdate)",
]);

const oracleAbi = parseAbi(["function getPrice() view returns (uint256)"]);
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

function tryGetRpcUrl() {
  const direct = process.env.ETHEREUM_RPC_URL;
  if (direct) return direct;

  const apiKey = process.env.ALCHEMY_API_KEY;
  if (apiKey) return `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;

  const envPaths = [
    new URL("../.env", import.meta.url),
    new URL("../../../.env", import.meta.url),
  ];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;

    const envContents = readFileSync(envPath, "utf8");
    const values = Object.fromEntries(
      envContents
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .map((line) => {
          const separatorIndex = line.indexOf("=");
          return [
            line.slice(0, separatorIndex),
            line.slice(separatorIndex + 1),
          ];
        }),
    );

    if (values.ETHEREUM_RPC_URL) return values.ETHEREUM_RPC_URL;
    if (values.ALCHEMY_API_KEY) {
      return `https://eth-mainnet.g.alchemy.com/v2/${values.ALCHEMY_API_KEY}`;
    }
  }
}

const rpcUrl = tryGetRpcUrl();
const client = rpcUrl
  ? createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl),
    })
  : undefined;

async function buildIrm(
  irmAddress: `0x${string}`,
  totalSupplyAssets: bigint,
  totalBorrowAssets: bigint,
  blockNumber: bigint,
) {
  if (!client) throw new Error("RPC client unavailable");

  const irmType = await client.readContract({
    address: irmAddress,
    abi: irmCommonAbi,
    functionName: "IRM_TYPE",
    blockNumber,
  });

  if (irmType === 0) {
    const [borrowRate, lastUpdate] = await client.readContract({
      address: irmAddress,
      abi: fixedIrmAbi,
      functionName: "irState",
      blockNumber,
    });

    const irm = new FixedRateIrm({ borrowRate, lastUpdate });
    const [interest, newBorrowRate] = await client.readContract({
      address: irmAddress,
      abi: irmCommonAbi,
      functionName: "updateInterestRateView",
      args: [totalSupplyAssets, totalBorrowAssets],
      blockNumber,
    });

    return {
      irmType: IrmType.FixedRate,
      irm,
      lastUpdate: BigInt(lastUpdate),
      onchainInterest: interest,
      onchainBorrowRate: newBorrowRate,
    };
  }

  const [rateAtTarget, lastUpdate] = await client.readContract({
    address: irmAddress,
    abi: adaptiveIrmAbi,
    functionName: "irState",
    blockNumber,
  });
  const [
    curveSteepness,
    adjustmentSpeed,
    targetUtilization,
    initialRateAtTarget,
    minRateAtTarget,
    maxRateAtTarget,
  ] = await client.readContract({
    address: irmAddress,
    abi: adaptiveIrmAbi,
    functionName: "irmConfig",
    blockNumber,
  });

  const irm = new AdaptiveCurveIrm(
    {
      curveSteepness,
      adjustmentSpeed,
      targetUtilization,
      initialRateAtTarget,
      minRateAtTarget,
      maxRateAtTarget,
    },
    {
      rateAtTarget,
      lastUpdate,
    },
  );
  const [interest, newBorrowRate] = await client.readContract({
    address: irmAddress,
    abi: irmCommonAbi,
    functionName: "updateInterestRateView",
    args: [totalSupplyAssets, totalBorrowAssets],
    blockNumber,
  });

  return {
    irmType: IrmType.AdaptiveCurve,
    irm,
    lastUpdate: BigInt(lastUpdate),
    onchainInterest: interest,
    onchainBorrowRate: newBorrowRate,
  };
}

async function loadMarket(address: `0x${string}`, blockNumber: bigint) {
  if (!client) throw new Error("RPC client unavailable");

  const [
    marketTypeRaw,
    borrowToken,
    collateralToken,
    oracle,
    irmAddress,
    liquidationEngine,
    maxLtv,
    borrowOpeningFee,
    feeRecipient,
    totalSupply,
    totalBorrowed,
  ] = await Promise.all([
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "MARKET_TYPE",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "borrowToken",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "collateralToken",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "oracle",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "irm",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "liquidationEngine",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "maxLtv",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "borrowOpeningFee",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "feeRecipient",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "totalSupply",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "totalBorrowed",
      blockNumber,
    }),
  ]);

  const price = await client.readContract({
    address: oracle,
    abi: oracleAbi,
    functionName: "getPrice",
    blockNumber,
  });

  const marketType =
    marketTypeRaw === 0 ? MarketType.Borrow : MarketType.Mint;

  const irmData = await buildIrm(
    irmAddress,
    totalSupply[0],
    totalBorrowed[0],
    blockNumber,
  );

  const shared = {
    params: new MarketParams({
      address,
      marketType,
      borrowToken,
      collateralToken,
      oracle,
      irm: irmAddress,
      liquidationEngine,
      maxLtv,
      feeRecipient,
      borrowOpeningFee,
    }),
    totalSupplyAssets: totalSupply[0],
    totalSupplyShares: totalSupply[1],
    totalBorrowAssets: totalBorrowed[0],
    totalBorrowShares: totalBorrowed[1],
    lastUpdate: irmData.lastUpdate,
    collateralPrice: price,
    interestRateModel: irmData.irm,
  };

  if (marketType === MarketType.Borrow) {
    const [interestFee, borrowTokenBalance] = await Promise.all([
      client.readContract({
        address,
        abi: marketAbi,
        functionName: "interestFee",
        blockNumber,
      }),
      client.readContract({
        address: borrowToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        blockNumber,
      }),
    ]);

    return {
      sdkMarket: new Market({
        ...shared,
        interestFee,
        borrowTokenBalance,
      }),
      marketType,
      irmData,
      interestFee,
      borrowTokenBalance,
      claimableFeesAssets: 0n,
      badDebtAssets: 0n,
    };
  }

  const [claimableFeesAssets, badDebtAssets] = await Promise.all([
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "claimableFeesAssets",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: marketAbi,
      functionName: "badDebtAssets",
      blockNumber,
    }),
  ]);

  return {
    sdkMarket: new Market({
      ...shared,
      claimableFeesAssets,
      badDebtAssets,
    }),
    marketType,
    irmData,
    interestFee: 0n,
    claimableFeesAssets,
    badDebtAssets,
  };
}

describe("Onchain accrual parity", () => {
  if (!client) {
    it("is disabled when no mainnet RPC is configured", () => {
      expect(rpcUrl).toBeUndefined();
    });

    return;
  }

  it("matches live borrow-market accrual preview at a fixed mainnet block", async () => {
    const block = await client!.getBlock({ blockNumber: FIXED_BLOCK });
    const { sdkMarket, irmData, interestFee, borrowTokenBalance } = await loadMarket(
      syrupUsdcBorrowMarket,
      FIXED_BLOCK,
    );

    const sdkPreview = sdkMarket.interestRateModel!.previewInterestRate(
      sdkMarket.totalSupplyAssets,
      sdkMarket.totalBorrowAssets,
      block.timestamp,
    );
    const accrued = sdkMarket.accrueInterest(block.timestamp);

    expect(sdkPreview.interest).toBe(irmData.onchainInterest);
    expect(sdkPreview.newBorrowRate).toBe(irmData.onchainBorrowRate);
    expect(sdkMarket.getBorrowRate(block.timestamp)).toBe(irmData.onchainBorrowRate);
    expect(sdkMarket.liquidity).toBe(
      FixedPointMath.min(
        FixedPointMath.zeroFloorSub(
          sdkMarket.totalSupplyAssets,
          sdkMarket.totalBorrowAssets,
        ),
        borrowTokenBalance!,
      ),
    );
    expect(accrued.totalBorrowAssets).toBe(
      sdkMarket.totalBorrowAssets + irmData.onchainInterest,
    );
    expect(accrued.totalSupplyAssets).toBe(
      sdkMarket.totalSupplyAssets + irmData.onchainInterest,
    );

    const expectedFeeShares = AssetShareConversionMath.convertToSharesDown(
      FixedPointMath.multiplyWithPrecision(irmData.onchainInterest, interestFee),
      sdkMarket.totalSupplyAssets +
        irmData.onchainInterest -
        FixedPointMath.multiplyWithPrecision(irmData.onchainInterest, interestFee),
      sdkMarket.totalSupplyShares,
    );

    expect(accrued.totalSupplyShares).toBe(
      sdkMarket.totalSupplyShares + expectedFeeShares,
    );
  });

  it("matches live mint-market accrual preview at a fixed mainnet block", async () => {
    const block = await client!.getBlock({ blockNumber: FIXED_BLOCK });
    const { sdkMarket, irmData, claimableFeesAssets, badDebtAssets } =
      await loadMarket(syrupUsdcMintMarket, FIXED_BLOCK);

    const sdkPreview = sdkMarket.interestRateModel!.previewInterestRate(
      sdkMarket.totalSupplyAssets,
      sdkMarket.totalBorrowAssets,
      block.timestamp,
    );
    const accrued = sdkMarket.accrueInterest(block.timestamp);

    expect(sdkPreview.interest).toBe(irmData.onchainInterest);
    expect(sdkPreview.newBorrowRate).toBe(irmData.onchainBorrowRate);
    expect(accrued.totalBorrowAssets).toBe(
      sdkMarket.totalBorrowAssets + irmData.onchainInterest,
    );
    expect(accrued.totalSupplyAssets).toBe(sdkMarket.totalSupplyAssets);
    expect(accrued.claimableFeesAssets).toBe(
      claimableFeesAssets + irmData.onchainInterest,
    );
    expect(accrued.liquidity).toBe(
      FixedPointMath.zeroFloorSub(
        sdkMarket.totalSupplyAssets,
        sdkMarket.totalBorrowAssets + irmData.onchainInterest + badDebtAssets,
      ),
    );
  });
});
