/**
 * Real Robinhood Chain degen tokens, pulled from the official Blockscout explorer
 * (robinhoodchain.blockscout.com, chainId 4663). Symbols are the on-chain tickers;
 * addresses are the real ERC-20 contracts the radar reads transfers from.
 *
 * This list is a snapshot of active names — refresh it from the tokens endpoint:
 *   /api/v2/tokens?type=ERC-20&sort=holders_count&order=desc
 */
export interface TokenRef {
  symbol: string;
  address: string;
}

export const DEGEN_TOKENS: TokenRef[] = [
  { symbol: "RIBBIT", address: "0xdAE109b18129751A4283e5a72E183ABfC728C024" },
  { symbol: "ROBINWOOD", address: "0x7B549124b6D04b60E4E971d2825d0955f1FCcFB2" },
  { symbol: "WAGMI", address: "0xe3a7d490324B8a3Da0F71a63BFA08Ae9E57B1CD9" },
  { symbol: "HOODIE", address: "0xB0E280C6f79BAb2eC58C7D9f2Ee2A14D764751B4" },
  { symbol: "VLAD", address: "0xfD584f7397Ed0F42266bCa2f8e3fc264aa12d409" },
  { symbol: "CAT", address: "0xc8b17236c5b7303253946f40f56fa92128029f0D" },
  { symbol: "PICKLE", address: "0xfc0ddA7dF2d57321dB308bA7C751e9606d4FC71C" },
  { symbol: "DIH", address: "0x1E9e4dD08C116DF16DF478f82c6a3823B78F0eea" },
  { symbol: "JUGGERNAUT", address: "0x6b3A8A50F2B7717ba7d0DB5298124e16151A9A17" },
  { symbol: "CASHDOG", address: "0xc44616F8c395760fB6C38710130Ccbbe8dA71Af4" },
];

export const DEGEN_SYMBOLS = DEGEN_TOKENS.map((t) => t.symbol);
