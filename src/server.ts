// Magneta Contract Risk: one express process serving
//   GET  /health                          free
//   GET  /v1/risk/:chainId/:address       paid ($0.02, x402 exact)
//   POST /mcp                             Streamable HTTP MCP: paid tool contract_risk_summary + free tool supported_chains
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { createPaymentWrapper } from "@x402/mcp";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import { DESCRIPTION, httpDiscovery, mcpDiscovery } from "./discovery.js";
import { ADDRESS_RE, CHAINS, isSupportedChain } from "./chains.js";
import { NETWORK, PORT, PRICE, PUBLIC_URL, need } from "./config.js";
import { makeFacilitatorClient } from "./facilitator-client.js";
import { AnalysisError, analyzeContract } from "./risk/analyze.js";

const network = NETWORK();
const payTo = need("PAY_TO") as `0x${string}`;

// One resource server shared by the HTTP middleware and the MCP wrapper.
const resourceServer = new x402ResourceServer(makeFacilitatorClient());
resourceServer.register(network, new ExactEvmScheme());
resourceServer.registerExtension(bazaarResourceServerExtension);
await resourceServer.initialize(); // fetches /supported from the facilitator

// Lifecycle logs: one line per event, no secrets (payloads carry signatures, never print them whole).
resourceServer.onVerifyFailure(async (c: any) => console.log(`[x402] verify-failure payer=${c.paymentPayload?.payload?.authorization?.from ?? "?"} reason=${c.result?.invalidReason ?? c.error ?? "?"} ${c.result?.invalidMessage ?? ""}`));
resourceServer.onAfterSettle(async (c: any) => console.log(`[x402] settled tx=${c.result?.transaction} network=${c.result?.network} payer=${c.result?.payer}`));
resourceServer.onSettleFailure(async (c: any) => console.log(`[x402] settle-failure reason=${c.result?.errorReason ?? c.error ?? "?"}`));


const app = express();
app.disable("x-powered-by");
// Behind Caddy (loopback) the forwarded proto is https: the resource URL advertised to the facilitator must be https.
app.set("trust proxy", "loopback");

app.get("/health", (_req, res) => res.json({ status: "ok", network, price: PRICE, chains: Object.keys(CHAINS).map(Number) }));

// Free validation BEFORE the payment middleware: bad input must never produce a 402.
app.use("/v1/risk/:chainId/:address", (req, res, next) => {
  const chainId = Number(req.params.chainId);
  if (!Number.isInteger(chainId) || !isSupportedChain(chainId)) {
    res.status(400).json({ error: "unsupported_chain", supportedChains: Object.keys(CHAINS).map(Number) });
    return;
  }
  if (!ADDRESS_RE.test(req.params.address)) {
    res.status(400).json({ error: "invalid_address", expected: "0x followed by 40 hex characters" });
    return;
  }
  next();
});

app.use(
  paymentMiddleware(
    {
      "GET /v1/risk/:chainId/:address": {
        accepts: [{ scheme: "exact", price: PRICE, network, payTo }],
        description: DESCRIPTION,
        mimeType: "application/json",
        extensions: httpDiscovery(),
      },
    },
    resourceServer,
    undefined,
    undefined,
    false, // already initialized above
  ),
);

app.get("/v1/risk/:chainId/:address", async (req, res) => {
  try {
    res.json(await analyzeContract(Number(req.params.chainId), req.params.address));
  } catch (e) {
    // Status >= 400 means the x402 middleware does not settle: the buyer is not charged for a failed analysis.
    if (e instanceof AnalysisError) {
      const status = e.code === "not_a_contract" ? 422 : e.code === "timeout" ? 504 : 400;
      res.status(status).json({ error: e.code, message: e.message });
      return;
    }
    console.error("[risk] analysis failed:", e);
    res.status(502).json({ error: "analysis_failed", message: "Upstream data source failed; you were not charged." });
  }
});

// ---- MCP ----
const toolAccepts = await resourceServer.buildPaymentRequirements({ scheme: "exact", network, payTo, price: PRICE });
const paid = createPaymentWrapper(resourceServer, {
  accepts: toolAccepts,
  resource: { url: `${PUBLIC_URL()}/mcp`, description: DESCRIPTION, mimeType: "application/json", serviceName: "Magneta Contract Risk", tags: ["security", "smart-contracts", "risk"] },
  extensions: mcpDiscovery(),
});

/** Builds a fresh MCP server (stateless mode: one server + transport per HTTP request). */
function buildServer(): McpServer {
  const server = new McpServer({ name: "Magneta Contract Risk", version: "0.1.0" });
  server.tool(
    "contract_risk_summary",
    `On-chain smart-contract risk report (score 0-100, proxy, owner, risky selectors, source verification, static analysis). Costs ${PRICE} in USDC via x402.`,
    {
      chainId: z.number().int().refine(isSupportedChain, "unsupported chainId; call supported_chains").describe("EVM chain id"),
      address: z.string().regex(ADDRESS_RE, "invalid address").describe("Contract address (0x...)"),
    },
    paid(async (args: { chainId: number; address: string }) => {
      try {
        const report = await analyzeContract(args.chainId, args.address);
        return { content: [{ type: "text" as const, text: JSON.stringify(report) }] };
      } catch (e) {
        // isError results are not settled: no charge for a failed analysis.
        const message = e instanceof AnalysisError ? e.message : "Upstream data source failed";
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
      }
    }),
  );
  server.tool("supported_chains", "Free: list the chains this service can analyze.", {}, async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(Object.values(CHAINS).map(({ id, name }) => ({ chainId: id, name }))) }],
  }));
  return server;
}

app.post("/mcp", express.json({ limit: "100kb" }), async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = PORT();
const listener = app.listen(port, () => console.log(`[risk-x402] listening on :${port}, network=${network}, price=${PRICE}, payTo=${payTo}`));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => listener.close(() => process.exit(0)));
