// The Bazaar declarations must pass the SDK's own validator with concrete wire values
// (path params arrive as strings), otherwise the facilitator rejects discovery and the service is never catalogued.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidIconUrl, isValidServiceName, sanitizeTags, validateDiscoveryExtension, type DiscoveryExtension } from "@x402/extensions/bazaar";
import { EXAMPLE_REPORT, REPORT_SCHEMA, SERVICE_NAME, SERVICE_TAGS, httpDiscovery, iconUrl, mcpDiscovery } from "../src/discovery.js";

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

test("service metadata survives the SDK sanitizers unchanged (search ranks on it)", () => {
  assert.equal(isValidServiceName(SERVICE_NAME), true);
  assert.deepEqual(sanitizeTags(SERVICE_TAGS), SERVICE_TAGS);
  assert.equal(isValidIconUrl(iconUrl("https://x402.magneta.finance")), true);
  // negative twins: the sanitizers really reject what they should
  assert.equal(isValidServiceName("x".repeat(33)), false);
  assert.equal(sanitizeTags([...SERVICE_TAGS, "sixth"])?.length, 5);
  assert.equal(isValidIconUrl("http://127.0.0.1/icon.png"), false);
});

test("both declarations publish the report schema, and the example carries every required field", () => {
  for (const ext of [httpDiscovery().bazaar, mcpDiscovery().bazaar]) {
    // The SDK embeds output.schema as the JSON Schema of output.example inside the extension's own schema.
    const s = (ext as unknown as { schema: { properties: { output: { properties: { example: { properties: unknown; required: unknown } } } } } }).schema;
    const example = s.properties.output.properties.example;
    assert.deepEqual(example.properties, REPORT_SCHEMA.properties);
    assert.deepEqual(example.required, REPORT_SCHEMA.required);
  }
  for (const k of REPORT_SCHEMA.required) assert.ok(k in EXAMPLE_REPORT, `example lacks ${k}`);
});

test("DESCRIPTION stays within the 500-character facilitator limit and names the error cases", async () => {
  const { DESCRIPTION } = await import("../src/discovery.js");
  assert.ok(DESCRIPTION.length <= 500, `DESCRIPTION is ${DESCRIPTION.length} chars`);
  assert.match(DESCRIPTION, /400/);
  assert.match(DESCRIPTION, /422/);
  assert.match(DESCRIPTION, /not charged/);
});
