import { test } from "node:test";
import assert from "node:assert/strict";
import { createContractRiskClient, toolDefinition, toLangChainTool, toAiSdkTool, ContractRiskError } from "../src/index.js";

const KEY = "0x" + "11".repeat(32);
const ADDR = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

test("toolDefinition shape", () => {
  assert.equal(toolDefinition.name, "contract_risk_summary");
  assert.deepEqual(toolDefinition.parameters.required, ["chainId", "address"]);
  assert.equal(toolDefinition.parameters.properties.chainId.type, "integer");
  assert.equal(toolDefinition.parameters.type, "object");
});

test("risk() goes through the injected fetch and parses the report", async () => {
  const urls: string[] = [];
  const fakeFetch = (async (input: any) => {
    urls.push(String(input instanceof Request ? input.url : input));
    return new Response(JSON.stringify({ chainId: 8453, address: ADDR, score: 65, level: "high", flags: ["upgradeable-proxy"] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const c = createContractRiskClient({ privateKey: KEY as `0x${string}`, fetch: fakeFetch, baseUrl: "http://x.test/" });
  const r = await c.risk(8453, ADDR);
  assert.equal(r.score, 65);
  assert.equal(r.level, "high");
  assert.equal(urls[0], `http://x.test/v1/risk/8453/${ADDR}`);
  assert.equal(r._payment, undefined);
});

test("risk() surfaces non-2xx as ContractRiskError and validates input", async () => {
  const fakeFetch = (async () => new Response('{"error":"not_a_contract"}', { status: 422 })) as typeof fetch;
  const c = createContractRiskClient({ privateKey: KEY as `0x${string}`, fetch: fakeFetch });
  await assert.rejects(() => c.risk(8453, ADDR), (e: any) => e instanceof ContractRiskError && e.status === 422);
  await assert.rejects(() => c.risk(8453, "0x123"), TypeError);
});

test("quickFlags() is a plain unpaid GET; supportedChains() lists 20", async () => {
  const fakeFetch = (async (u: any) => new Response(JSON.stringify({ chainId: 1, address: ADDR, flags: [] }))) as typeof fetch;
  const c = createContractRiskClient({ privateKey: KEY as `0x${string}`, fetch: fakeFetch });
  assert.deepEqual((await c.quickFlags(1, ADDR)).flags, []);
  assert.equal((await c.supportedChains()).length, 20);
});

const chain: any = new Proxy(function () {}, { get: () => chain, apply: () => chain });

test("adapters call the client", async () => {
  const fakeFetch = (async () => new Response(JSON.stringify({ score: 5 }))) as typeof fetch;
  const c = createContractRiskClient({ privateKey: KEY as `0x${string}`, fetch: fakeFetch });
  const lc: any = toLangChainTool(c, { tool: (fn, fields) => ({ fn, fields }), z: chain });
  assert.equal(lc.fields.name, "contract_risk_summary");
  assert.equal(await lc.fn({ chainId: 8453, address: ADDR }), '{"score":5}');
  const ai: any = toAiSdkTool(c, { tool: (d) => d, jsonSchema: (s) => s });
  assert.deepEqual(await ai.execute({ chainId: 8453, address: ADDR }), { score: 5 });
  assert.equal(ai.inputSchema.type, "object");
});
