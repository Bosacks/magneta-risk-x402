import type { IAgentRuntime } from "@elizaos/core";

export const DEFAULT_BASE_URL = "https://x402.magneta.finance";
export const DEFAULT_MAX_USD = 0.05;

function str(runtime: IAgentRuntime, key: string): string | undefined {
  const v = runtime.getSetting(key);
  if (v === null || v === undefined || v === false) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

export function getBaseUrl(runtime: IAgentRuntime): string {
  return (str(runtime, "CONTRACT_RISK_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** Returns the key as 0x-prefixed hex, or undefined if absent or malformed. Never logged. */
export function getPrivateKey(runtime: IAgentRuntime): `0x${string}` | undefined {
  const raw = str(runtime, "CONTRACT_RISK_EVM_PRIVATE_KEY");
  if (!raw) return undefined;
  const k = raw.startsWith("0x") ? raw : `0x${raw}`;
  return /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as `0x${string}`) : undefined;
}

export function getMaxUsd(runtime: IAgentRuntime): number {
  const raw = str(runtime, "CONTRACT_RISK_MAX_USD");
  if (raw === undefined) return DEFAULT_MAX_USD;
  const n = Number(raw.replace(/^\$/, ""));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_USD;
}
