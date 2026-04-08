# AltoMoney SDK Agent Reference

## Import Surface

```ts
import {
  Market,
  MarketParams,
  MarketType,
  Position,
  Vault,
  FixedRateIrm,
  AdaptiveCurveIrm,
  DlbDcfPriorityLiquidationEngine,
} from "@altomoney/sdk";
```

## Modeling Assumptions

- All core calculations use `bigint`.
- WAD precision is `1e18`.
- Oracle price precision is `1e36`.
- The SDK is snapshot-based. Callers must provide market, vault, oracle, liquidation, and IRM state.
- Entity accrual methods are pure and return new instances.

## Market Notes

- Borrow markets accrue interest to both supply and borrow assets, then mint fee shares from `interestFee`.
- Mint markets accrue interest to borrow assets and `claimableFeesAssets`; `totalSupplyAssets` acts as the debt ceiling.
- Borrow-market liquidity can be capped by `borrowTokenBalance` and forced to zero by `isPaused`.

## Position Notes

- `Position` exposes convenience getters for supply assets, borrow assets, health factor, LTV, and liquidation data.
- Health and liquidation are derived from the attached `Market` snapshot, so stale market state produces stale position outputs.

## Vault Notes

- `Vault` models ERC-4626-style share math over multiple market allocations.
- Share conversion uses vault-specific offsets, not the market virtual share constants.
- Yield and fee accounting depend on accrued market snapshots and `lastTotalAssets`.

## IRM Notes

- `FixedRateIrm` holds a constant per-second borrow rate.
- `AdaptiveCurveIrm` updates rate-at-target based on utilization around a configured target.
- Compound interest uses a Taylor-series approximation designed to match covered on-chain behavior.

## Liquidation Notes

- `DlbDcfPriorityLiquidationEngine` models dynamic bonus, dynamic close factor, and priority liquidator behavior.
- `quote()` models the calculation path only; full on-chain liquidation authorization can still depend on external contract state.

## Good Agent Behavior

- Prefer constructing SDK objects with explicit data over inventing missing snapshot fields.
- If the user asks for protocol actions, clarify that this package is not a wallet or transaction builder.
- If the user asks for price/rate fetching, suggest pairing the SDK with a separate data-loading layer.
