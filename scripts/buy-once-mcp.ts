// Buys ONE risk report through the MCP tool contract_risk_summary. Spend cap: $0.05.
//   BUYER_PRIVATE_KEY=0x... [MCP_URL=...] [X402_NETWORK=eip155:84532] [CHAIN_ID=84532] [ADDRESS=0x...] pnpm buy-once-mcp
import "../src/config.js";
import { createx402MCPClient } from "@x402/mcp";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { privateKeyToAccount } from "viem/accounts";
import { env, need, NETWORK } from "../src/config.js";

const MAX_ATOMIC = 50_000n; // $0.05 in USDC base units (6 decimals)
const account = privateKeyToAccount(need("BUYER_PRIVATE_KEY") as `0x${string}`);
const mcpUrl = env("MCP_URL", "http://127.0.0.1:3011/mcp");

const mcp = createx402MCPClient({
  name: "magneta-risk-buyer",
  version: "0.1.0",
  schemes: [{ network: NETWORK(), client: new ExactEvmScheme(account) }],
  autoPayment: true,
  onPaymentRequested: async (ctx) => {
    const a = ctx.paymentRequired.accepts[0];
    console.error(`[buy-once-mcp] payment requested for ${ctx.toolName}: ${a.amount} base units of ${a.asset}`);
    return BigInt(a.amount) <= MAX_ATOMIC; // refuse anything above the $0.05 cap
  },
});
await mcp.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
try {
  const t0 = performance.now();
  const r = await mcp.callTool("contract_risk_summary", {
    chainId: Number(env("CHAIN_ID", "84532")),
    address: env("ADDRESS", "0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  });
  const ms = Math.round(performance.now() - t0);
  const text = (r.content[0] as { text?: string } | undefined)?.text ?? "";
  if (r.isError) {
    console.error(`[buy-once-mcp] tool error: ${text}`);
    process.exit(1);
  }
  console.log(JSON.stringify(JSON.parse(text), null, 2));
  console.error(`[buy-once-mcp] paymentMade=${r.paymentMade} success=${r.paymentResponse?.success} tx=${r.paymentResponse?.transaction} payer=${r.paymentResponse?.payer} (${ms} ms)`);
  if (!r.paymentMade || !r.paymentResponse?.success) process.exit(1);
} finally {
  await mcp.close();
}
