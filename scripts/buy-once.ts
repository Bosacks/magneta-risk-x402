// Buys ONE risk report over HTTP with a signed USDC authorization. Spend cap: $0.05.
//   BUYER_PRIVATE_KEY=0x... [TARGET_URL=...] pnpm buy-once
import "../src/config.js";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { env, need } from "../src/config.js";

const account = privateKeyToAccount(need("BUYER_PRIVATE_KEY") as `0x${string}`);
const url = env("TARGET_URL", "http://127.0.0.1:3011/v1/risk/84532/0x036CbD53842c5426634e7929541eC2318f3dCF7e");

const client = new x402Client();
client.setSpendControls({ maxAmountPerPayment: "$0.05" });
client.register("eip155:*", new ExactEvmScheme(account));
const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const httpClient = new x402HTTPClient(client);

console.error(`[buy-once] buyer=${account.address} url=${url}`);
const t0 = performance.now();
const res = await fetchWithPayment(url, { method: "GET" });
const ms = Math.round(performance.now() - t0);
if (!res.ok) {
  const pr = res.headers.get("PAYMENT-REQUIRED");
  if (pr) { try { console.error("[buy-once] 402 error field:", JSON.parse(Buffer.from(pr, "base64").toString("utf8")).error); } catch { /* ignore */ } }
  console.error(`[buy-once] HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const settle = httpClient.getPaymentSettleResponse((n) => res.headers.get(n)); // PAYMENT-RESPONSE header
console.log(JSON.stringify(await res.json(), null, 2));
console.error(`[buy-once] settled success=${settle.success} tx=${settle.transaction} payer=${settle.payer} network=${settle.network} (${ms} ms)`);
if (!settle.success) process.exit(1);
