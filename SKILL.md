---
name: alto-sdk
description: >-
  Alto protocol TypeScript SDK for off-chain market, vault, IRM, liquidation,
  and position calculations. Use when working with Alto lending protocol entities,
  computing interest accrual, liquidation quotes, vault share conversions, or
  any Alto-related math.
---

# Alto SDK

A framework-agnostic TypeScript SDK that mirrors Alto lending protocol smart contract
math for supported off-chain calculation paths. All calculations use `bigint` with
1e18 (WAD) fixed-point precision and are designed to match covered on-chain math when
given correct snapshot inputs.

Package: `@altomoney/sdk` — located at `packages/sdk/`.

## What This SDK Is / Is Not

This SDK is:
- A snapshot-based math SDK for Alto markets, positions, IRMs, liquidation quotes, and vault accounting
- Framework-agnostic and pure at the entity level: construct objects from data, then compute derived values
- Suitable for simulations, analytics, UI calculations, and parity checks against contract math

This SDK is not:
- An RPC/data-loading layer; callers must fetch market, vault, oracle, and IRM state themselves
- A transaction builder, wallet integration layer, or deployment tool
- A full protocol runtime; some authorization/state-machine behavior still depends on external contract state

In practice: accuracy depends on passing a correct market/vault snapshot for the timestamp being modeled.

## Key Constants

| Name | Value | Usage |
|------|-------|-------|
| `MATH_PRECISION` | `1e18` | WAD scale for all rates, fees, LTVs |
| `LENDING_ORACLE_PRICE_PRECISION` | `1e36` | Oracle price scale |
| `VIRTUAL_SHARES` | `1e6` | Market share conversion offset |
| `VIRTUAL_ASSETS` | `1` | Market asset conversion offset |

## Market Types

```typescript
enum MarketType {
  Borrow = "borrow",  // Lenders deposit, borrowers borrow; interest goes to supply side
  Mint = "mint"       // Synthetic asset minting; interest accrues to claimableFeesAssets
}
```

**Borrow** markets add interest to both `totalSupplyAssets` and `totalBorrowAssets`,
then mint fee shares from `interestFee`.

**Mint** markets add interest only to `totalBorrowAssets` and `claimableFeesAssets`;
`totalSupplyAssets` is the debt ceiling.

## Alto Terms

- `claimableFeesAssets`: Fees accumulated on mint markets and claimable by the configured fee recipient
- `badDebtAssets`: Mint-market debt that should reduce effective liquidity
- `lostAssets`: Vault accounting bucket for impairment relative to `lastTotalAssets`
- `priority liquidator`: Liquidator eligible for the priority path; gets base fee only instead of dynamic bonus
- `liquidationWindowTag`: Time window associated with a tagged liquidatable position
- `disablePriorityLiquidationAbovePositionLtv`: LTV threshold above which the priority restrictions stop applying

## Minimal Workflow

```typescript
const irm = new FixedRateIrm({ borrowRate, lastUpdate });

const market = new Market({
  params: new MarketParams({ address, marketType, borrowToken, collateralToken, oracle, irm: irmAddress, liquidationEngine, maxLtv, feeRecipient, borrowOpeningFee }),
  totalSupplyAssets,
  totalSupplyShares,
  totalBorrowAssets,
  totalBorrowShares,
  lastUpdate,
  collateralPrice,
  interestRateModel: irm,
  interestFee,
});

const position = new AccrualPosition({
  user,
  market,
  supplyShares,
  borrowShares,
  collateralAssets,
});

const accruedMarket = market.accrueInterest(timestamp);
const ltv = position.ltv;
const quote = position.liquidationQuote;
```

## Core Classes

### `Market`

Immutable snapshot of an Alto lending market. Central class for accrual and position math.
The SDK does not fetch any of this state for you; callers supply the snapshot.

```typescript
const market = new Market({
  params: new MarketParams({ address, marketType, borrowToken, collateralToken, oracle, irm, liquidationEngine, maxLtv, feeRecipient, borrowOpeningFee }),
  totalSupplyAssets, totalSupplyShares,
  totalBorrowAssets, totalBorrowShares,
  lastUpdate, collateralPrice,
  interestRateModel,     // optional IIrm instance
  liquidationModel,      // optional ILiquidationEngine instance
  borrowTokenBalance,    // optional — caps borrow-market liquidity
  isPaused,              // optional — liquidity = 0 when true
  interestFee,           // optional — borrow markets only (WAD)
  supplyCapAssets,       // optional — borrow markets only
  claimableFeesAssets,   // optional — mint markets only
  badDebtAssets,         // optional — mint markets only
});
```

Key getters and methods:

| Member | Returns | Notes |
|--------|---------|-------|
| `utilization` | `bigint` | `totalBorrow / totalSupply` (WAD) |
| `liquidity` | `bigint` | Available to borrow; capped by `borrowTokenBalance` and pause |
| `borrowRate` / `supplyRate` | `bigint` | Per-second rate (WAD) |
| `borrowApy` / `supplyApy` | `number` | Annualized via `Math.expm1` |
| `accrueInterest(timestamp?)` | `Market` | Returns new `Market` with interest applied |
| `toSupplyAssets(shares)` | `bigint` | Shares → assets (round down) |
| `toBorrowAssets(shares)` | `bigint` | Shares → assets (round up) |
| `toSupplyShares(assets)` | `bigint` | Assets → shares (round down) |
| `toBorrowShares(assets)` | `bigint` | Assets → shares (round up) |
| `getCollateralValue(collateral)` | `bigint` | In borrow-token terms |
| `getMaxBorrowAssets(collateral)` | `bigint` | `collateralValue * maxLtv` |
| `getLtv(position)` | `bigint` | Current LTV (WAD) |
| `getHealthFactor(position)` | `bigint` | `maxBorrow / borrow` (WAD) |
| `isHealthy(position)` | `boolean` | `borrow <= maxBorrow` |
| `isLiquidatable(position)` | `boolean` | Delegates to `liquidationModel` if present |
| `getWithdrawableCollateral(position)` | `bigint` | Max removable without liquidation |

`accrueInterest` is pure — returns a new `Market`, never mutates.

### `AccrualPosition`

Combines a `Position` with a `Market` for convenience getters.

```typescript
const pos = new AccrualPosition({
  user: "0x...", market,
  supplyShares, borrowShares, collateralAssets,
});

pos.supplyAssets;           // shares → assets
pos.borrowAssets;
pos.ltv;                    // current LTV
pos.healthFactor;
pos.isHealthy;
pos.isLiquidatable;
pos.maxBorrowableAssets;    // remaining capacity
pos.withdrawableCollateral;
pos.liquidationQuote;       // full LiquidationQuote or undefined
pos.accrueInterest(ts);     // returns new AccrualPosition
```

### `FixedRateIrm` / `AdaptiveCurveIrm`

Both implement `IIrm` with `previewInterestRate` (read-only) and `updateInterestRate`
(mutates internal state).

```typescript
// Fixed rate
const fixedIrm = new FixedRateIrm({ borrowRate: 100_000_000n, lastUpdate: 0n });

// Adaptive curve — Morpho-style with utilization-dependent rate adaptation
const adaptiveIrm = new AdaptiveCurveIrm(
  { curveSteepness, adjustmentSpeed, targetUtilization, initialRateAtTarget, minRateAtTarget, maxRateAtTarget },
  { rateAtTarget, lastUpdate },
);
```

Interest calculation: `totalBorrowed * calculateCompoundInterest(rate, elapsed) / WAD`.

The compound factor is a 3rd-order Taylor series (4th term added when `rate * elapsed > 0.2e18`),
capped at `1e20`.

### `DlbDcfPriorityLiquidationEngine`

Dynamic Liquidator Bonus + Dynamic Close Factor + Priority Liquidation.

```typescript
const engine = new DlbDcfPriorityLiquidationEngine(market, liquidationConfig, isPriorityLiquidator);

engine.isLiquidatable({ borrowShares, collateralAssets }); // boolean
engine.quote({ borrowShares, collateralAssets });          // LiquidationQuote
engine.minLltv();                                          // maxLiquidationLtv
```

`LiquidationQuote` fields: `seizedCollateralAssets`, `collateralToLiquidator`,
`repaidBorrowAssets`, `repaidBorrowShares`, `protocolSeizedCollateralFee`,
`liquidationPercentage`, `liquidationFee`, `newLtv`.

Key mechanics:
- `liquidationPercentage` scales linearly from 0 (at `maxLiquidationLtv`) to 1 (at `ltvForCompleteLiquidation`)
- Bonus fee decays exponentially via `wExp(-steepness * liquidationPercentage)`; zero at full liquidation
- Priority liquidators get base fee only (no dynamic bonus)
- `newLtv = maxLtv * (1 - max(liquidationPercentage, minPenaltyPercentage))`
- `repaidBorrowShares` is down-rounded and capped to position's shares

Important caveat: `quote()` models the calculation path only. Full on-chain liquidation authorization
can still depend on tag/grace-period state that lives outside this SDK snapshot.

### `Vault`

ERC-4626 vault that allocates across multiple Alto borrow markets.

```typescript
const vault = new Vault({
  config: { address, asset, name, symbol, decimalsOffset },
  owner, curator, guardian, fee, feeRecipient, skimRecipient,
  timelock, totalSupply, totalAssets, lastTotalAssets, lostAssets,
  supplyQueue, withdrawQueue,
  allocations: [{ market, suppliedAssets, suppliedShares, config }],
});
```

| Member | Returns | Notes |
|--------|---------|-------|
| `avgSupplyRate` | `bigint` | Asset-weighted average across allocations |
| `apy` / `netApy` | `number` | Gross and after-fee APY |
| `idleLiquidity` | `bigint` | `totalAssets - allocatedAssets` |
| `liquidity` | `bigint` | Idle + withdrawable from markets |
| `toAssets(shares, rounding?, ts?)` | `bigint` | Vault shares → underlying assets |
| `toShares(assets, rounding?, ts?)` | `bigint` | Assets → vault shares |
| `accrueInterest(ts?)` | `Vault` | New vault with fee shares minted, losses tracked |

Vault share math uses `10 ** decimalsOffset` (not `VIRTUAL_SHARES`) and `+1` on assets,
matching the on-chain OpenZeppelin `mulDiv` pattern:
- `toAssets = shares * (totalAssets + 1) / (totalSupply + 10^offset)`
- `toShares = assets * (totalSupply + 10^offset) / (totalAssets + 1)`

Loss tracking: if `realTotalAssets < lastTotalAssets - lostAssets`, the difference is
recorded as `lostAssets`. Fee shares are minted on `totalInterest = newTotalAssets - lastTotalAssets`.

## Math Utilities

All in `FixedPointMath` namespace:

- `multiplyWithPrecision(x, y)` — `x * y / WAD` (round down)
- `divideWithPrecisionDown(x, y)` — `x * WAD / y` (round down)
- `divideWithPrecisionUp(x, y)` — `x * WAD / y` (round up)
- `divideWithRounding(x, y, denom, "Up"|"Down")` — `x * y / denom`
- `zeroFloorSub(x, y)` — `max(x - y, 0)`
- `min(...xs)` / `max(...xs)`

`AssetShareConversionMath`: `convertToSharesDown/Up`, `convertToAssetsDown/Up` with virtual offsets.

`wExp(x)`: Fixed-point `e^x` via decomposition into `2^q * e^r` with 2nd-order Taylor on `r`.

`rateToApy(rate)`: `Math.expm1(rate / 1e18 * SECONDS_PER_YEAR)`.

`calculateCompoundInterest(rate, elapsed)`: Taylor series approximation of `e^(rate*elapsed) - 1`.

## Testing

Workspace commands run from the repo root:

- `bun run typecheck`
- `bun run build`
- `bun run test`
- `bun run validate`

Package-local commands run from `packages/sdk/`:

- `bun run typecheck`
- `bun run build`
- `bun run test`

Tests use standalone raw math helpers (not SDK imports) for expected values and hardcoded
literal outputs. The `onchain-accrual-parity` test compares SDK output against live
mainnet contract calls at a pinned block (requires `ETHEREUM_RPC_URL` or `ALCHEMY_API_KEY`;
skips gracefully without).

## Releases

- Add release intent with `bun run changeset`.
- Merges to `main` trigger the GitHub Actions release workflow.
- The release workflow versions changed workspace packages, commits the version updates back to `main`, and publishes them to npm.
- For local verification without publishing, run `bun run release:dry-run`.
- Prefer npm trusted publishing from GitHub Actions. If a token fallback is needed, store it only as the `NPM_TOKEN` GitHub Actions secret and never commit it to the repo.
