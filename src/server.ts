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
import { SCORING_RUBRIC } from "./risk/score.js";

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
  const server = new McpServer({ name: "Magneta Contract Risk", version: "0.1.1" });
  server.registerTool(
    "contract_risk_summary",
    {
      title: "Contract risk summary",
      description:
        `Analyze a deployed smart contract and return a deterministic risk report: 0-100 score with level (low/medium/high/critical), ` +
        `proxy/upgradeability, owner and pause state, risky selectors found in the bytecode (mint, blacklist, fee/tax setters, pause, upgrade), ` +
        `SELFDESTRUCT/DELEGATECALL opcodes, source verification (Blockscout, Sourcify) and aderyn static-analysis findings. ` +
        `Use it before trading, bridging, approving or integrating a token or protocol contract; use supported_chains first if you are unsure the chain id is covered, ` +
        `and scoring_rubric to interpret the score. Paid: ${PRICE} in USDC on Base per call via x402. The first call answers with an x402 payment ` +
        `challenge; an x402-enabled client pays automatically and the same call then returns the report. Read-only, no side effects; failed analyses ` +
        `(not a contract, upstream data source down) are not charged; identical requests within 10 minutes return the cached report.`,
      inputSchema: {
        chainId: z.number().int().refine(isSupportedChain, "unsupported chainId; call supported_chains").describe(`EVM chain id, one of: ${Object.keys(CHAINS).join(", ")}`),
        address: z.string().regex(ADDRESS_RE, "invalid address").describe("Contract address, 0x followed by 40 hex characters (an EOA is rejected without charge)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
  server.registerTool(
    "supported_chains",
    {
      title: "Supported chains",
      description:
        "List the EVM chains contract_risk_summary can analyze, as { chainId, name, testnet } objects. Free, read-only, no payment and no parameters. " +
        "Call it when you need to map a chain name to its id or to check coverage before paying for a report.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => ({
      content: [{ type: "text" as const, text: JSON.stringify(Object.values(CHAINS).map(({ id, name, testnet }) => ({ chainId: id, name, testnet: Boolean(testnet) }))) }],
    }),
  );
  server.registerTool(
    "scoring_rubric",
    {
      title: "Scoring rubric",
      description:
        "Return the exact rubric behind contract_risk_summary scores: points per flag, the level thresholds and what each flag means. Free, read-only, " +
        "no parameters. Call it to explain a score to a user or to decide your own threshold before acting on a report.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => ({ content: [{ type: "text" as const, text: JSON.stringify(SCORING_RUBRIC) }] }),
  );
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
