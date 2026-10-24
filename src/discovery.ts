// Bazaar discovery declarations, kept in one place so a unit test can validate them with the SDK's own validator.
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { CHAINS } from "./chains.js";

export const DESCRIPTION =
  "Deterministic smart-contract risk report for any deployed contract on 20 EVM chains: 0-100 score, proxy/upgradeability, owner and pause state, mint/blacklist/fee selectors, SELFDESTRUCT, verified source and aderyn static analysis. Use before trading, approving, bridging or integrating a token or protocol. Read-only; failed analyses are not charged.";

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
    output: { example: EXAMPLE_REPORT },
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
    output: { example: EXAMPLE_REPORT },
  });
