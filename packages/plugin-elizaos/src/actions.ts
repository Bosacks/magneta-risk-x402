import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory } from "@elizaos/core";
import { createContractRiskClient, ContractRiskError } from "@magnetafinance/contract-risk";
import type { QuickFlags, RiskReport } from "@magnetafinance/contract-risk";
import { extract } from "./parse.js";
import { getBaseUrl, getMaxUsd, getPrivateKey } from "./settings.js";

type FetchLike = typeof fetch;
/** Test seam: replaced in unit tests. */
export const deps: { fetch: FetchLike } = { fetch: (...a) => globalThis.fetch(...a) };

async function reply(callback: HandlerCallback | undefined, text: string, actionName: string) {
  if (callback) await callback({ text, actions: [actionName], source: "contract-risk" });
}

const NO_ADDRESS =
  "I need a contract address (0x followed by 40 hex characters) to check. Optionally name the chain, e.g. \"on Ethereum\" (default: Base).";

export function formatFlags(f: QuickFlags, chainDefaulted: boolean): string {
  const lines = [
    `Quick flags for ${f.address} on chain ${f.chainId}${chainDefaulted ? " (no chain named, assumed Base)" : ""}:`,
    `Partial risk score: ${f.partialScore}/100 (${f.partialLevel}), bytecode only.`,
    f.flags.length ? `Flags: ${f.flags.join(", ")}.` : "Flags: none raised.",
    "This free preview excludes source verification and static-analysis findings; the full report (CONTRACT_RISK_REPORT, $0.02) includes them.",
  ];
  return lines.join("\n");
}

export function formatReport(r: RiskReport): string {
  const top = r.flags.slice(0, 5);
  const lines = [
    `Risk report for ${r.address} on chain ${r.chainId}:`,
    `Score ${r.score}/100, verdict: ${r.level}.`,
    top.length ? `Top findings: ${top.join(", ")}${r.flags.length > top.length ? ` (+${r.flags.length - top.length} more)` : ""}.` : "Top findings: none raised.",
  ];
  if (r.aderyn?.ran && r.aderyn.top?.length) {
    lines.push(`Static analysis: ${r.aderyn.top.slice(0, 3).map((t) => `${t.title} (${t.severity})`).join("; ")}.`);
  }
  if (r._payment?.transaction) lines.push(`Paid $0.02 USDC, tx ${r._payment.transaction}.`);
  lines.push("A triage signal, not an audit.");
  return lines.join("\n");
}

export const quickFlagsAction: Action = {
  name: "CONTRACT_QUICK_FLAGS",
  similes: ["CHECK_CONTRACT_FLAGS", "QUICK_CONTRACT_CHECK", "CONTRACT_PREVIEW", "IS_THIS_CONTRACT_SAFE_QUICK"],
  description:
    "Free, instant bytecode-only red-flag check of a smart contract (proxy, owner, pause, mint/blacklist/fee selectors, SELFDESTRUCT) with a partial risk score. Use when the user gives a 0x contract address and wants a quick safety check.",
  validate: async (_runtime: IAgentRuntime, message: Memory) => extract(message.content?.text ?? "").address !== null,
  handler: async (runtime, message, _state, _options, callback): Promise<ActionResult> => {
    const { address, chainId, chainDefaulted } = extract(message.content?.text ?? "");
    if (!address) {
      await reply(callback, NO_ADDRESS, "CONTRACT_QUICK_FLAGS");
      return { success: false, text: NO_ADDRESS, error: "no_address" };
    }
    try {
      const res = await deps.fetch(`${getBaseUrl(runtime)}/v1/flags/${chainId}/${address}`);
      if (res.status === 429) {
        const t = "The free quick-flags endpoint is rate limited (30 requests/minute). Please retry shortly.";
        await reply(callback, t, "CONTRACT_QUICK_FLAGS");
        return { success: false, text: t, error: "rate_limited" };
      }
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
        const t = `The risk service could not check that contract (HTTP ${res.status}): ${body}`;
        await reply(callback, t, "CONTRACT_QUICK_FLAGS");
        return { success: false, text: t, error: `http_${res.status}` };
      }
      const flags = (await res.json()) as QuickFlags;
      const text = formatFlags(flags, chainDefaulted);
      await reply(callback, text, "CONTRACT_QUICK_FLAGS");
      return { success: true, text, data: { chainId, address, partialScore: flags.partialScore, flags: flags.flags } };
    } catch (e) {
      const t = `Could not reach the risk service: ${e instanceof Error ? e.message : String(e)}`;
      await reply(callback, t, "CONTRACT_QUICK_FLAGS");
      return { success: false, text: t, error: "network" };
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Quick check on 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 on Base" } },
      { name: "{{agent}}", content: { text: "Checking the bytecode flags for that contract.", actions: ["CONTRACT_QUICK_FLAGS"] } },
    ],
  ],
};

export const riskReportAction: Action = {
  name: "CONTRACT_RISK_REPORT",
  similes: ["FULL_CONTRACT_RISK_REPORT", "BUY_RISK_REPORT", "AUDIT_CONTRACT_RISK", "CONTRACT_RISK_SCORE"],
  description:
    "Paid ($0.02 USDC via x402) full risk report for a smart contract: 0-100 score, verdict, findings including source verification and static analysis. Only use when the user explicitly wants the full/deep report; prefer CONTRACT_QUICK_FLAGS for a free first look.",
  validate: async (runtime: IAgentRuntime, message: Memory) =>
    getPrivateKey(runtime) !== undefined && extract(message.content?.text ?? "").address !== null,
  handler: async (runtime, message, _state, _options, callback): Promise<ActionResult> => {
    const name = "CONTRACT_RISK_REPORT";
    const key = getPrivateKey(runtime);
    if (!key) {
      const t = "The paid risk report is not configured: set CONTRACT_RISK_EVM_PRIVATE_KEY (a wallet holding USDC on Base).";
      await reply(callback, t, name);
      return { success: false, text: t, error: "no_wallet" };
    }
    const { address, chainId } = extract(message.content?.text ?? "");
    if (!address) {
      await reply(callback, NO_ADDRESS, name);
      return { success: false, text: NO_ADDRESS, error: "no_address" };
    }
    const maxUsd = getMaxUsd(runtime);
    try {
      const client = createContractRiskClient({
        privateKey: key,
        baseUrl: getBaseUrl(runtime),
        maxAmountPerPayment: `$${maxUsd}`,
        fetch: deps.fetch,
      });
      const report = await client.risk(chainId, address);
      const text = formatReport(report);
      await reply(callback, text, name);
      return { success: true, text, data: { chainId, address, score: report.score, level: report.level, flags: report.flags } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      let t: string;
      let code: string;
      if (/maxAmountPerPayment|spendControls/i.test(msg)) {
        t = `Refused: the service price exceeds my spend cap of $${maxUsd} per call (CONTRACT_RISK_MAX_USD). Nothing was paid.`;
        code = "over_cap";
      } else if (e instanceof ContractRiskError) {
        t = `The risk service returned HTTP ${e.status}; no report was produced.`;
        code = `http_${e.status}`;
      } else if (e instanceof TypeError) {
        t = `Invalid input: ${msg}`;
        code = "invalid_input";
      } else {
        t = "The paid risk report failed before completion; check wallet USDC balance on Base and retry.";
        code = "payment_failed";
      }
      await reply(callback, t, name);
      return { success: false, text: t, error: code };
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Get me the full risk report for 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 on Base" } },
      { name: "{{agent}}", content: { text: "Buying the full report ($0.02 USDC).", actions: ["CONTRACT_RISK_REPORT"] } },
    ],
  ],
};
