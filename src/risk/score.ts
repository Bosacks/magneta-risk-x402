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

/** Machine-readable copy of the rubric above, served by the free MCP tool `scoring_rubric`. Keep in sync with computeScore. */
export const SCORING_RUBRIC = {
  scale: "0-100, higher is riskier; points are additive and capped at 100",
  levels: { low: "0-24", medium: "25-49", high: "50-74", critical: "75-100" },
  points: [
    { flag: "unverified-source", points: 25, meaning: "logic contract source is not verified on Blockscout nor Sourcify" },
    { flag: "source-verification-unknown", points: 0, meaning: "every source provider was unreachable; not penalised, flagged only" },
    { flag: "upgradeable-proxy", points: 15, meaning: "proxy pattern detected (EIP-1967, EIP-1822, legacy zeppelinos, EIP-1167); the admin can change behaviour" },
    { flag: "owner-not-renounced", points: 10, meaning: "owner() exists and is not the zero address" },
    { flag: "mint-function", points: 15, meaning: "a mint selector is present in the bytecode (supply can grow)" },
    { flag: "blacklist-function", points: 15, meaning: "a blacklist or bot-list selector is present (transfers can be blocked per address)" },
    { flag: "fee-or-limit-setters", points: 10, meaning: "fee, tax, max-tx, max-wallet or trading-switch setters are present" },
    { flag: "pausable", points: 5, meaning: "pause/unpause selectors are present" },
    { flag: "currently-paused", points: 5, meaning: "paused() currently returns true" },
    { flag: "selfdestruct-opcode", points: 10, meaning: "SELFDESTRUCT opcode present in the bytecode" },
    { flag: "aderyn-high-findings:N", points: "5 per high-severity finding, capped at 20", meaning: "aderyn static analysis high-severity detectors that fired on the verified source" },
  ],
  caveats: [
    "Selector presence in bytecode is a heuristic: a function may exist but be restricted or unused.",
    "A high score flags centralisation and upgrade power, not a proven exploit; a low score is not an endorsement.",
    "Reports are cached for 10 minutes per chain and address.",
  ],
} as const;
