// Bazaar discovery declarations, kept in one place so a unit test can validate them with the SDK's own validator.
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { CHAINS } from "./chains.js";

export const DESCRIPTION =
  "Smart contract security and token risk check before you trade, approve, bridge or integrate: deterministic 0-100 risk score for any deployed contract on 20 EVM chains. Flags rug-pull levers (owner mint, blacklist, pause, adjustable fees, upgradeable proxy, ownership not renounced), SELFDESTRUCT/DELEGATECALL, verified source and aderyn static analysis. Read-only; failed analyses are not charged.";

/** Bazaar service metadata on the `resource` object. Search ranks on it: without serviceName/tags/iconUrl the
 *  listing was indexed but never returned by /discovery/search (measured 2026-10-24, 4 queries, absent from all).
 *  Rules (SDK sanitizers): serviceName and each tag printable ASCII <= 32 chars, at most 5 tags, iconUrl absolute https. */
export const SERVICE_NAME = "Magneta Contract Risk";
export const SERVICE_TAGS = ["smart-contract-risk", "contract-risk", "rug-check", "token-security", "due-diligence"];
export const iconUrl = (publicUrl: string) => `${publicUrl}/icon.png`;

export const EXAMPLE_REPORT = {
  chainId: 8453, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", analyzedAt: "2026-01-01T00:00:00.000Z",
  isContract: true, bytecodeSize: 1798, proxy: { type: "zeppelinos", implementation: "0x0000000000000000000000000000000000000001" },
  score: 65, level: "high", flags: ["upgradeable-proxy", "owner-not-renounced"], notes: [],
};

/** JSON Schema of the paid report (src/risk/analyze.ts RiskReport), published in both Bazaar declarations so an agent
 *  knows what it buys before paying. Core fields are required; nested verification/analysis objects stay open. */
const nullableString = { type: ["string", "null"] };
export const REPORT_SCHEMA = {
  type: "object",
  properties: {
    chainId: { type: "integer", description: "EVM chain id" },
    address: { type: "string", description: "Contract address analysed" },
    analyzedAt: { type: "string", format: "date-time" },
    isContract: { type: "boolean" },
    bytecodeSize: { type: "integer", description: "Runtime bytecode size in bytes" },
    proxy: {
      type: ["object", "null"],
      description: "Detected proxy pattern (EIP-1967, EIP-1822, EIP-1167, zeppelinos) or null",
      properties: { type: { type: "string" }, implementation: nullableString, admin: nullableString, beacon: nullableString },
    },
    erc20: {
      type: "object",
      properties: {
        isLikelyErc20: { type: "boolean" }, name: nullableString, symbol: nullableString, decimals: { type: ["integer", "null"] },
        totalSupply: nullableString, owner: nullableString, ownerRenounced: { type: ["boolean", "null"] }, paused: { type: ["boolean", "null"] },
      },
    },
    opcodes: { type: "object", properties: { selfdestruct: { type: "boolean" }, delegatecall: { type: "boolean" } } },
    selectors: { type: "object", description: "Risky function selectors found in the bytecode (mint, blacklist, pause, fees, upgrade)", properties: { found: { type: "array", items: { type: "string" } } } },
    blockscout: { type: "object", description: "Source verification from Blockscout" },
    sourcify: { type: "object", description: "Source verification from Sourcify (fallback)" },
    aderyn: { type: "object", description: "aderyn static-analysis summary when verified source exists" },
    score: { type: "integer", minimum: 0, maximum: 100, description: "Risk score, higher is riskier" },
    level: { type: "string", enum: ["low", "medium", "high", "critical"] },
    flags: { type: "array", items: { type: "string" }, description: "Rubric flags, e.g. upgradeable-proxy, owner-not-renounced, mint-function" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["chainId", "address", "analyzedAt", "isContract", "score", "level", "flags"],
};

const chainIds = Object.keys(CHAINS); // decimal strings: path params are strings on the wire

/** Discovery declaration for GET /v1/risk/:chainId/:address. */
export const httpDiscovery = () =>
  declareDiscoveryExtension({
    pathParams: { chainId: "8453", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    pathParamsSchema: {
      properties: {
        chainId: { type: "string", enum: chainIds, description: "EVM chain id (decimal string)" },
        address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$", description: "Contract address" },
      },
      required: ["chainId", "address"],
    },
    output: { example: EXAMPLE_REPORT, schema: REPORT_SCHEMA },
  });

/** Discovery declaration for the MCP tool contract_risk_summary. */
export const mcpDiscovery = () =>
  declareDiscoveryExtension({
    toolName: "contract_risk_summary",
    description: DESCRIPTION,
    transport: "streamable-http",
    // The Bazaar calls the tool with this example to obtain the 402 challenge; without it the tool is never indexed.
    example: { chainId: 8453, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    inputSchema: {
      type: "object",
      properties: { chainId: { type: "integer", enum: chainIds.map(Number) }, address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } },
      required: ["chainId", "address"],
    },
    output: { example: EXAMPLE_REPORT, schema: REPORT_SCHEMA },
  });
