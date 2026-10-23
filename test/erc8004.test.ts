// The ERC-8004 registration file must follow the current schema and match the live payment address;
// the calldata the owner will sign must decode back to the served URI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeFunctionData } from "viem";
import { AGENT_URI, IDENTITY_REGISTRY, REGISTRY_ABI, registerCalldata } from "../scripts/erc8004-register.js";

const PAY_TO = "0xc7c84858Bb060367d69c6f28b0F8333960c9821e";
const file = JSON.parse(readFileSync(new URL("../erc8004/agent-registration.json", import.meta.url), "utf8"));

test("registration file has the required fields", () => {
  assert.equal(file.type, "https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
  assert.equal(file.name, "Magneta Contract Risk");
  assert.ok(typeof file.description === "string" && file.description.length > 20);
  assert.equal(file.x402Support, true);
  assert.equal(file.active, true);
  assert.ok(Array.isArray(file.services) && file.services.length > 0);
  assert.ok(Array.isArray(file.registrations));
  assert.ok(file.supportedTrust.includes("reputation"));
  for (const r of file.registrations) {
    assert.equal(r.agentRegistry, `eip155:8453:${IDENTITY_REGISTRY}`);
    assert.ok(Number.isInteger(r.agentId));
  }
});

test("HTTPS endpoints and wallet match the live service", () => {
  const byName = Object.fromEntries(file.services.map((s: { name: string; endpoint: string }) => [s.name, s.endpoint]));
  assert.equal(byName.web, "https://x402.magneta.finance");
  assert.equal(byName.MCP, "https://x402.magneta.finance/mcp");
  for (const s of file.services) if (s.name === "web" || s.name === "MCP") assert.ok(s.endpoint.startsWith("https://"));
  const wallets = file.services.filter((s: { name: string }) => s.name === "agentWallet").map((s: { endpoint: string }) => s.endpoint);
  assert.deepEqual(wallets, [
    `eip155:8453:${PAY_TO}`,
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:8chhny9NZmA51mEhtwa8qCJo6BcwgZNgdwDME7XKPi72",
  ]);
});

test("register calldata decodes back to the agent URI", () => {
  const d = decodeFunctionData({ abi: REGISTRY_ABI, data: registerCalldata() });
  assert.equal(d.functionName, "register");
  assert.deepEqual(d.args, [AGENT_URI]);
  assert.equal(AGENT_URI, "https://x402.magneta.finance/.well-known/agent-registration.json");
});
