import { test } from "node:test";
import assert from "node:assert/strict";
import type { IAgentRuntime, Memory } from "@elizaos/core";
import plugin, { extract, extractChainId, quickFlagsAction, riskReportAction } from "../src/index.js";
import { deps } from "../src/actions.js";

const ADDR = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const KEY = "0x" + "11".repeat(32);

const rt = (s: Record<string, string> = {}) => ({ getSetting: (k: string) => s[k] ?? null }) as unknown as IAgentRuntime;
const msg = (text: string) => ({ content: { text } }) as unknown as Memory;
const collect = () => {
  const out: string[] = [];
  return { out, cb: (async (c: { text?: string }) => { out.push(c.text ?? ""); return []; }) as any };
};
const real = deps.fetch;

test("plugin exposes both actions", () => {
  assert.deepEqual(plugin.actions?.map((a) => a.name), ["CONTRACT_QUICK_FLAGS", "CONTRACT_RISK_REPORT"]);
});

test("extract: address + named chains", () => {
  assert.deepEqual(extract(`check ${ADDR} on Ethereum`), { address: ADDR, chainId: 1, chainDefaulted: false });
  assert.equal(extractChainId("this is on Arbitrum").chainId, 42161);
  assert.equal(extractChainId("on optimism please").chainId, 10);
  assert.equal(extractChainId("polygon").chainId, 137);
  assert.equal(extractChainId("BSC token").chainId, 56);
  assert.equal(extractChainId("avalanche").chainId, 43114);
  assert.equal(extractChainId("chain 137").chainId, 137);
  assert.equal(extractChainId("eip155:42161").chainId, 42161);
});

test("extract negative twins: no chain / unknown chain -> Base default; no address -> null; database is not base", () => {
  assert.deepEqual(extractChainId("check this"), { chainId: 8453, defaulted: true });
  assert.deepEqual(extractChainId("on fantom"), { chainId: 8453, defaulted: true });
  assert.equal(extractChainId("my database").defaulted, true);
  assert.equal(extract("hello world").address, null);
  assert.equal(extract("0x1234").address, null);
  assert.equal(extract("0x" + "a".repeat(41)).address, null); // 41 hex chars, too long
});

test("quick flags validate: needs an address", async () => {
  assert.equal(await quickFlagsAction.validate(rt(), msg(`check ${ADDR}`)), true);
  assert.equal(await quickFlagsAction.validate(rt(), msg("is this safe?")), false);
});

test("paid action validate: needs private key AND address", async () => {
  assert.equal(await riskReportAction.validate(rt(), msg(`report ${ADDR}`)), false); // no key
  assert.equal(await riskReportAction.validate(rt({ CONTRACT_RISK_EVM_PRIVATE_KEY: "nope" }), msg(`report ${ADDR}`)), false); // malformed
  assert.equal(await riskReportAction.validate(rt({ CONTRACT_RISK_EVM_PRIVATE_KEY: KEY }), msg("report please")), false); // no address
  assert.equal(await riskReportAction.validate(rt({ CONTRACT_RISK_EVM_PRIVATE_KEY: KEY }), msg(`report ${ADDR}`)), true);
});

test("quick flags handler: polite reply without address, no network call", async () => {
  let called = false;
  deps.fetch = (async () => { called = true; return new Response("{}"); }) as typeof fetch;
  const { out, cb } = collect();
  const r = await quickFlagsAction.handler(rt(), msg("is it safe"), undefined, undefined, cb);
  assert.equal(r?.success, false);
  assert.match(out[0], /contract address/);
  assert.equal(called, false);
  deps.fetch = real;
});

test("quick flags handler: calls free endpoint on named chain and summarises", async () => {
  const urls: string[] = [];
  deps.fetch = (async (u: any) => {
    urls.push(String(u));
    return new Response(JSON.stringify({ chainId: 1, address: ADDR, partialScore: 40, partialLevel: "medium", flags: ["upgradeable-proxy", "owner-not-renounced"] }));
  }) as typeof fetch;
  const { out, cb } = collect();
  const r = await quickFlagsAction.handler(rt({ CONTRACT_RISK_BASE_URL: "http://x.test/" }), msg(`${ADDR} on ethereum`), undefined, undefined, cb);
  assert.equal(urls[0], `http://x.test/v1/flags/1/${ADDR}`);
  assert.equal(r?.success, true);
  assert.match(out[0], /40\/100 \(medium\)/);
  assert.match(out[0], /upgradeable-proxy, owner-not-renounced/);
  assert.doesNotMatch(out[0], /assumed Base/);
  deps.fetch = real;
});

test("quick flags handler: 429 is reported, not thrown", async () => {
  deps.fetch = (async () => new Response("slow down", { status: 429 })) as typeof fetch;
  const { out, cb } = collect();
  const r = await quickFlagsAction.handler(rt(), msg(ADDR), undefined, undefined, cb);
  assert.equal(r?.success, false);
  assert.match(out[0], /rate limited/);
  deps.fetch = real;
});

test("paid handler: refuses when the 402 price exceeds CONTRACT_RISK_MAX_USD", async () => {
  const requirements = {
    x402Version: 2,
    resource: { url: `http://x.test/v1/risk/8453/${ADDR}` },
    accepts: [{
      scheme: "exact", network: "eip155:8453", amount: "10000", // $0.01 in USDC atomic units
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x" + "22".repeat(20),
      maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" },
    }],
  };
  const header = Buffer.from(JSON.stringify(requirements)).toString("base64");
  let calls = 0;
  deps.fetch = (async () => {
    calls++;
    return new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": header } });
  }) as typeof fetch;
  const { out, cb } = collect();
  const r = await riskReportAction.handler(
    rt({ CONTRACT_RISK_EVM_PRIVATE_KEY: KEY, CONTRACT_RISK_MAX_USD: "0.005" }), msg(`full report ${ADDR}`), undefined, undefined, cb);
  assert.equal(r?.success, false);
  assert.equal(r?.error, "over_cap");
  assert.match(out[0], /exceeds my spend cap of \$0\.005/);
  assert.equal(calls, 1, "no paid retry after refusal");
  deps.fetch = real;
});

test("paid handler: success path formats score, verdict, findings (cap high enough, 200 response)", async () => {
  deps.fetch = (async () => new Response(JSON.stringify({
    chainId: 8453, address: ADDR, score: 65, level: "high", flags: ["upgradeable-proxy", "owner-not-renounced", "mint-selector"],
    aderyn: { ran: false },
  }))) as typeof fetch;
  const { out, cb } = collect();
  const r = await riskReportAction.handler(rt({ CONTRACT_RISK_EVM_PRIVATE_KEY: KEY }), msg(ADDR), undefined, undefined, cb);
  assert.equal(r?.success, true);
  assert.match(out[0], /Score 65\/100, verdict: high/);
  assert.match(out[0], /upgradeable-proxy/);
  deps.fetch = real;
});

test("paid handler: missing key yields a configuration message", async () => {
  const { out, cb } = collect();
  const r = await riskReportAction.handler(rt(), msg(ADDR), undefined, undefined, cb);
  assert.equal(r?.error, "no_wallet");
  assert.match(out[0], /CONTRACT_RISK_EVM_PRIVATE_KEY/);
});
