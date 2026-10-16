// The Bazaar declarations must pass the SDK's own validator with concrete wire values
// (path params arrive as strings), otherwise the facilitator rejects discovery and the service is never catalogued.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDiscoveryExtension, type DiscoveryExtension } from "@x402/extensions/bazaar";
import { httpDiscovery, mcpDiscovery } from "../src/discovery.js";

test("HTTP discovery declaration validates with string path params", () => {
  const ext = structuredClone(httpDiscovery().bazaar) as DiscoveryExtension & { info: { input: Record<string, unknown> } };
  ext.info.input = { ...ext.info.input, method: "GET", pathParams: { chainId: "84532", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" } };
  const r = validateDiscoveryExtension(ext);
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

test("MCP discovery declaration validates and carries the example the Bazaar needs", () => {
  const ext = mcpDiscovery().bazaar;
  const r = validateDiscoveryExtension(ext);
  assert.equal(r.valid, true, JSON.stringify(r.errors));
  const input = (ext as { info: { input: Record<string, unknown> } }).info.input;
  assert.deepEqual(input.example, { chainId: 8453, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" });
  assert.equal(input.transport, "streamable-http");
});
