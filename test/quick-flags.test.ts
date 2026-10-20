import { test } from "node:test";
import assert from "node:assert/strict";
import type { PublicClient } from "viem";
import { getChain } from "../src/chains.js";
import { AnalysisError, quickFlagsUncached } from "../src/risk/analyze.js";
import { createRateLimiter } from "../src/rate-limit.js";

const ADDR = "0x4200000000000000000000000000000000000006" as const;
function stub(code: string | null): PublicClient {
  return {
    getCode: async () => code,
    getStorageAt: async () => "0x" + "00".repeat(32),
    readContract: async () => { throw new Error("reverted"); },
  } as unknown as PublicClient;
}

test("quickFlags output is free-tier shaped and has no source/static-analysis keys", async () => {
  const r = await quickFlagsUncached(getChain(8453)!, ADDR, stub("0x6080ff"));
  assert.equal(r.tier, "free");
  assert.equal(r.isContract, true);
  assert.equal(r.bytecodeSize, 3);
  for (const k of ["blockscout", "sourcify", "aderyn", "score", "level"]) assert.equal(k in r, false, k);
  assert.ok(typeof r.partialScore === "number" && r.partialLevel);
  assert.ok(r.flags.includes("selfdestruct-opcode"));
  assert.ok(!r.flags.includes("unverified-source"));
  assert.ok(r.notes.some((n) => n.includes("contract_risk_summary")));
});

test("quickFlags rejects an EOA", async () => {
  await assert.rejects(quickFlagsUncached(getChain(8453)!, ADDR, stub("0x")), (e: unknown) => e instanceof AnalysisError && e.code === "not_a_contract");
});

test("rate limiter allows N per window, then 429 info, then resets", () => {
  let t = 0;
  const rl = createRateLimiter(3, 60_000, () => t);
  assert.equal(rl.hit("a"), null);
  assert.equal(rl.hit("a"), null);
  assert.equal(rl.hit("a"), null);
  assert.equal(rl.hit("a"), 60);
  assert.equal(rl.hit("b"), null);
  t = 30_000;
  assert.equal(rl.hit("a"), 30);
  t = 60_000;
  assert.equal(rl.hit("a"), null);
});

test("free route path never matches the paid route key", () => {
  const paid = /^\/v1\/risk\/[^/]+\/[^/]+$/;
  assert.equal(paid.test(`/v1/flags/8453/${ADDR}`), false);
  assert.equal(paid.test(`/v1/risk/8453/${ADDR}`), true);
});
