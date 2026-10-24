// OpenAPI 3.1 description of the public HTTP API, built from the same sources as the runtime
// (CHAINS, PRICE, REPORT_SCHEMA, QuickFlags). Status codes mirror src/server.ts exactly.
import { CHAINS } from "./chains.js";
import { PRICE } from "./config.js";
import { DESCRIPTION, EXAMPLE_REPORT, REPORT_SCHEMA, SERVICE_NAME } from "./discovery.js";

const chainIds = Object.keys(CHAINS).map(Number);
const nullableString = { type: ["string", "null"] };

/** JSON Schema of GET /v1/flags (src/risk/analyze.ts QuickFlags). */
export const QUICK_FLAGS_SCHEMA = {
  type: "object",
  properties: {
    chainId: { type: "integer" },
    address: { type: "string" },
    analyzedAt: { type: "string", format: "date-time" },
    tier: { type: "string", const: "free" },
    isContract: { type: "boolean", const: true },
    bytecodeSize: { type: "integer" },
    proxy: REPORT_SCHEMA.properties.proxy,
    erc20: REPORT_SCHEMA.properties.erc20,
    opcodes: REPORT_SCHEMA.properties.opcodes,
    selectors: { type: "object", properties: { found: { type: "array", items: { type: "string" } } } },
    partialScore: { type: "integer", minimum: 0, maximum: 100, description: "Score from bytecode signals only (no source or static-analysis findings)" },
    partialLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
    flags: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["chainId", "address", "analyzedAt", "tier", "isContract", "partialScore", "partialLevel", "flags"],
};

const errorBody = (codes: string[], extra: Record<string, unknown> = {}) => ({
  type: "object",
  properties: { error: { type: "string", enum: codes }, ...extra },
  required: ["error"],
});
const jsonResponse = (description: string, schema: unknown, example?: unknown) => ({
  description,
  content: { "application/json": { schema, ...(example !== undefined ? { example } : {}) } },
});

const params = [
  { name: "chainId", in: "path", required: true, description: "EVM chain id", schema: { type: "integer", enum: chainIds } },
  { name: "address", in: "path", required: true, description: "Contract address", schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } },
];

const badRequest = jsonResponse(
  "Unsupported chain or malformed address. Answered before any payment is requested.",
  { oneOf: [
    errorBody(["unsupported_chain"], { supportedChains: { type: "array", items: { type: "integer" } } }),
    errorBody(["invalid_address"], { expected: { type: "string" } }),
  ] },
  { error: "invalid_address", expected: "0x followed by 40 hex characters" },
);
const notAContract = jsonResponse(
  "The address has no contract code on that chain (an EOA). Not charged.",
  errorBody(["not_a_contract"], { message: { type: "string" } }),
  { error: "not_a_contract", message: "0x... has no contract code on Base" },
);
const timeout = jsonResponse(
  "The analysis exceeded its 24 s time budget. Not charged.",
  errorBody(["timeout"], { message: { type: "string" } }),
);
const analysisFailed = (note: string) =>
  jsonResponse(`Upstream data source (RPC, explorer) failed. ${note}`, errorBody(["analysis_failed"], { message: { type: "string" } }), { error: "analysis_failed", message: "Upstream data source failed; you were not charged." });

export function buildOpenApi(opts: { publicUrl: string; networks: { network: string; asset: string }[] }) {
  const price = PRICE.replace("$", "");
  return {
    openapi: "3.1.0",
    info: {
      title: SERVICE_NAME,
      version: "0.1.2",
      description: DESCRIPTION,
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: opts.publicUrl }],
    paths: {
      "/health": {
        get: {
          operationId: "health",
          summary: "Service status (free)",
          responses: { "200": jsonResponse("Service status, price, payment networks, supported chains and route lists.", {
            type: "object",
            properties: {
              status: { type: "string" }, network: { type: "string" }, price: { type: "string" },
              paymentNetworks: { type: "array", items: { type: "string" } }, chains: { type: "array", items: { type: "integer" } },
              freeRoutes: { type: "array", items: { type: "string" } }, paidRoutes: { type: "array", items: { type: "string" } },
              freeTools: { type: "array", items: { type: "string" } }, paidTools: { type: "array", items: { type: "string" } },
            },
          }) },
        },
      },
      "/v1/flags/{chainId}/{address}": {
        get: {
          operationId: "contractQuickFlags",
          summary: "Bytecode-only quick flags (free, 30 requests per minute per IP)",
          parameters: params,
          responses: {
            "200": jsonResponse("Quick flags: proxy, ERC-20 probe, risky selectors, opcodes, partial score.", QUICK_FLAGS_SCHEMA),
            "400": badRequest,
            "422": notAContract,
            "429": {
              ...jsonResponse("More than 30 requests per minute from one IP. Retry-After header gives the wait in seconds.", errorBody(["rate_limited"], { retryAfterSeconds: { type: "integer" } }), { error: "rate_limited", retryAfterSeconds: 42 }),
              headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds to wait" } },
            },
            "502": analysisFailed("Free route: no payment involved."),
            "504": timeout,
          },
        },
      },
      "/v1/risk/{chainId}/{address}": {
        get: {
          operationId: "contractRiskReport",
          summary: `Full contract risk report (paid, ${PRICE} USDC via x402)`,
          description: "Without a valid payment the response is 402 with an x402 challenge in the PAYMENT-REQUIRED header. Input errors (400) are answered before the challenge. Only a 200 response is settled: 400, 422, 502 and 504 are never charged. No rate limit on this route.",
          parameters: params,
          "x-payment-info": {
            protocol: "x402",
            version: 2,
            scheme: "exact",
            price: PRICE,
            priceUsd: Number(price),
            currency: "USDC",
            networks: opts.networks,
            challengeHeader: "PAYMENT-REQUIRED",
            paymentHeader: "PAYMENT-SIGNATURE",
            settlementHeader: "PAYMENT-RESPONSE",
            chargedOn: "200 only",
          },
          responses: {
            "200": jsonResponse("Full risk report. Settlement receipt in the PAYMENT-RESPONSE header.", REPORT_SCHEMA, EXAMPLE_REPORT),
            "400": badRequest,
            "402": {
              description: `Payment required: ${PRICE} USDC, x402 v2 \`exact\` scheme. The base64 JSON challenge (accepts[] with network, asset, amount, payTo) is in the PAYMENT-REQUIRED response header; the body may be empty.`,
              headers: { "PAYMENT-REQUIRED": { schema: { type: "string" }, description: "Base64-encoded x402 payment requirements" } },
              content: { "application/json": { schema: { type: "object" } } },
            },
            "422": notAContract,
            "502": analysisFailed("Not charged."),
            "504": timeout,
          },
        },
      },
    },
  };
}
