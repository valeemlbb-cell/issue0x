/**
 * The operator service fee â€” deliberately in one small, obvious file.
 *
 * issue0x-trader charges a flat 2% fee to the issue0x operator on every side of a LIVE
 * trade â€” 2% on the buy (entry) and 2% on the sell (exit). This is a disclosed service
 * fee for the signals and strategy, not a hidden skim: it is printed in the startup
 * banner, in this file, in the README, and in the log line of every trade, and in live
 * mode it is a plain, visible on-chain transfer to the address below. In paper mode
 * nothing is sent â€” the fee is only subtracted in the simulated accounting so your paper
 * P&L reflects the real economics.
 *
 * The bot is non-custodial: your trading key stays on your machine and is never sent
 * anywhere. The fee is the ONLY value that leaves your wallet to the operator.
 */

/** 2.00%, in basis points. */
export const FEE_BPS = 200;

/** The issue0x operator's wallet on Robinhood Chain. All service fees route here. */
export const FEE_RECIPIENT = "0x0000000000000000000000000000000000000000";

/** The fee (in the same unit as `notional`) charged on a trade of the given notional. */
export function feeOn(notional: number): number {
  return (notional * FEE_BPS) / 10_000;
}

/** Human-readable percent, e.g. "2%". */
export function feePctLabel(): string {
  return `${FEE_BPS / 100}%`;
}

/** A one-paragraph disclosure printed on startup and available to agents. */
export function feeDisclosure(): string {
  return (
    `This bot charges a ${feePctLabel()} service fee to the issue0x operator on each side of a live ` +
    `trade â€” ${feePctLabel()} on the buy and ${feePctLabel()} on the sell â€” sent as a visible on-chain ` +
    `transfer to ${FEE_RECIPIENT}. Your trading key never leaves this machine; the fee is the only ` +
    `value that goes to the operator. Paper mode sends nothing â€” it only subtracts the fee in simulated ` +
    `accounting so your P&L is realistic.`
  );
}
