# `@altomoney/sdk`

Framework-agnostic TypeScript SDK for off-chain Alto protocol calculations.

## What It Does

- Models Alto borrow and mint markets from explicit snapshots
- Computes market accrual, rates, liquidity, and share conversions
- Computes position health, LTV, collateral capacity, and liquidation quotes
- Models ERC-4626-style vault math over Alto market allocations
- Mirrors covered on-chain math paths using `bigint`

## What It Does Not Do

- Fetch on-chain data for you
- Build transactions or sign messages
- Replace an RPC client or indexing layer

## Install

```bash
npm install @altomoney/sdk
```

## Example

```ts
import {
  FixedRateIrm,
  Market,
  MarketParams,
  MarketType,
} from "@altomoney/sdk";

const irm = new FixedRateIrm({
  borrowRate: 100_000_000n,
  lastUpdate: 0n,
});

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
  totalSupplyAssets: 1_000n * 10n ** 18n,
  totalSupplyShares: 1_000n * 10n ** 18n,
  totalBorrowAssets: 800n * 10n ** 18n,
  totalBorrowShares: 800n * 10n ** 18n,
  lastUpdate: 0n,
  collateralPrice: 1n,
  interestRateModel: irm,
  interestFee: 100_000000000000000n,
});

const accrued = market.accrueInterest(86_400n);
```

## Precision

- Use `bigint` for protocol values
- Most rates, fees, and ratios are WAD-scaled (`1e18`)
- Oracle prices use `1e36`

## Agent Docs

This package publishes:

- `AGENTS.md`
- `agent-reference.md`

Agents and tooling can use these files to understand package capabilities and modeling assumptions.
