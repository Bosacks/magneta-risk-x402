export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ProxyInfo {
  type: string;
  implementation: string | null;
  admin?: string | null;
  beacon?: string | null;
}

export interface Erc20Info {
  isLikelyErc20: boolean;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
  owner: string | null;
  ownerRenounced: boolean | null;
  paused: boolean | null;
}

/** Paid report, shape of GET /v1/risk/:chainId/:address (src/risk/analyze.ts RiskReport). */
export interface RiskReport {
  chainId: number;
  address: string;
  analyzedAt: string;
  isContract: true;
  bytecodeSize: number;
  proxy: ProxyInfo | null;
  erc20: Erc20Info;
  opcodes: {
    selfdestruct: boolean;
    delegatecall: boolean;
    implementation?: { bytecodeSize: number; selfdestruct: boolean; delegatecall: boolean };
  };
  selectors: { found: string[] };
  /** Verification info; fields beyond `available`/`verified` vary, so they are left open. */
  blockscout: { available: boolean; verified?: boolean; [k: string]: unknown };
  sourcify?: { available?: boolean; verified?: boolean; [k: string]: unknown };
  aderyn: { ran: boolean; reason?: string; counts?: { high: number; low: number }; top?: { title: string; severity: string; instances: number }[] };
  /** 0..100, higher is riskier. */
  score: number;
  level: RiskLevel;
  /** Rubric flags, e.g. "upgradeable-proxy", "owner-not-renounced", "aderyn-high-findings:2". */
  flags: string[];
  notes: string[];
  /** Added client-side from the PAYMENT-RESPONSE header. Absent when the response carried none. */
  _payment?: PaymentReceipt;
}

/** Free bytecode-only preview, GET /v1/flags/:chainId/:address. Fields beyond the core ones are open-ended. */
export interface QuickFlags {
  chainId: number;
  address: string;
  analyzedAt: string;
  tier: "free";
  isContract: boolean;
  bytecodeSize: number;
  proxy: ProxyInfo | null;
  erc20: RiskReport["erc20"];
  opcodes: RiskReport["opcodes"];
  selectors: { found: string[] };
  /** Partial score: never includes the unverified-source penalty nor aderyn findings (paid report only). */
  partialScore: number;
  partialLevel: "low" | "medium" | "high" | "critical";
  flags: string[];
  notes: string[];
}

export interface ChainInfo {
  chainId: number;
  name: string;
  testnet: boolean;
}

export interface PaymentReceipt {
  transaction: string;
  network: string;
  payer?: string;
}
