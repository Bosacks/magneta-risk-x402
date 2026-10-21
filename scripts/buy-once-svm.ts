// Pays ONE call with USDC on Solana (x402 exact scheme, SVM) and prints the report and the settlement signature.
//   SVM_PRIVATE_KEY=<base58 64-byte secret key> [TARGET_URL=...] pnpm buy-once-svm
import "../src/config.js";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { env, need } from "../src/config.js";

const al = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) { const i = al.indexOf(c); if (i < 0) throw new Error("invalid base58"); n = n * 58n + BigInt(i); }
  const out: number[] = [];
  while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c === "1") out.unshift(0); else break; }
  return Uint8Array.from(out);
}

const signer = await createKeyPairSignerFromBytes(base58Decode(need("SVM_PRIVATE_KEY")));
const url = env("TARGET_URL", "http://127.0.0.1:3011/v1/risk/8453/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
const client = new x402Client();
client.setSpendControls({ maxAmountPerPayment: "$0.05" });
client.register("solana:*", new ExactSvmScheme(signer));
const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const httpClient = new x402HTTPClient(client);

console.error(`[buy-once-svm] buyer=${signer.address} url=${url}`);
const t0 = performance.now();
const res = await fetchWithPayment(url, { method: "GET" });
const ms = Math.round(performance.now() - t0);
if (!res.ok) {
  const pr = res.headers.get("PAYMENT-REQUIRED");
  if (pr) { try { console.error("[buy-once-svm] 402 error field:", JSON.parse(Buffer.from(pr, "base64").toString("utf8")).error); } catch { /* ignore */ } }
  console.error(`[buy-once-svm] HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const settle = httpClient.getPaymentSettleResponse((n) => res.headers.get(n));
const report = await res.json();
console.log(JSON.stringify({ chainId: report.chainId, address: report.address, score: report.score, level: report.level }, null, 2));
console.error(`[buy-once-svm] settled success=${settle.success} tx=${settle.transaction} payer=${settle.payer} network=${settle.network} (${ms} ms)`);
if (!settle.success) process.exit(1);
