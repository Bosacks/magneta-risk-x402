export const DEFAULT_CHAIN_ID = 8453;

const ADDRESS_RE = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;

/** Name or alias -> EVM chain id. Matched as whole words, case-insensitive. */
export const CHAIN_NAMES: Record<string, number> = {
  ethereum: 1, eth: 1, mainnet: 1,
  base: 8453,
  arbitrum: 42161, arb: 42161,
  optimism: 10,
  polygon: 137, matic: 137,
  bsc: 56, bnb: 56, binance: 56,
  avalanche: 43114, avax: 43114,
};

export interface Extracted {
  address: string | null;
  chainId: number;
  /** true when no chain was named or given numerically and the default was applied. */
  chainDefaulted: boolean;
}

export function extractAddress(text: string): string | null {
  return text.match(ADDRESS_RE)?.[0] ?? null;
}

export function extractChainId(text: string): { chainId: number; defaulted: boolean } {
  // Explicit numeric forms: "chain 137", "chainId: 42161", "eip155:8453"
  const num = text.match(/(?:chain\s*id|chain|eip155)\s*[:=#]?\s*(\d{1,10})\b/i);
  if (num) {
    const n = Number(num[1]);
    if (Number.isSafeInteger(n) && n > 0) return { chainId: n, defaulted: false };
  }
  // Named chain: earliest whole-word mention wins.
  const lower = text.toLowerCase();
  let best: { idx: number; id: number } | null = null;
  for (const [name, id] of Object.entries(CHAIN_NAMES)) {
    const m = new RegExp(`(?<![a-z0-9])${name}(?![a-z0-9])`).exec(lower);
    if (m && (best === null || m.index < best.idx)) best = { idx: m.index, id };
  }
  return best ? { chainId: best.id, defaulted: false } : { chainId: DEFAULT_CHAIN_ID, defaulted: true };
}

export function extract(text: string): Extracted {
  const { chainId, defaulted } = extractChainId(text);
  return { address: extractAddress(text), chainId, chainDefaulted: defaulted };
}
