/**
 * The live signer — NON-CUSTODIAL. Your private key is read from a local file you
 * control and used only to sign transactions your machine broadcasts. It is never
 * logged, printed, or sent anywhere. Only used in live mode; paper mode never touches
 * this. ethers is imported dynamically so paper mode has no hard dependency on it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Signer {
  address: string;
  // The ethers Wallet, typed loosely to avoid a hard type dep in paper mode.
  raw: unknown;
}

export async function loadSigner(keyFile: string, rpcUrl: string): Promise<Signer> {
  const { JsonRpcProvider, Wallet } = await import("ethers");
  const key = readFileSync(resolve(process.cwd(), keyFile), "utf8").trim();
  if (!/^0x?[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("keyFile does not contain a 32-byte hex private key");
  }
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(key.startsWith("0x") ? key : `0x${key}`, provider);
  return { address: await wallet.getAddress(), raw: wallet };
}
