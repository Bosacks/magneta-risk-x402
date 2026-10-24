import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOpenApi } from "../src/openapi.js";
import { PRICE } from "../src/config.js";

const doc = JSON.parse(JSON.stringify(buildOpenApi({
  publicUrl: "https://x402.magneta.finance",
  networks: [{ network: "eip155:8453", asset: "USDC" }, { network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", asset: "USDC" }],
}))) as any;

test("price is $0.01 from the single source", () => {
  assert.equal(PRICE, "$0.01");
  assert.equal(doc.paths["/v1/risk/{chainId}/{address}"]["x-payment-info"], undefined);
  assert.equal(doc.paths["/v1/risk/{chainId}/{address}"].get["x-payment-info"].price, "$0.01");
});

test("openapi documents the 3 public paths", () => {
  assert.equal(doc.openapi, "3.1.0");
  assert.deepEqual(Object.keys(doc.paths).sort(), ["/health", "/v1/flags/{chainId}/{address}", "/v1/risk/{chainId}/{address}"]);
});

test("paid route documents 200/400/402/422/502/504 and payment networks", () => {
  const get = doc.paths["/v1/risk/{chainId}/{address}"].get;
  for (const c of ["200", "400", "402", "422", "502", "504"]) assert.ok(get.responses[c], `missing ${c}`);
  assert.equal(get.responses["429"], undefined); // the paid route has no rate limiter
  assert.deepEqual(get["x-payment-info"].networks.map((n: any) => n.network), ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"]);
});

test("free flags route documents 400/422/429/502", () => {
  const get = doc.paths["/v1/flags/{chainId}/{address}"].get;
  for (const c of ["200", "400", "422", "429", "502"]) assert.ok(get.responses[c], `missing ${c}`);
  assert.deepEqual(get.responses["429"].content["application/json"].schema.properties.error.enum, ["rate_limited"]);
  assert.ok(get.responses["400"].content["application/json"].schema.oneOf.length === 2);
});
