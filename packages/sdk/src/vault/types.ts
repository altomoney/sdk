import type { Market } from "../market/index.js";
import type {
  Address,
  BigIntish,
  MarketConfig,
  PendingAddress,
  PendingUint192,
} from "../types.js";

export interface IVaultConfig {
  address: Address;
  asset: Address;
  name: string;
  symbol: string;
  decimalsOffset: BigIntish;
}

export interface VaultAllocation {
  market: Market;
  suppliedAssets: BigIntish;
  suppliedShares?: BigIntish;
  config: MarketConfig;
}

export interface IVault {
  config: IVaultConfig;
  owner: Address;
  curator: Address;
  guardian: Address;
  fee: BigIntish;
  feeRecipient: Address;
  skimRecipient: Address;
  pendingTimelock?: PendingUint192;
  pendingGuardian?: PendingAddress;
  timelock: BigIntish;
  totalSupply: BigIntish;
  totalAssets: BigIntish;
  lastTotalAssets: BigIntish;
  lostAssets?: BigIntish;
  supplyQueue: Address[];
  withdrawQueue: Address[];
  allocations: VaultAllocation[];
}
