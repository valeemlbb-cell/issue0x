/**
 * Execution — two backends behind one interface.
 *
 *   paper (default): no chain, no key, no risk. Fills at the scanner price and applies
 *     the operator fee ONLY in accounting, so simulated P&L reflects real economics.
 *
 *   live (opt-in): signs and broadcasts with your local key. On entry it (1) sends the
 *     2% operator fee as a plain, visible transfer to FEE_RECIPIENT, then (2) swaps the
 *     remainder for the token via a Uniswap-V2-style router. On exit it swaps the token
 *     balance back to native. Live swaps use amountOutMin=0 (no slippage guard) and a
 *     standard router path — they are EXPERIMENTAL and venue-dependent; treat as such.
 *
 * The 2% fee is charged on BOTH sides of a trade — on entry (the position notional) and
 * on exit (the exit notional). Both are visible on-chain transfers to the operator in
 * live mode, and both are subtracted in paper accounting. Everything else stays in your
 * wallet.
 */

import { feeOn, FEE_RECIPIENT } from "./fee.js";
import type { Config, Signal } from "./types.js";
import type { Signer } from "./wallet.js";

const ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

export interface EntryResult {
  entryPriceUsd: number;
  feeEth: number;
  entryTx: string | null;
  feeTx: string | null;
}

export interface ExitResult {
  exitPriceUsd: number;
  exitTx: string | null;
  feeEth: number;
  feeTx: string | null;
}

/** Open a position. Charges + (live) sends the operator fee, then acquires the token. */
export async function executeEntry(
  cfg: Config,
  s: Signal,
  sizeEth: number,
  signer: Signer | null,
): Promise<EntryResult> {
  const feeEth = feeOn(sizeEth);
  if (cfg.mode === "paper" || !signer) {
    return { entryPriceUsd: s.priceUsd, feeEth, entryTx: null, feeTx: null };
  }

  const { Contract, parseEther } = await import("ethers");
  const wallet = signer.raw as InstanceType<Awaited<typeof import("ethers")>["Wallet"]>;

  // 1) operator fee — a visible transfer, always.
  const feeTxResp = await wallet.sendTransaction({ to: FEE_RECIPIENT, value: parseEther(feeEth.toFixed(18)) });
  await feeTxResp.wait();

  // 2) swap the remainder for the token.
  const swapEth = Math.max(0, sizeEth - feeEth);
  const router = new Contract(cfg.routerAddress as string, ROUTER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 300;
  const tx = await router.swapExactETHForTokens(
    0,
    [cfg.wethAddress as string, s.token],
    signer.address,
    deadline,
    { value: parseEther(swapEth.toFixed(18)) },
  );
  const rec = await tx.wait();
  return { entryPriceUsd: s.priceUsd, feeEth, entryTx: rec?.hash ?? null, feeTx: feeTxResp.hash };
}

/** Close a position at the current price (paper) or by swapping the balance back (live).
 *  Charges the exit-side operator fee on `exitNotionalEth` (the ETH value coming out). */
export async function executeExit(
  cfg: Config,
  token: string,
  currentPriceUsd: number,
  exitNotionalEth: number,
  signer: Signer | null,
): Promise<ExitResult> {
  const feeEth = feeOn(Math.max(0, exitNotionalEth));
  if (cfg.mode === "paper" || !signer) {
    return { exitPriceUsd: currentPriceUsd, exitTx: null, feeEth, feeTx: null };
  }

  const { Contract, parseEther } = await import("ethers");
  const wallet = signer.raw as InstanceType<Awaited<typeof import("ethers")>["Wallet"]>;
  const erc = new Contract(token, ERC20_ABI, wallet);
  const bal: bigint = await erc.balanceOf(signer.address);
  if (bal === 0n) return { exitPriceUsd: currentPriceUsd, exitTx: null, feeEth: 0, feeTx: null };

  // 1) swap the token balance back to native.
  await (await erc.approve(cfg.routerAddress as string, bal)).wait();
  const router = new Contract(cfg.routerAddress as string, ROUTER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 300;
  const tx = await router.swapExactTokensForETH(bal, 0, [token, cfg.wethAddress as string], signer.address, deadline);
  const rec = await tx.wait();

  // 2) exit-side operator fee — a visible transfer, on the exit notional.
  let feeTx: string | null = null;
  if (feeEth > 0) {
    const feeResp = await wallet.sendTransaction({ to: FEE_RECIPIENT, value: parseEther(feeEth.toFixed(18)) });
    await feeResp.wait();
    feeTx = feeResp.hash;
  }
  return { exitPriceUsd: currentPriceUsd, exitTx: rec?.hash ?? null, feeEth, feeTx };
}
