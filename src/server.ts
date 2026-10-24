// Magneta Contract Risk: one express process serving
//   GET  /health                          free
//   GET  /v1/flags/:chainId/:address      free, bytecode-only quick flags (30 req/min per IP)
//   GET  /v1/risk/:chainId/:address       paid ($0.02, x402 exact)
//   POST /mcp                             Streamable HTTP MCP: paid tool contract_risk_summary + free tools contract_quick_flags, supported_chains, scoring_rubric
import { readFileSync } from "node:fs";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { createPaymentWrapper } from "@x402/mcp";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import { DESCRIPTION, SERVICE_NAME, SERVICE_TAGS, httpDiscovery, iconUrl, mcpDiscovery } from "./discovery.js";
import { ADDRESS_RE, CHAINS, isSupportedChain } from "./chains.js";
import { NETWORK, PORT, PRICE, PUBLIC_URL, SOLANA_NETWORK, SOLANA_PAY_TO, need } from "./config.js";
import { makeFacilitatorClient } from "./facilitator-client.js";
import { AnalysisError, analyzeContract, quickFlags } from "./risk/analyze.js";
import { createRateLimiter } from "./rate-limit.js";
import { SCORING_RUBRIC } from "./risk/score.js";

const network = NETWORK();
const payTo = need("PAY_TO") as `0x${string}`;
const solanaPayTo = SOLANA_PAY_TO();
const solanaNetwork = SOLANA_NETWORK();

// One resource server shared by the HTTP middleware and the MCP wrapper.
const resourceServer = new x402ResourceServer(makeFacilitatorClient());
resourceServer.register(network, new ExactEvmScheme());
if (solanaPayTo) resourceServer.register(solanaNetwork, new ExactSvmScheme()); // USDC on Solana, settled by the same facilitator
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

app.get("/health", (_req, res) =>
  res.json({
    status: "ok", network, price: PRICE, paymentNetworks: [network, ...(solanaPayTo ? [solanaNetwork] : [])], chains: Object.keys(CHAINS).map(Number),
    freeRoutes: ["GET /health", "GET /v1/flags/:chainId/:address", "GET /.well-known/agent-registration.json", "GET /icon.png"],
    paidRoutes: ["GET /v1/risk/:chainId/:address"],
    freeTools: ["contract_quick_flags", "supported_chains", "scoring_rubric"],
    paidTools: ["contract_risk_summary"],
  }),
);

// ERC-8004 registration file, served as the agentURI and as the endpoint-domain verification file.
// Resolved from the repo root (../erc8004 relative to both src/server.ts and dist/server.js), read once at startup.
const agentRegistration = readFileSync(new URL("../erc8004/agent-registration.json", import.meta.url), "utf8");
for (const path of ["/.well-known/agent-registration.json", "/agent-registration.json"]) {
  app.get(path, (_req, res) => {
    res.type("application/json").send(agentRegistration);
  });
}

// Service icon (Bazaar iconUrl, ERC-8004 image), 256x256 PNG, read once at startup like the registration file.
const icon = readFileSync(new URL("../public/icon.png", import.meta.url));
app.get("/icon.png", (_req, res) => {
  res.type("image/png").set("Cache-Control", "public, max-age=86400").send(icon);
});

/** Shared free input validation: unsupported chain / bad address answer 400 before anything else. */
const validateTarget: express.RequestHandler = (req, res, next) => {
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
};

// FREE tier. Registered before the payment middleware, and its path never matches the paid route key
// "GET /v1/risk/:chainId/:address", so x402 never applies to it. Rate limit only here, never on paid routes.
const freeLimiter = createRateLimiter(30, 60_000);
app.get("/v1/flags/:chainId/:address", (req, res, next) => {
  const retryAfterSeconds = freeLimiter.hit(req.ip ?? "unknown");
  if (retryAfterSeconds !== null) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: "rate_limited", retryAfterSeconds });
    return;
  }
  next();
}, validateTarget, async (req, res) => {
  try {
    res.json(await quickFlags(Number(req.params.chainId), req.params.address));
  } catch (e) {
    if (e instanceof AnalysisError) {
      const status = e.code === "not_a_contract" ? 422 : e.code === "timeout" ? 504 : 400;
      res.status(status).json({ error: e.code, message: e.message });
      return;
    }
    console.error("[flags] analysis failed:", e);
    res.status(502).json({ error: "analysis_failed", message: "RPC failed; try again shortly." });
  }
});

// Free validation BEFORE the payment middleware: bad input must never produce a 402.
app.use("/v1/risk/:chainId/:address", validateTarget);

app.use(
  paymentMiddleware(
    {
      "GET /v1/risk/:chainId/:address": {
        accepts: [
          { scheme: "exact", price: PRICE, network, payTo },
          ...(solanaPayTo ? [{ scheme: "exact", price: PRICE, network: solanaNetwork, payTo: solanaPayTo }] : []),
        ],
        description: DESCRIPTION,
        mimeType: "application/json",
        serviceName: SERVICE_NAME,
        tags: SERVICE_TAGS,
        iconUrl: iconUrl(PUBLIC_URL()),
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
const toolAccepts = [
  ...(await resourceServer.buildPaymentRequirements({ scheme: "exact", network, payTo, price: PRICE })),
  ...(solanaPayTo ? await resourceServer.buildPaymentRequirements({ scheme: "exact", network: solanaNetwork, payTo: solanaPayTo, price: PRICE }) : []),
];
const paid = createPaymentWrapper(resourceServer, {
  accepts: toolAccepts,
  resource: { url: `${PUBLIC_URL()}/mcp`, description: DESCRIPTION, mimeType: "application/json", serviceName: SERVICE_NAME, tags: SERVICE_TAGS, iconUrl: iconUrl(PUBLIC_URL()) },
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
        `Use it before trading, bridging, approving or integrating a token or protocol contract; ` +
        `Use contract_quick_flags first for a free bytecode-only preview when you are not sure the full report is worth paying for. Use supported_chains first if you are unsure the chain id is covered, ` +
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
    "contract_quick_flags",
    {
      title: "Contract quick flags (free)",
      description:
        `Free, no payment: bytecode-only preview of a deployed smart contract. Covers proxy/upgradeability, ERC-20 probe (name, symbol, owner, paused), ` +
        `risky selectors found in the bytecode (mint, blacklist, fee/tax setters, pause, upgrade), SELFDESTRUCT/DELEGATECALL opcodes, and a partialScore/partialLevel ` +
        `computed from those on-chain signals only. Does NOT cover source verification (Blockscout, Sourcify) nor aderyn static analysis, so partialScore ` +
        `can be lower than the real risk. contract_risk_summary (${PRICE} in USDC via x402) is the full report. Read-only, no side effects; an EOA is rejected; ` +
        `identical requests within 10 minutes return the cached result; the HTTP twin GET /v1/flags/:chainId/:address is rate limited to 30 requests per minute per IP.`,
      inputSchema: {
        chainId: z.number().int().refine(isSupportedChain, "unsupported chainId; call supported_chains").describe(`EVM chain id, one of: ${Object.keys(CHAINS).join(", ")}`),
        address: z.string().regex(ADDRESS_RE, "invalid address").describe("Contract address, 0x followed by 40 hex characters"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args: { chainId: number; address: string }) => {
      try {
        return { content: [{ type: "text" as const, text: JSON.stringify(await quickFlags(args.chainId, args.address)) }] };
      } catch (e) {
        const message = e instanceof AnalysisError ? e.message : "RPC failed";
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
      }
    },
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
