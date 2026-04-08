# AltoMoney SDK Agent Guide

Use this file when reasoning about `@altomoney/sdk`.

## What This Package Is

- A snapshot-based TypeScript SDK for off-chain Alto protocol calculations
- Pure modeling and math for markets, positions, vaults, IRMs, and liquidation quotes
- Not an RPC client, indexer, wallet integration, signer, or transaction builder

## Default Assumptions

- Import from `@altomoney/sdk`
- Use `bigint` for protocol values
- Most rates, fees, and LTV-style ratios use WAD precision (`1e18`)
- Callers must provide the full timestamped snapshot required for each calculation
- Accrual and conversion methods are intended to match covered on-chain math paths

## Main Models

- `Market`: accrual, liquidity, rates, conversions, LTV, health checks
- `Position`: convenience wrapper over a `Market` snapshot for user-level metrics
- `Vault`: ERC-4626-style vault math over market allocations
- `FixedRateIrm` and `AdaptiveCurveIrm`: interest rate models
- `DlbDcfPriorityLiquidationEngine`: liquidation and quote calculations

## Good Usage

1. Build entities from explicit snapshot data.
2. Keep precision in `bigint` form until display.
3. Prefer exported helpers over reimplementing math.
4. For parity checks, use a fixed block and the correct timestamp.
5. If the user asks for fetching or transactions, clarify that another layer is needed.

## Reference

See `agent-reference.md` for additional modeling details.
