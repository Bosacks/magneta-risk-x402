// Deterministic risk score, 0..100 (higher = riskier). Rubric (points are additive, then capped at 100):
//
//   Source / transparency
//     +25  logic contract source is not verified (Blockscout, then Sourcify as fallback)
//      +0  verification status unknown because every provider was unreachable (flagged, not penalised)
//   Upgradeability / control
//     +15  proxy (EIP-1967 / EIP-1822-style slots, legacy zeppelinos slots, EIP-1167 clone)
//     +10  owner() exists and is not the zero address (ownership not renounced)
//   Token powers (selector presence in bytecode, heuristic)
//     +15  mint selector present
//     +15  blacklist / bot-list selector present
//     +10  fee / tax / limit / trading-switch setter present
//     +5   pause selector present, or paused() currently true (+5 more when currently paused)
//   Bytecode
//     +10  SELFDESTRUCT opcode present
//   Static analysis (aderyn, only when it ran)
//     +5   per high-severity finding, capped at +20
//
//   Level: 0-24 low, 25-49 medium, 50-74 high, 75-100 critical.
// "Not a contract" is not scored: analyzeContract rejects it with an error.

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ScoreInput {
  verified: boolean | null; // null = unknown (all source providers unreachable): not penalised
  isProxy: boolean;
  ownerNotRenounced: boolean;
  foundSelectors: readonly string[];
  hasSelfdestruct: boolean;
  currentlyPaused: boolean;
  aderynHigh: number | null; // null = aderyn did not run
}

export interface ScoreResult {
  score: number;
  level: RiskLevel;
  flags: string[];
}

const MINT = ["mint(address,uint256)", "mint(uint256)"];
const BLACKLIST = ["blacklist(address)", "setBlacklist(address,bool)", "addBlacklist(address)", "setBots(address[],bool)"];
const FEES = [
  "setFee(uint256)", "setFees(uint256,uint256)", "setTaxes(uint256,uint256)", "setBuyTax(uint256)", "setSellTax(uint256)",
  "setMaxTxAmount(uint256)", "setMaxWallet(uint256)", "setTradingEnabled(bool)", "enableTrading()",
  "setSwapAndLiquifyEnabled(bool)", "excludeFromFee(address,bool)",
];
const PAUSE = ["pause()", "unpause()"];

export function levelFor(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function computeScore(i: ScoreInput): ScoreResult {
  let score = 0;
  const flags: string[] = [];
  const has = (list: string[]) => list.some((s) => i.foundSelectors.includes(s));

  if (i.verified === false) { score += 25; flags.push("unverified-source"); }
  if (i.verified === null) flags.push("source-verification-unknown");
  if (i.isProxy) { score += 15; flags.push("upgradeable-proxy"); }
  if (i.ownerNotRenounced) { score += 10; flags.push("owner-not-renounced"); }
  if (has(MINT)) { score += 15; flags.push("mint-function"); }
  if (has(BLACKLIST)) { score += 15; flags.push("blacklist-function"); }
  if (has(FEES)) { score += 10; flags.push("fee-or-limit-setters"); }
  if (has(PAUSE)) { score += 5; flags.push("pausable"); }
  if (i.currentlyPaused) { score += 5; flags.push("currently-paused"); }
  if (i.hasSelfdestruct) { score += 10; flags.push("selfdestruct-opcode"); }
  if (i.aderynHigh && i.aderynHigh > 0) {
    score += Math.min(20, 5 * i.aderynHigh);
    flags.push(`aderyn-high-findings:${i.aderynHigh}`);
  }
  score = Math.min(100, score);
  return { score, level: levelFor(score), flags };
}
