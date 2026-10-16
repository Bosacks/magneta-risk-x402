// Risky function signatures and the (heuristic) selector matcher.
import { toFunctionSelector } from "viem";

export const RISKY_SIGNATURES = [
  "mint(address,uint256)",
  "mint(uint256)",
  "pause()",
  "unpause()",
  "blacklist(address)",
  "setBlacklist(address,bool)",
  "addBlacklist(address)",
  "setBots(address[],bool)",
  "setFee(uint256)",
  "setFees(uint256,uint256)",
  "setTaxes(uint256,uint256)",
  "setBuyTax(uint256)",
  "setSellTax(uint256)",
  "setMaxTxAmount(uint256)",
  "setMaxWallet(uint256)",
  "setTradingEnabled(bool)",
  "enableTrading()",
  "upgradeTo(address)",
  "upgradeToAndCall(address,bytes)",
  "transferOwnership(address)",
  "renounceOwnership()",
  "setSwapAndLiquifyEnabled(bool)",
  "excludeFromFee(address,bool)",
] as const;

export const SIGNATURE_SELECTORS: ReadonlyMap<string, string> = new Map(
  RISKY_SIGNATURES.map((sig) => [sig, toFunctionSelector(sig).toLowerCase()]),
);

/** Returns the risky signatures whose selector appears among the given PUSH4 immediates. */
export function matchSelectors(push4: ReadonlySet<string>, signatures: readonly string[] = RISKY_SIGNATURES): string[] {
  return signatures.filter((sig) => {
    const sel = SIGNATURE_SELECTORS.get(sig) ?? toFunctionSelector(sig).toLowerCase();
    return push4.has(sel);
  });
}
