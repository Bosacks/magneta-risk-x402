import type { ContractRiskClient } from "./client.js";

const ADDRESS_PATTERN = "^0x[0-9a-fA-F]{40}$";
export const TOOL_NAME = "contract_risk_summary";
export const TOOL_DESCRIPTION =
  "Paid ($0.02 USDC on Base via x402) deterministic risk report for a deployed smart contract on 20 EVM chains: 0-100 score, level, flags " +
  "(proxy/upgradeability, owner not renounced, mint/blacklist/fee selectors, SELFDESTRUCT, unverified source, aderyn findings). " +
  "Use before trading, approving, bridging or integrating a token or protocol. A triage signal, not an audit.";

/** Provider-neutral definition: usable for OpenAI / Anthropic function calling and the Vercel AI SDK (`jsonSchema(parameters)`). */
export const toolDefinition = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  parameters: {
    type: "object",
    properties: {
      chainId: { type: "integer", description: "EVM chain id, e.g. 8453 for Base, 1 for Ethereum" },
      address: { type: "string", pattern: ADDRESS_PATTERN, description: "Contract address (0x + 40 hex)" },
    },
    required: ["chainId", "address"],
    additionalProperties: false,
  },
} as const;

type Args = { chainId: number; address: string };
const run = (client: ContractRiskClient) => async ({ chainId, address }: Args) => JSON.stringify(await client.risk(chainId, address));

/**
 * LangChain.js adapter without importing langchain. Pass `tool` from "@langchain/core/tools" and `z` from "zod".
 * Verified signature (@langchain/core 1.2.19): tool(func, { name, description, schema }) -> DynamicStructuredTool.
 */
export function toLangChainTool(
  client: ContractRiskClient,
  deps: { tool: (fn: (input: any) => Promise<string>, fields: { name: string; description: string; schema: any }) => unknown; z: any },
) {
  const { tool, z } = deps;
  return tool(run(client), {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    schema: z.object({
      chainId: z.number().int().describe(toolDefinition.parameters.properties.chainId.description),
      address: z.string().regex(new RegExp(ADDRESS_PATTERN)).describe(toolDefinition.parameters.properties.address.description),
    }),
  });
}

/**
 * Vercel AI SDK adapter without importing "ai". Pass `tool` and `jsonSchema` from "ai".
 * Verified shape (ai 7.0.146): tool({ description, inputSchema, execute }); jsonSchema() wraps a JSON Schema.
 */
export function toAiSdkTool(
  client: ContractRiskClient,
  deps: { tool: (def: any) => unknown; jsonSchema: (schema: any) => unknown },
) {
  return deps.tool({
    description: TOOL_DESCRIPTION,
    inputSchema: deps.jsonSchema(toolDefinition.parameters),
    execute: async (args: Args) => client.risk(args.chainId, args.address),
  });
}

/** Execute a tool call coming from a function-calling model (OpenAI / Anthropic): returns the JSON string to feed back. */
export const executeToolCall = (client: ContractRiskClient, args: Args) => run(client)(args);
