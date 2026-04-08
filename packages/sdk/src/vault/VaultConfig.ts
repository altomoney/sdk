import type { Address } from "../types.js";
import { toBigInt } from "../types.js";
import type { IVaultConfig } from "./types.js";

export class VaultConfig {
  public readonly address: Address;
  public readonly asset: Address;
  public readonly name: string;
  public readonly symbol: string;
  public readonly decimalsOffset: bigint;

  constructor(config: IVaultConfig) {
    this.address = config.address;
    this.asset = config.asset;
    this.name = config.name;
    this.symbol = config.symbol;
    this.decimalsOffset = toBigInt(config.decimalsOffset);
  }
}
